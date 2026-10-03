// Starts the PRODUCTION build (server.mjs) on a throwaway data folder with sample data, for e2e tests.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Fixed location so the tests can read captured emails (sign-in codes) from DATA_DIR/outbox.jsonl.
const dataDir = path.join(os.tmpdir(), `hr-e2e-${process.env.E2E_PORT || '4400'}`)
fs.rmSync(dataDir, { recursive: true, force: true })
fs.mkdirSync(dataDir, { recursive: true })
const port = process.env.E2E_PORT || '4400'
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DATA_DIR: dataDir,
  PORT: port,
  SERVER_URL: `http://localhost:${port}`,
  PAYLOAD_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  SMTP_HOST: '',
  HR_EMAIL_CAPTURE: '1',
  HR_E2E: '1',
}
// Runs migrations (production mode) and loads the sample data.
execFileSync(path.join(root, 'node_modules/.bin/tsx'), ['src/seed/index.ts'], {
  cwd: path.join(root, 'apps/cms'),
  env: { ...env, HR_SEED_FORCE: '1' },
  stdio: 'inherit',
})
const server = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: 'inherit' })
const stop = () => {
  server.kill()
  fs.rmSync(dataDir, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
server.on('exit', (code) => process.exit(code ?? 0))
