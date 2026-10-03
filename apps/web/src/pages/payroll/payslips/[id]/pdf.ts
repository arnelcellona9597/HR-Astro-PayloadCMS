import { payslipPdf } from '@hr/cms/server/payroll'
import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.id)
  // Access check: the signed-in user must be able to read this payslip.
  const ok = await locals.payload.findByID({ collection: 'payslips', id, depth: 0, user: locals.user ?? undefined, overrideAccess: false, disableErrors: true })
  if (!ok) return new Response('Not found', { status: 404 })
  const { filename, pdf } = await payslipPdf(locals.payload, id)
  return new Response(pdf as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store' },
  })
}
