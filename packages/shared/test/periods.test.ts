import { describe, expect, it } from 'vitest'

import { addMonths, bucketKey, bucketsFor, isPeriodKey, percentChange, resolvePeriod } from '../src/periods'

describe('reporting periods', () => {
  it('this year compares with the same days last year, by month', () => {
    const p = resolvePeriod('this-year', '2026-10-04')
    expect(p).toMatchObject({ from: '2026-01-01', to: '2026-10-04', prevFrom: '2025-01-01', prevTo: '2025-10-04', bucket: 'month' })
  })

  it('last month is the full calendar month, compared with the month before', () => {
    const p = resolvePeriod('last-month', '2026-03-31')
    expect(p).toMatchObject({ from: '2026-02-01', to: '2026-02-28', prevFrom: '2026-01-01', prevTo: '2026-01-31', bucket: 'day' })
  })

  it('this month clamps the comparison to the shorter month', () => {
    const p = resolvePeriod('this-month', '2026-03-31')
    expect(p).toMatchObject({ from: '2026-03-01', to: '2026-03-31', prevFrom: '2026-02-01', prevTo: '2026-02-28' })
  })

  it('90 days and 12 months have equal-length previous ranges', () => {
    expect(resolvePeriod('90d', '2026-10-04')).toMatchObject({ from: '2026-07-07', prevFrom: '2026-04-08', prevTo: '2026-07-06', bucket: 'week' })
    expect(resolvePeriod('12m', '2026-10-04')).toMatchObject({ from: '2025-11-01', prevFrom: '2024-11-01', prevTo: '2025-10-31' })
    expect(resolvePeriod('10y', '2026-10-04')).toMatchObject({ from: '2017-01-01', prevFrom: '2007-01-01', prevTo: '2016-12-31', bucket: 'year' })
  })

  it('validates period keys from the URL', () => {
    expect(isPeriodKey('90d')).toBe(true)
    expect(isPeriodKey('7y')).toBe(false)
    expect(isPeriodKey(null)).toBe(false)
  })

  it('adds months with day clamping, across years', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29')
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15')
  })

  it('groups dates into buckets and lists every bucket in a range', () => {
    expect(bucketKey('2026-10-04', 'week')).toBe('2026-09-28') // Sunday → Monday of that week
    expect(bucketKey('2026-09-28', 'week')).toBe('2026-09-28')
    expect(bucketKey('2026-10-04', 'month')).toBe('2026-10')
    expect(bucketsFor('2026-01-01', '2026-03-15', 'month').map((b) => b.label)).toEqual(['Jan', 'Feb', 'Mar'])
    expect(bucketsFor('2025-11-01', '2026-01-10', 'month').map((b) => b.label)).toEqual(['Nov ’25', 'Dec ’25', 'Jan ’26'])
    expect(bucketsFor('2026-10-01', '2026-10-04', 'day').map((b) => b.key)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(bucketsFor('2017-01-01', '2026-10-04', 'year')).toHaveLength(10)
    const weeks = bucketsFor('2026-07-07', '2026-10-04', 'week')
    expect(weeks[0]!.key).toBe('2026-07-06')
    expect(weeks.at(-1)!.key).toBe('2026-09-28')
  })

  it('computes percentage change, with no comparison when the previous value is zero', () => {
    expect(percentChange(12, 10)).toBeCloseTo(20)
    expect(percentChange(5, 10)).toBeCloseTo(-50)
    expect(percentChange(3, 0)).toBeNull()
  })
})
