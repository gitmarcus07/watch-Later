/* global Buffer */
/**
 * Traces assets/icon.png into a white notification silhouette:
 * opaque logo pixels become white, everything else transparent, cropped to
 * the mark with padding and downsampled to 192px with smoothed edges.
 *
 * Usage: node scripts/make-notification-icon-from-logo.mjs [--preview-only]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function decodePng(path) {
  const b = readFileSync(path);
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const colorType = b[25];
  let pos = 8;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    if (b.toString('ascii', pos + 4, pos + 8) === 'IDAT') idat.push(b.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const stride = width * channels + 1;
  const pixels = new Uint8Array(width * height * 4);
  // PNG filters: handle None/Sub/Up/Average/Paeth so decoded bytes are exact.
  let prev = new Uint8Array(width * channels);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * stride];
    const row = raw.subarray(y * stride + 1, (y + 1) * stride);
    const out = new Uint8Array(width * channels);
    for (let x = 0; x < width * channels; x += 1) {
      const a = x >= channels ? out[x - channels] : 0;
      const bb = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let value = row[x];
      if (filter === 1) value = (value + a) & 0xff;
      else if (filter === 2) value = (value + bb) & 0xff;
      else if (filter === 3) value = (value + ((a + bb) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + bb - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - bb);
        const pc = Math.abs(p - c);
        value = (value + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 0xff;
      }
      out[x] = value;
    }
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (channels === 4) { pixels[o] = out[x * 4]; pixels[o + 1] = out[x * 4 + 1]; pixels[o + 2] = out[x * 4 + 2]; pixels[o + 3] = out[x * 4 + 3]; }
      else if (channels === 3) { pixels[o] = out[x * 3]; pixels[o + 1] = out[x * 3 + 1]; pixels[o + 2] = out[x * 3 + 2]; pixels[o + 3] = 255; }
      else if (channels === 2) { pixels[o] = pixels[o + 1] = pixels[o + 2] = out[x * 2]; pixels[o + 3] = out[x * 2 + 1]; }
      else { pixels[o] = pixels[o + 1] = pixels[o + 2] = out[x]; pixels[o + 3] = 255; }
    }
    prev = out;
  }
  return { width, height, pixels };
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const parts = [];
  for (let y = 0; y < size; y += 1) {
    parts.push(Buffer.from([0]));
    parts.push(Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(parts))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const { width, height, pixels } = decodePng('assets/icon.png');
// Measured: backdrop peaks at luminance 11, mascot body starts well above.
// Threshold 24 separates the mark from the backdrop with wide margin.
const TRACE_THRESHOLD = 24;
const mask = new Uint8Array(width * height);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const o = (y * width + x) * 4;
    mask[y * width + x] = (0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]) >= TRACE_THRESHOLD ? 1 : 0;
  }
}
// Keep the largest connected component (the mascot), dropping glow specks.
const seen = new Int32Array(width * height).fill(-1);
let best = [];
{
  let bestSize = 0;
  const stack = [];
  for (let s = 0; s < width * height; s += 1) {
    if (!mask[s] || seen[s] !== -1) continue;
    const id = s;
    let size = 0;
    stack.length = 0;
    stack.push(s);
    seen[s] = id;
    while (stack.length) {
      const cur = stack.pop();
      size += 1;
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      if (cx > 0 && mask[cur - 1] && seen[cur - 1] === -1) { seen[cur - 1] = id; stack.push(cur - 1); }
      if (cx < width - 1 && mask[cur + 1] && seen[cur + 1] === -1) { seen[cur + 1] = id; stack.push(cur + 1); }
      if (cy > 0 && mask[cur - width] && seen[cur - width] === -1) { seen[cur - width] = id; stack.push(cur - width); }
      if (cy < height - 1 && mask[cur + width] && seen[cur + width] === -1) { seen[cur + width] = id; stack.push(cur + width); }
    }
    if (size > bestSize) { bestSize = size; best = [id]; }
  }
  const keep = best[0];
  for (let i = 0; i < width * height; i += 1) mask[i] = seen[i] === keep ? 1 : 0;
  console.log(`largest component ${bestSize} px (${(100 * bestSize / (width * height)).toFixed(1)}%)`);
}
// Bounding box of the mark.
let minX = width; let maxX = -1; let minY = height; let maxY = -1;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
if (maxX < 0) throw new Error('No logo pixels found — cannot trace.');
// 1px dilation keeps thin gaps (face, clapper stripes) connected at 24dp.
const dilated = new Uint8Array(width * height);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx; const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) { hit = true; break; }
      }
    }
    dilated[y * width + x] = hit ? 1 : 0;
  }
}
// Fit the mark into the padded area, box-downsample for smooth edges.
const size = 192;
const pad = Math.round(size * 0.14);
const boxW = maxX - minX + 1; const boxH = maxY - minY + 1;
const div = 4;
const big = size * div;
const inset = Math.round((pad / size) * big);
const inner = big - inset * 2;
const longSide = Math.max(boxW, boxH);
const ox = minX - (longSide - boxW) / 2;
const oy = minY - (longSide - boxH) / 2;
const bigMask = new Uint8Array(big * big);
for (let y = 0; y < big; y += 1) {
  for (let x = 0; x < big; x += 1) {
    if (x < inset || y < inset || x >= big - inset || y >= big - inset) continue;
    const px = Math.floor(ox + ((x - inset) / inner) * longSide);
    const py = Math.floor(oy + ((y - inset) / inner) * longSide);
    bigMask[y * big + x] = (px >= 0 && py >= 0 && px < width && py < height && dilated[py * width + px]) ? 1 : 0;
  }
}
const rgba = Buffer.alloc(size * size * 4);
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    let coverage = 0;
    for (let dy = 0; dy < div; dy += 1) {
      for (let dx = 0; dx < div; dx += 1) {
        coverage += bigMask[(y * div + dy) * big + x * div + dx];
      }
    }
    const o = (y * size + x) * 4;
    rgba[o] = 255; rgba[o + 1] = 255; rgba[o + 2] = 255;
    rgba[o + 3] = Math.round((coverage / (div * div)) * 255);
  }
}

let art = '';
let opaque = 0;
const cells = 32;
// Final cleanup: keep only the largest alpha component so thin bridges that
// broke during downsampling don't leave floating specks at 24dp.
{
  const solid = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i += 1) solid[i] = rgba[i * 4 + 3] > 127 ? 1 : 0;
  const seen = new Int32Array(size * size).fill(-1);
  let keepId = -1;
  let bestSize = 0;
  const stack = [];
  for (let s = 0; s < size * size; s += 1) {
    if (!solid[s] || seen[s] !== -1) continue;
    let sz = 0;
    stack.length = 0;
    stack.push(s);
    seen[s] = s;
    while (stack.length) {
      const cur = stack.pop();
      sz += 1;
      const cx = cur % size;
      const cy = Math.floor(cur / size);
      const neighbors = [];
      if (cx > 0) neighbors.push(cur - 1);
      if (cx < size - 1) neighbors.push(cur + 1);
      if (cy > 0) neighbors.push(cur - size);
      if (cy < size - 1) neighbors.push(cur + size);
      for (const nb of neighbors) {
        if (solid[nb] && seen[nb] === -1) { seen[nb] = s; stack.push(nb); }
      }
    }
    if (sz > bestSize) { bestSize = sz; keepId = s; }
  }
  for (let i = 0; i < size * size; i += 1) {
    if (solid[i] && seen[i] !== keepId) rgba[i * 4 + 3] = 0;
  }
}
for (let y = 0; y < cells; y += 1) {
  let row = '';
  for (let x = 0; x < cells; x += 1) {
    const px = Math.floor((x / cells) * size);
    const py = Math.floor((y / cells) * size);
    const solid = rgba[(py * size + px) * 4 + 3] > 127;
    if (solid) opaque += 1;
    row += solid ? '#' : '.';
  }
  art += `${row}\n`;
}
console.log(`silhouette opaque ${(100 * opaque / (cells * cells)).toFixed(1)}%`);
console.log(art);

if (!process.argv.includes('--preview-only')) {
  writeFileSync('assets/notification-icon.png', encodePng(size, rgba));
  console.log('Wrote assets/notification-icon.png');
}
