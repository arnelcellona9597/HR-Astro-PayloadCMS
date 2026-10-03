// Temporary storage for uploaded workbooks between "validate" and "confirm", plus the import history.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Payload } from 'payload'

import { DATA_DIR } from '../env'
import { commit, validateImport, type ImportPlan } from './excel/import'

const DIR = path.join(DATA_DIR, 'imports')
const PENDING_TTL_MS = 60 * 60 * 1000

type Meta = { userId: number; fileName: string; moduleHint?: string; createdAt: number }
type User = Parameters<Payload['find']>[0]['user'] & { id: number; name?: string; email?: string }

function cleanup() {
  if (!fs.existsSync(DIR)) return
  for (const f of fs.readdirSync(DIR)) {
    if (!f.startsWith('pending-')) continue
    const full = path.join(DIR, f)
    if (Date.now() - fs.statSync(full).mtimeMs > PENDING_TTL_MS) fs.rmSync(full, { force: true })
  }
}

export function discardPending(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return
  fs.rmSync(path.join(DIR, `pending-${token}.xlsx`), { force: true })
  fs.rmSync(path.join(DIR, `pending-${token}.json`), { force: true })
}

export async function stagePendingImport(buffer: Buffer, meta: Omit<Meta, 'createdAt'>): Promise<string> {
  fs.mkdirSync(DIR, { recursive: true })
  cleanup()
  const token = crypto.randomBytes(16).toString('hex')
  fs.writeFileSync(path.join(DIR, `pending-${token}.xlsx`), buffer)
  fs.writeFileSync(path.join(DIR, `pending-${token}.json`), JSON.stringify({ ...meta, createdAt: Date.now() }))
  return token
}

/** A staged upload, only for the user who uploaded it and within the hour. */
export function readPending(token: string, userId: number): { buffer: Buffer; meta: Meta } | null {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const file = path.join(DIR, `pending-${token}.xlsx`)
  const metaFile = path.join(DIR, `pending-${token}.json`)
  if (!fs.existsSync(file) || !fs.existsSync(metaFile)) return null
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as Meta
  if (meta.userId !== userId || Date.now() - meta.createdAt > PENDING_TTL_MS) return null
  return { buffer: fs.readFileSync(file), meta }
}

export async function previewPendingImport(payload: Payload, user: User, token: string) {
  const pending = readPending(token, user.id)
  if (!pending) return null
  return { plan: await validateImport(payload, user, pending.buffer, { moduleHint: pending.meta.moduleHint }), meta: pending.meta }
}

/**
 * Takes exclusive ownership of a staged upload (atomic rename), so two simultaneous "Confirm"
 * clicks can't both import it. Call `release` to put it back if the import doesn't go ahead.
 */
export function claimPending(token: string, userId: number) {
  const pending = readPending(token, userId)
  if (!pending) return null
  const from = path.join(DIR, `pending-${token}.xlsx`)
  const claimed = path.join(DIR, `committing-${token}.xlsx`)
  try {
    fs.renameSync(from, claimed)
  } catch {
    return null // someone else claimed it first
  }
  return {
    ...pending,
    release: () => fs.existsSync(claimed) && fs.renameSync(claimed, from),
    finish: (archiveName?: string) => {
      if (archiveName) fs.renameSync(claimed, path.join(DIR, archiveName))
      else fs.rmSync(claimed, { force: true })
      fs.rmSync(path.join(DIR, `pending-${token}.json`), { force: true })
    },
  }
}

export type CommitOutcome =
  | { ok: true; created: number; updated: number; unchanged: number; fileName: string }
  | { ok: false; reason: string; plan?: ImportPlan }

/**
 * Re-validates the staged file against the current data (it may have changed since the preview)
 * and commits it in a single transaction. The workbook is archived with the import history.
 */
export async function commitPendingImport(payload: Payload, user: User, token: string): Promise<CommitOutcome> {
  const pending = claimPending(token, user.id)
  if (!pending) return { ok: false, reason: 'This upload has expired or was already imported. Upload the file again.' }
  let plan: ImportPlan
  let res: Awaited<ReturnType<typeof commit>>
  try {
    plan = await validateImport(payload, user, pending.buffer, { moduleHint: pending.meta.moduleHint })
    if (plan.errors.length) {
      pending.release()
      return { ok: false, reason: 'The data changed since the preview and the file no longer passes all checks.', plan }
    }
    res = await commit(payload, user, plan)
  } catch (err) {
    pending.release()
    throw err
  }
  const archive = `import-${new Date().toISOString().replace(/[:.]/g, '-')}-${token.slice(0, 8)}.xlsx`
  const modules = plan.sheets.map((s) => s.title).join(', ')
  if (res.ok) pending.finish(archive)
  else pending.release()
  await payload.create({
    collection: 'import-jobs',
    data: {
      fileName: pending.meta.fileName,
      module: modules || '—',
      status: res.ok ? 'committed' : 'failed',
      created: res.ok ? res.created : 0,
      updated: res.ok ? res.updated : 0,
      unchanged: res.ok ? res.unchanged : 0,
      error: res.ok ? null : `${res.issue.sheet} row ${res.issue.row ?? '?'}: ${res.issue.message}`,
      user: user.id,
      userName: user.name ?? user.email ?? null,
      archiveFile: res.ok ? archive : null,
    },
    overrideAccess: true,
  })
  if (!res.ok) return { ok: false, reason: `Nothing was imported. ${res.issue.sheet} row ${res.issue.row ?? '?'}: ${res.issue.message}` }
  return { ...res, fileName: pending.meta.fileName }
}
