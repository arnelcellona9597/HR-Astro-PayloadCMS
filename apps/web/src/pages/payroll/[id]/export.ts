import { exportPeriodWorkbook } from '@hr/cms/server/payroll-excel'
import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params, locals }) => {
  const { filename, buffer } = await exportPeriodWorkbook(locals.payload, Number(params.id))
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
