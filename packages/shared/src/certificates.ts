// Certificates of employment: the block model behind the drag-and-drop template editor, the
// {{placeholders}} a template can use, validation, and the HTML renderer shared by the editor's live
// preview, the certificate page and the print view (the PDF is drawn from the same blocks).
import { lengthOfService, toYmd } from './dates'
import { escapeHtml, findPlaceholders } from './merge'
import { formatNameFirstLast } from './names'

// ---------------------------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------------------------
export type Align = 'left' | 'center' | 'right' | 'justify'
export type Signer = { label: string; name: string; title: string }

export type CertBlock =
  | { id: string; type: 'header'; showLogo: boolean; companyName: string; lines: string; align: 'left' | 'center' }
  | { id: string; type: 'title'; text: string; size: 'md' | 'lg' | 'xl'; align: 'left' | 'center'; wide: boolean }
  | { id: string; type: 'paragraph'; text: string; align: Align; size: 'sm' | 'md' | 'lg'; indent: boolean }
  | { id: string; type: 'details'; fields: string[] }
  | { id: string; type: 'signatory'; align: 'left' | 'center' | 'right'; signers: Signer[] }
  | { id: string; type: 'spacer'; size: 'sm' | 'md' | 'lg' | 'xl' }
  | { id: string; type: 'divider' }
  | { id: string; type: 'footer'; text: string; align: 'left' | 'center' | 'right' }

export type BlockType = CertBlock['type']
export type PaperSize = 'A4' | 'Letter' | 'Legal'
export type CertFont = 'serif' | 'sans'
export type CertMargin = 'narrow' | 'normal' | 'wide'

export const PAPER_SIZES: PaperSize[] = ['A4', 'Letter', 'Legal']
/** Page sizes in PDF points (1/72 in). */
export const PAPER_POINTS: Record<PaperSize, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008] }
export const MARGIN_POINTS: Record<CertMargin, number> = { narrow: 50, normal: 72, wide: 96 }
export const SPACER_POINTS = { sm: 8, md: 18, lg: 32, xl: 56 } as const
export const TEXT_POINTS = { sm: 10.5, md: 12, lg: 13.5 } as const
export const TITLE_POINTS = { md: 16, lg: 20, xl: 24 } as const

/** One entry per block type: what the editor's palette and property panel show. */
export const BLOCK_TYPES: { type: BlockType; label: string; description: string; icon: string }[] = [
  { type: 'header', label: 'Letterhead', description: 'Logo, company name and address lines', icon: 'building' },
  { type: 'title', label: 'Title', description: 'e.g. CERTIFICATE OF EMPLOYMENT', icon: 'file' },
  { type: 'paragraph', label: 'Paragraph', description: 'Text with {{placeholders}}; **bold**', icon: 'edit' },
  { type: 'details', label: 'Details table', description: 'Employee details as label: value rows', icon: 'sheet' },
  { type: 'signatory', label: 'Signatories', description: 'Up to 3 names with titles and signature lines', icon: 'user' },
  { type: 'spacer', label: 'Space', description: 'Empty vertical space', icon: 'minus' },
  { type: 'divider', label: 'Line', description: 'A thin horizontal rule', icon: 'minus' },
  { type: 'footer', label: 'Footnote', description: 'Small print, e.g. "Not valid without dry seal"', icon: 'info' },
]

const newId = () => Math.random().toString(36).slice(2, 10)

export function newBlock(type: BlockType): CertBlock {
  const id = newId()
  switch (type) {
    case 'header':
      return { id, type, showLogo: true, companyName: '', lines: '', align: 'center' }
    case 'title':
      return { id, type, text: 'CERTIFICATE OF EMPLOYMENT', size: 'lg', align: 'center', wide: true }
    case 'paragraph':
      return { id, type, text: 'Type your text here. Use {{fullName}} and other placeholders.', align: 'justify', size: 'md', indent: true }
    case 'details':
      return { id, type, fields: ['fullName', 'position', 'station', 'dateHired'] }
    case 'signatory':
      return { id, type, align: 'right', signers: [{ label: '', name: '', title: 'HR Officer' }] }
    case 'spacer':
      return { id, type, size: 'md' }
    case 'divider':
      return { id, type }
    case 'footer':
      return { id, type, text: 'Not valid without the official dry seal.', align: 'left' }
  }
}

