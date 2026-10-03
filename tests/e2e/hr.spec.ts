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

async function register(page: Page, who: typeof ADMIN) {
  await page.goto('/register')
  await page.fill('#name', who.name)
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.fill('#confirm', who.password)
  await page.locator('form button').click()
  await page.waitForURL('**/register/verify')
  await expect(page.getByText('We sent a 6-digit code')).toBeVisible()
  await page.fill('#code', codeFor(who.email))
  await page.waitForURL('**/login?notice=*')
}

test('first account becomes System Admin; sign-in needs the emailed code', async ({ page }) => {
  await register(page, ADMIN)
  await expect(page.getByText('Email verified')).toBeVisible()
  await submitPassword(page, ADMIN)
  await page.waitForURL('**/login/verify')
  await page.fill('#code', codeFor(ADMIN.email) === '000000' ? '111111' : '000000')
  await expect(page.getByText(/not correct\. 4 attempts left/)).toBeVisible()
  await page.fill('#code', codeFor(ADMIN.email))
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
  await expect(page.getByText(/Signed in until/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Employee statistics' })).toBeVisible()
  await expect(page.getByText('Total employees')).toBeVisible()
  await expect(page.getByText('Male and female employees')).toBeVisible()
  await expect(page.locator('canvas[data-bar-chart]').first()).toBeVisible()
})

test('new sign-ups wait for approval and staff cannot manage users', async ({ page, browser }) => {
  await register(page, STAFF)
  await expect(page.getByText('A System Admin must approve your account')).toBeVisible()
  await submitPassword(page, STAFF)
  await expect(page.getByText('waiting for approval')).toBeVisible()

  const adminCtx = await browser.newContext()
  const admin = await adminCtx.newPage()
  await login(admin, ADMIN)
  await admin.goto('/notifications')
  await expect(admin.getByText('New HR account request: Sam Staff')).toBeVisible()
  await admin.goto('/users')
  await admin.getByRole('button', { name: 'Approve as HR Staff' }).click()
  await expect(admin.getByText('Sam Staff can now sign in.')).toBeVisible()
  await adminCtx.close()

  await login(page, STAFF)
  await expect(page.getByRole('heading', { name: 'Employee statistics' })).toBeVisible()
  await page.goto('/users')
  await expect(page.getByText("You don't have permission to open that page.")).toBeVisible()
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

test('pages fit a phone screen without sideways scrolling', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await login(page, ADMIN)
  for (const path of ['/', '/employees', '/leave', '/branches', '/requirements', '/payroll', '/messages', '/messages/new', '/data', '/login']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1)
  }
  await ctx.close()
})
