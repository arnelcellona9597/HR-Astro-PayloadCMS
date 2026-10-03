import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUTBOX = path.join(os.tmpdir(), `hr-e2e-${process.env.E2E_PORT || '4400'}`, 'outbox.jsonl')
type Mail = { to: string; subject: string; text?: string; attachments: { filename?: string; contentBase64?: string }[] }
const mails = (): Mail[] => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
const codeFor = (email: string) => /(\d{6})/.exec(mails().filter((m) => m.to === email && /sign-in code|Confirm your email/.test(m.subject)).at(-1)?.subject ?? '')?.[1] ?? ''

// One story, in order, against the production build with sample data (see scripts/e2e-server.mjs).
test.describe.configure({ mode: 'serial' })

const ADMIN = { name: 'Ana Admin', email: 'admin@e2e.test', password: 'Adm1nPassword!' }
const STAFF = { name: 'Sam Staff', email: 'staff@e2e.test', password: 'St4ffPassword!' }

async function submitPassword(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Password, then the 6-digit code from the (captured) email. */
async function login(page: Page, who: { email: string; password: string }) {
  await submitPassword(page, who)
  await page.waitForURL('**/login/verify')
  await page.fill('#code', codeFor(who.email))
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

test('the first System Admin (created with the server command) signs in with the emailed code', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByText('Accounts are created by a System Admin')).toBeVisible()
  await submitPassword(page, ADMIN)
  await page.waitForURL('**/login/verify')
  await page.fill('#code', codeFor(ADMIN.email) === '000000' ? '111111' : '000000')
  await expect(page.getByText(/not correct\. 4 attempts left/)).toBeVisible()
  await page.fill('#code', codeFor(ADMIN.email))
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  await expect(page.getByText(/Signed in until/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Employee statistics' })).toBeVisible()
  await expect(page.getByText('Male and female employees')).toBeVisible()
  await expect(page.locator('canvas[data-chart]').first()).toBeVisible()
})

test('a System Admin invites HR Staff, who choose their own password; staff cannot manage accounts', async ({ page, browser }) => {
  const adminCtx = await browser.newContext()
  const admin = await adminCtx.newPage()
  await login(admin, ADMIN)
  await admin.goto('/users')
  await admin.fill('#n-name', STAFF.name)
  await admin.fill('#n-email', STAFF.email)
  await admin.getByRole('button', { name: 'Create & send invitation' }).click()
  await expect(admin.getByText(/Account created for Sam Staff/)).toBeVisible()
  await adminCtx.close()

  const invite = mails().filter((m) => m.to === STAFF.email).at(-1)!
  const link = /(https?:\/\/\S+\/set-password\?token=[a-f0-9]{64})/.exec(invite.text ?? '')![1]!
  await page.goto(new URL(link).pathname + new URL(link).search)
  await expect(page.getByText('Welcome — choose your password')).toBeVisible()
  await page.fill('#password', STAFF.password)
  await page.fill('#confirm', STAFF.password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Password saved')).toBeVisible()
  // The link works only once
  await page.goto(new URL(link).pathname + new URL(link).search)
  await expect(page.getByText(/invalid, was already used or has expired/)).toBeVisible()

  await login(page, STAFF)
  await expect(page.getByRole('heading', { name: 'Employee statistics' })).toBeVisible()
  await page.goto('/users')
  await expect(page.getByText("You don't have permission to open that page.")).toBeVisible()
  await page.goto('/settings/email-server')
  await expect(page.getByText("You don't have permission to open that page.")).toBeVisible()
})

test('dashboard: period filter, real-data KPIs and an activity feed that respects access', async ({ page, browser }) => {
  await login(page, ADMIN)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening), Ana/)
  await expect(page.locator('#period')).toHaveValue('this-year')
  await page.selectOption('#period', '10y')
  await page.waitForURL(/period=10y/)
  await expect(page.locator('[data-period-note]')).toContainText('vs previous 10 years')
  await expect(page.getByRole('link', { name: /New hires/ })).toBeVisible()
  await expect(page.locator('canvas[data-chart]').first()).toBeVisible()
  // The admin sees account activity; HR Staff do not (audit-log access rules apply to the feed).
  const feed = (p: Page) => p.locator('section[aria-labelledby="timeline-title"]')
  await expect(feed(page)).toContainText('HR account')
  const staffCtx = await browser.newContext()
  const staff = await staffCtx.newPage()
  await login(staff, STAFF)
  await staff.goto('/')
  await expect(feed(staff)).toBeVisible()
  await expect(feed(staff)).not.toContainText('HR account')
  await staffCtx.close()
})

test('security: encoded login URLs are blocked, headers are set, rate limits hold', async ({ page, request }) => {
  for (const path of ['/api/users/logi%6E', '/api//users/login', '/API/users/login/', '/api/users/refresh-token']) {
    const res = await request.post(path, { data: { email: ADMIN.email, password: ADMIN.password }, headers: { 'Content-Type': 'application/json' } })
    expect(res.status(), path).toBe(403)
  }
  const signup = await request.post('/api/users', { data: { name: 'x', email: 'x@x.test', password: 'Passw0rd12345' } })
  expect(signup.status()).toBe(403)

  const res = await page.goto('/login')
  const h = res!.headers()
  expect(h['content-security-policy']).toContain("object-src 'none'")
  expect(h['x-frame-options']).toBe('SAMEORIGIN')
  expect(h['x-content-type-options']).toBe('nosniff')

  // A spoofed (leftmost) X-Forwarded-For doesn't give a fresh rate-limit budget.
  let limited = false
  for (let i = 0; i < 70 && !limited; i++) {
    const r = await request.post('/forgot-password', {
      form: { email: `nobody${i}@x.test` },
      headers: { 'X-Forwarded-For': `10.9.${i}.1, 198.51.100.7`, Origin: new URL(page.url()).origin },
    })
    limited = r.status() === 429
  }
  expect(limited).toBe(true)
})

test('System Admin saves SMTP settings in the app; the password is never shown again', async ({ page }) => {
  await login(page, ADMIN)
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && /Content Security Policy|Refused/.test(m.text()) && errors.push(m.text()))
  await page.goto('/settings/email-server')
  await page.fill('#host', 'mail.example.test')
  await page.fill('#port', '465')
  await page.fill('#username', 'info@example.test')
  await page.fill('#password', 'not-a-real-password')
  await page.fill('#fromAddress', 'info@example.test')
  await page.getByRole('button', { name: 'Save and test connection' }).click()
  await expect(page.getByText(/Saved/).first()).toBeVisible()
  await expect(page.getByText('saved (encrypted)')).toBeVisible()
  expect(await page.content()).not.toContain('not-a-real-password')
  for (const p of ['/', '/employees', '/payroll', '/messages/new', '/leave']) await page.goto(p)
  expect(errors).toEqual([])
})

