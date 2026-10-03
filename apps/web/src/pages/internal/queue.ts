import { drainQueue } from '@hr/cms/server/mailer'
import type { APIRoute } from 'astro'
import crypto from 'node:crypto'

/**
 * Cron entry point (every 5 minutes): sends queued emails even when nobody is using the app.
 *   curl -s -H "X-Queue-Key: <key from Email Settings>" "https://hr.example.com/internal/queue"
 * The key travels in a header so it doesn't end up in web server access logs.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const { payload } = locals
  const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true })
  const given = Buffer.from(request.headers.get('x-queue-key') ?? '')
  const expected = Buffer.from(settings.queueKey ?? '')
  if (!expected.length || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return new Response('Forbidden', { status: 403 })
  }
  return Response.json(await drainQueue(payload))
}
