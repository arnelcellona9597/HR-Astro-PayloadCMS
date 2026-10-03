import { describe, expect, it } from 'vitest'

import { safeNext } from '../src/redirect'
// @ts-expect-error plain ESM module without types
import { clientIp, normalizePath } from '../../../server-security.mjs'

describe('safeNext (post-login redirect)', () => {
  it('keeps local paths', () => {
    expect(safeNext('/employees?q=santos#x')).toBe('/employees?q=santos#x')
    expect(safeNext('/payroll/1')).toBe('/payroll/1')
  })
  it('rejects anything that could leave the site', () => {
    for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test', '/%5Cevil', '\\\\evil', 'javascript:alert(1)', '/a\nb', '', null, undefined]) {
      expect(safeNext(bad as string)).toBe('/')
    }
    expect(safeNext('/%2F%2Fevil.test')).toBe('/')
    expect(safeNext('/employees?q=a%20b')).toBe('/employees?q=a%20b')
    expect(safeNext('/login?next=/x')).toBe('/')
  })
})

describe('server path normalisation', () => {
  it('maps encoded and doubled variants to one canonical path', () => {
    expect(normalizePath('/api/users/logi%6E')).toBe('/api/users/login')
    expect(normalizePath('/api//Users/login/')).toBe('/api/users/login')
    expect(normalizePath('/API/%75sers/refresh-token')).toBe('/api/users/refresh-token')
    expect(normalizePath('/')).toBe('/')
  })
  it('rejects malformed or suspicious paths', () => {
    expect(normalizePath('/%E0%A4%A')).toBeNull()
    expect(normalizePath('/a%00b')).toBeNull()
    expect(normalizePath('/a%5Cb')).toBeNull()
  })
})

describe('client IP for rate limiting', () => {
  it('uses the address appended by our proxy, not client-supplied ones', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, socket: {} })).toBe('203.0.113.9')
    expect(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.1' } })).toBe('10.0.0.1')
  })
})