test('employee form validates, saves, and advanced search finds the record', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/employees/new')
  await page.fill('#f-lastName', 'Testcase')
  await page.fill('#f-firstName', 'Erlinda')
  await page.selectOption('#f-gender', 'Female')
  await page.fill('#f-employeeId', 'E2E-0001')
  await page.selectOption('#f-classification', 'COS')
  await page.selectOption('#f-employmentStatus', 'Active')
  await page.fill('#f-dateOfBirth', '1991-04-15')
  await page.fill('#f-dateHired', '2020-01-06')
  await page.fill('#f-sss', '12345')
  await page.getByRole('button', { name: 'Add employee' }).click()
  await expect(page.getByText('SSS Number must have 10 digits')).toBeVisible()
  await page.fill('#f-sss', '0412345678')
  await page.getByRole('button', { name: 'Add employee' }).click()
  await expect(page.getByRole('heading', { name: 'Testcase, Erlinda' })).toBeVisible()
  await expect(page.getByText('04-1234567-8')).toBeVisible()

  await page.goto('/employees?q=testcase&classification=COS&gender=Female&status=Active')
  await expect(page.getByText('Showing 1–1 of 1')).toBeVisible()
  await page.goto('/employees?q=testcase&classification=Regular')
  await expect(page.getByText('No employees match')).toBeVisible()
})

