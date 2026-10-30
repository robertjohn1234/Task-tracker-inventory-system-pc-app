'use strict';
// The Electron side of inventory: pictures leave the data file and live as files in the photos folder.
// Electron is replaced by a stand-in so this runs in plain Node.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');

const handlers = {};
const stub = { ipcMain: { handle: (n, f) => { handlers[n] = f; } }, dialog: { showSaveDialog: async () => ({ canceled: true }) }, shell: {}, BrowserWindow: class {} };
const orig = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? stub : orig.call(this, req, ...a); };
const core = require('../src/main/inventory/inventory-core.js');
const { registerInventory } = require('../src/main/inventory/inventory.js');
Module._load = orig;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-files-'));
registerInventory(stub.ipcMain, { userDataDir: () => tmp, getWindow: () => null });
const B64 = Buffer.from('not really a jpeg but it will do '.repeat(20)).toString('base64');
const PHOTO = 'data:image/jpeg;base64,' + B64;
const photosDir = path.join(tmp, 'inventory', 'photos');
const dataFile = path.join(tmp, 'inventory', 'inventory.json');

test('a new tool picture becomes a file; the data file keeps only its name', async () => {
  const r = await handlers['inv-item-save']({}, { name: 'Drill', uom: 'pcs', category: core.TOOLS, photo: PHOTO, startQty: 3 });
  assert.equal(r.ok, true, r.error);
  const item = r.state ? undefined : undefined;
  const st = (await handlers['inv-load']({}, 'tools')).state;
  const tool = st.items.find(i => i.name === 'Drill');
  assert.match(tool.photo, /^ph-[0-9a-f]{20}\.jpg$/);
  assert.ok(fs.existsSync(path.join(photosDir, tool.photo)));
  assert.ok(!fs.readFileSync(dataFile, 'utf8').includes('data:image'));
  assert.match(st.photoBase, /^file:\/\/.*\/photos\/$/);
});

test('the same picture used twice is stored once', async () => {
  await handlers['inv-item-save']({}, { name: 'Drill 2', uom: 'pcs', category: core.TOOLS, photo: PHOTO });
  assert.equal(fs.readdirSync(photosDir).filter(f => f.startsWith('ph-')).length, 1);
});

test('damage photos become files too', async () => {
  const st = (await handlers['inv-load']({}, 'tools')).state;
  const drill = st.items.find(i => i.name === 'Drill');
  const r = await handlers['inv-repair-report']({}, { itemId: drill.id, kind: 'Damaged', qty: 1, photos: [PHOTO + 'AAAA'.slice(0, 0)] });
  assert.equal(r.ok, true, r.error);
  const rep = (await handlers['inv-load']({}, 'tools')).state.repairs[0];
  assert.match(rep.photos[0], /^ph-[0-9a-f]{20}\.jpg$/);
});

test('the screen can ask for the data of a saved picture, but only by a valid name', async () => {
  const name = fs.readdirSync(photosDir).find(f => f.startsWith('ph-'));
  const ok = await handlers['inv-photo-data']({}, [name, '../../etc/passwd', 'ph-zz.jpg']);
  assert.deepEqual(Object.keys(ok.photos), [name]);
  assert.ok(ok.photos[name].startsWith('data:image/jpeg;base64,'));
});

test('old data with pictures inside the file is moved out on the first start', async () => {
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-legacy-'));
  const d = core.emptyData();
  assert.equal(core.saveItem(d, { name: 'Old drill', uom: 'pcs', category: core.TOOLS, photo: PHOTO }, 't').ok, true);
  fs.mkdirSync(path.join(dir2, 'inventory'), { recursive: true });
  fs.writeFileSync(path.join(dir2, 'inventory', 'inventory.json'), JSON.stringify(d));
  const h2 = {}; const st2 = { handle: (n, f) => { h2[n] = f; } };
  Module._load = function (req, ...a) { return req === 'electron' ? stub : orig.call(this, req, ...a); };
  delete require.cache[require.resolve('../src/main/inventory/inventory.js')];
  const again = require('../src/main/inventory/inventory.js');
  Module._load = orig;
  again.registerInventory(st2, { userDataDir: () => dir2, getWindow: () => null });
  const s = (await h2['inv-load']({}, 'tools')).state;
  assert.match(s.items[0].photo, /^ph-[0-9a-f]{20}\.jpg$/);
  assert.ok(!fs.readFileSync(path.join(dir2, 'inventory', 'inventory.json'), 'utf8').includes('data:image'));
  assert.ok(fs.existsSync(path.join(dir2, 'inventory', 'backups')), 'the old file was backed up first');
});
