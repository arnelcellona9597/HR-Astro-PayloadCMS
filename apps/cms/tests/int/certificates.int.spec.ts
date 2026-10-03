import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { composeCertificate, renderCertificatePdf, type CertificateContent } from '../../src/server/certificates'

let payload: Payload
let admin: any
let staff: any
let maria: any
let pedro: any
let activeTpl: any
let separatedTpl: any

const mkUser = async (email: string, role: string) => {
  const u = await payload.create({
    collection: 'users',
    data: { name: email === 'staff@cert.test' ? 'Sam Staff' : 'Ana Admin', email, password: 'Sup3rSecret!pw', role, status: 'approved' } as any,
    overrideAccess: true,
    context: { passwordChange: true },
  })
  return { ...u, collection: 'users' }
}
const issue = (data: Record<string, unknown>, user = staff) =>
  payload.create({ collection: 'certificates', data: { issuedDate: '2026-10-04', ...data } as any, user, overrideAccess: false })
const text = (c: { content?: unknown }) => JSON.stringify((c.content as CertificateContent).blocks)

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  admin = await mkUser('admin@cert.test', 'system-admin')
  staff = await mkUser('staff@cert.test', 'hr-staff')
  const branch = await payload.create({ collection: 'branches', data: { name: 'PENRO Laguna' }, overrideAccess: true })
  const base = { classification: 'Regular', dateOfBirth: '1990-01-01', station: branch.id }
  maria = await payload.create({
    collection: 'employees',
    data: { ...base, employeeId: 'C-001', lastName: 'Reyes', firstName: 'Maria', middleName: 'Santos', gender: 'Female', employmentStatus: 'Active', dateHired: '2018-03-05', position: 'Accountant III' } as any,
    overrideAccess: true,
  })
  pedro = await payload.create({
    collection: 'employees',
    data: { ...base, employeeId: 'C-002', lastName: 'Cruz', firstName: 'Pedro', gender: 'Male', employmentStatus: 'Resigned', dateHired: '2015-06-01', lastDayOfService: '2025-12-31', position: 'Driver I' } as any,
    overrideAccess: true,
  })
  const templates = await payload.find({ collection: 'certificate-templates', sort: 'sortOrder', overrideAccess: true })
  activeTpl = templates.docs.find((t) => t.key === 'coe-active')
  separatedTpl = templates.docs.find((t) => t.key === 'coe-separated')
})

describe('certificate templates', () => {
  it('starts with built-in templates for active, newly hired and separated employees', async () => {
    const keys = (await payload.find({ collection: 'certificate-templates', overrideAccess: true })).docs.map((t) => t.key)
    expect(keys).toEqual(expect.arrayContaining(['coe-active', 'coe-newly-hired', 'coe-separated']))
  })

  it('validates the layout: unknown placeholders and blocks are refused', async () => {
    const data = { name: 'Bad', prefix: 'X', blocks: [{ type: 'paragraph', text: 'Salary {{salary}}' }] }
    await expect(payload.create({ collection: 'certificate-templates', data: data as any, user: staff, overrideAccess: false })).rejects.toThrow(/\{\{salary\}\}/)
    await expect(
      payload.create({ collection: 'certificate-templates', data: { ...data, blocks: [{ type: 'html', html: '<script>' }] } as any, user: staff, overrideAccess: false }),
    ).rejects.toThrow(/unknown block/)
    await expect(
      payload.create({ collection: 'certificate-templates', data: { ...data, prefix: 'bad prefix', blocks: [{ type: 'divider' }] } as any, user: staff, overrideAccess: false }),
    ).rejects.toThrow()
  })
})