test('wellness leave is counted in working days and blocked over the allowance', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/employees?q=E2E-0001')
  await page.getByRole('link', { name: 'Testcase, Erlinda' }).click()
  await page.getByRole('link', { name: 'File leave' }).click()
  // Mon 2026-02-02 .. Wed 2026-02-04 = 3 working days
  await page.fill('#f-inclusiveDateFrom', '2026-02-02')
  await page.fill('#f-inclusiveDateTo', '2026-02-04')
  await page.locator('#f-inclusiveDateTo').dispatchEvent('change')
  await expect(page.locator('#leave-preview')).toContainText('3 working days')
  await page.getByRole('button', { name: 'Save leave' }).click()
  await expect(page.getByText('(3 days)')).toBeVisible()

  await page.goto('/leave/new')
  const option = page.locator('#f-employee option', { hasText: 'E2E-0001' })
  await page.selectOption('#f-employee', (await option.getAttribute('value'))!)
  await page.fill('#f-inclusiveDateFrom', '2026-03-02')
  await page.fill('#f-inclusiveDateTo', '2026-03-04')
  await page.getByRole('button', { name: 'Save leave' }).click()
  await expect(page.getByRole('alert')).toContainText(/Exceeds the 2026 wellness leave allowance: 2 of 5/)
})

test('branding changes apply everywhere and dark mode is remembered', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/settings')
  await page.fill('#companyName', 'Acme Regional Office')
  await page.fill('#c-primary', '#166534')
  await page.getByRole('button', { name: 'Save branding' }).click()
  await expect(page.getByText('Branding saved')).toBeVisible()
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim())
  expect(primary).toBe('#166534')
  await expect(page.locator('#sidebar').getByText('Acme Regional Office')).toBeVisible()

  await page.locator('[data-theme-toggle]').click()
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
})

test('Excel round trip: export, edit one cell, preview, confirm', async ({ page }) => {
  await login(page, ADMIN)
  const res = await page.request.get('/data/export?module=employees')
  expect(res.ok()).toBe(true)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await res.body()) as unknown as ArrayBuffer)
  const ws = wb.getWorksheet('Employees')!

  // Unchanged file → nothing to import
  await page.goto('/data')
  await page.setInputFiles('#file', { name: 'unchanged.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(await wb.xlsx.writeBuffer()) })
  await page.getByRole('button', { name: 'Check file' }).click()
  await expect(page.getByText('Nothing to import')).toBeVisible()

  // Change Erlinda's position
  let posCol = 0
  let idCol = 0
  ws.getRow(1).eachCell((c, n) => {
    if (c.value === 'Position / Designation') posCol = n
    if (c.value === 'Employee ID') idCol = n
  })
  ws.eachRow((row) => {
    if (row.getCell(idCol).value === 'E2E-0001') row.getCell(posCol).value = 'Imported Title'
  })
  await page.goto('/data')
  await page.setInputFiles('#file', { name: 'edited.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(await wb.xlsx.writeBuffer()) })
  await page.getByRole('button', { name: 'Check file' }).click()
  await expect(page.getByText('All rows passed every check')).toBeVisible()
  await expect(page.getByText('Imported Title')).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Confirm import' }).click()
  await expect(page.getByText(/0 new and 1 updated record/)).toBeVisible()
  await page.goto('/employees?q=E2E-0001')
  await expect(page.getByText('Imported Title')).toBeVisible()
})

test('payroll: generate, enter amounts, print, release with PDF payslips', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/payroll/new')
  await page.fill('#f-name', 'E2E Payroll')
  await page.fill('#f-code', 'E2E-1')
  await page.fill('#f-periodStart', '2026-09-01')
  await page.fill('#f-periodEnd', '2026-09-15')
  await page.fill('#f-payDate', '2026-09-20')
  await page.getByRole('button', { name: 'Create period' }).click()
  await page.waitForURL(/\/payroll\/\d+$/)
  const periodUrl = page.url()
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByText(/payslip\(s\) created/)).toBeVisible()

  // Give every payslip an amount so the period can be released; check one row's totals.
  const rows = page.locator('tr[data-row]')
  const count = await rows.count()
  expect(count).toBeGreaterThan(50)
  for (let i = 0; i < count; i++) await rows.nth(i).locator('input[data-kind="e"]').first().fill('20000')
  const first = rows.first()
  await first.locator('input[data-kind="e"]').nth(1).fill('1,000.50')
  await first.locator('input[data-kind="d"]').first().fill('1500.25')
  await expect(first.locator('[data-net]')).toHaveText('₱19,500.25')
  await page.getByRole('button', { name: 'Save all payslips' }).click()
  await expect(page.getByText(`Saved ${count} payslip(s).`)).toBeVisible()

  const slipHref = await page.locator('tr[data-row] a[href^="/payroll/payslips/"]').first().getAttribute('href')
  await page.goto(`${slipHref}/print`)
  await expect(page.getByText('NET PAY')).toBeVisible()
  await expect(page.getByText('₱19,500.25')).toBeVisible()
  const pdf = await page.request.get(`${slipHref}/pdf`)
  expect(pdf.headers()['content-type']).toBe('application/pdf')

  await page.goto(periodUrl)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Release payroll' }).click()
  await expect(page.getByText(/E2E Payroll released/)).toBeVisible()
  await expect.poll(() => mails().filter((m) => m.subject === 'Your payslip for E2E Payroll').length, { timeout: 30_000 }).toBeGreaterThan(5)
  const mail = mails().find((m) => m.subject === 'Your payslip for E2E Payroll')!
  expect(mail.attachments[0]?.filename).toMatch(/^payslip-E2E-1-.*\.pdf$/)
})

