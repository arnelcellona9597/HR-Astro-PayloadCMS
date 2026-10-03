// .xlsx files are zip archives. Before any library inflates one, check its central directory so a
// small upload can't expand into gigabytes in memory ("zip bomb") and crash the server.
export const ZIP_LIMITS = { maxUncompressed: 60 * 1024 * 1024, maxEntries: 300, maxRatio: 200 }

/** Returns an error message, or null when the archive looks safe to open. */
export function checkZip(input: ArrayBuffer | Buffer, limits = ZIP_LIMITS): string | null {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const bad = 'This file is not a valid Excel workbook (.xlsx).'
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return bad
  // End of central directory record: within the last 64 KB + 22 bytes.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return bad
  const entries = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (entries === 0xffff || cdOffset === 0xffffffff) return 'This workbook is too large to import.'
  if (entries > limits.maxEntries) return 'This workbook has too many parts to import safely.'
  if (cdOffset + cdSize > buf.length) return bad
  let total = 0
  let p = cdOffset
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return bad
    const compressed = buf.readUInt32LE(p + 20)
    const uncompressed = buf.readUInt32LE(p + 24)
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) return 'This workbook is too large to import.'
    if (uncompressed > 1024 * 1024 && uncompressed / Math.max(compressed, 1) > limits.maxRatio) {
      return 'This workbook is compressed suspiciously and was rejected.'
    }
    total += uncompressed
    if (total > limits.maxUncompressed) return 'This workbook is too large to import (more than 60 MB of data).'
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return null
}