describe('issuing certificates', () => {
  it('numbers certificates per prefix and year and freezes the merged text', async () => {
    const c1 = await issue({ template: activeTpl.id, employee: maria.id, purpose: 'housing loan application' })
    expect(c1.controlNumber).toBe('COE-2026-0001')
    expect(c1.employeeName).toBe('Maria S. Reyes')
    expect(c1.issuedByName).toBe('Sam Staff')
    expect(c1.status).toBe('Valid')
    expect(text(c1)).toContain('MARIA S. REYES')
    expect(text(c1)).toContain('housing loan application')
    expect(text(c1)).toContain('COE-2026-0001')
    expect(text(c1)).not.toContain('{{')

    const c2 = await issue({ template: separatedTpl.id, employee: pedro.id })
    expect(c2.controlNumber).toBe('COE-2026-0002')
    expect(text(c2)).toContain('he resigned on December 31, 2025')
    expect(text(c2)).toContain('10 years and 6 months')
    expect(text(c2)).toContain('whatever legal purpose it may serve')
  })

  it('gives unique numbers when several are issued at once', async () => {
    const docs = await Promise.all([1, 2, 3].map(() => issue({ template: activeTpl.id, employee: maria.id })))
    expect(new Set(docs.map((d) => d.controlNumber)).size).toBe(3)
    expect(docs.map((d) => d.controlNumber).sort()).toEqual(['COE-2026-0003', 'COE-2026-0004', 'COE-2026-0005'])
    const next = await issue({ template: activeTpl.id, employee: maria.id, issuedDate: '2027-01-02' })
    expect(next.controlNumber).toBe('COE-2027-0001')
  })

  it('ignores computed fields sent by the client', async () => {
    const c = await issue({ template: activeTpl.id, employee: maria.id, controlNumber: 'FAKE-1', content: { blocks: [] }, employeeName: 'Someone Else', status: 'Void' })
    expect(c.controlNumber).toMatch(/^COE-2026-\d{4}$/)
    expect(c.employeeName).toBe('Maria S. Reyes')
    expect(c.status).toBe('Valid')
    expect(text(c)).toContain('MARIA S. REYES')
  })

  it('keeps issued certificates unchanged when the template or employee changes later', async () => {
    const c = await issue({ template: activeTpl.id, employee: maria.id })
    await payload.update({ collection: 'employees', id: maria.id, data: { position: 'Chief Accountant' }, overrideAccess: true })
    const blocks = activeTpl.blocks.map((b: any) => (b.type === 'paragraph' ? { ...b, text: 'Changed wording.' } : b))
    await payload.update({ collection: 'certificate-templates', id: activeTpl.id, data: { blocks }, user: staff, overrideAccess: false })
    const again = await payload.findByID({ collection: 'certificates', id: c.id, overrideAccess: true })
    expect(text(again)).toContain('Accountant III')
    expect(text(again)).not.toContain('Changed wording.')
    await payload.update({ collection: 'certificate-templates', id: activeTpl.id, data: { blocks: activeTpl.blocks }, overrideAccess: true })
  })

  it('refuses inactive templates', async () => {
    await payload.update({ collection: 'certificate-templates', id: separatedTpl.id, data: { active: false }, overrideAccess: true })
    await expect(issue({ template: separatedTpl.id, employee: pedro.id })).rejects.toThrow(/inactive/)
    await payload.update({ collection: 'certificate-templates', id: separatedTpl.id, data: { active: true }, overrideAccess: true })
  })

  it('can only be voided (with a reason), never edited or un-voided; only System Admins delete', async () => {
    const c = await issue({ template: activeTpl.id, employee: maria.id })
    const edited = await payload.update({ collection: 'certificates', id: c.id, data: { employee: pedro.id, purpose: 'changed', content: { blocks: [] } } as any, user: staff, overrideAccess: false })
    expect((edited.employee as any).id ?? edited.employee).toBe(maria.id)
    expect(edited.purpose).toBe(c.purpose)
    expect(text(edited)).toBe(text(c))

    await expect(payload.update({ collection: 'certificates', id: c.id, data: { status: 'Void' }, user: staff, overrideAccess: false })).rejects.toThrow(/reason/)
    const voided = await payload.update({ collection: 'certificates', id: c.id, data: { status: 'Void', voidReason: 'Wrong purpose' }, user: staff, overrideAccess: false })
    expect(voided.status).toBe('Void')
    expect(voided.voidedAt).toBeTruthy()
    await expect(payload.update({ collection: 'certificates', id: c.id, data: { status: 'Valid' }, user: staff, overrideAccess: false })).rejects.toThrow(/cannot be made valid/)

    await expect(payload.delete({ collection: 'certificates', id: c.id, user: staff, overrideAccess: false })).rejects.toThrow()
    await payload.delete({ collection: 'certificates', id: c.id, user: admin, overrideAccess: false })
  })
})

describe('certificate PDF', () => {
  it('renders serif and sans PDFs, with a VOID mark and characters outside Latin-1', async () => {
    const { content } = await composeCertificate(payload, { templateId: activeTpl.id, employeeId: maria.id, purpose: 'Loan of ₱500,000 — Ñoño bank', issuedDate: '2026-10-04' })
    const serif = await renderCertificatePdf(payload, content)
    expect(Buffer.from(serif.slice(0, 5)).toString()).toBe('%PDF-')
    const sans = await renderCertificatePdf(payload, { ...content, font: 'sans', paperSize: 'Letter' }, { void: true })
    expect(Buffer.from(sans.slice(0, 5)).toString()).toBe('%PDF-')
    expect(sans.length).toBeGreaterThan(1000)
  })
})
