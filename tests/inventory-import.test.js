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
