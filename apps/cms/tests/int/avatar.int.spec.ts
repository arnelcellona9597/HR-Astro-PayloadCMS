import { PDFDocument } from 'pdf-lib'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { setOwnAvatar } from '../../src/server/avatar'

let payload: Payload
let admin: any
let staff: any

// A valid 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const png = (name = 'me.png') => ({ data: PNG, mimetype: 'image/png', name, size: PNG.length })

const mkUser = async (email: string, role: string) => {
  const u = await payload.create({
    collection: 'users',
    data: { name: email, email, password: 'Sup3rSecret!pw', role, status: 'approved' } as any,
    overrideAccess: true,
    context: { passwordChange: true },
  })
  return { ...u, collection: 'users' }
}
const avatarOf = async (id: number) => (await payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })).avatar as number | null
const mediaExists = async (id: number) => Boolean(await payload.findByID({ collection: 'media', id, overrideAccess: true, disableErrors: true }))

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  admin = await mkUser('admin@avatar.test', 'system-admin')
  staff = await mkUser('staff@avatar.test', 'hr-staff')
})

describe('profile pictures', () => {
  it('HR Staff and System Admins set their own picture; it stays private', async () => {
    await setOwnAvatar(payload, staff, png())
    const first = await avatarOf(staff.id)
    expect(first).toBeTruthy()
    const media = await payload.findByID({ collection: 'media', id: first!, overrideAccess: true })
    expect(media.isPublic).toBe(false)
    expect(media.mimeType).toBe('image/png')

    await setOwnAvatar(payload, admin, png('admin.png'))
    expect(await avatarOf(admin.id)).toBeTruthy()
  })

  it('replacing or removing a picture deletes the old file', async () => {
    const before = (await avatarOf(staff.id))!
    await setOwnAvatar(payload, staff, png('new.png'))
    const after = (await avatarOf(staff.id))!
    expect(after).not.toBe(before)
    expect(await mediaExists(before)).toBe(false)

    await setOwnAvatar(payload, staff, null)
    expect(await avatarOf(staff.id)).toBeNull()
    expect(await mediaExists(after)).toBe(false)
  })

  it('refuses non-images and oversized files', async () => {
    await expect(setOwnAvatar(payload, staff, { data: Buffer.from('%PDF-1.4'), mimetype: 'application/pdf', name: 'x.pdf', size: 8 })).rejects.toThrow(
      /PNG, JPG, WEBP or GIF/,
    )
    await expect(setOwnAvatar(payload, staff, { ...png(), size: 3 * 1024 * 1024 })).rejects.toThrow(/2 MB/)
  })

  it('a scanned document cannot become a profile picture by id', async () => {
    const d = await PDFDocument.create()
    d.addPage()
    const pdf = Buffer.from(await d.save())
    const doc = await payload.create({ collection: 'media', data: { alt: 'scan' }, file: { data: pdf, mimetype: 'application/pdf', name: 'id.pdf', size: pdf.length }, user: staff, overrideAccess: false })
    await expect(payload.update({ collection: 'users', id: staff.id, data: { avatar: doc.id }, user: staff, overrideAccess: false })).rejects.toThrow(/profile picture must be/)
  })

  it('HR Staff cannot change another account’s picture', async () => {
    const m = await payload.create({ collection: 'media', data: { alt: 'x' }, file: png('x.png'), user: staff, overrideAccess: false })
    await expect(payload.update({ collection: 'users', id: admin.id, data: { avatar: m.id }, user: staff, overrideAccess: false })).rejects.toThrow()
  })
})
