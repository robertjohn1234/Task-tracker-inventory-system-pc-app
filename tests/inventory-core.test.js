'use strict';
// Run with:  npm test      (uses Node's built-in test runner, nothing to install)
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/main/inventory/inventory-core.js');

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
const TOOL = core.TOOLS;

function fresh() { return core.emptyData(); }
function addConsumable(d, name = 'Gloves', qty = 10) {
  const r = core.saveItem(d, { name, uom: 'pcs', category: 'Consumables', startQty: qty }, 'tester');
  assert.equal(r.ok, true, r.error);
  return r.item;
}
function addTool(d, name = 'Drill', qty = 5) {
  const r = core.saveItem(d, { name, uom: 'pcs', category: TOOL, startQty: qty, photo: PHOTO }, 'tester');
  assert.equal(r.ok, true, r.error);
  return r.item;
}
const avail = (d, it) => core.balanceOf(d, it.id) - core.onLoanOf(d, it.id) - core.inRepairOf(d, it.id);

test('consumables: stock in / out keeps a running balance', () => {
  const d = fresh(), it = addConsumable(d, 'Gloves', 10);
  assert.equal(core.balanceOf(d, it.id), 10);
  assert.equal(core.addMovement(d, { itemId: it.id, dir: 'out', qty: 4, reason: 'Issued' }, 't').ok, true);
  assert.equal(core.balanceOf(d, it.id), 6);
  assert.equal(core.addMovement(d, { itemId: it.id, dir: 'in', qty: 2, reason: 'Delivery' }, 't').ok, true);
  assert.equal(core.balanceOf(d, it.id), 8);
});

test('consumables: cannot take out more than is in stock', () => {
  const d = fresh(), it = addConsumable(d, 'Gloves', 3);
  const r = core.addMovement(d, { itemId: it.id, dir: 'out', qty: 5, reason: 'Issued' }, 't');
  assert.equal(r.ok, false);
  assert.equal(core.balanceOf(d, it.id), 3);
});

test('tools: a NEW tool must have a picture', () => {
  const d = fresh();
  const r = core.saveItem(d, { name: 'Drill', uom: 'pcs', category: TOOL, startQty: 1 }, 't');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PHOTO');
  assert.equal(d.items.length, 0);
});

test('tools: an invalid picture is refused, a valid one is kept', () => {
  const d = fresh();
  assert.equal(core.saveItem(d, { name: 'Drill', uom: 'pcs', category: TOOL, photo: 'http://x/y.png' }, 't').ok, false);
  const it = addTool(d);
  assert.equal(it.photo, PHOTO);
});

test('tools: editing keeps the old picture when none is sent', () => {
  const d = fresh(), it = addTool(d);
  const r = core.saveItem(d, { id: it.id, name: 'Drill 18V', uom: 'pcs', category: TOOL }, 't');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.item.photo, PHOTO);
  assert.equal(r.item.name, 'Drill 18V');
});

test('tools: a legacy tool saved before pictures existed can still be edited without one', () => {
  const d = fresh(), it = addTool(d);
  it.photo = '';                                    // pretend it came from an old backup
  const r = core.saveItem(d, { id: it.id, name: 'Drill', uom: 'pcs', category: TOOL, location: 'Shelf 2' }, 't');
  assert.equal(r.ok, true, r.error);
});

test('consumables never need a picture', () => {
  const d = fresh();
  assert.equal(core.saveItem(d, { name: 'Tape', uom: 'roll', category: 'Consumables' }, 't').ok, true);
});

test('loans: lend, available drops, return restores it', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  assert.equal(c.ok, true, c.error);
  assert.equal(core.balanceOf(d, it.id), 5);        // owned stays 5
  assert.equal(avail(d, it), 4);                    // 4 available, 1 borrowed
  const r = core.returnLoan(d, c.loan.id, {}, 't');
  assert.equal(r.ok, true, r.error);
  assert.equal(avail(d, it), 5);
});

