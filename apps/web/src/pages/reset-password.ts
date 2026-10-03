import type { APIRoute } from 'astro'

// Old reset links point here; password links are now handled by /set-password.
export const GET: APIRoute = ({ url, redirect }) => redirect(`/set-password?token=${encodeURIComponent(url.searchParams.get('token') ?? '')}`, 302)
