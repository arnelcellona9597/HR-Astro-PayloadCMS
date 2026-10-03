import type { APIRoute } from 'astro'

// Public sign-up is disabled: HR accounts are created by a System Admin (HR Accounts page).
export const GET: APIRoute = ({ redirect }) => redirect('/login?notice=no-signup', 302)
export const POST = GET
