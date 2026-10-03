// Payroll record-keeping: generate payslips, save the grid in one transaction, release (email PDFs),
// and render payslip PDFs. Amounts are entered by HR; the system only adds them up.
import fontkit from '@pdf-lib/fontkit'
import { formatCentavos, formatDate, toCentavos } from '@hr/shared'
import fs from 'node:fs'
import path from 'node:path'
import { createLocalReq, type Payload, type PayloadRequest, type Where } from 'payload'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import type { Payslip, PayrollPeriod, PayslipSetting } from '../payload-types'
import { DEFAULT_DEDUCTIONS, DEFAULT_EARNINGS } from '../globals/PayslipSettings'
import { UserError } from './errors'
import { fontPath } from './fonts'
import { queueMessage, templateByKey } from './mailer'

type User = { id: number; name?: string | null; email?: string | null }

/** A request acting as the current user record (role/status read fresh from the database). */
async function userReq(payload: Payload, user: User) {
  const doc = await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })
  return createLocalReq({ user: { ...doc, collection: 'users' } as never }, payload)
}

export function itemLabels(settings: Pick<PayslipSetting, 'earningItems' | 'deductionItems'> | null | undefined) {
  return {
    earnings: settings?.earningItems?.map((i) => i.label).filter(Boolean) ?? DEFAULT_EARNINGS,
    deductions: settings?.deductionItems?.map((i) => i.label).filter(Boolean) ?? DEFAULT_DEDUCTIONS,
  }
}

/** Creates an empty payslip (all template items at 0) for each matching active employee without one. */
export async function generatePayslips(
  payload: Payload,
  user: User,
  periodId: number,
  filter: { branch?: number[]; classification?: string[] } = {},
): Promise<{ created: number; existing: number }> {
  const settings = await payload.findGlobal({ slug: 'payslip-settings', overrideAccess: true })
  const { earnings, deductions } = itemLabels(settings)
  const and: Where[] = [{ employmentStatus: { equals: 'Active' } }]
  if (filter.branch?.length) and.push({ station: { in: filter.branch } })
  if (filter.classification?.length) and.push({ classification: { in: filter.classification } })
  const [employees, existing] = await Promise.all([
    payload.find({ collection: 'employees', where: { and }, pagination: false, depth: 0, overrideAccess: true, select: { employeeId: true } }),
    payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, pagination: false, depth: 0, overrideAccess: true, select: { employee: true } }),
  ])
  const have = new Set(existing.docs.map((p) => (typeof p.employee === 'object' ? p.employee.id : p.employee)))
  const req = await userReq(payload, user)
  req.transactionID = (await payload.db.beginTransaction()) ?? undefined
  let created = 0
  try {
    for (const e of employees.docs) {
      if (have.has(e.id)) continue
      await payload.create({
        collection: 'payslips',
        data: {
          period: periodId,
          employee: e.id,
          earnings: earnings.map((label) => ({ label, amount: 0 })),
          deductions: deductions.map((label) => ({ label, amount: 0 })),
        },
        req,
        overrideAccess: false,
      })
      created++
    }
    if (req.transactionID) await payload.db.commitTransaction(req.transactionID)
  } catch (err) {
    if (req.transactionID) await payload.db.rollbackTransaction(req.transactionID).catch(() => {})
    throw err
  }
  return { created, existing: have.size }
}

export type GridRow = { id?: number; employeeId?: number; values: Record<string, string>; remarks?: string }
export type GridError = { id: number; label: string; message: string; row?: number }

type Item = { label: string; amount: number }

/**
 * Builds a payslip's items from grid/Excel values (keys "e:<label>" / "d:<label>"). Items in the
 * template come first; extra items already on the payslip are kept. Returns the problems found.
 */
