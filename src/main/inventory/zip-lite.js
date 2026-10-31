'use strict';
// A tiny zip writer / reader with no extra packages (used for "Back up everything").
// Writes: STORE (pictures are already compressed) or DEFLATE (text). Reads the same two. No zip64: files under 4 GB, under 65,000 entries.
const fs = require('fs');
const zlib = require('zlib');

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function dosTime(d) { return { time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF }; }

// entries: [{ name, data: Buffer }] or [{ name, file: '/path' }]. Reads one file at a time, so a big photo folder does not fill the memory.
function createZip(outPath, entries) {
  const fd = fs.openSync(outPath, 'w');
  const central = [];
  let offset = 0;
  const write = (buf) => { fs.writeSync(fd, buf, 0, buf.length); offset += buf.length; };
  const { time, date } = dosTime(new Date());
  try {
    for (const e of entries) {
      const raw = e.data || fs.readFileSync(e.file);
      const deflate = /\.(json|txt|csv)$/i.test(e.name);
      const body = deflate ? zlib.deflateRawSync(raw) : raw;
      const useDeflate = deflate && body.length < raw.length;
      const data = useDeflate ? body : raw;
      const nameBuf = Buffer.from(e.name, 'utf8');
      const crc = crc32(raw);
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(useDeflate ? 8 : 0, 8);
      h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22);
      h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
      const at = offset;
      write(h); write(nameBuf); write(data);
      central.push({ nameBuf, crc, csize: data.length, usize: raw.length, method: useDeflate ? 8 : 0, at, time, date });
    }
    const cdStart = offset;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(c.method, 10);
      h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.usize, 24);
      h.writeUInt16LE(c.nameBuf.length, 28); h.writeUInt32LE(c.at, 42);
      write(h); write(c.nameBuf);
    }
    const cdSize = offset - cdStart;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(cdStart, 16);
    write(end);
  } finally { fs.closeSync(fd); }
  return { bytes: offset, files: central.length };
}

// Returns { names: [...], size(name), read(name) -> Buffer, close() }. Throws a readable error for anything that is not a zip made like ours.
function openZip(path) {
  const fd = fs.openSync(path, 'r');
  const close = () => { try { fs.closeSync(fd); } catch (e) {} };
  try {
    const total = fs.fstatSync(fd).size;
    if (total < 22) throw new Error('This is not a backup file.');
    const tailLen = Math.min(total, 66000);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, total - tailLen);
    let p = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { p = i; break; }
    if (p < 0) throw new Error('This is not a backup file.');
    const count = tail.readUInt16LE(p + 10), cdSize = tail.readUInt32LE(p + 12), cdStart = tail.readUInt32LE(p + 16);
    if (cdStart + cdSize > total || cdSize > 64 * 1024 * 1024) throw new Error('This backup file is damaged.');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdStart);
    const map = new Map();
    let o = 0;
    for (let n = 0; n < count; n++) {
      if (o + 46 > cd.length || cd.readUInt32LE(o) !== 0x02014b50) throw new Error('This backup file is damaged.');
      const method = cd.readUInt16LE(o + 10), crc = cd.readUInt32LE(o + 16), csize = cd.readUInt32LE(o + 20), usize = cd.readUInt32LE(o + 24);
      const nl = cd.readUInt16LE(o + 28), el = cd.readUInt16LE(o + 30), cl = cd.readUInt16LE(o + 32), at = cd.readUInt32LE(o + 42);
      const name = cd.toString('utf8', o + 46, o + 46 + nl);
      map.set(name, { method, crc, csize, usize, at });
      o += 46 + nl + el + cl;
    }
    const read = (name, maxBytes) => {
      const e = map.get(name);
      if (!e) throw new Error('Missing in the backup: ' + name);
      if (maxBytes && e.usize > maxBytes) throw new Error('A file in the backup is too big: ' + name);
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, e.at);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('This backup file is damaged.');
      const start = e.at + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (start + e.csize > total) throw new Error('This backup file is damaged.');
      const raw = Buffer.alloc(e.csize);
      fs.readSync(fd, raw, 0, e.csize, start);
      const out = e.method === 8 ? zlib.inflateRawSync(raw) : e.method === 0 ? raw : null;
      if (!out) throw new Error('This backup uses a compression this app cannot read.');
      if (out.length !== e.usize || crc32(out) !== e.crc) throw new Error('A file in the backup is damaged: ' + name);
      return out;
    };
    return { names: [...map.keys()], size: (n) => (map.get(n) ? map.get(n).usize : 0), read, close };
  } catch (e) { close(); throw e; }
}

module.exports = { createZip, openZip, crc32 };
