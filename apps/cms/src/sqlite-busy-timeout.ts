import { createRequire } from 'node:module'

// @libsql/client opens a fresh SQLite connection every time a transaction starts, and libsql
// connections default to `busy_timeout = 0`. Without this, any save that overlaps another write
// (for example an Excel import) fails instantly with SQLITE_BUSY instead of waiting its turn.
// Patch the libsql Database class so every connection waits up to BUSY_TIMEOUT_MS for the lock.
export const BUSY_TIMEOUT_MS = 30_000

type LibsqlDb = {
  exec(sql: string): unknown
  prepare(sql: string): unknown
  __hrBusy?: boolean
}

const require = createRequire(import.meta.url)

try {
  const Database = require('libsql') as { prototype: LibsqlDb & { __hrPatched?: boolean } }
  const proto = Database.prototype
  if (!proto.__hrPatched) {
    const origExec = proto.exec
    const origPrepare = proto.prepare
    const ensure = (db: LibsqlDb) => {
      if (!db.__hrBusy) {
        db.__hrBusy = true
        origExec.call(db, `PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
      }
    }
    proto.exec = function (this: LibsqlDb, sql: string) {
      ensure(this)
      return origExec.call(this, sql)
    }
    proto.prepare = function (this: LibsqlDb, sql: string) {
      ensure(this)
      return origPrepare.call(this, sql)
    }
    proto.__hrPatched = true
  }
} catch (err) {
  console.warn('[hr] Could not patch libsql busy_timeout:', err)
}
