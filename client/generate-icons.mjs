/**
 * Pure Node.js PNG icon generator — no external dependencies.
 * Generates a receipt-on-indigo icon in all required PWA sizes.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

// ── CRC32 (required by PNG spec) ─────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const lenBuf    = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
  const crcBuf    = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf])
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function dist2(ax, ay, bx, by) { return (ax - bx) ** 2 + (ay - by) ** 2 }

function inRoundedRect(px, py, rx, ry, rw, rh, cr) {
  if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false
  if (px < rx + cr && py < ry + cr)        return dist2(px, py, rx + cr,      ry + cr)      <= cr * cr
  if (px > rx+rw-cr && py < ry + cr)       return dist2(px, py, rx + rw - cr, ry + cr)      <= cr * cr
  if (px < rx + cr && py > ry + rh - cr)   return dist2(px, py, rx + cr,      ry + rh - cr) <= cr * cr
  if (px > rx+rw-cr && py > ry + rh - cr)  return dist2(px, py, rx + rw - cr, ry + rh - cr) <= cr * cr
  return true
}

// ── Icon pixel colour ─────────────────────────────────────────────────────────
// Design: indigo background + white rounded receipt + grey text lines + green dot
function pixelAt(x, y, S) {
  const cx = S / 2, cy = S / 2

  // Receipt card
  const rW = S * 0.52, rH = S * 0.64
  const rX = cx - rW / 2, rY = cy - rH / 2
  const cr = S * 0.06

  if (inRoundedRect(x, y, rX, rY, rW, rH, cr)) {
    const relX = x - rX, relY = y - rY

    // "R" currency symbol — drawn as filled regions
    const symX = rX + rW * 0.18, symY = rY + rH * 0.14
    const symW = rW * 0.28, symH = rH * 0.26
    const stemX1 = symX, stemX2 = symX + symW * 0.22
    if (x >= stemX1 && x <= stemX2 && y >= symY && y <= symY + symH) {
      return [0x63, 0x66, 0xf1]  // indigo vertical stem
    }
    // Bowl of R (top-right arc approximated as filled half)
    const bCX = symX + symW * 0.22, bCY = symY + symH * 0.30
    const bRX = symW * 0.39, bRY = symH * 0.32
    if (x >= stemX2 && x <= symX + symW && y >= symY && y <= symY + symH * 0.60) {
      const normX = (x - bCX) / bRX, normY = (y - bCY) / bRY
      if (normX * normX + normY * normY <= 1) return [0x63, 0x66, 0xf1]
    }
    // Leg of R (diagonal stripe bottom-right)
    if (x >= symX + symW * 0.18 && x <= symX + symW && y >= symY + symH * 0.48 && y <= symY + symH) {
      const legSlope = (y - (symY + symH * 0.52)) / symH
      if (x >= symX + symW * 0.18 + legSlope * symW * 0.9 &&
          x <= symX + symW * 0.40 + legSlope * symW * 0.9) {
        return [0x63, 0x66, 0xf1]
      }
    }

    // Horizontal lines (expense rows)
    const lineAreaY = rY + rH * 0.44
    const lineAreaH = rH * 0.48
    const numLines  = 4
    for (let i = 0; i < numLines; i++) {
      const ly    = lineAreaY + i * (lineAreaH / numLines)
      const lh    = lineAreaH / numLines * 0.30
      const lxEnd = rX + rW * (i === 0 ? 0.80 : i === 1 ? 0.65 : i === 2 ? 0.73 : 0.55)

      if (y >= ly && y <= ly + lh && x >= rX + rW * 0.12 && x <= lxEnd) {
        return [0xc7, 0xd2, 0xfe]  // light indigo lines
      }

      // Small amount on right for each row
      if (y >= ly && y <= ly + lh && x >= rX + rW * 0.72 && x <= rX + rW * 0.90) {
        return [0xc7, 0xd2, 0xfe]
      }
    }

    // Divider line
    const divY = rY + rH * 0.42
    if (y >= divY && y <= divY + Math.max(1, S * 0.004) && x >= rX + rW * 0.08 && x <= rX + rW * 0.92) {
      return [0xe0, 0xe7, 0xff]
    }

    return [255, 255, 255]  // white card body
  }

  // Indigo background
  return [0x63, 0x66, 0xf1]
}

// ── PNG encoder ───────────────────────────────────────────────────────────────
function createIconPNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 2   // color type: RGB

  // Raw scanlines: 1 filter byte + 3 bytes per pixel
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const rowOff = y * (1 + size * 3)
    raw[rowOff] = 0  // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y, size)
      raw[rowOff + 1 + x * 3]     = r
      raw[rowOff + 1 + x * 3 + 1] = g
      raw[rowOff + 1 + x * 3 + 2] = b
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Generate all sizes ────────────────────────────────────────────────────────
mkdirSync('public/icons', { recursive: true })

const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512]
for (const s of SIZES) {
  const file = s === 180
    ? 'public/icons/apple-touch-icon.png'
    : `public/icons/icon-${s}x${s}.png`
  writeFileSync(file, createIconPNG(s))
  console.log(`✓ ${file}`)
}

console.log('\nAll icons generated.')
