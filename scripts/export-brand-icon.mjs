// Exports the SmartTrip icon (same drawing as scripts/gen-icons.mjs) for use
// elsewhere: square (full bleed, like the app icon files) and rounded (corners
// transparent, like it looks on a phone), as PNG in several sizes and as SVG.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Usage: node scripts/export-brand-icon.mjs   (writes to brand/)
const OUT = process.argv[2] ?? "brand";
mkdirSync(OUT, { recursive: true });

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
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// Same shapes and colours as scripts/gen-icons.mjs
function shade(x, y) {
  const t = (x + y) / 2;
  let rgb = [0x2e + (0x6a - 0x2e) * t, 0x5b + (0x3d - 0x5b) * t, 0xff + (0xf5 - 0xff) * t];
  const white = [255, 255, 255];
  if (inRoundRect(x, y, 0.38, 0.2, 0.62, 0.36, 0.06) && !inRoundRect(x, y, 0.43, 0.25, 0.57, 0.36, 0.03)) rgb = white;
  if (inRoundRect(x, y, 0.2, 0.32, 0.8, 0.78, 0.08)) {
    rgb = white;
    if ((x > 0.34 && x < 0.39) || (x > 0.61 && x < 0.66)) rgb = [0x4a, 0x4c, 0xfa];
  }
  for (const wx of [0.31, 0.69]) if ((x - wx) ** 2 + (y - 0.82) ** 2 < 0.035 ** 2) rgb = white;
  return rgb;
}

const CORNER = 0.2237; // the rounding of an iPhone app icon

function render(size, rounded) {
  const SS = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      let cover = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (rounded && !inRoundRect(x, y, 0, 0, 1, 1, CORNER)) continue;
          const c = shade(x, y);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
          cover++;
        }
      const i = (py * size + px) * 4;
      if (cover) {
        out[i] = Math.round(acc[0] / cover);
        out[i + 1] = Math.round(acc[1] / cover);
        out[i + 2] = Math.round(acc[2] / cover);
      }
      out[i + 3] = Math.round((cover / (SS * SS)) * 255);
    }
  return png(size, out);
}

for (const size of [1024, 512, 256, 128, 64, 32]) {
  writeFileSync(`${OUT}/smarttrip-icon-${size}.png`, render(size, false));
  writeFileSync(`${OUT}/smarttrip-icon-rounded-${size}.png`, render(size, true));
}

// Vector versions (1024 units; scale freely)
const S = 1024;
const n = (v) => +(v * S).toFixed(2);
const rr = (x0, y0, x1, y1, r) => `M${n(x0 + r)} ${n(y0)}H${n(x1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y0 + r)}V${n(y1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1 - r)} ${n(y1)}H${n(x0 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0)} ${n(y1 - r)}V${n(y0 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0 + r)} ${n(y0)}Z`;
function svg(rounded) {
  const bg = rounded ? `<rect width="${S}" height="${S}" rx="${n(CORNER)}" fill="url(#bg)"/>` : `<rect width="${S}" height="${S}" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <title>SmartTrip</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2E5BFF"/>
      <stop offset="1" stop-color="#6A3DF5"/>
    </linearGradient>
  </defs>
  ${bg}
  <path fill="#FFFFFF" fill-rule="evenodd" d="${rr(0.38, 0.2, 0.62, 0.36, 0.06)}${rr(0.43, 0.25, 0.57, 0.36, 0.03)}"/>
  <path fill="#FFFFFF" d="${rr(0.2, 0.32, 0.8, 0.78, 0.08)}"/>
  <rect x="${n(0.34)}" y="${n(0.32)}" width="${n(0.05)}" height="${n(0.46)}" fill="#4A4CFA"/>
  <rect x="${n(0.61)}" y="${n(0.32)}" width="${n(0.05)}" height="${n(0.46)}" fill="#4A4CFA"/>
  <circle cx="${n(0.31)}" cy="${n(0.82)}" r="${n(0.035)}" fill="#FFFFFF"/>
  <circle cx="${n(0.69)}" cy="${n(0.82)}" r="${n(0.035)}" fill="#FFFFFF"/>
</svg>
`;
}
writeFileSync(`${OUT}/smarttrip-icon.svg`, svg(false));
writeFileSync(`${OUT}/smarttrip-icon-rounded.svg`, svg(true));
console.log('done');
