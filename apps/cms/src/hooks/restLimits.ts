import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'

export const REST_MAX_LIMIT = 200

/**
 * REST requests can't dump whole tables in one call: `limit` is capped and `pagination=false`
 * is ignored. (The app's own pages use the Local API and are not affected.)
 */
export const clampRestReads: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (req.payloadAPI === 'REST' && operation === 'read') {
    const a = args as { limit?: number; pagination?: boolean }
    if (a.pagination === false) a.pagination = true
    if (typeof a.limit !== 'number' || a.limit <= 0 || a.limit > REST_MAX_LIMIT) a.limit = Math.min(a.limit && a.limit > 0 ? a.limit : 10, REST_MAX_LIMIT)
  }
  return args
}

export function withRestLimits(c: CollectionConfig): CollectionConfig {
  return { ...c, hooks: { ...c.hooks, beforeOperation: [clampRestReads, ...(c.hooks?.beforeOperation ?? [])] } }
}
