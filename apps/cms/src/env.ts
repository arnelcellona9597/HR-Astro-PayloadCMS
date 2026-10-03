import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

// Both the Payload admin (Next.js) and the Astro app import this config, from different working
// directories. Find the monorepo root and load its single `.env` (existing env vars win).
function findRepoRoot(start: string): string | null {
  let dir = start
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const root = findRepoRoot(process.cwd())
if (root) dotenv.config({ path: path.join(root, '.env'), quiet: true } as dotenv.DotenvConfigOptions)

export const IS_PROD = process.env.NODE_ENV === 'production'

/** Called when Payload starts (not at build time): refuse to run production with unsafe settings. */
export function assertProductionEnv() {
  if (!IS_PROD) return
  if (!process.env.DATA_DIR) {
    throw new Error('DATA_DIR must be set in production (absolute path outside the deploy folder).')
  }
  if ((process.env.PAYLOAD_SECRET ?? '').length < 32) {
    throw new Error('PAYLOAD_SECRET must be set to a random string of at least 32 characters.')
  }
}

/** Folder holding hr.db, uploaded media and backups. */
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root ?? process.cwd(), 'data'))
export const MEDIA_DIR = path.join(DATA_DIR, 'media')
export const DB_FILE = path.join(DATA_DIR, 'hr.db')

fs.mkdirSync(MEDIA_DIR, { recursive: true })

export const SERVER_URL = (process.env.SERVER_URL || 'http://localhost:4321').replace(/\/$/, '')
export const PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'dev-only-secret-change-me-dev-only-secret'
