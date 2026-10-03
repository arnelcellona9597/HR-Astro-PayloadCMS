import { exportPeriodWorkbook } from '@hr/cms/server/payroll-excel'
import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 })
  // Access check with the signed-in user before exporting.
  const period = await locals.payload.findByID({ collection: 'payroll-periods', id, depth: 0, user: locals.user ?? undefined, overrideAccess: false, disableErrors: true })
  if (!period) return new Response('Not found', { status: 404 })
  const { filename, buffer } = await exportPeriodWorkbook(locals.payload, id)
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
