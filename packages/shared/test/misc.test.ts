import { describe, expect, it } from 'vitest'
import { countWorkdays } from '../src/workdays'
import { formatGovId, validateGovId } from '../src/ids'
import { adjectivalRating } from '../src/ipcr'
import { contrastRatio, contrastWarnings, resolvePalette, DEFAULT_PALETTE } from '../src/colors'
import { formatNameLastFirst } from '../src/names'

describe('countWorkdays', () => {
  it('skips weekends', () => {
    // Mon 2024-03-04 .. Sun 2024-03-10
    expect(countWorkdays('2024-03-04', '2024-03-10').total).toBe(5)
  })
  it('skips holidays', () => {
    expect(countWorkdays('2024-03-25', '2024-03-29', ['2024-03-28', '2024-03-29']).total).toBe(3)
  })
  it('splits a Dec–Jan leave across years', () => {
    const r = countWorkdays('2024-12-30', '2025-01-03', ['2025-01-01'])
    expect(r.byYear).toEqual({ 2024: 2, 2025: 2 })
    expect(r.total).toBe(4)
  })
  it('counts a single day', () => {
    expect(countWorkdays('2024-03-04', '2024-03-04').total).toBe(1)
    expect(countWorkdays('2024-03-09', '2024-03-09').total).toBe(0)
  })
  it('rejects reversed or invalid ranges', () => {
    expect(() => countWorkdays('2024-03-05', '2024-03-04')).toThrow()
    expect(() => countWorkdays('2024-02-30', '2024-03-04')).toThrow()
  })
})

describe('government IDs', () => {
  it('validates lengths', () => {
    expect(validateGovId('sss', '34-1234567-8')).toBeNull()
    expect(validateGovId('sss', '34-1234567')).toMatch(/10/)
    expect(validateGovId('philhealth', '010000000001')).toBeNull()
    expect(validateGovId('pagibig', '1210-0000-0001')).toBeNull()
    expect(validateGovId('tin', '123456789')).toBeNull()
    expect(validateGovId('tin', '123-456-789-000')).toBeNull()
    expect(validateGovId('tin', '123-456-789-00000')).toBeNull()
    expect(validateGovId('tin', '1234')).not.toBeNull()
    expect(validateGovId('tin', '12A456789')).not.toBeNull()
    expect(validateGovId('sss', '')).toBeNull()
  })
  it('formats canonically and keeps leading zeros', () => {
    expect(formatGovId('sss', '0412345678')).toBe('04-1234567-8')
    expect(formatGovId('philhealth', '010000000001')).toBe('01-000000000-1')
    expect(formatGovId('pagibig', '012345678901')).toBe('0123-4567-8901')
    expect(formatGovId('tin', '001 234 567 000')).toBe('001-234-567-000')
  })
})

describe('adjectivalRating', () => {
  it('maps the CSC scale', () => {
    expect(adjectivalRating(5)).toBe('Outstanding')
    expect(adjectivalRating(4.5)).toBe('Outstanding')
    expect(adjectivalRating(4.499)).toBe('Very Satisfactory')
    expect(adjectivalRating(3.5)).toBe('Very Satisfactory')
    expect(adjectivalRating(2.5)).toBe('Satisfactory')
    expect(adjectivalRating(1.5)).toBe('Unsatisfactory')
    expect(adjectivalRating(1)).toBe('Poor')
    expect(adjectivalRating(0.5)).toBe('')
    expect(adjectivalRating(null)).toBe('')
  })
})

describe('colors', () => {
  it('computes contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
  })
  it('flags low-contrast colors and keeps defaults readable', () => {
    expect(contrastWarnings({ primary: '#ffff00' })).toHaveLength(1)
    // Yellow accent/warning are fills (warning text is darkened by the stylesheet), not flagged.
    expect(contrastWarnings({ accent: '#ffc72c', warning: '#ffc72c' })).toHaveLength(0)
    expect(contrastWarnings(DEFAULT_PALETTE)).toHaveLength(0)
  })
  it('falls back on invalid hex', () => {
    expect(resolvePalette({ primary: 'red' }).primary).toBe(DEFAULT_PALETTE.primary)
  })
})

describe('names', () => {
  it('formats last-first', () => {
    expect(formatNameLastFirst({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Perez', extension: 'Jr.' })).toBe(
      'Dela Cruz, Juan P. Jr.',
    )
  })
})
