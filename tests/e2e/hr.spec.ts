import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'

// One story, in order, against the production build with sample data (see scripts/e2e-server.mjs).
test.describe.configure({ mode: 'serial' })

const ADMIN = { name: 'Ana Admin', email: 'admin@e2e.test', password: 'Adm1nPassword!' }
const STAFF = { name: 'Sam Staff', email: 'staff@e2e.test', password: 'St4ffPassword!' }

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function register(page: Page, who: typeof ADMIN) {
  await page.goto('/register')
  await page.fill('#name', who.name)
  await page.fill('#email', who.email)
  await page.fill('#password', who.password)
  await page.fill('#confirm', who.password)
  await page.locator('form button').click()
}

test('first account becomes Super Admin and sees the dashboard', async ({ page }) => {
  await register(page, ADMIN)
  await login(page, ADMIN)
  await expect(page.getByRole('heading', { name: 'Employee statistics' })).toBeVisible()
  await expect(page.getByText('Total employees')).toBeVisible()
  await expect(page.getByText('Male and female employees')).toBeVisible()
  await expect(page.locator('canvas[data-bar-chart]').first()).toBeVisible()
})

test('new sign-ups wait for approval and staff cannot manage users', async ({ page, browser }) => {
  await register(page, STAFF)
  await expect(page.getByText('A Super Admin must approve your account')).toBeVisible()
  await login(page, STAFF)
  await expect(page.getByText('waiting for approval')).toBeVisible()

  const adminCtx = await browser.newContext()
  const admin = await adminCtx.newPage()
  await login(admin, ADMIN)
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

test('pages fit a phone screen without sideways scrolling', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await login(page, ADMIN)
  for (const path of ['/', '/employees', '/leave', '/branches', '/requirements', '/data', '/login']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1)
  }
  await ctx.close()
})
