import { fileTypeFromBuffer } from 'file-type'
import type { Payload } from 'payload'

import type { User } from '@hr/cms/types'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Checks an uploaded file by its CONTENT (magic bytes), not the browser-supplied type or name.
 * Returns an error message, or null when it is acceptable (or empty).
 */
export async function checkUpload(file: File | null, types: string[], maxBytes: number): Promise<string | null> {
  if (!file || file.size === 0) return null
  if (file.size > maxBytes) return `The file must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`
  const detected = await fileTypeFromBuffer(new Uint8Array(await file.arrayBuffer()))
  if (!detected || !types.includes(detected.mime)) {
    const names = types.map((t) => t.split('/')[1]!.toUpperCase().replace('JPEG', 'JPG')).join(', ')
    return `This file type isn't allowed. Use ${names}.`
  }
  return null
}

/** Images (profile pictures, logo). */
export function checkImage(file: File | null, maxBytes = MAX_IMAGE_BYTES, types = IMAGE_TYPES): Promise<string | null> {
  return checkUpload(file, types, maxBytes)
}

export async function saveUpload(
  payload: Payload,
  user: User | null,
  file: File,
  alt: string,
  isPublic = false,
): Promise<number> {
  const data = Buffer.from(await file.arrayBuffer())
  const detected = await fileTypeFromBuffer(new Uint8Array(data))
  const doc = await payload.create({
    collection: 'media',
    data: { alt, isPublic },
    file: {
      data,
      // Trust the detected type, never the browser's claim.
      mimetype: detected?.mime ?? 'application/octet-stream',
      name: file.name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'upload',
      size: file.size,
    },
    user: user ?? undefined,
    overrideAccess: false,
  })
  return doc.id
}
