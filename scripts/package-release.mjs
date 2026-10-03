// Builds a self-contained release folder + tarball for the shared host (no build tools needed there).
//   pnpm release        → release/hr-app/ and release/hr-app-<timestamp>.tar.gz
// The server only needs Node 22: upload, extract into the Passenger app root, restart.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'release', 'hr-app')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))

if (!process.argv.includes('--skip-build')) run('pnpm build')

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const copy = (from, to = from) => fs.cpSync(path.join(root, from), path.join(out, to), { recursive: true })

copy('server.mjs')
copy('passenger.cjs')
copy('server-security.mjs')
copy('scripts/backup.mjs')
copy('scripts/check-host.sh')
fs.cpSync(path.join(root, 'apps/cms/dist-cli/create-admin.mjs'), path.join(out, 'scripts/create-admin.mjs'))
copy('apps/cms/.next')
copy('apps/cms/next.config.mjs')
copy('apps/cms/assets')
copy('apps/cms/package.json')
copy('apps/web/dist')
copy('.env.example')
// Build caches and dev-only folders are not needed at runtime.
for (const p of ['apps/cms/.next/cache', 'apps/cms/.next/dev']) fs.rmSync(path.join(out, p), { recursive: true, force: true })

// One flat production dependency list (workspace packages are already bundled into the builds).
const deps = {}
for (const p of ['package.json', 'apps/cms/package.json', 'apps/web/package.json']) {
  for (const [name, version] of Object.entries(read(p).dependencies ?? {})) {
    // Build-only packages are left out; astro + @astrojs/node provide the server bundle's runtime helpers.
    if (!String(version).startsWith('workspace:') && !['@tailwindcss/vite', 'tailwindcss', 'chart.js'].includes(name)) {
      // Pin to the exact version that was installed and tested (not whatever the range allows today).
      deps[name] = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version
    }
  }
}
fs.writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify({ name: 'hr-app', private: true, type: 'module', engines: { node: '>=22.12.0' }, dependencies: deps }, null, 2),
)
// apps/cms/package.json must not pull workspace deps when Next reads it.
const cmsPkg = read('apps/cms/package.json')
fs.writeFileSync(path.join(out, 'apps/cms/package.json'), JSON.stringify({ name: cmsPkg.name, private: true, type: 'module' }, null, 2))

run('npm install --omit=dev --no-audit --no-fund --legacy-peer-deps --ignore-scripts', out)

// Not used at runtime (compiler/image tooling, other-libc binaries): keeps the upload and inode count down.
for (const p of ['@next/swc-linux-x64-gnu', '@next/swc-linux-x64-musl', '@img', 'sharp', '@libsql/linux-x64-musl']) {
  fs.rmSync(path.join(out, 'node_modules', p), { recursive: true, force: true })
}

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
const tarball = path.join(root, 'release', `hr-app-${stamp}.tar.gz`)
run(`tar -czf ${JSON.stringify(tarball)} -C ${JSON.stringify(path.join(root, 'release'))} hr-app`)
const files = execSync(`find ${JSON.stringify(out)} -type f | wc -l`).toString().trim()
console.log(`\nRelease ready: ${tarball}\nFiles: ${files} (shared hosting inode budget: keep well under 250,000)`)