test('loans: cannot lend more than is available', () => {
  const d = fresh(), it = addTool(d, 'Drill', 2);
  assert.equal(core.checkout(d, { itemId: it.id, qty: 3, borrower: 'Ben' }, 't').ok, false);
});

test('loans: return date cannot be before the date taken', () => {
  const d = fresh(), it = addTool(d);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben', dateOut: '2026-10-10' }, 't');
  assert.equal(core.returnLoan(d, c.loan.id, { date: '2026-10-01' }, 't').ok, false);
});

test('stock-in is refused as a way to "return" a borrowed tool', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  const r = core.addMovement(d, { itemId: it.id, dir: 'in', qty: 1, reason: 'Returned' }, 't');
  assert.equal(r.ok, false);
  assert.equal(core.balanceOf(d, it.id), 5);
});

test('damaged on return: goes to repairs and leaves "available"', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  const r = core.returnLoan(d, c.loan.id, { condition: 'Damaged', remarks: 'cracked' }, 't');
  assert.equal(r.ok, true, r.error);
  assert.equal(d.repairs.filter(x => !x.deleted && x.status === 'open').length, 1);
  assert.equal(avail(d, it), 4);
});

test('repairs: fixed puts it back, scrap writes it off the stock', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const a = core.reportProblem(d, { itemId: it.id, kind: 'Damaged', qty: 1 }, 't');
  assert.equal(a.ok, true, a.error);
  assert.equal(avail(d, it), 4);
  assert.equal(core.updateRepair(d, a.repair.id, { action: 'fixed' }, 't').ok, true);
  assert.equal(avail(d, it), 5);
  const b = core.reportProblem(d, { itemId: it.id, kind: 'Damaged', qty: 1 }, 't');
  assert.equal(core.updateRepair(d, b.repair.id, { action: 'scrap' }, 't').ok, false, 'write-off needs a note and the boss');
  assert.equal(core.updateRepair(d, b.repair.id, { action: 'scrap', note: 'Motor burnt out', approvedBy: 'Mr. Reyes' }, 't').ok, true);
  assert.equal(core.balanceOf(d, it.id), 4);
  assert.equal(avail(d, it), 4);
});

test('undo: undoing a lend removes the loan and restores availability', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  const ev = core.buildEvents(d).find(e => e.key === 'lend:' + c.loan.id);
  assert.ok(ev);
  const r = core.undoEvent(d, ev);
  assert.equal(r.ok, true, r.error);
  assert.equal(avail(d, it), 5);
  assert.equal(core.buildEvents(d).length, 0);
});

test('undo: undoing a damaged return removes the repair AND the return', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  core.returnLoan(d, c.loan.id, { condition: 'Damaged' }, 't');
  const ret = core.buildEvents(d).find(e => e.type === 'return');
  const dry = core.undoEvent(d, ret, { dryRun: true });
  assert.equal(dry.ok, true, dry.error);
  assert.ok(dry.effects.length >= 1);
  assert.equal(d.repairs.filter(x => !x.deleted).length, 1);   // dry run changes nothing
  assert.equal(core.undoEvent(d, ret).ok, true);
  assert.equal(d.repairs.filter(x => !x.deleted).length, 0);
  assert.equal(avail(d, it), 4);                                // back to "borrowed 1"
});

test('merge: the newer record wins, deleted records stay deleted', () => {
  const a = fresh(), it = addConsumable(a, 'Gloves', 5);
  const b = JSON.parse(JSON.stringify(a));
  b.items[0].name = 'Gloves XL';
  b.items[0].updatedAt = new Date(Date.now() + 5000).toISOString();
  core.mergeData(a, b);
  assert.equal(a.items.find(i => i.id === it.id).name, 'Gloves XL');
});

// ---------- damage photos ----------
test('damage photos: kept on a damage report, at most 3', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const ok = core.reportProblem(d, { itemId: it.id, kind: 'Damaged', qty: 1, photos: [PHOTO, PHOTO] }, 't');
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.repair.photos.length, 2);
  const many = core.reportProblem(d, { itemId: it.id, kind: 'Damaged', qty: 1, photos: [PHOTO, PHOTO, PHOTO, PHOTO] }, 't');
  assert.equal(many.ok, false);
});