test('messages: send an announcement to a branch group', async ({ page }) => {
  await login(page, ADMIN)
  // The payroll release above used up the default 100-per-hour budget; raise it in Email Settings.
  await page.goto('/settings/notifications')
  await page.fill('#hourlyLimit', '1000')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Email settings saved.')).toBeVisible()
  await page.goto('/messages/new')
  await page.selectOption('#groupBranch', { index: 0 })
  await page.check('input[name="groupStatus"][value="Active"]')
  await page.fill('#subject', 'Office closed on Friday')
  await page.fill('#body', 'Hi {{firstName}},\n\nThe {{station}} office is closed on Friday.')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.locator('#preview-summary')).toContainText('recipient(s) will get this email')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(/Message queued for \d+ recipient/)).toBeVisible()
  await expect.poll(() => mails().filter((m) => m.subject === 'Office closed on Friday').length, { timeout: 30_000 }).toBeGreaterThan(0)
  await page.reload()
  await expect(page.locator('main').getByText(/Delivered/)).toBeVisible()
  const mail = mails().find((m) => m.subject === 'Office closed on Friday')!
  expect(mail.text).toMatch(/^Office closed on Friday\n\nHi \w+/)
  expect(mail.text).not.toContain('{{')
})

test('HR Staff change their own profile picture; it shows in the header and HR accounts list', async ({ page, browser }) => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await login(page, STAFF)
  await page.goto('/profile')
  await page.setInputFiles('[data-avatar-input]', { name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('[data-avatar-preview]')).toBeVisible()
  await page.getByRole('button', { name: 'Save picture' }).click()
  await expect(page.getByText('Profile picture updated.')).toBeVisible()
  const headerImg = page.locator('#user-menu-button img')
  await expect(headerImg).toHaveAttribute('src', /^\/files\/\d+$/)
  expect(await headerImg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)

  // A file that only pretends to be an image is refused.
  await page.setInputFiles('[data-avatar-input]', { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('%PDF-1.4 not an image') })
  await page.getByRole('button', { name: 'Save picture' }).click()
  await expect(page.getByRole('alert')).toContainText(/file type isn't allowed/)

  // System Admins see it in the HR accounts list.
  const adminCtx = await browser.newContext()
  const admin = await adminCtx.newPage()
  await login(admin, ADMIN)
  await admin.goto('/users')
  await expect(admin.locator('tr', { hasText: STAFF.email }).locator('img')).toHaveAttribute('src', /^\/files\/\d+$/)
  await adminCtx.close()

  await page.goto('/profile')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Remove picture' }).click()
  await expect(page.getByText('Profile picture removed.')).toBeVisible()
  await expect(page.locator('#user-menu-button img')).toHaveCount(0)
})

test('certificates: edit a template by drag and drop, issue, print, PDF and void', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page, ADMIN)
  await page.goto('/certificates/templates')
  await page.getByRole('link', { name: 'Certificate of Employment', exact: true }).click()
  const blocks = page.locator('#ed-paper .ed-block')
  const count = await blocks.count()

  // Drag a footnote from the palette to the very top of the page.
  const from = (await page.locator('[data-palette-type="footer"]').boundingBox())!
  const to = (await blocks.first().boundingBox())!
  await page.mouse.move(from.x + 20, from.y + 10)
  await page.mouse.down()
  await page.mouse.move(from.x + 120, from.y + 40, { steps: 4 })
  await page.mouse.move(to.x + 80, to.y + 2, { steps: 8 })
  await page.mouse.up()
  await expect(blocks).toHaveCount(count + 1)
  await expect(blocks.first()).toHaveAttribute('aria-label', /^1\. Footnote/)

  // Edit it in the property panel; a placeholder chip inserts at the cursor.
  const text = page.locator('#ed-inspector textarea[data-key="text"]')
  await text.fill('Reference: ')
  await page.locator('[data-ph="employeeId"]').click()
  await expect(text).toHaveValue('Reference: {{employeeId}}')
  await expect(blocks.first()).toContainText('Reference: EMP-0001')
  // Keyboard reordering: move it down one place.
  await blocks.first().focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(blocks.nth(1)).toHaveAttribute('aria-label', /^2\. Footnote: Reference/)

  // Unknown placeholders are refused on save.
  await text.fill('Salary: {{salary}}')
  await expect(page.locator('#ed-warning')).toContainText('{{salary}}')
  await page.getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByRole('alert')).toContainText('Unknown placeholder')
  // The page keeps the unsaved layout; select the footnote again and fix it.
  await page.locator('#ed-paper .ed-block').nth(1).click()
  await page.locator('#ed-inspector textarea[data-key="text"]').fill('Reference: {{employeeId}}')
  await page.getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText('Template saved.')).toBeVisible()
  await expect(page.locator('#ed-paper .ed-block').nth(1)).toContainText('Reference: EMP-0001')

  // Issue a certificate with a live preview.
  await page.goto('/certificates/new')
  await page.locator('[data-filter-for="employee"]').fill('Erlinda')
  await page.selectOption('#employee', { label: (await page.locator('#employee option:not([hidden])').first().textContent())! })
  await page.locator('input[name="template"]').first().check()
  await page.fill('#purpose', 'housing loan application')
  await expect(page.locator('[data-preview-paper]')).toContainText('housing loan application')
  await page.getByRole('button', { name: 'Issue certificate' }).click()
  await page.waitForURL(/\/certificates\/\d+$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^COE-\d{4}-0001$/)
  await expect(page.locator('.cert-paper')).toContainText('ERLINDA')
  await expect(page.locator('.cert-paper')).toContainText('housing loan application')

  const url = page.url()
  const pdf = await page.request.get(`${url}/pdf`)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  const print = await page.request.get(`${url}/print`)
  expect(await print.text()).toContain('Print / Save as PDF')

  // Void with a reason; it then prints with a VOID mark and shows on the employee profile.
  await page.locator('summary', { hasText: 'Void this certificate' }).click()
  await page.fill('#reason', 'Wrong purpose')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Void certificate' }).click()
  await expect(page.getByText('Certificate voided.')).toBeVisible()
  await expect(page.locator('.cert-void')).toBeVisible()
  await page.goto('/certificates?status=Void')
  await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('app shell: collapsible sidebar, right side, compact header, account menu and log out', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await login(page, ADMIN)
  for (const path of ['/', '/employees', '/leave', '/payroll', '/onboarding', '/requirements', '/settings', '/audit', '/users']) await page.goto(path)
  expect(errors, errors.join('\n')).toEqual([])

  await page.goto('/')
  const shell = page.locator('#shell')
  const sidebar = page.locator('#sidebar')
  await page.locator('#topbar [data-sidebar-toggle]').click()
  await expect(shell).toHaveAttribute('data-sidebar', 'collapsed')
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(100)
  await sidebar.getByRole('link', { name: 'Employees' }).hover()
  await expect(page.locator('#nav-tip')).toHaveText('Employees')
  await expect(page.locator('#nav-tip')).toHaveAttribute('data-show', 'true')
  await page.reload()
  await expect(shell).toHaveAttribute('data-sidebar', 'collapsed')
  await expect(sidebar.getByRole('link', { name: 'Employees' })).toBeVisible()
  await page.locator('#topbar [data-sidebar-toggle]').click()
  await expect(shell).toHaveAttribute('data-sidebar', 'expanded')

  // Account menu by keyboard; display preferences live in it.
  await page.locator('#user-menu-button').focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'My profile' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'HR accounts' })).toBeFocused()
  await menu.getByRole('menuitemcheckbox', { name: 'Sidebar on the right' }).click()
  await expect(shell).toHaveAttribute('data-side', 'right')
  expect((await sidebar.boundingBox())!.x).toBeGreaterThan(1000)
  await menu.getByRole('menuitemcheckbox', { name: 'Compact header' }).click()
  await expect.poll(async () => (await page.locator('#topbar').boundingBox())!.height).toBeLessThanOrEqual(49)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.locator('#user-menu-button')).toBeFocused()
  await page.reload()
  await expect(shell).toHaveAttribute('data-side', 'right')
  await expect(shell).toHaveAttribute('data-header', 'compact')

  // Log out lives in the account menu, not the sidebar.
  await expect(sidebar.getByRole('button', { name: /sign out|log out/i })).toHaveCount(0)
  await page.locator('#user-menu-button').click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await page.waitForURL('**/login')
  await page.goto('/')
  await page.waitForURL(/\/login/)
})

