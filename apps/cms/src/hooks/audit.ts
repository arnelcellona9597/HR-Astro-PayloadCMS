import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

const IGNORED = new Set([
  'updatedAt',
  'createdAt',
  'id',
  'age',
  'lengthOfService',
  // auth bookkeeping
  'sessions',
  'loginAttempts',
  'lockUntil',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'salt',
  'hash',
  'password',
])

type Doc = Record<string, unknown>

/** Relationship values may arrive populated ({ id, … }) or as raw ids — compare by id. */
function comparable(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'id' in (v as Doc)) return (v as Doc).id
  if (v === undefined || v === '') return null
  return v
}

export function diffDocs(before: Doc | undefined, after: Doc): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)])
  for (const key of keys) {
    if (IGNORED.has(key) || key.startsWith('_') || key === 'sizes') continue
    const from = comparable(before?.[key])
    const to = comparable(after[key])
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from: from ?? null, to: to ?? null }
  }
  return changes
}

function actor(req: PayloadRequest) {
  const u = req.user as { id?: number; name?: string; email?: string } | null
  return { user: u?.id ?? null, userName: u ? u.name || u.email || null : 'System' }
}

export async function writeAudit(
  req: PayloadRequest,
  data: { action: string; collectionSlug: string; docId?: string | number | null; docLabel?: string | null; changes?: unknown },
) {
  await req.payload.create({
    collection: 'audit-logs',
    data: {
      ...actor(req),
      action: data.action,
      collectionSlug: data.collectionSlug,
      docId: data.docId == null ? null : String(data.docId),
      docLabel: data.docLabel ?? null,
      changes: (data.changes ?? null) as Record<string, unknown> | null,
    },
    overrideAccess: true,
    req,
  })
}

/** Records who created/changed/deleted what, field by field. Skip with `context.skipAudit`. */
export function auditHooks(labelField: string) {
  const afterChange: CollectionAfterChangeHook = async ({ collection, doc, previousDoc, operation, req }) => {
    if (req.context?.skipAudit) return doc
    const changes = operation === 'create' ? null : diffDocs(previousDoc, doc)
    if (changes && Object.keys(changes).length === 0) return doc
    await writeAudit(req, {
      action: operation,
      collectionSlug: collection.slug,
      docId: doc.id,
      docLabel: (doc[labelField] as string) ?? null,
      changes,
    })
    return doc
  }
  const afterDelete: CollectionAfterDeleteHook = async ({ collection, doc, req }) => {
    if (req.context?.skipAudit) return doc
    await writeAudit(req, {
      action: 'delete',
      collectionSlug: collection.slug,
      docId: doc.id,
      docLabel: (doc[labelField] as string) ?? null,
      changes: doc,
    })
    return doc
  }
  return { afterChange: [afterChange], afterDelete: [afterDelete] }
}
