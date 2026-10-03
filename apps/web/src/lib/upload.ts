import { fileTypeFromBuffer } from 'file-type'
import type { Payload } from 'payload'

import type { User } from '@hr/cms/types'

import { UserError } from './errors'

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

/**
 * Reads an uploaded image for saving: checks size and the type found in its CONTENT, and returns the
 * bytes with that detected type. Throws a UserError with a message for the person when it isn't valid.
 */
export async function readImage(file: File | null, maxBytes = MAX_IMAGE_BYTES, types = IMAGE_TYPES) {
  if (!file || file.size === 0) throw new UserError('Choose a picture to upload.')
  const problem = await checkUpload(file, types, maxBytes)
  if (problem) throw new UserError(problem)
  const data = Buffer.from(await file.arrayBuffer())
  const detected = await fileTypeFromBuffer(new Uint8Array(data))
  return { data, mimetype: detected!.mime, name: file.name, size: file.size }
}
