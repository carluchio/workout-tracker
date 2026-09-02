// Generates the PWA icon set as real PNGs — no image tooling required.
// Draws a barbell mark on the app's near-black ground, sized to sit inside the
// maskable safe zone so Android's circular/squircle crops never clip it.
//
//   node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [0x0a, 0x0a, 0x0a]
const BAR = [0xf0, 0xf0, 0xf0]
const PLATE = [0x3b, 0x82, 0xf6]

// ── PNG encoding ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 6      // colour type: RGBA
  ihdr[10] = 0     // deflate
  ihdr[11] = 0     // adaptive filtering
  ihdr[12] = 0     // no interlace

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const src = y * width * 4
    const dst = y * (1 + width * 4)
    raw[dst] = 0
    rgba.copy(raw, dst + 1, src, src + width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── The mark ────────────────────────────────────────────────────────────────

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4)

  const put = (x, y, [r, g, b]) => {
    const i = (y * size + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) put(x, y, BG)
  }

  const rect = (fx, fy, fw, fh, colour) => {
    const x0 = Math.round(fx * size), x1 = Math.round((fx + fw) * size)
    const y0 = Math.round(fy * size), y1 = Math.round((fy + fh) * size)
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) put(x, y, colour)
    }
  }

  // Everything below lives inside the middle 72%, clear of the maskable crop.
  rect(0.28, 0.465, 0.44, 0.07, BAR)     // bar
  rect(0.215, 0.35, 0.055, 0.30, PLATE)  // inner plate, left
  rect(0.73,  0.35, 0.055, 0.30, PLATE)  // inner plate, right
  rect(0.15,  0.405, 0.045, 0.19, PLATE) // outer plate, left
  rect(0.805, 0.405, 0.045, 0.19, PLATE) // outer plate, right

  return encodePNG(size, size, px)
}

mkdirSync(OUT, { recursive: true })
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(OUT, name), drawIcon(size))
  console.log(`wrote public/${name} (${size}x${size})`)
}