// ---------------------------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------------------------
export const CERT_FIELDS: { name: string; label: string; sample: string }[] = [
  { name: 'fullName', label: 'Full name', sample: 'Juan A. Dela Cruz' },
  { name: 'fullNameUpper', label: 'Full name (capitals)', sample: 'JUAN A. DELA CRUZ' },
  { name: 'firstName', label: 'First name', sample: 'Juan' },
  { name: 'lastName', label: 'Last name', sample: 'Dela Cruz' },
  { name: 'honorific', label: 'Mr. / Ms.', sample: 'Mr.' },
  { name: 'pronoun', label: 'he / she', sample: 'he' },
  { name: 'pronounCap', label: 'He / She', sample: 'He' },
  { name: 'possessive', label: 'his / her', sample: 'his' },
  { name: 'employeeId', label: 'Employee ID', sample: 'EMP-0001' },
  { name: 'position', label: 'Position', sample: 'Administrative Officer IV' },
  { name: 'station', label: 'Station / branch', sample: 'PENRO Batangas' },
  { name: 'classification', label: 'Classification', sample: 'Regular' },
  { name: 'employmentStatus', label: 'Employment status', sample: 'Active' },
  { name: 'dateHired', label: 'Date hired', sample: 'March 5, 2018' },
  { name: 'lastDayOfService', label: 'Last day of service', sample: 'September 30, 2026' },
  { name: 'lengthOfService', label: 'Length of service', sample: '8 years and 6 months' },
  { name: 'separation', label: 'resigned / retired / was separated', sample: 'resigned' },
  { name: 'purpose', label: 'Purpose (entered when issuing)', sample: 'loan application' },
  { name: 'issuedDate', label: 'Date issued', sample: 'October 4, 2026' },
  { name: 'issuedDay', label: 'Day issued (e.g. 4th)', sample: '4th' },
  { name: 'issuedMonthYear', label: 'Month and year issued', sample: 'October 2026' },
  { name: 'controlNumber', label: 'Control number', sample: 'COE-2026-0001' },
  { name: 'companyName', label: 'Company name', sample: 'HR Management System' },
]
export const CERT_FIELD_NAMES = CERT_FIELDS.map((f) => f.name)
export const SAMPLE_VALUES: Record<string, string> = Object.fromEntries(CERT_FIELDS.map((f) => [f.name, f.sample]))

/** Text used when no purpose is entered. */
export const DEFAULT_PURPOSE = 'whatever legal purpose it may serve'

const LONG_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long' })

/** `2026-10-04` → `October 4, 2026`. */
export function longDate(value: unknown): string {
  const ymd = toYmd(value)
  return ymd ? LONG_DATE.format(new Date(`${ymd}T12:00:00Z`)) : ''
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** "8 years and 6 months" (written out, for formal letters). */
export function serviceInWords(dateHired: unknown, lastDay: unknown, today: string): string {
  const span = lengthOfService(toYmd(dateHired), toYmd(lastDay), today)
  if (!span) return ''
  const part = (n: number, unit: string) => (n ? `${n} ${unit}${n === 1 ? '' : 's'}` : '')
  const p = [part(span.years, 'year'), part(span.months, 'month')].filter(Boolean)
  return p.length ? p.join(' and ') : part(span.days, 'day') || 'less than a day'
}

export type CertEmployee = {
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  extension?: string | null
  gender?: string | null
  employeeId?: string | null
  position?: string | null
  station?: string | { name?: string | null } | null
  classification?: string | null
  employmentStatus?: string | null
  dateHired?: string | null
  lastDayOfService?: string | null
}

/** Placeholder values for one employee and one issuance. */
export function certificateValues(
  e: CertEmployee,
  issue: { issuedDate: string; purpose?: string | null; controlNumber?: string | null; companyName?: string | null },
): Record<string, string> {
  const female = e.gender === 'Female'
  const fullName = formatNameFirstLast(e)
  const issued = toYmd(issue.issuedDate) ?? issue.issuedDate
  const day = Number(issued.slice(8, 10))
  const separation = { Resigned: 'resigned', Retired: 'retired', Terminated: 'was separated' }[e.employmentStatus ?? ''] ?? 'was separated'
  return {
    fullName,
    fullNameUpper: fullName.toUpperCase(),
    firstName: (e.firstName ?? '').trim(),
    lastName: (e.lastName ?? '').trim(),
    honorific: female ? 'Ms.' : 'Mr.',
    pronoun: female ? 'she' : 'he',
    pronounCap: female ? 'She' : 'He',
    possessive: female ? 'her' : 'his',
    employeeId: e.employeeId ?? '',
    position: e.position ?? '',
    station: typeof e.station === 'object' && e.station ? (e.station.name ?? '') : typeof e.station === 'string' ? e.station : '',
    classification: e.classification ?? '',
    employmentStatus: e.employmentStatus ?? '',
    dateHired: longDate(e.dateHired),
    lastDayOfService: longDate(e.lastDayOfService),
    lengthOfService: serviceInWords(e.dateHired, e.lastDayOfService, issued),
    separation,
    purpose: (issue.purpose ?? '').trim() || DEFAULT_PURPOSE,
    issuedDate: longDate(issued),
    issuedDay: Number.isFinite(day) ? ordinal(day) : '',
    issuedMonthYear: MONTH_YEAR.format(new Date(`${issued}T12:00:00Z`)),
    controlNumber: issue.controlNumber ?? '',
    companyName: issue.companyName ?? '',
  }
}

// ---------------------------------------------------------------------------------------------
// Validation (templates come from the browser: everything is checked and normalised)
// ---------------------------------------------------------------------------------------------
export const MAX_BLOCKS = 40
const MAX_TEXT = 3000

export class CertificateTemplateError extends Error {}

const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '')
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const bool = (v: unknown) => v === true || v === 'true'

