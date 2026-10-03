import type { APIRoute } from 'astro'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

/**
 * Serves an uploaded file after Payload's access rules allow it: signed-in staff see everything,
 * visitors only files marked public (the logo). Files never live in a public web folder.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 })
  let doc
  try {
    doc = await locals.payload.findByID({ collection: 'media', id, user: locals.user ?? undefined, overrideAccess: false, depth: 0 })
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const staticDir = locals.payload.collections.media.config.upload.staticDir as string
  const file = path.join(staticDir, path.basename(doc.filename ?? ''))
  if (!doc.filename || !fs.existsSync(file)) return new Response('Not found', { status: 404 })
  const stat = fs.statSync(file)
  const isPublic = Boolean(doc.isPublic)
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': doc.mimeType ?? 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Cache-Control': isPublic ? 'public, max-age=300' : 'private, max-age=300',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
      'X-Content-Type-Options': 'nosniff',
      // SVGs could carry scripts; never let an uploaded file run code on this origin.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
