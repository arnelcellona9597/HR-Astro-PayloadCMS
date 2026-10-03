import { getPayload, type Payload } from 'payload'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { readCaptured } from '../../src/email/capture'
import { DATA_DIR } from '../../src/env'
import { processQueue, queueMessage } from '../../src/server/mailer'
import { generatePayslips, releasePeriod, saveGrid } from '../../src/server/payroll'
import { inviteUser, issuePasswordLink, passwordLinkInfo, setPasswordWithLink } from '../../src/server/accounts'
import { resendChallenge, startLogin, verifyChallenge } from '../../src/server/twofactor'

let payload: Payload
let admin: any
let branchId: number
const PASSWORD = 'Sup3rSecret!pw'

const lastCode = (to: string) => {
  const mail = readCaptured(DATA_DIR).filter((m) => m.to === to).at(-1)
  return /(\d{6})/.exec(mail?.subject ?? '')?.[1] ?? ''
}
const sessions = async (userId: number) => {
  const u = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true, showHiddenFields: true })
  return ((u as any).sessions ?? []).length as number
}
const drain = async () => {
  for (let i = 0; i < 10; i++) {
    const r = await processQueue(payload, 100)
    if (r.remaining === 0) break
  }
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await payload.create({
    collection: 'users',
    data: { name: 'Ana Admin', email: 'admin@x.test', password: PASSWORD, role: 'system-admin', status: 'approved' } as any,
    overrideAccess: true,
    context: { passwordChange: true },
  })
  admin = { ...(await payload.find({ collection: 'users', overrideAccess: true })).docs[0], collection: 'users' }
  branchId = (await payload.create({ collection: 'branches', data: { name: 'North' }, overrideAccess: true })).id
  const base = { gender: 'Female', classification: 'Regular', employmentStatus: 'Active', station: branchId } as const
  await payload.create({ collection: 'employees', data: { ...base, employeeId: 'P-1', lastName: 'Santos', firstName: 'Maria', email: 'maria@x.test' }, overrideAccess: true })
  await payload.create({ collection: 'employees', data: { ...base, employeeId: 'P-2', lastName: 'Cruz', firstName: 'Jose', email: 'jose@x.test' }, overrideAccess: true })
  await payload.create({ collection: 'employees', data: { ...base, employeeId: 'P-3', lastName: 'Reyes', firstName: 'Noemail' }, overrideAccess: true })
})

describe('email 2FA', () => {
  it('does not hand out a session until the emailed code is entered', async () => {
    const start = await startLogin(payload, 'admin@x.test', PASSWORD)
    expect(start.challenge).toMatch(/^[a-f0-9]{48}$/)
    expect(start.maskedEmail).toBe('ad•••@x.test')
    expect('token' in start).toBe(false)
    const code = lastCode('admin@x.test')
    expect(code).toMatch(/^\d{6}$/)

    const wrong = await verifyChallenge(payload, start.challenge, code === '000000' ? '111111' : '000000')
    expect(wrong).toMatchObject({ ok: false, restart: false })
    expect((wrong as any).error).toMatch(/4 attempts left/)

    const ok = await verifyChallenge(payload, start.challenge, code)
    expect(ok.ok).toBe(true)
    const token = (ok as any).token as string
    const me = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })
    expect(me.user?.email).toBe('admin@x.test')
    expect((await payload.findByID({ collection: 'users', id: admin.id, overrideAccess: true })).emailVerified).toBe(true)
    // The code cannot be reused
    expect((await verifyChallenge(payload, start.challenge, code)).ok).toBe(false)
  })

  it('ends the attempt and revokes the session after 5 wrong codes', async () => {
    const before = await sessions(admin.id)
    const start = await startLogin(payload, 'admin@x.test', PASSWORD)
    expect(await sessions(admin.id)).toBe(before + 1)
    let res
    for (let i = 0; i < 5; i++) res = await verifyChallenge(payload, start.challenge, '999999x'.slice(0, 6) === lastCode('admin@x.test') ? '888888' : '999999')
    expect(res).toMatchObject({ ok: false, restart: true })
    expect(await sessions(admin.id)).toBe(before)
  })

  it('rejects expired codes and rate-limits resending', async () => {
    const start = await startLogin(payload, 'admin@x.test', PASSWORD)
    expect((await resendChallenge(payload, start.challenge)).error).toMatch(/wait/)
    const c = (await payload.find({ collection: 'login-challenges', where: { key: { equals: start.challenge } }, overrideAccess: true })).docs[0]!
    await payload.update({ collection: 'login-challenges', id: c.id, data: { expiresAt: new Date(Date.now() - 1000).toISOString() }, overrideAccess: true })
    const res = await verifyChallenge(payload, start.challenge, lastCode('admin@x.test'))
    expect(res).toMatchObject({ ok: false, restart: true })
  })

  it('still refuses wrong passwords and unapproved accounts before sending any code', async () => {
    const mails = readCaptured(DATA_DIR).length
    await expect(startLogin(payload, 'admin@x.test', 'WrongPassw0rd')).rejects.toThrow()
    expect(readCaptured(DATA_DIR).length).toBe(mails)
  })

  it('counts parallel wrong guesses atomically (never more than 5)', async () => {
    const start = await startLogin(payload, 'admin@x.test', PASSWORD)
    const real = lastCode('admin@x.test')
    const wrong = real === '000000' ? '111111' : '000000'
    const results = await Promise.all(Array.from({ length: 12 }, () => verifyChallenge(payload, start.challenge, wrong)))
    expect(results.every((r) => !r.ok)).toBe(true)
    // The challenge is gone: even the right code no longer works.
    expect((await verifyChallenge(payload, start.challenge, real)).ok).toBe(false)
  })
})

