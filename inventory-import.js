'use strict';
// Reads the layouts of your two Excel workbooks (consumables + tools) and turns them into
// inventory records. It works on plain rows (arrays of cell values), so it can be tested without Excel.

const crypto = require('crypto');
const core = require('./inventory-core');

const norm = core.normName;
const cellText = (v) => (v == null ? '' : String(v).trim());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => {
  if (isNum(v)) return v;
  if (typeof v === 'string' && /^-?[\d,]*\.?\d+$/.test(v.trim())) return Number(v.replace(/,/g, ''));
  return null;
};

function toISO(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const s = v.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m && core.validDate(`${m[1]}-${m[2]}-${m[3]}`)) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
    if (m) {
      const iso = `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
      if (core.validDate(iso)) return iso;
    }
  }
  return '';
}

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 24);
const label = (v) => cellText(v).toLowerCase().replace(/\s+/g, ' ').replace(/[.:]+$/, '');
const findCol = (row, name) => row.findIndex(c => label(c) === name);
const findColContains = (row, part) => row.findIndex(c => label(c).includes(part));

// ---------- remarks -> reason and who ----------
function classify(remarks, dir) {
  const r = cellText(remarks);
  const low = r.toLowerCase();
  let reason = dir === 'in' ? 'Purchase / delivery' : 'Issued / withdrawn';
  if (/borrow/.test(low)) reason = dir === 'in' ? 'Borrowed from other dept' : 'Lent to other dept';
  else if (dir === 'out' && /transfer/.test(low)) reason = 'Transferred out';
  else if (dir === 'out' && /(damage|lost|expired|defective)/.test(low)) reason = 'Damaged / lost / expired';
  let party = '';
  const m = /(?:borrowed|transfer(?:red)?)\s*(?:to|from)?\s+(.+)$/i.exec(r) || /(?:to|from)\s+(.+)$/i.exec(r);
  if (m) party = m[1].trim();
  return { reason, party: party.slice(0, 120) };
}

// =====================================================================
// Consumables workbook: "Stock Dashboard" + "Stock IN_OUT_Order"
// =====================================================================
function parseConsumables(dash, io) {
  const issues = [];
  const h = dash.findIndex(r => r && findCol(r, 'item name') >= 0 && findCol(r, 'uom') >= 0);
  if (h < 0) throw new Error('Could not find the item list on the "Stock Dashboard" sheet (a row with "Item Name" and "UOM").');
  const hr = dash[h];
  const cName = findCol(hr, 'item name'), cUom = findCol(hr, 'uom');
  const cOpen = findCol(hr, 'opening stock'), cBal = findCol(hr, 'stock balance');
  const cMax = findCol(hr, 'max. lt'), cAvg = findCol(hr, 'avg. lt');

  const items = [];
  const byName = new Map();
  let group = '';
  for (let i = h + 1; i < dash.length; i++) {
    const r = dash[i] || [];
    const name = cellText(r[cName]);
    if (!name) continue;
    const uom = cellText(r[cUom]);
    const open = cOpen >= 0 ? num(r[cOpen]) : null;
    const bal = cBal >= 0 ? num(r[cBal]) : null;
    if (!uom && open == null && bal == null) { group = name; continue; }   // a section title such as "PPE"

    const key = norm(name);
    const item = {
      name, uom, group, opening: open, balance: bal, rowNo: i + 1,
      lead: Math.max(0, num(cAvg >= 0 ? r[cAvg] : null) || num(cMax >= 0 ? r[cMax] : null) || 0),
      dupIndex: 0, auto: false, inQ: 0, outQ: 0
    };
    if (byName.has(key)) {
      item.dupIndex = byName.get(key).dups = (byName.get(key).dups || 1) + 1;
      issues.push({ level: 'warn', row: item.rowNo, text: `"${name}" appears more than once in your item list (rows ${byName.get(key).rowNo} and ${item.rowNo}). The second one was imported as "${name} (row ${item.rowNo})" with no movements, please check which is correct.` });
      item.name = `${name} (row ${item.rowNo})`;
    } else {
      byName.set(key, item);
    }
    items.push(item);
  }
  if (!items.length) throw new Error('No items were found below the "Item Name" heading.');

  // ----- stock in / stock out lists -----
  const movements = [];
  const mh = io.findIndex(r => r && findCol(r, 'date') >= 0 && findCol(r, 'item name') >= 0);
  if (mh < 0) {
    issues.push({ level: 'warn', row: 0, text: 'The "Stock IN_OUT_Order" sheet was not found, so only the item list was imported (no stock movements).' });
  } else {
    const hr2 = io[mh];
    const dateCols = [];
    hr2.forEach((c, i) => { if (label(c) === 'date') dateCols.push(i); });
    const above = mh > 0 ? (io[mh - 1] || []) : [];
    const blocks = [];
    dateCols.forEach((c, n) => {
      let kind = n === 0 ? 'in' : n === 1 ? 'out' : 'order';
      for (let k = c; k < c + 4; k++) {
        const t = label(above[k]);
        if (t === 'stock in') kind = 'in';
        else if (t === 'stock out') kind = 'out';
        else if (t === 'stock order') kind = 'order';
      }
      if (kind === 'in' || kind === 'out') blocks.push({ kind, c, lastDate: '' });
    });
    for (let i = mh + 1; i < io.length; i++) {
      const r = io[i] || [];
      for (const b of blocks) {
        const nm = cellText(r[b.c + 1]);
        const q = num(r[b.c + 2]);
        const d = toISO(r[b.c]);
        const rem = cellText(r[b.c + 3]);
        if (!nm && q == null) continue;
        if (!nm) { issues.push({ level: 'skip', row: i + 1, text: `Row ${i + 1}: a quantity (${q}) without an item name was skipped.` }); continue; }
        if (!(q > 0)) { issues.push({ level: 'skip', row: i + 1, text: `Row ${i + 1}: "${nm}" has no valid quantity, so it was skipped.` }); continue; }
        let date = d;
        let remarks = rem;
        if (!date) {
          if (!b.lastDate) { issues.push({ level: 'skip', row: i + 1, text: `Row ${i + 1}: "${nm}" has no date, so it was skipped.` }); continue; }
          date = b.lastDate;
          remarks = (rem ? rem + ' ' : '') + '(date was missing in Excel)';
          issues.push({ level: 'warn', row: i + 1, text: `Row ${i + 1}: "${nm}" has no date. It was given the date of the row above (${date}), please check it.` });
        } else {
          b.lastDate = date;
        }
        movements.push({ itemName: nm, dir: b.kind, qty: q, date, remarks, rowNo: i + 1 });
      }
    }
  }

  // ----- link movements to items -----
  const key2item = new Map();
  items.forEach(it => { const k = norm(it.name.replace(/ \(row \d+\)$/, '')); if (!key2item.has(k) && it.dupIndex === 0) key2item.set(k, it); });
  const strangers = new Map();
  for (const m of movements) {
    let it = key2item.get(norm(m.itemName));
    if (!it) {
      it = { name: m.itemName.trim(), uom: '', group: 'Not in your item list', opening: 0, balance: null, rowNo: 0, lead: 0, dupIndex: 0, auto: true, inQ: 0, outQ: 0 };
      items.push(it);
      key2item.set(norm(m.itemName), it);
      strangers.set(it.name, true);
    }
    m.item = it;
    if (m.dir === 'in') it.inQ += m.qty; else it.outQ += m.qty;
    Object.assign(m, classify(m.remarks, m.dir));
  }
  for (const nm of strangers.keys()) issues.push({ level: 'warn', row: 0, text: `"${nm}" has stock movements but is not in your item list. It was added as a new item with no unit.` });

  // ----- opening stock and a check against your Excel balance -----
  let checked = 0, matched = 0;
  const mismatches = [];
  for (const it of items) {
    if (it.opening != null) {
      it.openingQty = it.opening;
      if (it.balance != null) {
        checked++;
        const calc = Math.round((it.opening + it.inQ - it.outQ) * 1000) / 1000;
        if (Math.abs(calc - it.balance) < 1e-6) matched++;
        else mismatches.push({ name: it.name, row: it.rowNo, excel: it.balance, app: calc });
      }
    } else if (it.balance != null) {
      // the sheet only has a typed balance: work back to the stock you had before these movements
      let o = Math.round((it.balance - it.inQ + it.outQ) * 1000) / 1000;
      if (o < 0) {
        issues.push({ level: 'warn', row: it.rowNo, text: `"${it.name}" (row ${it.rowNo}): the balance in Excel is ${it.balance} but the movements add up to more, so opening stock was set to 0. The app will show ${Math.round((it.inQ - it.outQ) * 1000) / 1000}. Please check.` });
        o = 0;
      }
      it.openingQty = o;
    } else {
      it.openingQty = 0;
    }
  }
  const dates = movements.map(m => m.date).sort();
  return {
    kind: 'consumables', category: 'Consumables', items, movements, loans: [], issues,
    reconcile: { checked, matched, mismatches },
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    counts: { items: items.length, movements: movements.length, loans: 0 }
  };
}

// =====================================================================
// Tools workbook: "Tools" + "Borrower"
// =====================================================================
function parseTools(toolRows, borrowerRows) {
  const issues = [];
  const h = toolRows.findIndex(r => r && findColContains(r, 'item description') >= 0);
  if (h < 0) throw new Error('Could not find the tools list (a row with "ITEM DESCRIPTION").');
  const hr = toolRows[h];
  const cName = findColContains(hr, 'item description');
  const cUom = findCol(hr, 'uom'), cQty = findCol(hr, 'qty');
  const cLoc = findColContains(hr, 'location'), cRem = findColContains(hr, 'remarks');

  const items = [];
  const byName = new Map();
  for (let i = h + 1; i < toolRows.length; i++) {
    const r = toolRows[i] || [];
    const name = cellText(r[cName]);
    if (!name) continue;
    let qty = cQty >= 0 ? num(r[cQty]) : null;
    if (qty == null || qty < 0) {
      issues.push({ level: 'warn', row: i + 1, text: `Row ${i + 1}: "${name}" has no valid quantity, so 1 was used. Please check.` });
      qty = 1;
    }
    const it = {
      name, uom: cUom >= 0 ? cellText(r[cUom]) : '', group: '', openingQty: qty,
      location: cLoc >= 0 ? cellText(r[cLoc]) : '', notes: cRem >= 0 ? cellText(r[cRem]) : '', rowNo: i + 1, dupIndex: 0
    };
    const key = norm(name);
    if (byName.has(key)) {
      issues.push({ level: 'warn', row: it.rowNo, text: `"${name}" appears more than once in your tools list (rows ${byName.get(key).rowNo} and ${it.rowNo}). The second one was imported as "${name} (row ${it.rowNo})".` });
      it.name = `${name} (row ${it.rowNo})`;
      it.dupIndex = 1;
    } else {
      byName.set(key, it);
    }
    items.push(it);
  }

  // ----- who has borrowed what -----
  const loans = [];
  const bh = (borrowerRows || []).findIndex(r => r && findCol(r, 'item') >= 0 && findColContains(r, 'borrower') >= 0);
  if (bh >= 0) {
    const b = borrowerRows[bh];
    const cI = findCol(b, 'item'), cB = findColContains(b, 'borrower'), cL = findCol(b, 'location');
    const cR = findColContains(b, 'brf'), cRet = findCol(b, 'return'), cRm = findColContains(b, 'remarks');
    const used = new Map();
    for (let i = bh + 1; i < borrowerRows.length; i++) {
      const r = borrowerRows[i] || [];
      const nm = cellText(r[cI]);
      const who = cellText(r[cB]);
      if (!nm && !who) continue;
      if (!nm || !who) { issues.push({ level: 'skip', row: i + 1, text: `Borrower sheet row ${i + 1}: item or borrower is missing, so it was skipped.` }); continue; }
      let tool = items.find(t => t.dupIndex === 0 && norm(t.name) === norm(nm));
      if (!tool) {
        const hits = items.filter(t => norm(t.name).includes(norm(nm)));
        if (hits.length === 1) tool = hits[0];
      }
      if (!tool) { issues.push({ level: 'skip', row: i + 1, text: `Borrower sheet row ${i + 1}: "${nm}" is not in your tools list, so the loan to ${who} was skipped.` }); continue; }
      const retRaw = cRet >= 0 ? r[cRet] : null;
      const returned = retRaw != null && cellText(retRaw) !== '';
      if (!returned) {
        const u = (used.get(tool) || 0) + 1;
        if (u > tool.openingQty) { issues.push({ level: 'skip', row: i + 1, text: `Borrower sheet row ${i + 1}: more "${tool.name}" are listed as borrowed than you own (${tool.openingQty}), so the loan to ${who} was skipped.` }); continue; }
        used.set(tool, u);
      }
      loans.push({
        tool, borrower: who, location: cL >= 0 ? cellText(r[cL]) : '', ref: cR >= 0 ? cellText(r[cR]) : '',
        returned, returnDate: returned ? toISO(retRaw) : '', remarks: cRm >= 0 ? cellText(r[cRm]) : '', rowNo: i + 1
      });
    }
  }
  return {
    kind: 'tools', category: 'Tools & Equipment', items, movements: [], loans, issues,
    reconcile: { checked: 0, matched: 0, mismatches: [] }, dateRange: null,
    counts: { items: items.length, movements: 0, loans: loans.length }
  };
}

// =====================================================================
// Put parsed data into the inventory
// =====================================================================
function applyParsed(data, parsed, opts, by) {
  opts = opts || {};
  const src = 'import:' + parsed.kind;
  const now = core.nowISO();
  const res = { itemsAdded: 0, itemsUpdated: 0, movementsAdded: 0, loansAdded: 0, removed: 0 };

  let openingDate = core.validDate(opts.openingDate) ? opts.openingDate : '';
  if (!openingDate) openingDate = parsed.dateRange ? core.addDays(parsed.dateRange.from, -1) : core.todayISO();

  const seen = new Set();   // ids that this import produces
  const itemId = (it) => 'imp-' + hash(`item|${parsed.kind}|${norm(it.name)}|${it.dupIndex || 0}`);

  const upsert = (list, rec, isNew) => {
    const idx = list.findIndex(x => x.id === rec.id);
    if (idx < 0) { list.push(rec); return 'added'; }
    if (opts.replace || list[idx].deleted) { list[idx] = Object.assign({}, rec, { createdAt: list[idx].createdAt }); return 'updated'; }
    return 'kept';
  };

  if (opts.replace) {
    for (const list of [data.items, data.movements, data.loans]) {
      for (const r of list) if (!r.deleted && r.src === src) { r.deleted = true; r.updatedAt = now; res.removed++; }
    }
  }

  const idByItem = new Map();
  for (const it of parsed.items) {
    const id = itemId(it);
    idByItem.set(it, id);
    seen.add(id);
    const existing = data.items.find(x => x.id === id);
    const code = existing && existing.code ? existing.code : core.nextCode(data, parsed.category);
    const rec = core.cleanItemRecord({
      id, code, name: it.name, category: parsed.category, group: it.group, uom: it.uom || 'pcs',
      location: it.location, notes: it.notes, leadTimeDays: it.lead, src, createdAt: now, updatedAt: now
    });
    const r = upsert(data.items, rec);
    if (r === 'added') res.itemsAdded++; else if (r === 'updated') res.itemsUpdated++;
  }

  for (const it of parsed.items) {
    const iid = idByItem.get(it);
    if (it.openingQty > 0) {
      const rec = core.cleanMoveRecord({
        id: 'imp-' + hash('open|' + iid), itemId: iid, dir: 'in', qty: it.openingQty, date: openingDate,
        reason: 'Opening balance', remarks: 'Imported from Excel', by, src, createdAt: now, updatedAt: now
      });
      if (upsert(data.movements, rec) === 'added') res.movementsAdded++;
    }
  }
  for (const m of parsed.movements) {
    const iid = idByItem.get(m.item);
    const rec = core.cleanMoveRecord({
      id: 'imp-' + hash(`mv|${parsed.kind}|${m.rowNo}|${m.dir}|${m.date}|${norm(m.itemName)}|${m.qty}`),
      itemId: iid, dir: m.dir, qty: m.qty, date: m.date, reason: m.reason, party: m.party, remarks: m.remarks,
      by, src, createdAt: now, updatedAt: now
    });
    if (upsert(data.movements, rec) === 'added') res.movementsAdded++;
  }
  if (opts.includeLoans !== false) {
    for (const l of parsed.loans) {
      const iid = idByItem.get(l.tool);
      const dateOut = opts.openingDate && core.validDate(opts.openingDate) ? opts.openingDate : openingDate;
      const rec = core.cleanLoanRecord({
        id: 'imp-' + hash(`loan|${parsed.kind}|${l.rowNo}|${norm(l.tool.name)}|${norm(l.borrower)}`),
        itemId: iid, qty: 1, borrower: l.borrower, location: l.location, ref: l.ref, dateOut,
        remarks: l.remarks, returns: l.returned ? [{ date: l.returnDate && l.returnDate >= dateOut ? l.returnDate : dateOut, qty: 1, remarks: '' }] : [],
        by, src, createdAt: now, updatedAt: now
      });
      if (upsert(data.loans, rec) === 'added') res.loansAdded++;
    }
  }
  res.removed = [data.items, data.movements, data.loans]
    .reduce((n, list) => n + list.filter(r => r.deleted && r.src === src && r.updatedAt === now).length, 0);
  res.openingDate = openingDate;
  return res;
}

module.exports = { parseConsumables, parseTools, applyParsed, classify, toISO };
