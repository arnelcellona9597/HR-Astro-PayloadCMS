import { describe, expect, it } from 'vitest'
import { formatCentavos, sumCentavos, toCentavos } from '../src/money'
import { renderTemplate, textToHtml, unknownPlaceholders } from '../src/merge'

describe('money', () => {
  it('parses amounts into exact centavos', () => {
    expect(toCentavos(0.1)).toEqual({ ok: true, centavos: 10 })
    expect(toCentavos('1,234.50')).toEqual({ ok: true, centavos: 123450 })
    expect(toCentavos('₱ 25,000')).toEqual({ ok: true, centavos: 2500000 })
    expect(toCentavos('PHP 99.99')).toEqual({ ok: true, centavos: 9999 })
    expect(toCentavos('')).toEqual({ ok: true, centavos: 0 })
  })
  it('adds without floating-point drift', () => {
    const a = (toCentavos(0.1) as { centavos: number }).centavos
    const b = (toCentavos(0.2) as { centavos: number }).centavos
    expect(sumCentavos([a, b])).toBe(30)
    expect(sumCentavos(Array(10).fill(10))).toBe(100)
  })
  it('rejects bad input', () => {
    expect(toCentavos(-1).ok).toBe(false)
    expect(toCentavos('12.345').ok).toBe(false)
    expect(toCentavos(12.345).ok).toBe(false)
    expect(toCentavos('abc').ok).toBe(false)
    expect(toCentavos(1e13).ok).toBe(false)
  })
  it('formats pesos', () => {
    expect(formatCentavos(123456)).toBe('₱1,234.56')
    expect(formatCentavos(5)).toBe('₱0.05')
    expect(formatCentavos(-100)).toBe('−₱1.00')
  })
})

describe('merge fields', () => {
  it('renders and flags unknown placeholders', () => {
    expect(renderTemplate('Hi {{ firstName }}, {{x}}!', { firstName: 'Ana' })).toBe('Hi Ana, !')
    expect(unknownPlaceholders('{{firstName}} {{salary}}', ['firstName'])).toEqual(['salary'])
  })
  it('escapes HTML and links URLs', () => {
    const html = textToHtml('<b>Hi</b>\nsee https://example.com/x?a=1&b=2\n\nBye')
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;<br>')
    expect(html).toContain('<a href="https://example.com/x?a=1&amp;b=2">')
    expect(html.match(/<p /g)).toHaveLength(2)
  })
})
