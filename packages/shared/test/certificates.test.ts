import { describe, expect, it } from 'vitest'

import {
  certificateValues,
  CertificateTemplateError,
  DEFAULT_PURPOSE,
  longDate,
  mergeBlocks,
  newBlock,
  ordinal,
  renderCertificateHtml,
  richRuns,
  sanitizeBlocks,
} from '../src/certificates'

const emp = {
  firstName: 'Maria',
  middleName: 'Santos',
  lastName: 'Reyes',
  gender: 'Female',
  employeeId: 'EMP-0042',
  position: 'Accountant III',
  station: { name: 'PENRO Laguna' },
  classification: 'Regular',
  employmentStatus: 'Resigned',
  dateHired: '2018-03-05T12:00:00.000Z',
  lastDayOfService: '2026-09-30T12:00:00.000Z',
}

describe('certificate values', () => {
  it('fills names, pronouns, dates and service length', () => {
    const v = certificateValues(emp, { issuedDate: '2026-10-04', controlNumber: 'COE-2026-0007', companyName: 'Acme' })
    expect(v).toMatchObject({
      fullName: 'Maria S. Reyes',
      fullNameUpper: 'MARIA S. REYES',
      honorific: 'Ms.',
      pronoun: 'she',
      possessive: 'her',
      station: 'PENRO Laguna',
      dateHired: 'March 5, 2018',
      lastDayOfService: 'September 30, 2026',
      lengthOfService: '8 years and 6 months',
      separation: 'resigned',
      issuedDay: '4th',
      issuedMonthYear: 'October 2026',
      purpose: DEFAULT_PURPOSE,
      controlNumber: 'COE-2026-0007',
    })
  })

  it('formats ordinals and long dates', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'])
    expect(longDate('2026-01-09')).toBe('January 9, 2026')
  })
})

describe('template validation', () => {
  it('accepts every block type and normalises bad values', () => {
    const blocks = sanitizeBlocks(['header', 'title', 'paragraph', 'details', 'signatory', 'spacer', 'divider', 'footer'].map((t) => newBlock(t as never)))
    expect(blocks).toHaveLength(8)
    const [p] = sanitizeBlocks([{ type: 'paragraph', text: 'Hi', align: 'sideways', size: 'huge', indent: 'yes' }])
    expect(p).toMatchObject({ type: 'paragraph', align: 'justify', size: 'md', indent: false })
    const [d] = sanitizeBlocks([{ type: 'details', fields: ['position', 'password', 'position'] }])
    expect(d).toMatchObject({ fields: ['position'] })
  })

  it('rejects unknown blocks, unknown placeholders, empty and oversized layouts', () => {
    expect(() => sanitizeBlocks([{ type: 'script' }])).toThrow(CertificateTemplateError)
    expect(() => sanitizeBlocks([{ type: 'paragraph', text: 'Salary: {{salary}}' }])).toThrow(/\{\{salary\}\}/)
    expect(() => sanitizeBlocks([])).toThrow(/at least one block/)
    expect(() => sanitizeBlocks(Array.from({ length: 41 }, () => newBlock('spacer')))).toThrow(/at most 40/)
    expect(() => sanitizeBlocks('not json')).toThrow(CertificateTemplateError)
  })
})

describe('rendering', () => {
  it('escapes all text, including employee data', () => {
    const blocks = sanitizeBlocks([{ type: 'paragraph', text: 'Name: **{{fullName}}** <script>alert(1)</script>' }])
    const html = renderCertificateHtml(blocks, { values: { fullName: '<img src=x onerror=alert(1)>' }, companyName: 'A', font: 'serif' })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>')
  })

  it('merges placeholders permanently for issued certificates', () => {
    const blocks = sanitizeBlocks([
      { type: 'paragraph', text: 'This certifies {{fullName}} for {{purpose}}.' },
      { type: 'details', fields: ['position'] },
    ])
    const merged = mergeBlocks(blocks, { fullName: 'Juan', purpose: 'a loan', position: 'Clerk' })
    const html = renderCertificateHtml(merged, { companyName: 'A', font: 'sans' })
    expect(html).toContain('This certifies Juan for a loan.')
    expect(html).toContain('<th>Position</th><td>Clerk</td>')
  })

  it('shows placeholders as tags in the editor', () => {
    const html = renderCertificateHtml(sanitizeBlocks([{ type: 'title', text: 'For {{fullName}}' }]), { showPlaceholders: true, companyName: 'A', font: 'serif' })
    expect(html).toContain('<span class="cert-ph">fullName</span>')
  })

  it('splits bold runs', () => {
    expect(richRuns('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ])
  })
})
