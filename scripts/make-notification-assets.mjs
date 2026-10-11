/* global Buffer */
/**
 * Generates branded notification assets (reproducible — re-run anytime):
 * - assets/notification-icon.png: white play-mark silhouette (transparent),
 *   the only style Android renders for small notification icons.
 * - assets/notification_sound.wav: short two-tone chime (44.1kHz 16-bit
 *   mono, ~1s), valid for Android res/raw and iOS notification sounds.
 *
 * Usage: node scripts/make-notification-assets.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

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

/** White RGBA icon rendered 2x then box-downsampled for smooth edges. */
function renderIcon(size = 192) {
  const scale = 2;
  const big = size * scale;
  const mask = new Uint8Array(big * big);
  const center = big / 2;
  const ringR = big * 0.39;
  const stroke = big * 0.115;
  // Play triangle (pointing right), centered in the ring.
  const tri = [
    [big * 0.39, big * 0.29],
    [big * 0.39, big * 0.71],
    [big * 0.71, big * 0.5],
  ];
  const sign = (p, a, b) => (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const inTriangle = (x, y) => {
    const d1 = sign([x, y], tri[0], tri[1]);
    const d2 = sign([x, y], tri[1], tri[2]);
    const d3 = sign([x, y], tri[2], tri[0]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const dist = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      if (Math.abs(dist - ringR) <= stroke / 2 || inTriangle(x + 0.5, y + 0.5)) {
        mask[y * big + x] = 1;
      }
    }
  }
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          coverage += mask[(y * scale + dy) * big + x * scale + dx];
        }
      }
      const alpha = Math.round((coverage / (scale * scale)) * 255);
      const o = (y * size + x) * 4;
      rgba[o] = 255; rgba[o + 1] = 255; rgba[o + 2] = 255; rgba[o + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const scanlines = [];
  for (let y = 0; y < size; y += 1) {
    scanlines.push(Buffer.from([0]));
    scanlines.push(rgba.subarray(y * size * 4, (y + 1) * size * 4));
  }
  const idat = deflateSync(Buffer.concat(scanlines));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Gentle major-chime: E5 → A5 with soft decay. */
function renderChime() {
  const rate = 44100;
  const notes = [
    { freq: 659.25, start: 0, end: 0.42 },
    { freq: 880.0, start: 0.28, end: 1.0 },
  ];
  const seconds = 1.1;
  const total = Math.floor(rate * seconds);
  const pcm = new Int16Array(total);
  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    let value = 0;
    for (const note of notes) {
      if (t < note.start || t > note.end) continue;
      const local = t - note.start;
      const attack = Math.min(1, local / 0.008);
      const decay = Math.exp(-local / 0.28);
      value += Math.sin(2 * Math.PI * note.freq * local) * attack * decay;
    }
    const edge = Math.min(1, (seconds - t) / 0.05);
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(value * 0.32 * edge * 32767)));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
  header.writeUInt32LE(pcm.length * 2, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer)]);
}

const icon = renderIcon();
writeFileSync('assets/notification-icon.png', icon);
const sound = renderChime();
writeFileSync('assets/notification_sound.wav', sound);
console.log(`Wrote assets/notification-icon.png (${icon.length} bytes)`);
console.log(`Wrote assets/notification_sound.wav (${sound.length} bytes)`);
