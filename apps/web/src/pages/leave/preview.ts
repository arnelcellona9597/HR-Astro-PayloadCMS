import { checkLeave } from '@hr/cms/server/leave'
import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ url, locals }) => {
  const employee = Number(url.searchParams.get('employee'))
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  const exclude = Number(url.searchParams.get('exclude')) || undefined
  if (!Number.isInteger(employee) || employee <= 0) return Response.json({ ok: false, error: 'Select an employee.' })
  const result = await checkLeave(locals.payload, { employee, from, to, status: url.searchParams.get('status'), excludeId: exclude })
  return Response.json({ ok: result.ok, error: result.error, days: result.count?.total ?? 0, years: result.years })
}
