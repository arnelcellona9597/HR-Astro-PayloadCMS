// Dev helper: screenshots pages as a signed-in user. Usage: node scripts/shot.mjs /path [/path2 ...] [--dark] [--mobile]
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const args = process.argv.slice(2)
const dark = args.includes('--dark')
const mobile = args.includes('--mobile')
const paths = args.filter((a) => a.startsWith('/'))
const base = process.env.BASE ?? 'http://localhost:4321'
const out = process.env.OUT ?? '/tmp/claude-1000/shots'
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  colorScheme: dark ? 'dark' : 'light',
})
const page = await ctx.newPage()
await page.goto(`${base}/login`)
await page.fill('#email', process.env.EMAIL ?? 'admin@hr.test')
await page.fill('#password', process.env.PASSWORD ?? 'Passw0rd123')
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit], form button')])
for (const p of paths) {
  await page.goto(`${base}${p}`)
  await page.waitForLoadState('networkidle')
  const file = `${out}/${p.replace(/[^a-z0-9]+/gi, '_') || 'root'}${dark ? '_dark' : ''}${mobile ? '_m' : ''}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(file)
}
await browser.close()
