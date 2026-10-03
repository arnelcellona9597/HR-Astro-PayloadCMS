// One writer at a time, waited for asynchronously.
//
// The SQLite driver is synchronous: when two write transactions overlap in the same Node process,
// the second one waits for SQLite's lock *while blocking the event loop*, so the first can never
// finish (both stall until the busy timeout). This first-come-first-served async lock serialises
// write transactions (and our few raw-SQL writes) in JavaScript instead, so waiting never blocks
// other requests. Writes inside a transaction pass `req` (same transaction) and don't take it again.
import type { Payload } from 'payload'

const WAIT_TIMEOUT_MS = 60_000
const MAX_HOLD_MS = 5 * 60_000

let tail: Promise<void> = Promise.resolve()

/** Waits for the write lock; returns the release function (safe to call more than once). */
async function acquire(): Promise<() => void> {
  let release!: () => void
  const mine = new Promise<void>((r) => (release = r))
  const previous = tail
  tail = previous.then(() => mine)
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      previous,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The database is busy. Please try again in a moment.')), WAIT_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    // Give our turn away when it arrives, so the queue keeps moving.
    void previous.then(() => release())
    throw err
  } finally {
    clearTimeout(timer)
  }
  let released = false
  const guard = setTimeout(() => {
    console.error('[db] write lock held for too long — releasing it')
    done()
  }, MAX_HOLD_MS)
  guard.unref()
  const done = () => {
    if (released) return
    released = true
    clearTimeout(guard)
    release()
  }
  return done
}

/** Runs `fn` while holding the write lock (for raw SQL writes outside Payload operations). */
export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquire()
  try {
    return await fn()
  } finally {
    release()
  }
}

let installed = false

/** Wraps the adapter's transaction functions so every write transaction holds the lock. */
export function installWriteLock(payload: Payload) {
  if (installed) return
  installed = true
  const db = payload.db as unknown as {
    beginTransaction: (o?: unknown) => Promise<string | number | null>
    commitTransaction: (id: string | number) => Promise<void>
    rollbackTransaction: (id: string | number) => Promise<void>
  }
  const begin = db.beginTransaction.bind(db)
  const commit = db.commitTransaction.bind(db)
  const rollback = db.rollbackTransaction.bind(db)
  const releases = new Map<string | number, () => void>()

  db.beginTransaction = async (opts?: unknown) => {
    const release = await acquire()
    try {
      const id = await begin(opts)
      if (id === null || id === undefined) release()
      else releases.set(id, release)
      return id
    } catch (err) {
      release()
      throw err
    }
  }
  const end = (fn: (id: string | number) => Promise<void>) => async (id: string | number) => {
    try {
      await fn(id)
    } finally {
      releases.get(id)?.()
      releases.delete(id)
    }
  }
  db.commitTransaction = end(commit)
  db.rollbackTransaction = end(rollback)
}
