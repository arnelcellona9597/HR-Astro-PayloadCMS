// Profile pictures for HR accounts (System Admins and HR Staff change their own on "My account").
// The picture is stored as a private media file; replacing or removing it deletes the old file so
// personal images don't pile up.
import type { Payload } from 'payload'

import { UserError } from './errors'

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

type Account = { id: number; name?: string | null; avatar?: number | { id: number } | null; collection?: string } & Record<string, unknown>
export type AvatarUpload = { data: Buffer; mimetype: string; name: string; size: number }

const idOf = (v: Account['avatar']) => (typeof v === 'object' && v ? v.id : (v ?? null))

/**
 * Sets (upload) or removes (null) the signed-in user's own profile picture.
 * `mimetype` must come from the file's content (see apps/web/src/lib/upload.ts), not the browser.
 */
export async function setOwnAvatar(payload: Payload, user: Account, upload: AvatarUpload | null) {
  const current = await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })
  const previous = idOf(current.avatar as Account['avatar'])
  let created: number | null = null
  if (upload) {
    if (upload.size > AVATAR_MAX_BYTES) throw new UserError('The picture must be 2 MB or smaller.')
    if (!AVATAR_TYPES.includes(upload.mimetype)) throw new UserError('Use a PNG, JPG, WEBP or GIF image.')
    const media = await payload.create({
      collection: 'media',
      data: { alt: `Profile picture of ${current.name}`, isPublic: false },
      file: { ...upload, name: `avatar-${user.id}-${upload.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'image'}` },
      user: user as never,
      overrideAccess: false,
    })
    created = media.id
  } else if (!previous) {
    return
  }
  try {
    await payload.update({ collection: 'users', id: user.id, data: { avatar: created }, user: user as never, overrideAccess: false })
  } catch (err) {
    if (created) await payload.delete({ collection: 'media', id: created, overrideAccess: true }).catch(() => {})
    throw err
  }
  if (previous && previous !== created) {
    await payload.delete({ collection: 'media', id: previous, overrideAccess: true }).catch(() => {})
  }
}
