'use strict';
// The small zip reader/writer used by "Back up everything". Plain Node, no packages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const { createZip, openZip, crc32 } = require('../src/main/inventory/zip-lite.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ziplite-'));

test('crc32 of "123456789" is the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('round trip: text is deflated, binary stored, names with spaces and accents survive', () => {
  const big = Buffer.alloc(20000, 7);
  fs.writeFileSync(path.join(tmp, 'pic.bin'), big);
  const p = path.join(tmp, 'a.zip');
  const r = createZip(p, [
    { name: 'manifest.json', data: Buffer.from('{"a":1}') },
    { name: 'photos/ph-1.png', file: path.join(tmp, 'pic.bin') },
    { name: 'notes/café é.txt', data: Buffer.from('hello hello hello hello') }
  ]);
  assert.equal(r.files, 3);
  const z = openZip(p);
  assert.deepEqual(z.names.sort(), ['manifest.json', 'notes/café é.txt', 'photos/ph-1.png']);
  assert.equal(z.read('manifest.json', 1000).toString(), '{"a":1}');
  assert.ok(z.read('photos/ph-1.png', 1e6).equals(big));
  z.close();
});

test('refuses non-zip files, truncated files and flipped bytes', () => {
  const junk = path.join(tmp, 'junk.zip'); fs.writeFileSync(junk, 'hello world, not a zip');
  assert.throws(() => openZip(junk), /not a backup/i);
  const p = path.join(tmp, 'b.zip');
  createZip(p, [{ name: 'x.json', data: Buffer.from(JSON.stringify({ k: 'v'.repeat(500) })) }]);
  const buf = fs.readFileSync(p);
  fs.writeFileSync(path.join(tmp, 'cut.zip'), buf.subarray(0, buf.length - 30));
  assert.throws(() => openZip(path.join(tmp, 'cut.zip')));
  const bad = Buffer.from(buf); bad[40] ^= 0xFF; // inside the compressed data
  fs.writeFileSync(path.join(tmp, 'flip.zip'), bad);
  assert.throws(() => openZip(path.join(tmp, 'flip.zip')).read('x.json', 1e6));
});

test('read() stops at the size limit (a zip bomb cannot fill the memory)', () => {
  const p = path.join(tmp, 'c.zip');
  createZip(p, [{ name: 'big.json', data: Buffer.alloc(200000, 97) }]);
  const z = openZip(p);
  assert.throws(() => z.read('big.json', 1000), /too big|too large|damaged|limit/i);
  z.close();
});
