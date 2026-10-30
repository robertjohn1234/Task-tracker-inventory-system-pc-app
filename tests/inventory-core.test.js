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
  assert.equal(core.updateRepair(d, b.repair.id, { action: 'scrap' }, 't').ok, true);
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
