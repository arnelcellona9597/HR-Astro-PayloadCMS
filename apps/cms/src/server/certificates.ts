// Issuing certificates of employment: control numbers, the frozen content of an issued certificate,
// previews, and the PDF (drawn from the same blocks as the HTML/print view).
import fontkit from '@pdf-lib/fontkit'
import {
  CERT_FIELDS,
  certificateValues,
  type CertBlock,
  type CertFont,
  type CertMargin,
  MARGIN_POINTS,
  mergeBlocks,
  PAPER_POINTS,
  type PaperSize,
  richRuns,
  sanitizeBlocks,
  SPACER_POINTS,
  TEXT_POINTS,
  TITLE_POINTS,
} from '@hr/shared/certificates'
import { todayYmd, toYmd } from '@hr/shared'
import fs from 'node:fs'
import path from 'node:path'
import type { Payload, PayloadRequest } from 'payload'
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib'

import { UserError } from './errors'
import { fontPath } from './fonts'

/** What an issued certificate prints. Stored with the certificate so reprints never change. */
export type CertificateContent = {
  blocks: CertBlock[]
  paperSize: PaperSize
  font: CertFont
  margin: CertMargin
  companyName: string
  logoId: number | null
}

type Actor = { id: number; name?: string | null; email?: string | null } | null | undefined
const relId = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : (v as number | null | undefined))

async function branding(payload: Payload, req?: PayloadRequest) {
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true, req })
  return { companyName: site.companyName || 'HR Management System', logoId: (relId(site.logo) as number | null) ?? null }
}

/**
 * Merges a template with an employee's data. Used for previews (no control number yet) and when a
 * certificate is issued.
 */
export async function composeCertificate(
  payload: Payload,
  input: { templateId: number; employeeId: number; purpose?: string | null; issuedDate?: string | null; controlNumber?: string | null },
  req?: PayloadRequest,
) {
  const [template, employee, brand] = await Promise.all([
    payload.findByID({ collection: 'certificate-templates', id: input.templateId, depth: 0, overrideAccess: true, req, disableErrors: true }),
    payload.findByID({ collection: 'employees', id: input.employeeId, depth: 1, overrideAccess: true, req, disableErrors: true }),
    branding(payload, req),
  ])
  if (!template) throw new UserError('Choose a certificate template.')
  if (!employee) throw new UserError('Choose an employee.')
  const issuedDate = toYmd(input.issuedDate) ?? todayYmd()
  const values = certificateValues(employee as never, {
    issuedDate,
    purpose: input.purpose,
    controlNumber: input.controlNumber ?? null,
    companyName: brand.companyName,
  })
  const content: CertificateContent = {
    blocks: mergeBlocks(sanitizeBlocks(template.blocks), values),
    paperSize: (template.paperSize as PaperSize) ?? 'A4',
    font: (template.font as CertFont) ?? 'serif',
    margin: (template.margin as CertMargin) ?? 'normal',
    companyName: brand.companyName,
    logoId: brand.logoId,
  }
  return { template, employee, issuedDate, values, content }
}

