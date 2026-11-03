// Draws the app icon (blue-violet gradient, white suitcase) and writes the PNG
// sizes the web app and iPhone home screen need. No image libraries: shapes
// are rasterised here with 4x supersampling and encoded with zlib.
// Usage: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shapes in unit space (0..1)
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/** `scale` shrinks the suitcase toward the centre (maskable icons need a safe zone). */
function shade(x, y, scale) {
  // Background gradient, top-left #2E5BFF to bottom-right #6A3DF5
  const t = (x + y) / 2;
  let rgb = [0x2e + (0x6a - 0x2e) * t, 0x5b + (0x3d - 0x5b) * t, 0xff + (0xf5 - 0xff) * t];
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  const white = [255, 255, 255];
  // Handle: rounded ring above the body
  const handleOuter = inRoundRect(u, v, 0.38, 0.2, 0.62, 0.36, 0.06);
  const handleInner = inRoundRect(u, v, 0.43, 0.25, 0.57, 0.36, 0.03);
  if (handleOuter && !handleInner) rgb = white;
  // Body
  if (inRoundRect(u, v, 0.2, 0.32, 0.8, 0.78, 0.08)) {
    rgb = white;
    // Two straps in the gradient colour
    if ((u > 0.34 && u < 0.39) || (u > 0.61 && u < 0.66)) rgb = [0x4a, 0x4c, 0xfa];
  }
  // Wheels
  for (const wx of [0.31, 0.69]) if ((u - wx) ** 2 + (v - 0.82) ** 2 < 0.035 ** 2) rgb = white;
  return rgb;
}

function render(size, scale) {
  const SS = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, scale);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      const i = (py * size + px) * 4;
      out[i] = Math.round(acc[0] / (SS * SS));
      out[i + 1] = Math.round(acc[1] / (SS * SS));
      out[i + 2] = Math.round(acc[2] / (SS * SS));
      out[i + 3] = 255;
    }
  return png(size, out);
}

mkdirSync('public/icons', { recursive: true });
const files = [
  ['public/icons/apple-touch-icon.png', 180, 1],
  ['public/icons/icon-192.png', 192, 1],
  ['public/icons/icon-512.png', 512, 1],
  ['public/icons/icon-maskable-512.png', 512, 0.78],
  ['public/favicon.png', 48, 1],
  ['assets/icon.png', 1024, 1],
];
for (const [path, size, scale] of files) {
  writeFileSync(path, render(size, scale));
  console.log('wrote', path);
}
