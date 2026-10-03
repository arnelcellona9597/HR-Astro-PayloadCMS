import { createLocalReq, type Payload } from 'payload'

import { writeAudit as writeAuditReq } from '../hooks/audit'

/** Audit entry for actions done outside a collection hook (imports, releases…). */
export async function writeAudit(
  payload: Payload,
  user: { id: number } | null | undefined,
  data: { action: string; collectionSlug: string; docId?: string | number | null; docLabel?: string | null; changes?: unknown },
) {
  const req = await createLocalReq({ user: user ? ({ ...user, collection: 'users' } as never) : undefined }, payload)
  await writeAuditReq(req, data)
}