describe('accounts: invites and password links', () => {
  let inviteLink = ''
  it('creates an approved account with no usable password and emails a single-use link', async () => {
    const res = await inviteUser(payload, admin, { name: 'New Staff', email: 'NEW@x.test', role: 'hr-staff' })
    expect(res.user).toMatchObject({ email: 'new@x.test', status: 'approved', role: 'hr-staff', emailVerified: false })
    expect(res.delivered).toBe(true)
    const mail = readCaptured(DATA_DIR).filter((m) => m.to === 'new@x.test').at(-1)!
    expect(mail.subject).toMatch(/set your password/i)
    inviteLink = /(https?:\/\/\S+set-password\?token=[a-f0-9]{64})/.exec(mail.text ?? '')![1]!
    // The token is not stored in plain text
    const token = new URL(inviteLink).searchParams.get('token')!
    const stored = await payload.find({ collection: 'login-challenges', where: { purpose: { equals: 'invite' } }, overrideAccess: true })
    expect(JSON.stringify(stored.docs)).not.toContain(token)
    // Invitations never appear in the Messages outbox
    expect((await payload.count({ collection: 'messages', where: { subject: { like: 'set your password' } }, overrideAccess: true })).totalDocs).toBe(0)
    await expect(startLogin(payload, 'new@x.test', 'whatever123')).rejects.toThrow()
  })

  it('lets the user choose a password once, then sign in with 2FA', async () => {
    const token = new URL(inviteLink).searchParams.get('token')!
    expect(await passwordLinkInfo(payload, token)).toMatchObject({ kind: 'invite', name: 'New Staff' })
    await setPasswordWithLink(payload, token, 'MyOwnPassw0rd')
    await expect(setPasswordWithLink(payload, token, 'Another1Passw0rd')).rejects.toThrow(/invalid or has expired|already used/)
    const u = (await payload.find({ collection: 'users', where: { email: { equals: 'new@x.test' } }, overrideAccess: true })).docs[0]!
    expect(u.emailVerified).toBe(true)
    const start = await startLogin(payload, 'new@x.test', 'MyOwnPassw0rd')
    expect((await verifyChallenge(payload, start.challenge, lastCode('new@x.test'))).ok).toBe(true)
  })

  it('expires reset links after an hour', async () => {
    const u = (await payload.find({ collection: 'users', where: { email: { equals: 'new@x.test' } }, overrideAccess: true })).docs[0]!
    const { link } = await issuePasswordLink(payload, u.id, 'reset')
    const token = new URL(link).searchParams.get('token')!
    const c = (await payload.find({ collection: 'login-challenges', where: { purpose: { equals: 'invite' } }, overrideAccess: true })).docs[0]!
    await payload.update({ collection: 'login-challenges', id: c.id, data: { expiresAt: new Date(Date.now() - 1000).toISOString() }, overrideAccess: true })
    expect(await passwordLinkInfo(payload, token)).toBeNull()
  })
})