test('damage photos: something that is not a picture is refused, nothing is saved', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const r = core.reportProblem(d, { itemId: it.id, kind: 'Damaged', qty: 1, photos: ['http://x/y.png'] }, 't');
  assert.equal(r.ok, false);
  assert.equal(d.repairs.length, 0);
});

test('damage photos: a report without photos still works', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const r = core.reportProblem(d, { itemId: it.id, kind: 'Damaged', qty: 1 }, 't');
  assert.equal(r.ok, true);
  assert.deepEqual(r.repair.photos, []);
});

test('damage photos: returned damaged with photos', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  const r = core.returnLoan(d, c.loan.id, { condition: 'Damaged', photos: [PHOTO] }, 't');
  assert.equal(r.ok, true, r.error);
  assert.equal(d.repairs[0].photos.length, 1);
});

test('damage photos: bad photos on a return stop the whole return', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  const r = core.returnLoan(d, c.loan.id, { condition: 'Damaged', photos: ['nope'] }, 't');
  assert.equal(r.ok, false);
  assert.equal(c.loan.returns.length, 0);          // the return was not recorded
});

test('damage photos: can be added or replaced later, also after the repair is closed', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const a = core.reportProblem(d, { itemId: it.id, kind: 'Damaged', qty: 1 }, 't');
  assert.equal(core.updateRepair(d, a.repair.id, { action: 'photos', photos: [PHOTO] }, 't').ok, true);
  assert.equal(a.repair.photos.length, 1);
  core.updateRepair(d, a.repair.id, { action: 'fixed' }, 't');
  assert.equal(core.updateRepair(d, a.repair.id, { action: 'photos', photos: [PHOTO, PHOTO] }, 't').ok, true);
  assert.equal(a.repair.photos.length, 2);
  assert.equal(core.updateRepair(d, a.repair.id, { action: 'photos', photos: [] }, 't').ok, true);
  assert.equal(a.repair.photos.length, 0);
});

// ---------- who returned it ----------
test('returns: "returned by" defaults to the borrower, "received by" to the person using the app', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  core.returnLoan(d, c.loan.id, {}, 'Storekeeper');
  assert.equal(c.loan.returns[0].returnedBy, 'Ben');
  assert.equal(c.loan.returns[0].receivedBy, 'Storekeeper');
});

test('returns: somebody else can bring it back, and the log shows who', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  core.returnLoan(d, c.loan.id, { returnedBy: 'Pedro', receivedBy: 'Ana' }, 't');
  const ev = core.buildEvents(d).find(e => e.type === 'return');
  assert.equal(ev.who, 'Pedro');
  assert.match(ev.remarks, /Received by Ana/);
  assert.equal(core.undoEvent(d, ev).ok, true);      // undo still works
  assert.equal(avail(d, it), 4);
});

test('returns: old records without these fields still load', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  core.returnLoan(d, c.loan.id, {}, 't');
  const old = JSON.parse(JSON.stringify(d));
  delete old.loans[0].returns[0].returnedBy; delete old.loans[0].returns[0].receivedBy;
  const back = core.normalizeData(old);
  assert.equal(back.loans[0].returns[0].returnedBy, '');
});

// ---------- pictures stored as files ----------
test('pictures: a saved picture is a file name; names are checked strictly', () => {
  assert.equal(core.cleanPhoto('ph-0123456789abcdef0123.jpg'), 'ph-0123456789abcdef0123.jpg');
  assert.equal(core.cleanPhoto('../../secret.jpg'), '');
  assert.equal(core.cleanPhoto('ph-0123456789abcdef0123.jpg/../x'), '');
  assert.equal(core.cleanPhoto('C:\\Windows\\win.ini'), '');
});

