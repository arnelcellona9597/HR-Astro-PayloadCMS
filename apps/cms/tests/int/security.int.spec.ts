import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { loadSmtpConfig } from '../../src/email/dbAdapter'
import { checkZip } from '../../src/server/excel/zipguard'

let payload: Payload
let admin: any
let staff: any
const PASSWORD = 'Sup3rSecret!pw'

const mkUser = async (email: string, role: string) => {
  const u = await payload.create({
    collection: 'users',
    data: { name: email, email, password: PASSWORD, role, status: 'approved' } as any,
    overrideAccess: true,
    context: { passwordChange: true },
  })
  return { ...u, collection: 'users' }
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  admin = await mkUser('admin@sec.test', 'system-admin')
  staff = await mkUser('staff@sec.test', 'hr-staff')
})

describe('SMTP settings live in the database, encrypted', () => {
  it('stores the password encrypted and never returns it', async () => {
    await payload.updateGlobal({
      slug: 'smtp-settings',
      data: { host: 'mail.example.test', port: 465, security: 'ssl', username: 'info@example.test', password: 'S3cret-smtp-pass', fromAddress: 'info@example.test' } as any,
      user: admin,
      overrideAccess: false,
    })
    const viaApi = await payload.findGlobal({ slug: 'smtp-settings', user: admin, overrideAccess: false })
    expect(JSON.stringify(viaApi)).not.toContain('S3cret-smtp-pass')
    expect((viaApi as any).passwordEnc).toBeUndefined()
    expect(viaApi.passwordSet).toBe(true)
    const raw = (await payload.db.findGlobal({ slug: 'smtp-settings' } as any)) as any
    expect(raw.passwordEnc).toBeTruthy()
    expect(raw.passwordEnc).not.toContain('S3cret')
    expect((await loadSmtpConfig(payload))?.password).toBe('S3cret-smtp-pass')
  })

  it('keeps the saved password when the field is left blank', async () => {
    await payload.updateGlobal({ slug: 'smtp-settings', data: { port: 587, password: '' } as any, user: admin, overrideAccess: false })
    const { invalidateSmtpCache } = await import('../../src/email/dbAdapter')
    invalidateSmtpCache()
    expect((await loadSmtpConfig(payload))?.password).toBe('S3cret-smtp-pass')
  })

  it('is invisible and unchangeable for HR Staff', async () => {
    await expect(payload.findGlobal({ slug: 'smtp-settings', user: staff, overrideAccess: false })).rejects.toThrow()
    await expect(payload.updateGlobal({ slug: 'smtp-settings', data: { host: 'evil.test' }, user: staff, overrideAccess: false })).rejects.toThrow()
  })
})

describe('system fields and records are protected', () => {
  it('HR Staff can neither read nor overwrite the cron key and mail status', async () => {
    const before = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
    const seen = await payload.findGlobal({ slug: 'notification-settings', user: staff, overrideAccess: false })
    expect(seen.queueKey).toBeUndefined()
    await payload.updateGlobal({ slug: 'notification-settings', data: { queueKey: 'hijacked', smtpLastError: 'x' } as any, user: staff, overrideAccess: false })
    const after = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
    expect(after.queueKey).toBe(before.queueKey)
    expect(after.smtpLastError ?? null).toBe(before.smtpLastError ?? null)
  })

  it('notifications can only be marked read, not redirected to another user or link', async () => {
    const n = await payload.create({ collection: 'notifications', data: { user: staff.id, title: 'Hello', link: '/leave' }, overrideAccess: true })
    await payload.update({ collection: 'notifications', id: n.id, data: { user: admin.id, link: '//evil.test', readAt: new Date().toISOString() } as any, user: staff, overrideAccess: false })
    const after = await payload.findByID({ collection: 'notifications', id: n.id, depth: 0, overrideAccess: true })
    expect(after.user).toBe(staff.id)
    expect(after.link).toBe('/leave')
    expect(after.readAt).toBeTruthy()
  })

  it('HR Staff cannot see account history in the audit log', async () => {
    await payload.update({ collection: 'users', id: staff.id, data: { name: 'Renamed' }, user: admin, overrideAccess: false })
    const forStaff = await payload.find({ collection: 'audit-logs', where: { collectionSlug: { equals: 'users' } }, user: staff, overrideAccess: false })
    const forAdmin = await payload.find({ collection: 'audit-logs', where: { collectionSlug: { equals: 'users' } }, user: admin, overrideAccess: false })
    expect(forStaff.totalDocs).toBe(0)
    expect(forAdmin.totalDocs).toBeGreaterThan(0)
  })

  it('only System Admins can make a file public', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
    const file = { data: png, mimetype: 'image/png', name: 'x.png', size: png.length }
    const m = await payload.create({ collection: 'media', data: { alt: 'x', isPublic: true }, file, user: staff, overrideAccess: false })
    expect(m.isPublic).toBe(false)
    const m2 = await payload.create({ collection: 'media', data: { alt: 'y', isPublic: true }, file, user: admin, overrideAccess: false })
    expect(m2.isPublic).toBe(true)
  })

  it('refuses a non-image as the (public) logo', async () => {
    const d = await PDFDocument.create()
    d.addPage()
    const pdf = Buffer.from(await d.save())
    const doc = await payload.create({ collection: 'media', data: { alt: 'scan' }, file: { data: pdf, mimetype: 'application/pdf', name: 'id.pdf', size: pdf.length }, user: admin, overrideAccess: false })
    await expect(payload.updateGlobal({ slug: 'site-settings', data: { logo: doc.id }, user: admin, overrideAccess: false })).rejects.toThrow(/logo must be/)
    expect((await payload.findByID({ collection: 'media', id: doc.id, overrideAccess: true })).isPublic).toBe(false)
  })

  it('caps REST page sizes', async () => {
    for (let i = 0; i < 3; i++) {
      await payload.create({ collection: 'branches', data: { name: `B${i}` }, overrideAccess: true })
    }
    const req = await createLocalReq({ user: staff }, payload)
    ;(req as any).payloadAPI = 'REST'
    const res = await payload.find({ collection: 'branches', limit: 100000, pagination: false, req, overrideAccess: false })
    expect(res.limit).toBeLessThanOrEqual(200)
  })
})

describe('Excel zip-bomb guard', () => {
  it('accepts a normal workbook', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('A').addRow(['x'])
    expect(checkZip(Buffer.from(await wb.xlsx.writeBuffer()))).toBeNull()
  })

  it('rejects non-zip data and archives that would expand too much', () => {
    expect(checkZip(Buffer.from('not a zip at all, definitely not'))).toMatch(/not a valid Excel/)
    // Hand-made zip: one entry claiming 100 MB uncompressed from 10 bytes.
    const name = Buffer.from('xl/a.xml')
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    name.copy(local, 30)
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt32LE(10, 20)
    central.writeUInt32LE(100 * 1024 * 1024, 24)
    central.writeUInt16LE(name.length, 28)
    name.copy(central, 46)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(1, 8)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(central.length, 12)
    eocd.writeUInt32LE(local.length, 16)
    expect(checkZip(Buffer.concat([local, central, eocd]))).toMatch(/suspiciously|too large/)
  })
})