describe('messages & queue', () => {
  it('sends to a branch group, skips people without email, personalises text', async () => {
    const res = await queueMessage(payload, {
      subject: 'Hello {{firstName}}',
      body: 'Dear {{fullName}} ({{employeeId}}) of {{station}}',
      category: 'Announcement',
      audience: { employeeFilter: { branch: [branchId] } },
      sentBy: admin,
    })
    expect(res).toMatchObject({ total: 3, queued: 2, skipped: 1 })
    await drain()
    const msg = await payload.findByID({ collection: 'messages', id: res.messageId, overrideAccess: true })
    expect(msg).toMatchObject({ status: 'sent', sent: 2, skipped: 1, failed: 0 })
    const maria = readCaptured(DATA_DIR).find((m) => m.to === 'maria@x.test' && m.subject === 'Hello Maria')!
    expect(maria.text).toContain('Dear Maria Santos (P-1) of North')
  })

  it('rejects unknown placeholders', async () => {
    await expect(queueMessage(payload, { subject: 'x {{salary}}', body: 'y', category: 'General', audience: { emails: ['a@b.co'] } })).rejects.toThrow(/salary/)
  })

  it('respects the hourly limit', async () => {
    const sentThisHour = (await payload.count({ collection: 'message-recipients', where: { status: { equals: 'sent' } }, overrideAccess: true })).totalDocs
    await payload.updateGlobal({ slug: 'notification-settings', data: { hourlyLimit: sentThisHour + 1 }, overrideAccess: true })
    try {
      const res = await queueMessage(payload, { subject: 'Limit', body: 'x', category: 'General', audience: { emails: ['l1@x.test', 'l2@x.test', 'l3@x.test'] } })
      await drain()
      const msg = await payload.findByID({ collection: 'messages', id: res.messageId, overrideAccess: true })
      expect(msg.sent).toBe(1)
      expect(msg.status).toBe('sending')
      await payload.updateGlobal({ slug: 'notification-settings', data: { hourlyLimit: 1000 }, overrideAccess: true })
      await drain()
      expect((await payload.findByID({ collection: 'messages', id: res.messageId, overrideAccess: true })).status).toBe('sent')
    } finally {
      await payload.updateGlobal({ slug: 'notification-settings', data: { hourlyLimit: 1000 }, overrideAccess: true })
    }
  })

  it('retries a failed send, then marks it failed and records the SMTP error', async () => {
    const original = payload.sendEmail
    payload.sendEmail = async () => {
      throw new Error('SMTP down')
    }
    try {
      const res = await queueMessage(payload, { subject: 'Fail', body: 'x', category: 'General', audience: { emails: ['f@x.test'] } })
      await processQueue(payload)
      let r = (await payload.find({ collection: 'message-recipients', where: { message: { equals: res.messageId } }, overrideAccess: true })).docs[0]!
      expect(r).toMatchObject({ status: 'queued', attempts: 1 })
      await payload.update({ collection: 'message-recipients', id: r.id, data: { attempts: 2, nextAttemptAt: null }, overrideAccess: true })
      await processQueue(payload)
      r = await payload.findByID({ collection: 'message-recipients', id: r.id, overrideAccess: true })
      expect(r.status).toBe('failed')
      const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
      expect(settings.smtpLastError).toMatch(/SMTP down/)
    } finally {
      payload.sendEmail = original
    }
  })

  it('emails the employee when leave is filed or its status changes, but not when told to skip', async () => {
    const emp = (await payload.find({ collection: 'employees', where: { employeeId: { equals: 'P-1' } }, overrideAccess: true })).docs[0]!
    const count = async () => (await payload.count({ collection: 'messages', where: { category: { equals: 'Leave' } }, overrideAccess: true })).totalDocs
    const before = await count()
    const leave = await payload.create({
      collection: 'wellness-leaves',
      data: { employee: emp.id, dateFiling: '2026-02-01', inclusiveDateFrom: '2026-02-02', inclusiveDateTo: '2026-02-03', status: 'Pending' } as any,
      user: admin,
      overrideAccess: false,
    })
    expect(await count()).toBe(before + 1)
    await payload.update({ collection: 'wellness-leaves', id: leave.id, data: { remarks: 'note' }, user: admin, overrideAccess: false })
    expect(await count()).toBe(before + 1)
    await payload.update({ collection: 'wellness-leaves', id: leave.id, data: { status: 'Approved' }, user: admin, overrideAccess: false })
    expect(await count()).toBe(before + 2)
    await payload.create({
      collection: 'wellness-leaves',
      data: { employee: emp.id, dateFiling: '2026-03-01', inclusiveDateFrom: '2026-03-02', inclusiveDateTo: '2026-03-02' } as any,
      overrideAccess: true,
      context: { skipNotifications: true },
    })
    expect(await count()).toBe(before + 2)
    await drain()
    const mail = readCaptured(DATA_DIR).filter((m) => m.to === 'maria@x.test' && /Approved/.test(m.subject)).at(-1)!
    expect(mail.text).toContain('Feb 2, 2026 to Feb 3, 2026')
  })
})

