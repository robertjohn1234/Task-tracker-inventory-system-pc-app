'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const imp = require('../src/main/inventory/inventory-import.js');

const STOCK = [
  ['Code', 'Item', 'Category', 'Group', 'Unit', 'On hand', 'Min level', 'Status', 'Location', 'Supplier'],
  ['CON-0001', 'Gloves', 'Consumables', '', 'pcs', 6, 2, 'OK', 'Shelf A', ''],
  ['TOL-0001', 'Drill', 'Tools & Equipment', '', 'pcs', 5, 0, 'OK', 'Cabinet', ''],
];
const MOVES = [
  ['Date', 'Code', 'Item', 'In / Out', 'Qty', 'Reason', 'Department / Person', 'Reference', 'Remarks', 'Entered by'],
  ['2026-10-01', 'CON-0001', 'Gloves', 'IN', 10, 'Opening balance', '', '', '', 'tester'],
  ['2026-10-02', 'CON-0001', 'Gloves', 'OUT', 4, 'Issued', 'Welding', '', '', 'tester'],
];

test('parseExport reads the app\'s own Excel export', () => {
  const p = imp.parseExport(STOCK, MOVES, []);
  assert.equal(p.items.length, 2);
  assert.equal(p.movements.length, 2);
});

test('parseExport refuses a file that is not an export', () => {
  assert.throws(() => imp.parseExport([['a', 'b'], [1, 2]], [], []), /Stock/);
});

test('parseExport skips a movement for an item that is not on the Stock sheet', () => {
  const bad = MOVES.concat([['2026-10-03', 'XXX-1', 'Ghost', 'IN', 1, '', '', '', '', '']]);
  const p = imp.parseExport(STOCK, bad, []);
  assert.equal(p.movements.length, 2);
  assert.ok(p.issues.some(i => i.level === 'skip'));
});

test('prices travel through the app\'s own Excel export and import', () => {
  const core = require('../src/main/inventory/inventory-core.js');
  const stock = [['Code', 'Item', 'Category', 'Unit', 'On hand', 'Price'], ['CON-0001', 'Gloves', 'Consumables', 'pcs', 6, 85.5], ['CON-0002', 'Tape', 'Consumables', 'pcs', 2, '']];
  const moves = [['Date', 'Code', 'Item', 'In / Out', 'Qty', 'Price / unit'], ['2026-10-01', 'CON-0001', 'Gloves', 'IN', 10, 85.5], ['2026-10-02', 'CON-0001', 'Gloves', 'OUT', 4, 99]];
  const p = imp.parseExport(stock, moves, []);
  assert.equal(p.items[0].price, 85.5); assert.equal(p.items[1].price, null);
  assert.equal(p.movements[0].price, 85.5); assert.equal(p.movements[1].price, null, 'a stock-out never carries a price');
  const d = core.emptyData();
  imp.applyParsed(d, p, {}, 't');
  assert.equal(d.items.find(i => i.name === 'Gloves').price, 85.5);
  assert.equal(d.movements.find(m => m.dir === 'in' && m.reason !== 'Opening balance').price, 85.5);
});