export function buildItems(
  labels: { earnings: string[]; deductions: string[] },
  values: Record<string, string>,
  current: { earnings?: Item[] | null; deductions?: Item[] | null } | null,
  who: string,
): { earnings: Item[]; deductions: Item[]; errors: string[] } {
  const errors: string[] = []
  const build = (list: string[], kind: 'e' | 'd', cur: Item[] | null | undefined) => {
    const extra = (cur ?? []).filter((i) => !list.includes(i.label))
    const items = list.map((label) => {
      const raw = values[`${kind}:${label}`]
      const r = toCentavos(raw === undefined ? (cur?.find((i) => i.label === label)?.amount ?? 0) : raw)
      if (!r.ok) errors.push(`${who}: ${label} ${r.error}`)
      return { label, amount: r.ok ? r.centavos / 100 : 0 }
    })
    return [...items, ...extra.map((i) => ({ label: i.label, amount: i.amount }))]
  }
  const earnings = build(labels.earnings, 'e', current?.earnings)
  const deductions = build(labels.deductions, 'd', current?.deductions)
  const cents = (items: Item[]) => items.reduce((s, i) => s + Math.round(i.amount * 100), 0)
  if (!errors.length && cents(deductions) > cents(earnings)) errors.push(`${who}: deductions are higher than gross pay.`)
  return { earnings, deductions, errors }
}

/**
 * Saves payslip rows for a period (grid or Excel). Every value is checked first; then all rows are
 * written in ONE transaction, so either every payslip is saved or none is. Rows with `employeeId`
 * and no existing payslip create one.
 */
export async function saveGrid(
  payload: Payload,
  user: User,
  periodId: number,
  rows: GridRow[],
): Promise<{ ok: true; updated: number; created: number } | { ok: false; errors: GridError[] }> {
  const settings = await payload.findGlobal({ slug: 'payslip-settings', overrideAccess: true })
  const labels = itemLabels(settings)
  const slips = await payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, pagination: false, depth: 0, overrideAccess: true })
  const byId = new Map(slips.docs.map((s) => [s.id, s]))
  const byEmployee = new Map(slips.docs.map((s) => [typeof s.employee === 'object' ? s.employee.id : s.employee, s]))
  const errors: GridError[] = []
  const writes: { id?: number; data: Record<string, unknown> }[] = []

  for (const [i, row] of rows.entries()) {
    const slip = row.id ? byId.get(row.id) : row.employeeId ? byEmployee.get(row.employeeId) : undefined
    if (row.id && !slip) {
      errors.push({ id: row.id, label: '', message: 'Payslip not found in this period.', row: i })
      continue
    }
    const who = slip?.fullName ?? `Row ${i + 1}`
    const built = buildItems(labels, row.values, slip ?? null, who)
    for (const m of built.errors) errors.push({ id: slip?.id ?? 0, label: '', message: m, row: i })
    const data: Record<string, unknown> = { earnings: built.earnings, deductions: built.deductions }
    if (row.remarks !== undefined) data.remarks = row.remarks || null
    if (slip) writes.push({ id: slip.id, data })
    else if (row.employeeId) writes.push({ data: { ...data, period: periodId, employee: row.employeeId } })
  }
  if (errors.length) return { ok: false, errors }

  const req = await userReq(payload, user)
  req.transactionID = (await payload.db.beginTransaction()) ?? undefined
  let created = 0
  try {
    for (const w of writes) {
      if (w.id) await payload.update({ collection: 'payslips', id: w.id, data: w.data as never, req, overrideAccess: false })
      else {
        await payload.create({ collection: 'payslips', data: w.data as never, req, overrideAccess: false })
        created++
      }
    }
    if (req.transactionID) await payload.db.commitTransaction(req.transactionID)
  } catch (err) {
    if (req.transactionID) await payload.db.rollbackTransaction(req.transactionID).catch(() => {})
    return { ok: false, errors: [{ id: 0, label: '', message: (err as Error).message }] }
  }
  return { ok: true, updated: writes.length - created, created }
}

async function payslipRecipients(payload: Payload, slips: Payslip[], period: PayrollPeriod) {
  const settings = await payload.findGlobal({ slug: 'payslip-settings', overrideAccess: true })
  const symbol = settings.currencySymbol || '₱'
  return slips.map((s) => ({
    employeeId: typeof s.employee === 'object' ? s.employee.id : s.employee,
    payslipId: s.id,
    context: {
      payPeriod: period.name,
      payDate: formatDate(period.payDate),
      netPay: formatCentavos(Math.round((s.netPay ?? 0) * 100), symbol),
    },
  }))
}