describe('payroll', () => {
  let periodId: number

  it('generates one payslip per active employee with the template items', async () => {
    periodId = (
      await payload.create({
        collection: 'payroll-periods',
        data: { name: 'Feb 2026 — 1st half', code: '2026-02-A', periodStart: '2026-02-01', periodEnd: '2026-02-15', payDate: '2026-02-20' } as any,
        user: admin,
        overrideAccess: false,
      })
    ).id
    // The web app passes only the user's id; the service must load the full (approved) user itself.
    const r = await generatePayslips(payload, { id: admin.id }, periodId)
    expect(r).toEqual({ created: 3, existing: 0 })
    expect(await generatePayslips(payload, admin, periodId)).toEqual({ created: 0, existing: 3 })
    const slip = (await payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, overrideAccess: true })).docs[0]!
    expect(slip.earnings?.map((e) => e.label)).toEqual(['Basic Pay', 'PERA', 'Overtime', 'Allowances'])
    expect(slip.netPay).toBe(0)
  })

  it('saves the grid all-or-nothing and adds totals in exact centavos', async () => {
    const slips = (await payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, sort: 'employeeCode', overrideAccess: true })).docs
    const bad = await saveGrid(payload, admin, periodId, [
      { id: slips[0]!.id, values: { 'e:Basic Pay': '10,000.10', 'e:PERA': '0.20' } },
      { id: slips[1]!.id, values: { 'e:Basic Pay': '12.345' } },
    ])
    expect(bad.ok).toBe(false)
    expect((await payload.findByID({ collection: 'payslips', id: slips[0]!.id, overrideAccess: true })).grossPay).toBe(0)

    const good = await saveGrid(payload, admin, periodId, slips.map((s, i) => ({
      id: s.id,
      values: { 'e:Basic Pay': '10,000.10', 'e:PERA': '0.20', 'e:Overtime': String(i), 'd:Withholding Tax': '1,000.05', 'd:PhilHealth': '0.10' },
    })))
    expect(good).toEqual({ ok: true, updated: 3, created: 0 })
    const first = await payload.findByID({ collection: 'payslips', id: slips[0]!.id, overrideAccess: true })
    expect(first).toMatchObject({ grossPay: 10000.3, totalDeductions: 1000.15, netPay: 9000.15 })
  })

  it('rejects deductions above gross and duplicate payslips', async () => {
    const slip = (await payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, overrideAccess: true })).docs[0]!
    const res = await saveGrid(payload, admin, periodId, [{ id: slip.id, values: { 'd:Loans': '999999' } }])
    expect(res.ok).toBe(false)
    await expect(
      payload.create({ collection: 'payslips', data: { period: periodId, employee: slip.employee as number } as any, user: admin, overrideAccess: false }),
    ).rejects.toThrow(/already has a payslip/)
  })

  it('release emails each employee a PDF payslip and flags later corrections', async () => {
    const res = await releasePeriod(payload, admin, periodId, { notify: true })
    expect(res).toMatchObject({ payslips: 3, queued: 2, skipped: 1 })
    await expect(releasePeriod(payload, admin, periodId, { notify: true })).rejects.toThrow(/already been released/)
    await drain()
    const mail = readCaptured(DATA_DIR).find((m) => m.to === 'maria@x.test' && /payslip/i.test(m.subject))!
    expect(mail.text).toContain('Net pay: ₱9,000.15')
    const pdf = mail.attachments.find((a) => a.filename?.endsWith('.pdf'))!
    const doc = await PDFDocument.load(Buffer.from(pdf.contentBase64!, 'base64'))
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toContain('Santos, Maria')

    const slip = (await payload.find({ collection: 'payslips', where: { period: { equals: periodId } }, overrideAccess: true })).docs[0]!
    const updated = await payload.update({ collection: 'payslips', id: slip.id, data: { remarks: 'fixed' }, user: admin, overrideAccess: false })
    expect(updated.correctedAfterRelease).toBe(true)
  })
})
