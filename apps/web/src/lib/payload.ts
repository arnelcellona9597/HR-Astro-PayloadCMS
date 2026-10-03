import config from '@hr/cms/config'
import { getPayload, type Payload } from 'payload'

/**
 * The one Payload instance for this process (shared with the admin panel in production).
 * All HR data access in the Astro app goes through Payload's Local API with the signed-in
 * user, so the same access rules, validation and hooks apply as in the admin panel.
 */
export function getHr(): Promise<Payload> {
  return getPayload({ config })
}