test('pages fit a phone screen without sideways scrolling', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await login(page, ADMIN)
  for (const path of ['/', '/?period=90d', '/employees', '/onboarding', '/leave', '/branches', '/requirements', '/payroll', '/messages', '/messages/new', '/data', '/audit', '/settings', '/users', '/profile', '/certificates', '/certificates/new', '/certificates/templates', '/login']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1)
  }
  await page.goto('/certificates/templates')
  await page.getByRole('link', { name: 'Edit layout' }).first().click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'template editor overflows').toBeLessThanOrEqual(1)
  // The menu becomes a drawer that closes with Escape; the account menu stays reachable.
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.locator('#sidebar').getByRole('link', { name: 'Employees' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#sidebar')).toHaveAttribute('data-open', 'false')
  await page.locator('#user-menu-button').click()
  await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible()
  await ctx.close()
})

test('My account: change password with the current one, then sign in with the new one', async ({ page }) => {
  await login(page, STAFF)
  await page.goto('/profile')
  await page.fill('#current', 'wrong-password-1')
  await page.fill('#password', 'N3wStaffPassword!')
  await page.fill('#confirm', 'N3wStaffPassword!')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert')).toContainText('Your current password is incorrect.')

  await page.fill('#current', STAFF.password)
  await page.fill('#password', 'N3wStaffPassword!')
  await page.fill('#confirm', 'N3wStaffPassword!')
  await page.getByRole('button', { name: 'Change password' }).click()
  await page.waitForURL(/\/login\?notice=password/)
  await login(page, { email: STAFF.email, password: 'N3wStaffPassword!' })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('annual requirements: searching works on every requirement type', async ({ page }) => {
  await login(page, ADMIN)
  for (const type of ['itr', 'sworn-declaration', 'pds', 'ipcr']) {
    const res = await page.goto(`/requirements/${type}?year=2026&q=dan`)
    expect(res?.status(), type).toBe(200)
    await expect(page.locator('main input[name="q"]')).toHaveValue('dan')
  }
})
