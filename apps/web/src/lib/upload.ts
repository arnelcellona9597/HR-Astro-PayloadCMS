import type { Payload } from 'payload'

import type { User } from '@hr/cms/types'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Validates an uploaded image from a form; returns an error message or null. */
export function checkImage(file: File | null, maxBytes = MAX_IMAGE_BYTES, types = IMAGE_TYPES): string | null {
  if (!file || file.size === 0) return null
  if (!types.includes(file.type)) return 'Upload a PNG, JPG, WEBP or GIF image.'
  if (file.size > maxBytes) return `The image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`
  return null
}

export async function saveUpload(
  payload: Payload,
  user: User | null,
  file: File,
  alt: string,
  isPublic = false,
): Promise<number> {
  const doc = await payload.create({
    collection: 'media',
    data: { alt, isPublic },
    file: {
      data: Buffer.from(await file.arrayBuffer()),
      mimetype: file.type,
      name: file.name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'upload',
      size: file.size,
    },
    user: user ?? undefined,
    overrideAccess: false,
  })
  return doc.id
}
