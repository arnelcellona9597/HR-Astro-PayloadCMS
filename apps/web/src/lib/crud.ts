import type { AstroGlobal } from 'astro'
import type { ModuleField } from '@hr/shared/modules'
import type { CollectionSlug } from 'payload'

import { toFormErrors } from './errors'
import { setFlash } from './flash'
import { formValues, parseModuleForm } from './forms'
import { inputValue } from './format'

export type FormState = {
  values: Record<string, string>
  errors: Record<string, string>
  formError?: string
  redirect?: Response
}

/** Current values of a saved document as strings for form inputs. */
export function docToValues(doc: Record<string, unknown> | null | undefined, fields: ModuleField[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!doc) return out
  for (const f of fields) out[f.name] = inputValue(doc[f.name], f.kind)
  return out
}

/**
 * Shared POST handling for create/edit pages: parse the form with the module definition, save through
 * Payload (same validation and access rules as everywhere else), then redirect or show field errors.
 */
export async function handleSave(
  Astro: AstroGlobal,
  opts: {
    collection: CollectionSlug
    fields: ModuleField[]
    id?: number
    initial?: Record<string, string>
    /** Adjust parsed data before saving (e.g. attach an uploaded file). Return an error map to stop. */
    prepare?: (data: Record<string, unknown>, fd: FormData) => Promise<Record<string, string> | void>
    /** Runs after a successful save (e.g. link related records). */
    afterSave?: (doc: Record<string, unknown>) => Promise<void>
    successMessage: (doc: Record<string, unknown>) => string
    redirectTo: (doc: Record<string, unknown>) => string
  },
): Promise<FormState> {
  const state: FormState = { values: opts.initial ?? {}, errors: {} }
  if (Astro.request.method !== 'POST') return state
  const { payload, user } = Astro.locals
  const fd = await Astro.request.formData()
  state.values = formValues(fd)
  const { data, errors } = parseModuleForm(fd, opts.fields)
  const extra = opts.prepare ? await opts.prepare(data, fd) : undefined
  Object.assign(errors, extra ?? {})
  if (Object.keys(errors).length) {
    state.errors = errors
    state.formError = 'Please fix the highlighted fields.'
    Astro.response.status = 400
    return state
  }
  try {
    const doc = (
      opts.id
        ? await payload.update({ collection: opts.collection, id: opts.id, data: data as never, user, overrideAccess: false, depth: 0 })
        : await payload.create({ collection: opts.collection, data: data as never, user, overrideAccess: false, depth: 0 })
    ) as unknown as Record<string, unknown>
    await opts.afterSave?.(doc)
    setFlash(Astro.cookies, { type: 'success', message: opts.successMessage(doc) })
    state.redirect = Astro.redirect(opts.redirectTo(doc))
  } catch (err) {
    const fe = toFormErrors(err)
    state.errors = fe.fields
    state.formError = fe.form
    Astro.response.status = 400
  }
  return state
}

/** POST handler for delete buttons. */
export async function handleDelete(
  Astro: AstroGlobal,
  collection: CollectionSlug,
  id: number,
  label: string,
  redirectTo: string,
  backTo: string,
): Promise<Response> {
  const { payload, user } = Astro.locals
  try {
    await payload.delete({ collection, id, user, overrideAccess: false })
    setFlash(Astro.cookies, { type: 'success', message: `${label} was deleted.` })
    return Astro.redirect(redirectTo)
  } catch (err) {
    const fe = toFormErrors(err)
    setFlash(Astro.cookies, { type: 'error', message: fe.form ?? 'Could not delete.' })
    return Astro.redirect(backTo)
  }
}