/** Marks the period Released and (if enabled) emails every employee their payslip PDF. */
export async function releasePeriod(payload: Payload, user: User, periodId: number, opts: { notify: boolean }) {
  const period = await payload.findByID({ collection: 'payroll-periods', id: periodId, depth: 0, overrideAccess: true })
  if (period.status === 'Released') throw new UserError('This payroll period has already been released.')
  const slips = await payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, pagination: false, depth: 0, overrideAccess: true })
  if (!slips.docs.length) throw new UserError('There are no payslips in this period yet.')
  const zero = slips.docs.filter((s) => !s.grossPay)
  if (zero.length) throw new UserError(`${zero.length} payslip(s) have no earnings (gross pay ₱0.00). Fill them in or remove them first.`)

  await payload.update({
    collection: 'payroll-periods',
    id: periodId,
    data: { status: 'Released', releasedAt: new Date().toISOString(), releasedBy: user.id },
    req: await userReq(payload, user),
    overrideAccess: false,
  })
  let queued = 0
  let skipped = 0
  const notifSettings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
  if (opts.notify && notifSettings.payrollReleasedToEmployee !== false) {
    const t = await templateByKey(payload, 'payroll-released', { subject: 'Your payslip for {{payPeriod}}', body: 'Hi {{firstName}},\n\nYour payslip for {{payPeriod}} is attached.' })
    const res = await queueMessage(payload, {
      ...t,
      category: 'Payroll',
      automatic: true,
      sentBy: user,
      recipients: await payslipRecipients(payload, slips.docs, period),
      audienceLabel: `Payroll ${period.name} (${slips.docs.length} employees)`,
      related: { collection: 'payroll-periods', id: periodId },
    })
    queued = res.queued
    skipped = res.skipped
  }
  return { payslips: slips.docs.length, queued, skipped }
}

/** Emails one payslip again (e.g. after a correction). */
export async function resendPayslip(payload: Payload, user: User, payslipId: number) {
  const slip = await payload.findByID({ collection: 'payslips', id: payslipId, depth: 0, overrideAccess: true })
  const period = await payload.findByID({ collection: 'payroll-periods', id: typeof slip.period === 'object' ? slip.period.id : slip.period, overrideAccess: true })
  const t = await templateByKey(payload, 'payroll-released', { subject: 'Your payslip for {{payPeriod}}', body: 'Hi {{firstName}},\n\nYour payslip for {{payPeriod}} is attached.' })
  const res = await queueMessage(payload, {
    ...t,
    subject: slip.correctedAfterRelease ? `Corrected: ${t.subject}` : t.subject,
    category: 'Payroll',
    automatic: true,
    sentBy: user,
    recipients: await payslipRecipients(payload, [slip], period),
    audienceLabel: `Payslip ${period.name}: ${slip.fullName}`,
    related: { collection: 'payslips', id: payslipId },
  })
  if (slip.correctedAfterRelease) {
    await payload.update({ collection: 'payslips', id: payslipId, data: { correctedAfterRelease: false }, overrideAccess: true, context: { releasing: true, skipAudit: true } })
  }
  return res
}

// ---------------------------------------------------------------------------------------------
// PDF

const PAPER: Record<string, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], 'Half-Letter': [396, 612] }

export type PayslipView = {
  settings: PayslipSetting
  companyName: string
  logo: { bytes: Buffer; type: 'png' | 'jpg' } | null
  period: PayrollPeriod
  slip: Payslip
}

export async function payslipView(payload: Payload, payslipId: number, req?: PayloadRequest): Promise<PayslipView> {
  const slip = await payload.findByID({ collection: 'payslips', id: payslipId, depth: 0, overrideAccess: true, req })
  const [period, settings, site] = await Promise.all([
    payload.findByID({ collection: 'payroll-periods', id: typeof slip.period === 'object' ? slip.period.id : slip.period, overrideAccess: true, req }),
    payload.findGlobal({ slug: 'payslip-settings', overrideAccess: true, req }),
    payload.findGlobal({ slug: 'site-settings', depth: 1, overrideAccess: true, req }),
  ])
  let logo: PayslipView['logo'] = null
  const media = site.logo && typeof site.logo === 'object' ? site.logo : null
  if (settings.showLogo !== false && media?.filename && /png|jpe?g/.test(media.mimeType ?? '')) {
    const file = path.join(payload.collections.media.config.upload.staticDir as string, path.basename(media.filename))
    if (fs.existsSync(file)) logo = { bytes: fs.readFileSync(file), type: media.mimeType === 'image/png' ? 'png' : 'jpg' }
  }
  return { settings, companyName: settings.companyName || site.companyName || 'HR', logo, period, slip }
}

