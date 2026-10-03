// Font files for generated PDFs (payslips, certificates).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export function fontPath(file: string): string {
  // Source tree (dev/tests), bundled builds (cwd = app root) and the release layout.
  const candidates = [
    path.resolve(here, '../../assets/fonts', file),
    path.resolve(process.cwd(), 'assets/fonts', file),
    path.resolve(process.cwd(), 'apps/cms/assets/fonts', file),
    path.resolve(process.cwd(), '../cms/assets/fonts', file),
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) throw new Error(`PDF font ${file} not found`)
  return found
}