/** Checks and normalises a template's blocks. Throws CertificateTemplateError with a readable message. */
export function sanitizeBlocks(input: unknown): CertBlock[] {
  const raw = typeof input === 'string' ? safeParse(input) : input
  if (!Array.isArray(raw)) throw new CertificateTemplateError('The template layout is not valid.')
  if (raw.length === 0) throw new CertificateTemplateError('Add at least one block to the template.')
  if (raw.length > MAX_BLOCKS) throw new CertificateTemplateError(`A template can have at most ${MAX_BLOCKS} blocks.`)
  const ids = new Set<string>()
  const out = raw.map((b: Record<string, unknown>): CertBlock => {
    let id = typeof b?.id === 'string' && /^[a-z0-9]{1,16}$/.test(b.id) ? b.id : newId()
    while (ids.has(id)) id = newId()
    ids.add(id)
    switch (b?.type) {
      case 'header':
        return { id, type: 'header', showLogo: bool(b.showLogo), companyName: str(b.companyName, 160), lines: str(b.lines, 600), align: pick(b.align, ['left', 'center'], 'center') }
      case 'title':
        return { id, type: 'title', text: str(b.text, 160), size: pick(b.size, ['md', 'lg', 'xl'], 'lg'), align: pick(b.align, ['left', 'center'], 'center'), wide: bool(b.wide) }
      case 'paragraph':
        return { id, type: 'paragraph', text: str(b.text), align: pick(b.align, ['left', 'center', 'right', 'justify'], 'justify'), size: pick(b.size, ['sm', 'md', 'lg'], 'md'), indent: bool(b.indent) }
      case 'details': {
        const fields = Array.isArray(b.fields) ? b.fields.filter((f): f is string => typeof f === 'string' && CERT_FIELD_NAMES.includes(f)) : []
        return { id, type: 'details', fields: [...new Set(fields)].slice(0, 12) }
      }
      case 'signatory': {
        const signers = (Array.isArray(b.signers) ? b.signers : [])
          .slice(0, 3)
          .map((s: Record<string, unknown>) => ({ label: str(s?.label, 60), name: str(s?.name, 120), title: str(s?.title, 160) }))
        return { id, type: 'signatory', align: pick(b.align, ['left', 'center', 'right'], 'right'), signers: signers.length ? signers : [{ label: '', name: '', title: '' }] }
      }
      case 'spacer':
        return { id, type: 'spacer', size: pick(b.size, ['sm', 'md', 'lg', 'xl'], 'md') }
      case 'divider':
        return { id, type: 'divider' }
      case 'footer':
        return { id, type: 'footer', text: str(b.text, 600), align: pick(b.align, ['left', 'center', 'right'], 'left') }
      default:
        throw new CertificateTemplateError('The template contains an unknown block.')
    }
  })
  const bad = unknownCertPlaceholders(out)
  if (bad.length) throw new CertificateTemplateError(`Unknown placeholder(s): ${bad.map((p) => `{{${p}}}`).join(', ')}`)
  return out
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** All text a block shows (for placeholder checks and merging). */
function blockTexts(b: CertBlock): string[] {
  switch (b.type) {
    case 'header':
      return [b.companyName, b.lines]
    case 'title':
    case 'paragraph':
    case 'footer':
      return [b.text]
    case 'signatory':
      return b.signers.flatMap((s) => [s.label, s.name, s.title])
    default:
      return []
  }
}

export function unknownCertPlaceholders(blocks: CertBlock[]): string[] {
  return [...new Set(blocks.flatMap(blockTexts).flatMap(findPlaceholders))].filter((p) => !CERT_FIELD_NAMES.includes(p))
}

// ---------------------------------------------------------------------------------------------
// Merging and HTML rendering
// ---------------------------------------------------------------------------------------------
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g
const merge = (text: string, values: Record<string, string>) => text.replace(PLACEHOLDER_RE, (_, k: string) => values[k] ?? '')

/** Replaces placeholders in every block (used when a certificate is issued, so reprints never change). */
export function mergeBlocks(blocks: CertBlock[], values: Record<string, string>): CertBlock[] {
  return blocks.map((b) => {
    switch (b.type) {
      case 'header':
        return { ...b, companyName: merge(b.companyName, values), lines: merge(b.lines, values) }
      case 'title':
      case 'paragraph':
      case 'footer':
        return { ...b, text: merge(b.text, values) }
      case 'signatory':
        return { ...b, signers: b.signers.map((s) => ({ label: merge(s.label, values), name: merge(s.name, values), title: merge(s.title, values) })) }
      case 'details':
        // Details rows keep their labels and freeze the values under the field names.
        return { ...b, fields: b.fields.map((f) => `${f}=${values[f] ?? ''}`) }
      default:
        return b
    }
  })
}

/** Bold runs: "a **b** c" → [{text:'a ',bold:false},{text:'b',bold:true},{text:' c',bold:false}]. */
export function richRuns(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = []
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return
    const bold = /^\*\*[^*]+\*\*$/.test(part)
    out.push({ text: bold ? part.slice(2, -2) : part, bold })
  })
  return out
}

