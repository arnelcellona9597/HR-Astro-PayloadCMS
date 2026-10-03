import type { Payload } from 'payload'

import type { Choice } from '../components/FormField.astro'

export async function branchChoices(payload: Payload): Promise<Choice[]> {
  const res = await payload.find({ collection: 'branches', limit: 1000, depth: 0, sort: 'name', overrideAccess: true, select: { name: true } })
  return res.docs.map((b) => ({ value: b.id, label: b.name }))
}

/** Employees for pickers: "EMP-0001 — Dela Cruz, Juan P." (active employees first). */
export async function employeeChoices(payload: Payload, includeInactive = true): Promise<Choice[]> {
  const res = await payload.find({
    collection: 'employees',
    limit: 5000,
    depth: 0,
    sort: 'fullName',
    pagination: false,
    overrideAccess: true,
    where: includeInactive ? {} : { employmentStatus: { equals: 'Active' } },
    select: { employeeId: true, fullName: true, employmentStatus: true },
  })
  const active = res.docs.filter((e) => e.employmentStatus === 'Active')
  const inactive = res.docs.filter((e) => e.employmentStatus !== 'Active')
  return [...active, ...inactive].map((e) => ({
    value: e.id,
    label: `${e.fullName} — ${e.employeeId}${e.employmentStatus !== 'Active' ? ` (${e.employmentStatus})` : ''}`,
  }))
}

/** Distinct existing position titles, offered as suggestions so titles stay consistent. */
export async function positionSuggestions(payload: Payload): Promise<string[]> {
  const res = await payload.find({ collection: 'employees', limit: 5000, pagination: false, depth: 0, overrideAccess: true, select: { position: true } })
  return [...new Set(res.docs.map((e) => e.position).filter((p): p is string => Boolean(p)))].sort()
}
