// Nightly backup: a consistent copy of the SQLite database (VACUUM INTO is safe while the app runs)
// plus the uploaded files, kept for BACKUP_KEEP days. Run from cron with the server's Node:
//   /opt/alt/alt-nodejs22/root/usr/bin/node /home/<user>/hr-app/scripts/backup.mjs
// Restore: stop the app, copy hr-<date>.db over DATA_DIR/hr.db (delete hr.db-wal/-shm), untar media.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '..')
const require = createRequire(path.join(appRoot, 'package.json'))
require('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true })

const dataDir = process.env.DATA_DIR
if (!dataDir) {
  console.error('DATA_DIR is not set (check .env).')
  process.exit(1)
}
const keep = Number(process.env.BACKUP_KEEP || 14)
const backupDir = path.join(dataDir, 'backups')
fs.mkdirSync(backupDir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

const Database = require('libsql')
const db = new Database(path.join(dataDir, 'hr.db'))
db.exec('PRAGMA busy_timeout = 30000')
const dbBackup = path.join(backupDir, `hr-${stamp}.db`)
db.exec(`VACUUM INTO '${dbBackup.replace(/'/g, "''")}'`)
const check = new Database(dbBackup)
const ok = check.prepare('PRAGMA integrity_check').get()
check.close()
db.close()
if (Object.values(ok)[0] !== 'ok') {
  console.error('Backup integrity check failed:', ok)
  process.exit(1)
}

const mediaDir = path.join(dataDir, 'media')
if (fs.existsSync(mediaDir)) {
  execFileSync('tar', ['-czf', path.join(backupDir, `media-${stamp}.tar.gz`), '-C', dataDir, 'media'])
}

// Rotate
const cutoff = Date.now() - keep * 86_400_000
for (const f of fs.readdirSync(backupDir)) {
  const full = path.join(backupDir, f)
  if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { force: true })
}
console.log(`Backup written: ${dbBackup}`)