const richHtml = (text: string) =>
  richRuns(text)
    .map((r) => (r.bold ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text)))
    .join('')
    .replace(/\n/g, '<br>')

const FIELD_LABELS: Record<string, string> = Object.fromEntries(CERT_FIELDS.map((f) => [f.name, f.label]))

export type RenderOptions = {
  /** Values for placeholders (sample data in the editor); omit when blocks are already merged. */
  values?: Record<string, string>
  /** Show {{placeholders}} as highlighted tags instead of values (editor). */
  showPlaceholders?: boolean
  companyName: string
  logoUrl?: string | null
  font: CertFont
}

/** Inline text with placeholders either merged or highlighted; always HTML-escaped. */
function inline(text: string, o: RenderOptions): string {
  if (o.showPlaceholders) {
    return richHtml(text).replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, k: string) => `<span class="cert-ph">${escapeHtml(k)}</span>`)
  }
  return richHtml(o.values ? merge(text, o.values) : text)
}

/** HTML for one block (no outer page). Every piece of text is escaped. */
export function renderBlockHtml(b: CertBlock, o: RenderOptions): string {
  switch (b.type) {
    case 'header': {
      const name = b.companyName.trim() ? inline(b.companyName, o) : escapeHtml(o.companyName)
      const logo = b.showLogo && o.logoUrl ? `<img class="cert-logo" src="${escapeHtml(o.logoUrl)}" alt="">` : ''
      const lines = b.lines.trim() ? `<div class="cert-lines">${inline(b.lines.trim(), o)}</div>` : ''
      return `<div class="cert-header cert-${b.align}">${logo}<div><div class="cert-company">${name}</div>${lines}</div></div>`
    }
    case 'title':
      // Not an <h1>: the certificate sits inside pages that already have their own heading.
      return `<div class="cert-title cert-${b.align} cert-t-${b.size}${b.wide ? ' cert-wide' : ''}">${inline(b.text, o)}</div>`
    case 'paragraph':
      return `<p class="cert-p cert-${b.align} cert-s-${b.size}${b.indent ? ' cert-indent' : ''}">${inline(b.text, o) || '&nbsp;'}</p>`
    case 'details': {
      const rows = b.fields
        .map((f) => {
          const [key, frozen] = f.includes('=') ? [f.slice(0, f.indexOf('=')), f.slice(f.indexOf('=') + 1)] : [f, null]
          const value = frozen !== null ? escapeHtml(frozen) : o.showPlaceholders ? `<span class="cert-ph">${escapeHtml(key)}</span>` : escapeHtml(o.values?.[key] ?? '')
          return `<tr><th>${escapeHtml(FIELD_LABELS[key] ?? key)}</th><td>${value}</td></tr>`
        })
        .join('')
      return `<table class="cert-details"><tbody>${rows}</tbody></table>`
    }
    case 'signatory': {
      const cols = b.signers
        .map(
          (s) =>
            `<div class="cert-signer">${s.label ? `<div class="cert-sig-label">${inline(s.label, o)}</div>` : ''}<div class="cert-sig-line"></div><div class="cert-sig-name">${inline(s.name, o) || '&nbsp;'}</div><div class="cert-sig-title">${inline(s.title, o)}</div></div>`,
        )
        .join('')
      return `<div class="cert-signatory cert-${b.align}">${cols}</div>`
    }
    case 'spacer':
      return `<div style="height:${SPACER_POINTS[b.size]}pt"></div>`
    case 'divider':
      return '<hr class="cert-hr">'
    case 'footer':
      return `<p class="cert-footer cert-${b.align}">${inline(b.text, o)}</p>`
  }
}

