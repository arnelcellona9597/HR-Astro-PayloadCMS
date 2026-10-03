import { ONBOARDING_REQUIREMENTS, REQUIREMENT_STATUSES } from '@hr/shared'
import type { APIRoute } from 'astro'

import { toFormErrors } from '../../lib/errors'

/** Inline update of one onboarding requirement from the tracker table. */
export const POST: APIRoute = async ({ request, locals }) => {
  const { payload, user } = locals
  const body = (await request.json().catch(() => null)) as { id?: number; key?: string; value?: string } | null
  const keyOk = ONBOARDING_REQUIREMENTS.some((r) => r.key === body?.key)
  const valueOk = (REQUIREMENT_STATUSES as readonly string[]).includes(body?.value ?? '')
  if (!body || !Number.isInteger(body.id) || !keyOk || !valueOk) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  try {
    const doc = await payload.update({
      collection: 'applications',
      id: body.id!,
      data: { [body.key!]: body.value } as never,
      user,
      overrideAccess: false,
      depth: 0,
    })
    return Response.json({ requirementsStatus: doc.requirementsStatus, requirementsMissing: doc.requirementsMissing })
  } catch (err) {
    return Response.json({ error: toFormErrors(err).form }, { status: 400 })
  }
}
