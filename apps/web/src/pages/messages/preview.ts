import { previewMessage } from '@hr/cms/server/mailer'
import type { APIRoute } from 'astro'

import { parseCompose } from '../../lib/compose'
import { errorMessage } from '../../lib/errors'

export const POST: APIRoute = async ({ request, locals }) => {
  const { input, error } = parseCompose(await request.formData(), locals.user)
  if (!input) return Response.json({ error }, { status: 400 })
  try {
    return Response.json(await previewMessage(locals.payload, input))
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 400 })
  }
}
