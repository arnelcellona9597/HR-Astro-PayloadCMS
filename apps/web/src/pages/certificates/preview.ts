// Live preview for the "Issue certificate" form: the certificate as it would be issued (HTML fragment).
import { composeCertificate } from '@hr/cms/server/certificates'
import { renderCertificateHtml } from '@hr/shared/certificates'
import type { APIRoute } from 'astro'

import { errorMessage } from '../../lib/errors'

export const GET: APIRoute = async ({ url, locals }) => {
  const p = url.searchParams
  const templateId = Number(p.get('template'))
  const employeeId = Number(p.get('employee'))
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' }
  if (!templateId || !employeeId) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
  // Read access with the user's own rights (both roles may read templates and employees).
  const [t, e] = await Promise.all([
    locals.payload.findByID({ collection: 'certificate-templates', id: templateId, depth: 0, user: locals.user ?? undefined, overrideAccess: false, disableErrors: true }),
    locals.payload.findByID({ collection: 'employees', id: employeeId, depth: 0, user: locals.user ?? undefined, overrideAccess: false, disableErrors: true }),
  ])
  if (!t || !e) return new Response('Not found', { status: 404, headers })
  try {
    const { content } = await composeCertificate(locals.payload, {
      templateId,
      employeeId,
      purpose: (p.get('purpose') ?? '').slice(0, 200),
      issuedDate: p.get('issuedDate'),
      controlNumber: `${t.prefix}-${(p.get('issuedDate') ?? '').slice(0, 4) || 'YYYY'}-????`,
    })
    const html = renderCertificateHtml(content.blocks, { companyName: content.companyName, logoUrl: content.logoId ? `/files/${content.logoId}` : null, font: content.font })
    return new Response(html, { headers: { ...headers, 'X-Paper': content.paperSize, 'X-Margin': content.margin } })
  } catch (err) {
    return new Response(errorMessage(err), { status: 400, headers })
  }
}
