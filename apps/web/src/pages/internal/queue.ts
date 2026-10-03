import { drainQueue } from '@hr/cms/server/mailer'
import type { APIRoute } from 'astro'
import crypto from 'node:crypto'

/**
 * Cron entry point (every 5 minutes): sends queued emails even when nobody is using the app.
 *   curl -s "https://hr.example.com/internal/queue?key=<key from Email Settings>"
 */
export const GET: APIRoute = async ({ url, locals }) => {
  const { payload } = locals
  const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
  const given = Buffer.from(url.searchParams.get('key') ?? '')
  const expected = Buffer.from(settings.queueKey ?? '')
  if (!expected.length || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return new Response('Forbidden', { status: 403 })
  }
  const result = await drainQueue(payload)
  return Response.json(result)
}
