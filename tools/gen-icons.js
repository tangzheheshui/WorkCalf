// 生成占位图标（棕色小牛脸）：icon.ico / icon.png / 各尺寸 png
// 用法: node tools/gen-icons.js   （在仓库根目录执行）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngEncode(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 简易光栅化 ----------
function makeCanvas(size) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b, a]) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // alpha 混合
    const sa = a / 255, da = buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    buf[i] = (r * sa + buf[i] * da * (1 - sa)) / oa;
    buf[i + 1] = (g * sa + buf[i + 1] * da * (1 - sa)) / oa;
    buf[i + 2] = (b * sa + buf[i + 2] * da * (1 - sa)) / oa;
    buf[i + 3] = oa * 255;
  };
  const ell = (cx, cy, rx, ry, color, rot = 0) => {
    const cs = Math.cos(-rot), sn = Math.sin(-rot);
    const x0 = Math.floor(cx - Math.max(rx, ry) - 2), x1 = Math.ceil(cx + Math.max(rx, ry) + 2);
    const y0 = Math.floor(cy - Math.max(rx, ry) - 2), y1 = Math.ceil(cy + Math.max(rx, ry) + 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const ux = dx * cs - dy * sn, uy = dx * sn + dy * cs;
      if ((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry) <= 1) set(x, y, color);
    }
  };
  return { buf, set, ell };
}

// ---------- 小牛脸 ----------
function drawCow(S) {
  const u = S / 256;
  const c = makeCanvas(S);
  const BROWN = [156, 107, 74, 255];
  const BROWN_D = [130, 86, 58, 255];
  const HORN = [233, 220, 192, 255];
  const MUZZLE = [217, 166, 121, 255];
  const DARK = [43, 26, 16, 255];
  const WHITE = [255, 252, 246, 255];
  // 耳朵（在头后面）
  c.ell(24 * u, 130 * u, 30 * u, 20 * u, BROWN_D, -0.4);
  c.ell(232 * u, 130 * u, 30 * u, 20 * u, BROWN_D, 0.4);
  // 牛角
  c.ell(62 * u, 46 * u, 16 * u, 26 * u, HORN, -0.35);
  c.ell(194 * u, 46 * u, 16 * u, 26 * u, HORN, 0.35);
  // 头
  c.ell(128 * u, 138 * u, 100 * u, 92 * u, BROWN);
  // 刘海斑纹
  c.ell(128 * u, 62 * u, 46 * u, 26 * u, BROWN_D);
  // 口鼻
  c.ell(128 * u, 182 * u, 58 * u, 38 * u, MUZZLE);
  c.ell(108 * u, 180 * u, 7 * u, 9 * u, DARK);
  c.ell(148 * u, 180 * u, 7 * u, 9 * u, DARK);
  // 眼睛
  c.ell(88 * u, 118 * u, 11 * u, 12 * u, DARK);
  c.ell(168 * u, 118 * u, 11 * u, 12 * u, DARK);
  c.ell(92 * u, 114 * u, 4 * u, 4 * u, WHITE);
  c.ell(172 * u, 114 * u, 4 * u, 4 * u, WHITE);
  return c.buf;
}

// ---------- 输出 ----------
const outDir = path.join(__dirname, '..', 'src-tauri', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const png256 = (() => { const b = drawCow(256); return pngEncode(256, 256, b); })();
fs.writeFileSync(path.join(outDir, 'icon.png'), png256);
fs.writeFileSync(path.join(outDir, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(outDir, '128x128.png'), pngEncode(128, 128, drawCow(128)));
fs.writeFileSync(path.join(outDir, '32x32.png'), pngEncode(32, 32, drawCow(32)));

// ICO：单条 256x256 PNG 条目
const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0); // reserved
iconDir.writeUInt16LE(1, 2); // type icon
iconDir.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0;          // 256 -> 0
entry[2] = 0; entry[3] = 0;
entry[4] = 0; entry[5] = 0;          // palette
entry.writeUInt16LE(1, 6);           // planes
entry.writeUInt16LE(32, 8);          // bpp
entry.writeUInt32LE(png256.length, 8); // data size
entry.writeUInt32LE(22, 12);         // data offset
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([iconDir, entry, png256]));
console.log('icons written to', outDir);
