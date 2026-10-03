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
await page.click('form button')
// Email 2FA: in development the code is captured in data/outbox.jsonl (HR_EMAIL_CAPTURE=1).
await page.waitForURL((u) => u.pathname === '/login/verify')
const outbox = process.env.OUTBOX ?? new URL('../data/outbox.jsonl', import.meta.url).pathname
const mails = fs.readFileSync(outbox, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const code = /(\d{6})/.exec(mails.reverse().find((m) => /sign-in code/.test(m.subject)).subject)[1]
await page.fill('#code', code)
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
for (const p of paths) {
  await page.goto(`${base}${p}`)
  await page.waitForLoadState('networkidle')
  const file = `${out}/${p.replace(/[^a-z0-9]+/gi, '_') || 'root'}${dark ? '_dark' : ''}${mobile ? '_m' : ''}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(file)
}
await browser.close()