/** Employee detail rows shown on the payslip, per the template's checkboxes. */
export function detailRows(v: PayslipView): [string, string][] {
  const s = v.settings.show ?? {}
  const rows: [string, string][] = [['Name', v.slip.fullName ?? '']]
  if (s.employeeId !== false) rows.push(['Employee ID', v.slip.employeeCode ?? ''])
  if (s.position !== false) rows.push(['Position', v.slip.position ?? ''])
  if (s.station !== false) rows.push(['Station', v.slip.station ?? ''])
  if (s.classification !== false) rows.push(['Classification', v.slip.classification ?? ''])
  if (s.tin) rows.push(['TIN', v.slip.tin ?? ''])
  if (s.sss) rows.push(['SSS', v.slip.sss ?? ''])
  if (s.philhealth) rows.push(['PhilHealth', v.slip.philhealth ?? ''])
  if (s.pagibig) rows.push(['Pag-IBIG', v.slip.pagibig ?? ''])
  return rows
}

export async function payslipPdf(payload: Payload, payslipId: number): Promise<{ filename: string; pdf: Uint8Array }> {
  return renderPayslipPdf(await payslipView(payload, payslipId))
}

export async function renderPayslipPdf(v: PayslipView): Promise<{ filename: string; pdf: Uint8Array }> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fs.readFileSync(fontPath('DejaVuSans.ttf')), { subset: true })
  const bold = await doc.embedFont(fs.readFileSync(fontPath('DejaVuSans-Bold.ttf')), { subset: true })
  const [W, H] = PAPER[v.settings.paperSize ?? 'A4'] ?? PAPER.A4!
  const page = doc.addPage([W, H])
  const half = W < 450
  const M = half ? 28 : 44
  const size = half ? 8.5 : 10
  const ink = rgb(0.07, 0.08, 0.1)
  const muted = rgb(0.42, 0.45, 0.5)
  const line = rgb(0.85, 0.86, 0.88)
  const sym = v.settings.currencySymbol || '₱'
  const money = (n: number | null | undefined) => formatCentavos(Math.round((n ?? 0) * 100), sym)
  let y = H - M

  const fit = (t: string, f: PDFFont, s: number, max: number) => {
    let out = t
    while (out.length > 1 && f.widthOfTextAtSize(out, s) > max) out = out.slice(0, -2) + '…'
    return out
  }
  const textAt = (p: PDFPage, t: string, x: number, yy: number, opts: { f?: PDFFont; s?: number; color?: ReturnType<typeof rgb>; right?: boolean; max?: number } = {}) => {
    const f = opts.f ?? font
    const s = opts.s ?? size
    const str = opts.max ? fit(t, f, s, opts.max) : t
    const x0 = opts.right ? x - f.widthOfTextAtSize(str, s) : x
    p.drawText(str, { x: x0, y: yy, size: s, font: f, color: opts.color ?? ink })
  }

  // Header
  let textX = M
  if (v.logo) {
    const img = v.logo.type === 'png' ? await doc.embedPng(v.logo.bytes) : await doc.embedJpg(v.logo.bytes)
    const h = half ? 30 : 42
    const w = (img.width / img.height) * h
    page.drawImage(img, { x: M, y: y - h + 6, width: w, height: h })
    textX = M + w + 10
  }
  textAt(page, v.companyName, textX, y - 6, { f: bold, s: size + 4, max: W - textX - M })
  let hy = y - 6 - (size + 4)
  for (const l of (v.settings.addressLines ?? '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4)) {
    textAt(page, l, textX, hy, { s: size - 1, color: muted, max: W - textX - M })
    hy -= size + 2
  }
  // Leave room for the logo only when there is one.
  y = (v.logo ? Math.min(hy, y - (half ? 34 : 48)) : hy + size) - 8
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: line })
  y -= size + 10
  textAt(page, v.settings.title || 'PAYSLIP', M, y, { f: bold, s: size + 3 })
  textAt(page, v.period.name, W - M, y, { f: bold, s: size, right: true, max: W / 2 })
  y -= size + 5
  textAt(page, `Period: ${formatDate(v.period.periodStart)} – ${formatDate(v.period.periodEnd)}`, M, y, { s: size - 0.5, color: muted })
  textAt(page, `Pay date: ${formatDate(v.period.payDate)}`, W - M, y, { s: size - 0.5, color: muted, right: true })
  y -= size + 14

  // Employee details (two columns)
  const rows = detailRows(v)
  const colW = (W - 2 * M) / 2
  rows.forEach(([k, val], i) => {
    const x = M + (i % 2) * colW
    const yy = y - Math.floor(i / 2) * (size + 8)
    textAt(page, k, x, yy, { s: size - 1, color: muted })
    textAt(page, val || '—', x + (half ? 62 : 90), yy, { s: size, max: colW - (half ? 66 : 96) })
  })
  y -= Math.ceil(rows.length / 2) * (size + 8) + 10

  // Items
  const section = (title: string, items: { label: string; amount: number }[] | null | undefined, totalLabel: string, total: number | null | undefined) => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: size + 10, color: rgb(0.95, 0.96, 0.97) })
    textAt(page, title, M + 6, y, { f: bold, s: size })
    textAt(page, 'Amount', W - M - 6, y, { f: bold, s: size, right: true })
    y -= size + 10
    for (const it of items ?? []) {
      if (!it.amount) continue
      textAt(page, it.label, M + 6, y, { s: size, max: W - 2 * M - 120 })
      textAt(page, money(it.amount), W - M - 6, y, { s: size, right: true })
      y -= size + 6
    }
    page.drawLine({ start: { x: M, y: y + size - 1 }, end: { x: W - M, y: y + size - 1 }, thickness: 0.5, color: line })
    textAt(page, totalLabel, M + 6, y - 2, { f: bold, s: size })
    textAt(page, money(total), W - M - 6, y - 2, { f: bold, s: size, right: true })
    y -= size + 16
  }
  section('Earnings', v.slip.earnings, 'Gross pay', v.slip.grossPay)
  section('Deductions', v.slip.deductions, 'Total deductions', v.slip.totalDeductions)

  // Net pay
  page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: size + 18, color: rgb(0.92, 0.95, 1), borderColor: rgb(0.7, 0.78, 0.92), borderWidth: 0.8 })
  textAt(page, 'NET PAY', M + 8, y, { f: bold, s: size + 2 })
  textAt(page, money(v.slip.netPay), W - M - 8, y, { f: bold, s: size + 3, right: true })
  y -= size + 30

  if (v.slip.remarks) {
    textAt(page, `Remarks: ${v.slip.remarks.replace(/\s+/g, ' ')}`, M, y, { s: size - 1, color: muted, max: W - 2 * M })
    y -= size + 12
  }

  // Signatories
  const sigs = [
    ['Prepared by', v.settings.preparedByName, v.settings.preparedByTitle],
    ['Certified correct', v.settings.certifiedByName, v.settings.certifiedByTitle],
  ].filter(([, name]) => name)
  if (sigs.length) {
    y -= 18
    const sw = (W - 2 * M) / 2
    sigs.forEach(([label, name, title], i) => {
      const x = M + i * sw
      textAt(page, label!, x, y + 26, { s: size - 1, color: muted })
      page.drawLine({ start: { x, y: y + 10 }, end: { x: x + sw - 24, y: y + 10 }, thickness: 0.6, color: muted })
      textAt(page, name!, x, y, { f: bold, s: size, max: sw - 24 })
      if (title) textAt(page, title, x, y - size - 3, { s: size - 1, color: muted, max: sw - 24 })
    })
    y -= size * 2 + 16
  }

  // Footer
  const footer = (v.settings.footerNote ?? '').replace(/\s+/g, ' ').trim()
  if (footer) textAt(page, footer, M, M, { s: size - 1.5, color: muted, max: W - 2 * M })
  textAt(page, `Generated ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`, W - M, M - size - 2, { s: size - 2, color: muted, right: true })

  doc.setTitle(`${v.settings.title || 'Payslip'} — ${v.slip.fullName} — ${v.period.name}`)
  doc.setCreator(v.companyName)
  const pdf = await doc.save()
  const safe = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return { filename: `payslip-${safe(v.period.code)}-${safe(v.slip.employeeCode ?? String(v.slip.id))}.pdf`, pdf }
}
