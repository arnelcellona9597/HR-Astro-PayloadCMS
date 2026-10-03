import type { APIRoute } from 'astro'

import { logout } from '../lib/auth'

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  await logout(locals.payload, locals.user, cookies)
  return redirect('/login')
}