/** Styles for a rendered certificate; scoped to `.cert`. Units are points so print matches the PDF. */
export function certificateCss(): string {
  return `
.cert{color:#111;line-height:1.5;font-size:12pt}
.cert.cert-serif{font-family:'Times New Roman',Times,'Liberation Serif',serif}
.cert.cert-sans{font-family:'DejaVu Sans','Inter Variable',Arial,sans-serif;font-size:11pt}
.cert *{box-sizing:border-box}
.cert .cert-left{text-align:left}.cert .cert-center{text-align:center}.cert .cert-right{text-align:right}.cert .cert-justify{text-align:justify}
.cert .cert-header{display:flex;align-items:center;gap:12pt;margin-bottom:4pt}
.cert .cert-header.cert-center{flex-direction:column;gap:6pt}
.cert .cert-logo{max-height:56pt;max-width:120pt;object-fit:contain}
.cert .cert-company{font-weight:700;font-size:14pt;line-height:1.25}
.cert .cert-lines{font-size:10pt;color:#333;line-height:1.35}
.cert .cert-title{font-weight:700;margin:0;line-height:1.2}
.cert .cert-t-md{font-size:16pt}.cert .cert-t-lg{font-size:20pt}.cert .cert-t-xl{font-size:24pt}
.cert .cert-wide{letter-spacing:.12em}
.cert .cert-p{margin:0 0 10pt}
.cert .cert-s-sm{font-size:10.5pt}.cert .cert-s-md{font-size:12pt}.cert .cert-s-lg{font-size:13.5pt}
.cert.cert-sans .cert-s-md{font-size:11pt}
.cert .cert-indent{text-indent:36pt}
.cert .cert-details{border-collapse:collapse;margin:0 0 10pt}
.cert .cert-details th{text-align:left;font-weight:700;padding:2pt 16pt 2pt 0;vertical-align:top;white-space:nowrap}
.cert .cert-details td{padding:2pt 0}
.cert .cert-signatory{display:flex;gap:24pt;margin-top:4pt}
.cert .cert-signatory.cert-left{justify-content:flex-start}.cert .cert-signatory.cert-center{justify-content:center}.cert .cert-signatory.cert-right{justify-content:flex-end}
.cert .cert-signatory.cert-center .cert-signer,.cert .cert-signatory.cert-right .cert-signer{text-align:center}
.cert .cert-signer{width:180pt}
.cert .cert-sig-label{font-size:10.5pt;margin-bottom:28pt;text-align:left}
.cert .cert-sig-line{border-top:1px solid #111;margin-top:30pt}
.cert .cert-sig-label+.cert-sig-line{margin-top:0}
.cert .cert-sig-name{font-weight:700;text-transform:uppercase;margin-top:3pt}
.cert .cert-sig-title{font-size:10.5pt}
.cert .cert-hr{border:0;border-top:1px solid #333;margin:6pt 0}
.cert .cert-footer{font-size:9pt;color:#444;margin:0 0 4pt}
.cert .cert-ph{background:#e8f0fb;color:#00539b;border-radius:3px;padding:0 3px;font-family:ui-monospace,monospace;font-size:.85em;white-space:nowrap}
.cert .cert-ph::before{content:'{{'}.cert .cert-ph::after{content:'}}'}
`
}

/** Full certificate body (all blocks) as HTML. */
export function renderCertificateHtml(blocks: CertBlock[], o: RenderOptions): string {
  return `<div class="cert cert-${o.font}">${blocks.map((b) => renderBlockHtml(b, o)).join('')}</div>`
}
