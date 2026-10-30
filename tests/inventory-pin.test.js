'use strict';
// The PIN file hand-over: tools/make-pin.js makes the file, the app picks it up once on its first start.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const { spawnSync } = require('child_process');

const handlers = {};
const stub = { ipcMain: { handle: (n, f) => { handlers[n] = f; } }, dialog: {}, shell: {}, BrowserWindow: class {} };
const orig = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? stub : orig.call(this, req, ...a); };
const core = require('../src/main/inventory/inventory-core.js');
const { registerInventory } = require('../src/main/inventory/inventory.js');
Module._load = orig;

const MAKE = path.join(__dirname, '..', 'tools', 'make-pin.js');
const user = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-user-'));
const app = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-app-'));

test('make-pin.js refuses a bad PIN and makes a file for a good one', () => {
  assert.notEqual(spawnSync(process.execPath, [MAKE, '12'], { encoding: 'utf8' }).status, 0);
  assert.notEqual(spawnSync(process.execPath, [MAKE, 'abcd'], { encoding: 'utf8' }).status, 0);
  const r = spawnSync(process.execPath, [MAKE, '4321', '--out', app], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const f = JSON.parse(fs.readFileSync(path.join(app, 'admin-pin.json'), 'utf8'));
  assert.match(f.salt, /^[0-9a-f]{32}$/); assert.match(f.hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(f).includes('4321'));
});

test('the app picks the file up once, then asks for that PIN', async () => {
  registerInventory(stub.ipcMain, { userDataDir: () => user, getWindow: () => null, seedDirs: () => [app] });
  const st = (await handlers['inv-load']({}, 'tools')).state;
  assert.equal(st.pinSet, true, 'PIN is set from the file');
  assert.ok(!fs.existsSync(path.join(app, 'admin-pin.json')), 'file removed from the app folder');
  const item = (await handlers['inv-item-save']({}, { name: 'Drill', uom: 'pcs', category: core.TOOLS, startQty: 3, photo: 'ph-0123456789abcdef0123.jpg' }));
  assert.equal(item.ok, true, item.error);
  const id = (await handlers['inv-load']({}, 'tools')).state.items[0].id;
  const out = (pin) => handlers['inv-move-save']({}, { itemId: id, dir: 'out', qty: 1, reason: 'Lost', remarks: 'Missing after move', approvedBy: 'Boss', pin });
  assert.equal((await out('1111')).code, 'PIN_WRONG');
  assert.equal((await out('4321')).ok, true);
});

const reg = () => registerInventory(stub.ipcMain, { userDataDir: () => user, getWindow: () => null, seedDirs: () => [app] });
const itemId = async () => (await handlers['inv-load']({}, 'tools')).state.items[0].id;
const removal = async (pin) => handlers['inv-move-save']({}, { itemId: await itemId(), dir: 'out', qty: 1, reason: 'Lost', remarks: 'Missing after move', approvedBy: 'Boss', pin });

test('a second PIN file never replaces a PIN that is set', async () => {
  spawnSync(process.execPath, [MAKE, '9999', '--out', app]);
  reg();
  assert.equal((await handlers['inv-load']({}, 'tools')).state.pinSet, true);
  assert.equal((await handlers['inv-pin-set']({}, '9999', '5555')).code, 'PIN_WRONG', 'the file did not become the PIN');
  fs.unlinkSync(path.join(app, 'admin-pin.json'));
});

test('second protection: deleting admin-pin.json locks removals; the user cannot set a new PIN', async () => {
  assert.ok(fs.existsSync(path.join(user, 'inventory', 'admin-pin.required')), 'marker inside the inventory folder');
  assert.ok(fs.existsSync(path.join(user, 'wh-pin.flag')), 'marker outside the inventory folder');
  fs.unlinkSync(path.join(user, 'inventory', 'admin-pin.json'));
  fs.unlinkSync(path.join(user, 'inventory', 'admin-pin.required'));   // even with one marker gone, the other keeps the lock
  reg();
  const st = (await handlers['inv-load']({}, 'tools')).state;
  assert.equal(st.pinSet, false); assert.equal(st.pinMissing, true);
  assert.equal((await removal('')).code, 'PIN_MISSING');
  assert.equal((await removal('4321')).code, 'PIN_MISSING');
  assert.equal((await handlers['inv-pin-set']({}, '', '1111')).code, 'PIN_MISSING', 'cannot set a new PIN from inside the app');
  const other = await handlers['inv-move-save']({}, { itemId: await itemId(), dir: 'in', qty: 1, reason: 'Purchase / delivery' });
  assert.equal(other.ok, true, 'adding units still works');
  assert.match(fs.readFileSync(path.join(user, 'inventory', 'audit.log'), 'utf8'), /PIN file is missing/);
});

test('the boss restores access with a new PIN file', async () => {
  spawnSync(process.execPath, [MAKE, '2468', '--out', app]);
  reg();
  const st = (await handlers['inv-load']({}, 'tools')).state;
  assert.equal(st.pinSet, true); assert.equal(st.pinMissing, false);
  assert.equal((await removal('4321')).code, 'PIN_WRONG', 'the old PIN no longer works');
  assert.equal((await removal('2468')).ok, true);
  assert.ok(fs.existsSync(path.join(user, 'inventory', 'admin-pin.required')), 'markers written again');
});

test('a PC that already had a PIN before this protection gets the markers on its next start', async () => {
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-old-'));
  fs.mkdirSync(path.join(old, 'inventory'), { recursive: true });
  fs.copyFileSync(path.join(user, 'inventory', 'admin-pin.json'), path.join(old, 'inventory', 'admin-pin.json'));
  registerInventory(stub.ipcMain, { userDataDir: () => old, getWindow: () => null, seedDirs: () => [] });
  await handlers['inv-load']({}, 'tools');
  assert.ok(fs.existsSync(path.join(old, 'wh-pin.flag')));
});

test('make-pin.js works without --out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-mp-'));
  const r = spawnSync(process.execPath, [MAKE, '54321'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'admin-pin.json')));
});
