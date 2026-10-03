import { escapeHtml, readableOn, resolvePalette, textToHtml } from '@hr/shared'
import type { Payload } from 'payload'

import { SERVER_URL } from '../env'

export type Brand = { companyName: string; primary: string; onPrimary: string; logoUrl: string | null; footer: string; replyTo?: string }

export async function loadBrand(payload: Payload): Promise<Brand> {
  const [site, notif] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings', depth: 1, overrideAccess: true }),
    payload.findGlobal({ slug: 'notification-settings', overrideAccess: true }),
  ])
  const palette = resolvePalette(site.palette)
  const logo = site.logo && typeof site.logo === 'object' ? site.logo : null
  return {
    companyName: site.companyName ?? 'HR Management System',
    primary: palette.primary,
    onPrimary: readableOn(palette.primary),
    logoUrl: logo ? `${SERVER_URL}/files/${logo.id}` : null,
    footer: notif.footer ?? '',
    replyTo: notif.replyTo ?? undefined,
  }
}

/** Branded HTML email + plain-text alternative. `body` is plain text written by HR (escaped here). */
export function renderEmail(brand: Brand, subject: string, body: string, opts: { sender?: string } = {}) {
  const footerLines = [brand.footer, opts.sender ? `Sent by ${opts.sender} · ${brand.companyName}` : brand.companyName].filter(Boolean)
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111418">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:${brand.primary};color:${brand.onPrimary};padding:18px 24px;font-size:16px;font-weight:600">
${brand.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="" height="32" style="height:32px;vertical-align:middle;margin-right:10px;border-radius:6px;background:#fff">` : ''}${escapeHtml(brand.companyName)}
</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<h1 style="margin:0 0 16px;font-size:18px">${escapeHtml(subject)}</h1>
${textToHtml(body)}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">${footerLines.map((l) => escapeHtml(l)).join('<br>')}</td></tr>
</table></td></tr></table></body></html>`
  const text = `${subject}\n\n${body.trim()}\n\n--\n${footerLines.join('\n')}`
  return { html, text }
}
