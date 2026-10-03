// Brand palette helpers: validation, WCAG contrast checks and ready-made presets.

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

export type Palette = {
  primary: string
  secondary: string
  accent: string
  success: string
  warning: string
  danger: string
}

export const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'success', 'warning', 'danger'] as const

export const DEFAULT_PALETTE: Palette = {
  primary: '#1d4ed8',
  secondary: '#475569',
  accent: '#0d9488',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
}

export const PALETTE_PRESETS: { name: string; palette: Palette }[] = [
  { name: 'Civil Blue', palette: DEFAULT_PALETTE },
  {
    name: 'Forest',
    palette: {
      primary: '#166534',
      secondary: '#57534e',
      accent: '#a16207',
      success: '#15803d',
      warning: '#b45309',
      danger: '#b91c1c',
    },
  },
  {
    name: 'Maroon',
    palette: {
      primary: '#9f1239',
      secondary: '#52525b',
      accent: '#b45309',
      success: '#15803d',
      warning: '#a16207',
      danger: '#dc2626',
    },
  },
  {
    name: 'Royal Purple',
    palette: {
      primary: '#6d28d9',
      secondary: '#475569',
      accent: '#0e7490',
      success: '#15803d',
      warning: '#b45309',
      danger: '#be123c',
    },
  },
  {
    name: 'Slate & Teal',
    palette: {
      primary: '#0f766e',
      secondary: '#334155',
      accent: '#4338ca',
      success: '#15803d',
      warning: '#b45309',
      danger: '#b91c1c',
    },
  },
]

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value)
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1! + 0.05) / (l2! + 0.05)
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string): '#ffffff' | '#000000' {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000'
}

/**
 * Brand colors are used as text/icons on the light page background, so each needs at least 3:1
 * contrast against white (WCAG 1.4.11). Text placed *on* a brand color always uses `readableOn`.
 */
export function contrastWarnings(p: Partial<Palette>): string[] {
  const warnings: string[] = []
  for (const key of PALETTE_KEYS) {
    const hex = p[key]
    if (!isHex(hex)) continue
    const ratio = contrastRatio(hex, '#ffffff')
    if (ratio < 3) warnings.push(`${key} (${hex}) is too light to read on white (${ratio.toFixed(1)}:1, needs 3:1)`)
  }
  return warnings
}

export function resolvePalette(p?: Partial<Record<keyof Palette, string | null>> | null): Palette {
  const out = { ...DEFAULT_PALETTE }
  for (const key of PALETTE_KEYS) {
    const v = p?.[key]
    if (isHex(v)) out[key] = v
  }
  return out
}