/** Next number for a prefix and year: COE-2026-0001, COE-2026-0002, … (runs inside the create transaction). */
async function nextControlNumber(payload: Payload, req: PayloadRequest, prefix: string, year: string) {
  const stem = `${prefix}-${year}-`
  const existing = await payload.find({
    collection: 'certificates',
    where: { controlNumber: { like: stem } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
    select: { controlNumber: true },
  })
  const max = existing.docs.reduce((m, d) => {
    const n = d.controlNumber?.startsWith(stem) ? Number(d.controlNumber.slice(stem.length)) : 0
    return Number.isInteger(n) && n > m ? n : m
  }, 0)
  return `${stem}${String(max + 1).padStart(4, '0')}`
}

/** Called by the certificates collection when one is issued: fills every computed field. */
export async function buildCertificateContent(payload: Payload, req: PayloadRequest, data: Record<string, unknown>, user: Actor) {
  const templateId = relId(data.template)
  const employeeId = relId(data.employee)
  if (!templateId || !employeeId) throw new UserError('Choose an employee and a certificate template.')
  const template = await payload.findByID({ collection: 'certificate-templates', id: templateId, depth: 0, overrideAccess: true, req, disableErrors: true })
  if (!template) throw new UserError('Choose a certificate template.')
  if (template.active === false) throw new UserError('This certificate template is inactive. Activate it or choose another one.')
  const issuedDate = toYmd(data.issuedDate) ?? todayYmd()
  const controlNumber = await nextControlNumber(payload, req, template.prefix || 'COE', issuedDate.slice(0, 4))
  const composed = await composeCertificate(payload, { templateId, employeeId, purpose: data.purpose as string, issuedDate, controlNumber }, req)
  return {
    controlNumber,
    issuedDate: `${issuedDate}T12:00:00.000Z`,
    templateName: template.name,
    employeeName: composed.values.fullName,
    content: composed.content,
    issuedBy: user?.id ?? null,
    issuedByName: user?.name ?? user?.email ?? 'System',
  }
}

// ---------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------
type Fonts = { regular: PDFFont; bold: PDFFont; unicode: boolean }

/** Standard Times fonts only cover Windows-1252; replace anything else (e.g. ₱) so drawing never fails. */
function safeFor(fonts: Fonts) {
  if (fonts.unicode) return (s: string) => s
  const cache = new Map<string, string>()
  return (s: string) =>
    [...s]
      .map((ch) => {
        if (!cache.has(ch)) {
          try {
            fonts.regular.encodeText(ch)
            cache.set(ch, ch)
          } catch {
            cache.set(ch, ch === '₱' ? 'PHP ' : '?')
          }
        }
        return cache.get(ch)!
      })
      .join('')
}

export async function renderCertificatePdf(
  payload: Payload,
  content: CertificateContent,
  opts: { void?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fonts: Fonts =
    content.font === 'sans'
      ? {
          regular: await doc.embedFont(fs.readFileSync(fontPath('DejaVuSans.ttf')), { subset: true }),
          bold: await doc.embedFont(fs.readFileSync(fontPath('DejaVuSans-Bold.ttf')), { subset: true }),
          unicode: true,
        }
      : { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold), unicode: false }
  const safe = safeFor(fonts)
  const [W, H] = PAPER_POINTS[content.paperSize] ?? PAPER_POINTS.A4
  const M = MARGIN_POINTS[content.margin] ?? MARGIN_POINTS.normal
  const width = W - M * 2
  const ink = rgb(0.07, 0.07, 0.07)
  const muted = rgb(0.27, 0.27, 0.27)
  const sizeScale = content.font === 'sans' ? 11 / 12 : 1

  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0
  const newPage = () => {
    page = doc.addPage([W, H])
    pages.push(page)
    y = H - M
  }
  newPage()
  const ensure = (h: number) => {
    if (y - h < M) newPage()
  }

  type Word = { text: string; bold: boolean; width: number }
  const measure = (t: string, bold: boolean, size: number) => (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(t, size)

  /** Wraps rich text (**bold**) and draws it; returns nothing, moves `y` down. */
  const drawRich = (text: string, o: { size: number; align: 'left' | 'center' | 'right' | 'justify'; indent?: number; color?: ReturnType<typeof rgb>; lineHeight?: number; x?: number; w?: number }) => {
    const x0 = o.x ?? M
    const maxW = o.w ?? width
    const lh = o.size * (o.lineHeight ?? 1.5)
    const space = measure(' ', false, o.size)
    const hardLines = safe(text).split('\n')
    hardLines.forEach((hard, hi) => {
      const words: Word[] = []
      for (const run of richRuns(hard)) {
        for (const w of run.text.split(/\s+/).filter(Boolean)) words.push({ text: w, bold: run.bold, width: measure(w, run.bold, o.size) })
      }
      if (!words.length) {
        ensure(lh)
        y -= lh
        return
      }
      const lines: Word[][] = []
      let cur: Word[] = []
      let curW = 0
      let first = hi === 0
      for (const w of words) {
        const avail = maxW - (first && o.indent ? o.indent : 0)
        const add = (cur.length ? space : 0) + w.width
        if (cur.length && curW + add > avail) {
          lines.push(cur)
          cur = []
          curW = 0
          first = false
        }
        curW += (cur.length ? space : 0) + w.width
        cur.push(w)
      }
      if (cur.length) lines.push(cur)
      lines.forEach((line, li) => {
        ensure(lh)
        const indent = hi === 0 && li === 0 && o.indent ? o.indent : 0
        const avail = maxW - indent
        const textW = line.reduce((s, w) => s + w.width, 0)
        const natural = textW + space * (line.length - 1)
        const isLast = li === lines.length - 1
        let gap = space
        let x = x0 + indent
        if (o.align === 'justify' && !isLast && line.length > 1) gap = (avail - textW) / (line.length - 1)
        else if (o.align === 'center') x = x0 + indent + (avail - natural) / 2
        else if (o.align === 'right') x = x0 + indent + (avail - natural)
        const baseline = y - o.size
        for (const w of line) {
          page.drawText(w.text, { x, y: baseline, size: o.size, font: w.bold ? fonts.bold : fonts.regular, color: o.color ?? ink })
          x += w.width + gap
        }
        y -= lh
      })
    })
  }

  let logo: { img: Awaited<ReturnType<PDFDocument['embedPng']>> } | null = null
  if (content.logoId && content.blocks.some((b) => b.type === 'header' && b.showLogo)) {
    const media = await payload.findByID({ collection: 'media', id: content.logoId, depth: 0, overrideAccess: true, disableErrors: true })
    if (media?.filename && /png|jpe?g/.test(media.mimeType ?? '')) {
      const file = path.join(payload.collections.media.config.upload.staticDir as string, path.basename(media.filename))
      if (fs.existsSync(file)) {
        const bytes = fs.readFileSync(file)
        logo = { img: media.mimeType === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes) }
      }
    }
  }

  for (const b of content.blocks) {
    switch (b.type) {
      case 'header': {
        const name = b.companyName.trim() || content.companyName
        if (b.align === 'center') {
          if (b.showLogo && logo) {
            const h = 56
            const w = Math.min(120, (logo.img.width / logo.img.height) * h)
            const hh = (logo.img.height / logo.img.width) * w
            ensure(hh + 6)
            page.drawImage(logo.img, { x: M + (width - w) / 2, y: y - hh, width: w, height: hh })
            y -= hh + 6
          }
          drawRich(`**${name}**`, { size: 14 * sizeScale, align: 'center', lineHeight: 1.25 })
          if (b.lines.trim()) drawRich(b.lines.trim(), { size: 10 * sizeScale, align: 'center', color: muted, lineHeight: 1.35 })
        } else {
          const startY = y
          let textX = M
          let logoH = 0
          if (b.showLogo && logo) {
            const h = 56
            const w = Math.min(120, (logo.img.width / logo.img.height) * h)
            logoH = (logo.img.height / logo.img.width) * w
            ensure(logoH)
            page.drawImage(logo.img, { x: M, y: y - logoH, width: w, height: logoH })
            textX = M + w + 12
          }
          drawRich(`**${name}**`, { size: 14 * sizeScale, align: 'left', lineHeight: 1.25, x: textX, w: width - (textX - M) })
          if (b.lines.trim()) drawRich(b.lines.trim(), { size: 10 * sizeScale, align: 'left', color: muted, lineHeight: 1.35, x: textX, w: width - (textX - M) })
          y = Math.min(y, startY - logoH)
        }
        y -= 4
        break
      }
      case 'title': {
        const size = TITLE_POINTS[b.size] * sizeScale
        const t = safe(b.text.replace(/\*\*/g, ''))
        if (!b.wide) {
          drawRich(`**${t}**`, { size, align: b.align, lineHeight: 1.2 })
        } else {
          // Letter-spaced title, drawn character by character.
          const spacing = size * 0.12
          const chars = [...t]
          const w = chars.reduce((s, c) => s + fonts.bold.widthOfTextAtSize(c, size), 0) + spacing * Math.max(0, chars.length - 1)
          ensure(size * 1.2)
          let x = b.align === 'center' ? M + (width - w) / 2 : M
          for (const c of chars) {
            page.drawText(c, { x, y: y - size, size, font: fonts.bold, color: ink })
            x += fonts.bold.widthOfTextAtSize(c, size) + spacing
          }
          y -= size * 1.2
        }
        break
      }
      case 'paragraph':
        drawRich(b.text, { size: TEXT_POINTS[b.size] * sizeScale, align: b.align, indent: b.indent ? 36 : 0 })
        y -= 10
        break
      case 'details': {
        const size = 12 * sizeScale
        const rows = b.fields.map((f) => {
          const i = f.indexOf('=')
          const key = i >= 0 ? f.slice(0, i) : f
          return [labelFor(key), i >= 0 ? f.slice(i + 1) : ''] as const
        })
        const labelW = Math.max(0, ...rows.map(([l]) => measure(safe(l), true, size))) + 16
        for (const [label, value] of rows) {
          ensure(size * 1.5)
          page.drawText(safe(label), { x: M, y: y - size, size, font: fonts.bold, color: ink })
          const before = y
          drawRich(value, { size, align: 'left', x: M + labelW, w: width - labelW, lineHeight: 1.4 })
          y = Math.min(y, before - size * 1.4)
        }
        y -= 10
        break
      }
      case 'signatory': {
        const colW = 180
        const gap = 24
        const n = b.signers.length
        const groupW = n * colW + (n - 1) * gap
        const startX = b.align === 'left' ? M : b.align === 'center' ? M + (width - groupW) / 2 : M + width - groupW
        const top = y
        let lowest = y
        b.signers.forEach((s, i) => {
          y = top
          const x = startX + i * (colW + gap)
          const center = b.align !== 'left'
          if (s.label.trim()) drawRich(s.label, { size: 10.5 * sizeScale, align: 'left', x, w: colW })
          y -= s.label.trim() ? 28 : 30
          ensure(40)
          page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 0.8, color: ink })
          y -= 3
          drawRich(`**${s.name.toUpperCase() || ' '}**`, { size: 12 * sizeScale, align: center ? 'center' : 'left', x, w: colW, lineHeight: 1.3 })
          if (s.title.trim()) drawRich(s.title, { size: 10.5 * sizeScale, align: center ? 'center' : 'left', x, w: colW, lineHeight: 1.3 })
          lowest = Math.min(lowest, y)
        })
        y = lowest - 6
        break
      }
      case 'spacer':
        y -= SPACER_POINTS[b.size]
        if (y < M) newPage()
        break
      case 'divider':
        ensure(12)
        y -= 6
        page.drawLine({ start: { x: M, y }, end: { x: M + width, y }, thickness: 0.6, color: muted })
        y -= 6
        break
      case 'footer':
        drawRich(b.text, { size: 9 * sizeScale, align: b.align, color: muted, lineHeight: 1.35 })
        y -= 4
        break
    }
  }

  if (opts.void) {
    for (const p of pages) {
      p.drawText('VOID', { x: W / 2 - 150, y: H / 2 - 60, size: 140, font: fonts.bold, color: rgb(0.78, 0.06, 0.18), opacity: 0.18, rotate: degrees(35) })
    }
  }
  doc.setTitle('Certificate of Employment')
  doc.setProducer('HR Management System')
  return doc.save()
}

const LABELS: Record<string, string> = Object.fromEntries(CERT_FIELDS.map((f) => [f.name, f.label]))
const labelFor = (key: string) => LABELS[key] ?? key
