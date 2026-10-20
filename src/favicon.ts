/**
 * Brand favicon, generated at runtime so the repo carries no binary blobs.
 *
 * Two artefacts are served:
 *   /favicon.svg  — vector, preferred by every modern browser
 *   /favicon.ico  — real 32x32 PNG-in-ICO container, for browsers and crawlers
 *                   that probe the root path without reading the <link> tag
 *
 * The mark is the same one the consoles use: a dark rounded tile with an
 * ascending key-rotation trace.
 */

const TILE = "#0d1014";
const ACCENT = "#e8a33d";

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Key rotator">
  <rect width="32" height="32" rx="7" fill="${TILE}"/>
  <path d="M9 20l5-9 4 6 5-3" fill="none" stroke="${ACCENT}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* ---------- minimal PNG encoder (RGBA, no filtering) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function hex(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Distance from point p to segment ab, used to rasterise the stroke. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

const SIZE = 32;
const SS = 4; // supersampling factor for anti-aliased edges

function renderRgba(): Uint8Array {
  const [tr, tg, tb] = hex(TILE);
  const [ar, ag, ab] = hex(ACCENT);
  // Same polyline as the SVG, scaled from the 32-unit viewBox.
  const pts = [
    [9, 20],
    [14, 11],
    [18, 17],
    [23, 14],
  ];
  const radius = 1.3;
  const corner = 7;

  const px = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let tileHits = 0;
      let accentHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;

          // rounded rectangle coverage
          const qx = Math.max(corner - fx, fx - (SIZE - corner), 0);
          const qy = Math.max(corner - fy, fy - (SIZE - corner), 0);
          if (Math.hypot(qx, qy) <= corner) tileHits++;

          // stroke coverage
          let d = Infinity;
          for (let i = 0; i < pts.length - 1; i++) {
            d = Math.min(d, distToSegment(fx, fy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
          }
          if (d <= radius) accentHits++;
        }
      }
      const total = SS * SS;
      const alpha = tileHits / total;
      const accent = accentHits / total;
      const i = (y * SIZE + x) * 4;
      // composite accent over tile, then tile over transparency
      px[i] = Math.round((ar * accent + tr * (1 - accent)) * alpha);
      px[i + 1] = Math.round((ag * accent + tg * (1 - accent)) * alpha);
      px[i + 2] = Math.round((ab * accent + tb * (1 - accent)) * alpha);
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

/** Returns a valid .ico file whose single image is an embedded PNG. */
export function buildFaviconIco(deflate: (data: Uint8Array) => Uint8Array): Uint8Array {
  const rgba = renderRgba();

  // raw scanlines: one filter byte (0) per row
  const raw = new Uint8Array(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), y * (SIZE * 4 + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, SIZE);
  dv.setUint32(4, SIZE);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // compression, filter, interlace all 0

  const idat = deflate(raw);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const pngLen = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(pngLen);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }

  // ICONDIR (6) + ICONDIRENTRY (16) + PNG payload
  const ico = new Uint8Array(22 + png.length);
  const iv = new DataView(ico.buffer);
  iv.setUint16(0, 0); // reserved
  iv.setUint16(2, 1); // type: icon
  iv.setUint16(4, 1); // image count
  ico[6] = SIZE; // width (32)
  ico[7] = SIZE; // height (32)
  ico[8] = 0; // palette colours
  ico[9] = 0; // reserved
  iv.setUint16(10, 1); // colour planes
  iv.setUint16(12, 32); // bits per pixel
  iv.setUint32(14, png.length); // payload size
  iv.setUint32(18, 22); // payload offset
  ico.set(png, 22);
  return ico;
}