test('pictures: an item and a damage report can hold file names', () => {
  const d = fresh();
  const r = core.saveItem(d, { name: 'Drill', uom: 'pcs', category: TOOL, startQty: 2, photo: 'ph-0123456789abcdef0123.jpg' }, 't');
  assert.equal(r.ok, true, r.error);
  const x = core.reportProblem(d, { itemId: r.item.id, kind: 'Damaged', qty: 1, photos: ['ph-0123456789abcdef0123.jpg'] }, 't');
  assert.equal(x.ok, true, x.error);
});

test('tools: removing units needs a listed reason, an explanation and the boss\'s name', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const out = (o) => core.addMovement(d, Object.assign({ itemId: it.id, dir: 'out', qty: 1 }, o), 't');
  assert.equal(out({}).code, 'REASON');
  assert.equal(out({ reason: 'Issued' }).code, 'REASON');
  assert.equal(out({ reason: 'Lost' }).code, 'NOTE');
  assert.equal(out({ reason: 'Lost', remarks: 'Missing after site move' }).code, 'APPROVER');
  const ok = out({ reason: 'Lost', remarks: 'Missing after site move', approvedBy: 'Mr. Reyes' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.movement.approvedBy, 'Mr. Reyes');
  assert.equal(core.balanceOf(d, it.id), 4);
});

test('tools: a lost return and a lost report also need the boss', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5);
  const c = core.checkout(d, { itemId: it.id, qty: 1, borrower: 'Ben' }, 't');
  assert.equal(core.returnLoan(d, c.loan.id, { condition: 'Lost', remarks: 'Not found' }, 't').ok, false);
  assert.equal(core.returnLoan(d, c.loan.id, { condition: 'Lost', remarks: 'Not found', approvedBy: 'Mr. Reyes' }, 't').ok, true);
  assert.equal(core.reportProblem(d, { itemId: it.id, kind: 'Lost', qty: 1, note: 'Gone' }, 't').ok, false);
  assert.equal(core.reportProblem(d, { itemId: it.id, kind: 'Lost', qty: 1, note: 'Gone from site', approvedBy: 'Mr. Reyes' }, 't').ok, true);
});

test('tools: added units keep supplier and DR / PO number; consumables are not affected', () => {
  const d = fresh(), it = addTool(d, 'Drill', 5), g = addConsumable(d, 'Gloves', 10);
  const r = core.addMovement(d, { itemId: it.id, dir: 'in', qty: 2, reason: 'Purchase / delivery', party: 'ACME Tools', ref: 'DR-1042' }, 't');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.movement.party, 'ACME Tools'); assert.equal(r.movement.ref, 'DR-1042');
  assert.equal(core.addMovement(d, { itemId: g.id, dir: 'out', qty: 1, reason: 'Issued' }, 't').ok, true);
});

test('price: optional, never blocks, bad values are refused, the latest purchase price wins', () => {
  const d = fresh();
  const none = core.saveItem(d, { name: 'Clamp', uom: 'pcs', category: TOOL, startQty: 1, photo: PHOTO }, 't');
  assert.equal(none.ok, true, none.error);
  assert.equal(none.item.price, null);
  const bad = core.saveItem(d, { id: none.item.id, name: 'Clamp', uom: 'pcs', category: TOOL, price: 'abc' }, 't');
  assert.equal(bad.ok, false);
  const ok = core.saveItem(d, { id: none.item.id, name: 'Clamp', uom: 'pcs', category: TOOL, price: '1,250.50' }, 't');
  assert.equal(ok.item.price, 1250.5);
  const again = core.saveItem(d, { id: none.item.id, name: 'Clamp', uom: 'pcs', category: TOOL }, 't');
  assert.equal(again.item.price, 1250.5, 'editing without a price keeps the old one');
  const m = core.addMovement(d, { itemId: none.item.id, dir: 'in', qty: 2, reason: 'Purchase / delivery', price: '1400' }, 't');
  assert.equal(m.ok, true, m.error);
  assert.equal(m.movement.price, 1400);
  assert.equal(d.items.find(i => i.id === none.item.id).price, 1400);
  assert.equal(core.addMovement(d, { itemId: none.item.id, dir: 'in', qty: 1, reason: 'Purchase / delivery', price: 'x' }, 't').ok, false);
});
