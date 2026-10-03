import { describe, expect, it } from 'vitest'
import {
  addYears,
  ageOn,
  diffYmd,
  formatSpan,
  isValidYmd,
  lengthOfService,
  normalizeDateOnly,
  todayYmd,
  toYmd,
} from '../src/dates'

describe('isValidYmd', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidYmd('2024-02-29')).toBe(true)
    expect(isValidYmd('2023-02-29')).toBe(false)
    expect(isValidYmd('2024-13-01')).toBe(false)
    expect(isValidYmd('2024-1-01')).toBe(false)
  })
})

describe('todayYmd', () => {
  it('uses Manila time, not UTC', () => {
    // 2024-03-04 17:30 UTC is 2024-03-05 01:30 in Manila
    expect(todayYmd(new Date('2024-03-04T17:30:00Z'))).toBe('2024-03-05')
    expect(todayYmd(new Date('2024-03-04T15:59:00Z'))).toBe('2024-03-04')
  })
})

describe('toYmd / normalizeDateOnly', () => {
  it('keeps YYYY-MM-DD as-is', () => {
    expect(toYmd('1990-07-15')).toBe('1990-07-15')
  })
  it('reads midnight-Manila ISO strings as the Manila date', () => {
    expect(toYmd('1990-07-14T16:00:00.000Z')).toBe('1990-07-15')
  })
  it('normalizes to noon UTC', () => {
    expect(normalizeDateOnly('1990-07-15')).toBe('1990-07-15T12:00:00.000Z')
    expect(normalizeDateOnly('1990-07-15T12:00:00.000Z')).toBe('1990-07-15T12:00:00.000Z')
    expect(normalizeDateOnly('')).toBeNull()
    expect(normalizeDateOnly('garbage')).toBeNull()
  })
})

describe('ageOn', () => {
  it('counts birthdays correctly', () => {
    expect(ageOn('1990-07-15', '2024-07-14')).toBe(33)
    expect(ageOn('1990-07-15', '2024-07-15')).toBe(34)
  })
  it('handles Feb 29 birthdays', () => {
    expect(ageOn('2000-02-29', '2023-02-28')).toBe(22)
    expect(ageOn('2000-02-29', '2023-03-01')).toBe(23)
    expect(ageOn('2000-02-29', '2024-02-29')).toBe(24)
  })
  it('returns null for future birth dates', () => {
    expect(ageOn('2030-01-01', '2024-01-01')).toBeNull()
  })
})

describe('diffYmd / lengthOfService', () => {
  it('computes years, months and days', () => {
    expect(diffYmd('2020-01-31', '2020-03-01')).toEqual({ years: 0, months: 1, days: 1 })
    expect(diffYmd('2015-06-01', '2024-06-01')).toEqual({ years: 9, months: 0, days: 0 })
    expect(diffYmd('2015-06-15', '2024-06-14')).toEqual({ years: 8, months: 11, days: 30 })
  })
  it('stops at last day of service when separated', () => {
    expect(lengthOfService('2010-01-01', '2015-01-01', '2024-01-01')).toEqual({ years: 5, months: 0, days: 0 })
  })
  it('uses today when still employed', () => {
    expect(lengthOfService('2010-01-01', null, '2024-01-01')).toEqual({ years: 14, months: 0, days: 0 })
  })
  it('formats spans', () => {
    expect(formatSpan({ years: 1, months: 2, days: 3 })).toBe('1 yr 2 mos')
    expect(formatSpan({ years: 0, months: 0, days: 5 })).toBe('5 days')
  })
})

describe('addYears', () => {
  it('clamps Feb 29', () => {
    expect(addYears('2024-02-29', -1)).toBe('2023-02-28')
    expect(addYears('2024-05-10', -30)).toBe('1994-05-10')
  })
})

describe('diffYmd edge cases', () => {
  it('handles month-end anchors', () => {
    expect(diffYmd('2021-01-31', '2021-02-28')).toEqual({ years: 0, months: 0, days: 28 })
    expect(diffYmd('2020-02-29', '2021-02-28')).toEqual({ years: 0, months: 11, days: 30 })
    expect(diffYmd('2020-02-29', '2024-02-29')).toEqual({ years: 4, months: 0, days: 0 })
    expect(diffYmd('2024-05-10', '2024-05-10')).toEqual({ years: 0, months: 0, days: 0 })
  })
})
