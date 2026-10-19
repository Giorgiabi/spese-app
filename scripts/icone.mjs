// Genera le icone PNG dell'app (nessuna dipendenza: PNG scritto a mano con zlib).
// Uso: node scripts/icone.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BLU = [42, 120, 214];
const BIANCO = [255, 255, 255];
const ARANCIO = [235, 104, 52];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function blocco(tipo, dati) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dati.length);
  const td = Buffer.concat([Buffer.from(tipo), dati]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(dim, pixel) {
  const righe = Buffer.alloc((dim * 4 + 1) * dim);
  for (let y = 0; y < dim; y++) {
    righe[y * (dim * 4 + 1)] = 0;
    for (let x = 0; x < dim; x++) {
      const [r, g, b, a] = pixel(x / dim, y / dim);
      const i = y * (dim * 4 + 1) + 1 + x * 4;
      righe[i] = r; righe[i + 1] = g; righe[i + 2] = b; righe[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0); ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    blocco('IHDR', ihdr), blocco('IDAT', deflateSync(righe)), blocco('IEND', Buffer.alloc(0)),
  ]);
}

// Disegno: sfondo blu (arrotondato se non "maskable"), tre barre bianche crescenti e una arancione.
function disegno(maskable) {
  const s = maskable ? 0.62 : 0.78; // area utile (le icone maskable vengono ritagliate)
  const o = (1 - s) / 2;
  const barre = [[0.08, 0.45], [0.31, 0.62], [0.54, 0.82], [0.77, 0.32]];
  return (x, y) => {
    if (!maskable) {
      const r = 0.2, dx = Math.max(r - x, x - (1 - r), 0), dy = Math.max(r - y, y - (1 - r), 0);
      if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
    }
    const u = (x - o) / s, v = (y - o) / s;
    for (let i = 0; i < barre.length; i++) {
      const [x0, h] = barre[i];
      if (u >= x0 && u <= x0 + 0.17 && v <= 0.92 && v >= 0.92 - h) return [...(i === 3 ? ARANCIO : BIANCO), 255];
    }
    return [...BLU, 255];
  };
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icona-192.png', png(192, disegno(false)));
writeFileSync('public/icona-512.png', png(512, disegno(false)));
writeFileSync('public/icona-maskable-512.png', png(512, disegno(true)));
writeFileSync('public/apple-touch-icon.png', png(180, disegno(true)));
console.log('Icone create in public/');
