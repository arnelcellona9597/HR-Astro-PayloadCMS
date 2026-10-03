import { type CertificateContent, renderCertificatePdf } from '@hr/cms/server/certificates'
import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 })
  // Access check with the signed-in user's rights.
  const cert = await locals.payload.findByID({ collection: 'certificates', id, depth: 0, user: locals.user ?? undefined, overrideAccess: false, disableErrors: true })
  if (!cert) return new Response('Not found', { status: 404 })
  const pdf = await renderCertificatePdf(locals.payload, cert.content as CertificateContent, { void: cert.status === 'Void' })
  const filename = `${cert.controlNumber ?? 'certificate'}-${(cert.employeeName ?? '').replace(/[^\w]+/g, '-')}.pdf`.replace(/-+/g, '-')
  return new Response(pdf as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' },
  })
}
