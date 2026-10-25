'use strict';
// Inventory logic with no Electron or file access, so it can be tested on its own.
// Every record has a unique id and an updatedAt time. That is what makes two PCs mergeable.

const crypto = require('crypto');

const CATEGORIES = [
  { name: 'Consumables', prefix: 'CON' },
  { name: 'Tools & Equipment', prefix: 'TLS' },
  { name: 'Office Supplies', prefix: 'OFC' },
  { name: 'Other', prefix: 'OTH' }
];
const CATEGORY_NAMES = CATEGORIES.map(c => c.name);
const TOOLS = 'Tools & Equipment';

const IN_REASONS = ['Purchase / delivery', 'Returned by user', 'Borrowed from other dept', 'Opening balance', 'Count adjustment', 'Other'];
const OUT_REASONS = ['Issued / withdrawn', 'Lent to other dept', 'Transferred out', 'Damaged / lost / expired', 'Count adjustment', 'Other'];
const CONDITIONS = ['Good', 'Needs repair', 'Under repair', 'Damaged', 'Lost'];

const MAX_QTY = 1e9;
const FORMAT = 'work-helper-inventory';

// ---------- small helpers ----------
const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();

function pad2(n) { return String(n).padStart(2, '0'); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
function text(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max || 200); }
function qtyNum(v) {
  const n = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
}
function nonNeg(v) {
  if (v === '' || v == null) return 0;
  const n = qtyNum(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_QTY ? n : 0;
}
function cleanCode(v) {
  return String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9._-]/g, '').slice(0, 30);
}
const fail = (error, extra) => Object.assign({ ok: false, error }, extra || {});

function normName(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/[“”″‶]/g, '"').replace(/[‘’′]/g, "'").replace(/''/g, '"')
    .replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
}

// ---------- the data file ----------
function emptyData() {
  return { format: FORMAT, version: 1, items: [], movements: [], loans: [], settings: { user: '', formCompany: '', formDept: '', formIssuerMode: 'user', formIssuerName: '', formLogo: '' } };
}

function cleanItemRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null;
  const code = cleanCode(r.code);
  const name = text(r.name, 200);
  if (!r.deleted && (!code || !name)) return null;
  return {
    id: r.id.slice(0, 80),
    code, name,
    category: CATEGORY_NAMES.includes(r.category) ? r.category : 'Other',
    group: text(r.group, 80),
    uom: text(r.uom, 20),
    location: text(r.location, 120),
    supplier: text(r.supplier, 120),
    barcode: text(r.barcode, 60),
    minQty: nonNeg(r.minQty),
    reorderQty: nonNeg(r.reorderQty),
    leadTimeDays: nonNeg(r.leadTimeDays),
    safetyStock: nonNeg(r.safetyStock),
    serial: text(r.serial, 200),
    condition: CONDITIONS.includes(r.condition) ? r.condition : '',
    calibrationDue: validDate(r.calibrationDue) ? r.calibrationDue : '',
    notes: text(r.notes, 2000),
    archived: !!r.archived,
    src: text(r.src, 40),
    createdAt: text(r.createdAt, 40) || nowISO(),
    updatedAt: text(r.updatedAt, 40) || nowISO(),
    deleted: !!r.deleted
  };
}

function cleanMoveRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null;
  const qty = qtyNum(r.qty);
  if (!r.deleted && !(qty > 0 && qty <= MAX_QTY)) return null;
  if (!r.deleted && !validDate(r.date)) return null;
  if (!r.deleted && r.dir !== 'in' && r.dir !== 'out') return null;
  return {
    id: r.id.slice(0, 80),
    itemId: text(r.itemId, 80),
    dir: r.dir === 'out' ? 'out' : 'in',
    qty: qty > 0 ? qty : 0,
    date: validDate(r.date) ? r.date : '1970-01-01',
    reason: text(r.reason, 120),
    party: text(r.party, 120),
    ref: text(r.ref, 80),
    remarks: text(r.remarks, 500),
    by: text(r.by, 60),
    formNo: text(r.formNo, 30),
    src: text(r.src, 40),
    createdAt: text(r.createdAt, 40) || nowISO(),
    updatedAt: text(r.updatedAt, 40) || nowISO(),
    deleted: !!r.deleted
  };
}

function cleanLoanRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null;
  const qty = qtyNum(r.qty);
  if (!r.deleted && !(qty > 0 && qty <= MAX_QTY)) return null;
  const returns = (Array.isArray(r.returns) ? r.returns : [])
    .map(x => ({ date: validDate(x && x.date) ? x.date : '1970-01-01', qty: qtyNum(x && x.qty), remarks: text(x && x.remarks, 300) }))
    .filter(x => x.qty > 0);
  const returnedQty = Math.min(qty > 0 ? qty : 0, returns.reduce((s, x) => s + x.qty, 0));
  return {
    id: r.id.slice(0, 80),
    itemId: text(r.itemId, 80),
    qty: qty > 0 ? qty : 0,
    borrower: text(r.borrower, 120),
    location: text(r.location, 120),
    ref: text(r.ref, 80),
    dateOut: validDate(r.dateOut) ? r.dateOut : todayISO(),
    dueDate: validDate(r.dueDate) ? r.dueDate : '',
    remarks: text(r.remarks, 500),
    returns,
    returnedQty,
    by: text(r.by, 60),
    formNo: text(r.formNo, 30),
    src: text(r.src, 40),
    createdAt: text(r.createdAt, 40) || nowISO(),
    updatedAt: text(r.updatedAt, 40) || nowISO(),
    deleted: !!r.deleted
  };
}

// A logo is kept as a small picture inside the settings (data URL), never a path to a file.
function cleanLogo(v) {
  v = typeof v === 'string' ? v : '';
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(v) && v.length <= 600000 ? v : '';
}

function normalizeData(raw) {
  const d = emptyData();
  if (!raw || typeof raw !== 'object') return d;
  d.items = (Array.isArray(raw.items) ? raw.items : []).map(cleanItemRecord).filter(Boolean);
  d.movements = (Array.isArray(raw.movements) ? raw.movements : []).map(cleanMoveRecord).filter(Boolean);
  d.loans = (Array.isArray(raw.loans) ? raw.loans : []).map(cleanLoanRecord).filter(Boolean);
  if (raw.settings && typeof raw.settings === 'object') {
    d.settings.user = text(raw.settings.user, 60);
    d.settings.formCompany = text(raw.settings.formCompany, 120);
    d.settings.formDept = text(raw.settings.formDept, 120);
    d.settings.formIssuerMode = ['user', 'fixed', 'blank'].includes(raw.settings.formIssuerMode) ? raw.settings.formIssuerMode : 'user';
    d.settings.formIssuerName = text(raw.settings.formIssuerName, 120);
    d.settings.formLogo = cleanLogo(raw.settings.formLogo);
  }
  return d;
}

// ---------- codes ----------
function prefixFor(category) {
  const c = CATEGORIES.find(x => x.name === category);
  return c ? c.prefix : 'OTH';
}

// CON-0001, TLS-0001 ... Numbers are never reused, even after an item is deleted.
function nextCode(data, category, reserved) {
  const prefix = prefixFor(category);
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  let max = 0;
  for (const it of data.items) {
    const m = re.exec(it.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  if (reserved) for (const c of reserved) { const m = re.exec(c); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return prefix + '-' + String(max + 1).padStart(4, '0');
}

// ---------- balances ----------
function liveItem(data, id) { return data.items.find(i => i.id === id && !i.deleted); }

function balanceOf(data, itemId, excludeMoveId) {
  let b = 0;
  for (const m of data.movements) {
    if (m.deleted || m.itemId !== itemId || m.id === excludeMoveId) continue;
    b += m.dir === 'in' ? m.qty : -m.qty;
  }
  return Math.round(b * 1000) / 1000;
}
function onLoanOf(data, itemId, excludeLoanId) {
  let n = 0;
  for (const l of data.loans) {
    if (l.deleted || l.itemId !== itemId || l.id === excludeLoanId) continue;
    n += l.qty - l.returnedQty;
  }
  return Math.round(n * 1000) / 1000;
}

// ---------- items ----------
function saveItem(data, input, by) {
  input = input || {};
  const name = text(input.name, 200);
  if (!name) return fail('Please type the item name.');
  const uom = text(input.uom, 20);
  if (!uom) return fail('Please type the unit (pcs, set, kg, m ...).');
  const category = CATEGORY_NAMES.includes(input.category) ? input.category : 'Consumables';

  const old = input.id ? data.items.find(i => i.id === input.id && !i.deleted) : null;
  if (input.id && !old) return fail('That item no longer exists.');

  let code = cleanCode(input.code);
  if (code) {
    const other = data.items.find(i => !i.deleted && i.code === code && (!old || i.id !== old.id));
    if (other) return fail(`The code ${code} is already used by "${other.name}".`);
  } else {
    code = old ? old.code : nextCode(data, category);
  }

  const startQty = old ? 0 : nonNeg(input.startQty);
  if (!old && input.startQty !== '' && input.startQty != null && !(qtyNum(input.startQty) >= 0)) {
    return fail('The starting quantity must be a number, zero or more.');
  }
  if (input.calibrationDue && !validDate(input.calibrationDue)) return fail('The calibration date is not a valid date.');

  const now = nowISO();
  const rec = cleanItemRecord({
    id: old ? old.id : uid(), code, name, category,
    group: input.group, uom, location: input.location, supplier: input.supplier, barcode: input.barcode,
    minQty: input.minQty, reorderQty: input.reorderQty, leadTimeDays: input.leadTimeDays, safetyStock: input.safetyStock,
    serial: input.serial, condition: input.condition, calibrationDue: input.calibrationDue,
    notes: input.notes, archived: input.archived,
    formNo: old ? old.formNo : '',
    src: old ? old.src : '', createdAt: old ? old.createdAt : now, updatedAt: now, deleted: false
  });

  if (old) data.items[data.items.indexOf(old)] = rec;
  else data.items.push(rec);

  if (startQty > 0) {
    data.movements.push(cleanMoveRecord({
      id: uid(), itemId: rec.id, dir: 'in', qty: startQty, date: validDate(input.startDate) ? input.startDate : todayISO(),
      reason: 'Opening balance', by: text(by, 60), createdAt: now, updatedAt: now
    }));
  }
  return { ok: true, item: rec };
}

function deleteItem(data, id) {
  const it = liveItem(data, id);
  if (!it) return fail('That item no longer exists.');
  const hasMoves = data.movements.some(m => !m.deleted && m.itemId === id);
  const hasLoans = data.loans.some(l => !l.deleted && l.itemId === id);
  if (hasMoves || hasLoans) {
    return fail('This item has stock history, so it cannot be deleted. Tick "Archived" to hide it instead.');
  }
  it.deleted = true;
  it.updatedAt = nowISO();
  return { ok: true };
}

// ---------- movements ----------
function addMovement(data, input, by, opts) {
  opts = opts || {};
  input = input || {};
  const it = liveItem(data, input.itemId);
  if (!it) return fail('Please choose an item from the list.');
  if (it.archived && !input.id) return fail('This item is archived. Untick "Archived" in the item first.');
  const dir = input.dir === 'out' ? 'out' : input.dir === 'in' ? 'in' : '';
  if (!dir) return fail('Choose Stock In or Stock Out.');
  const qty = qtyNum(input.qty);
  if (!(qty > 0) || qty > MAX_QTY) return fail('Please type a quantity greater than zero.');
  const date = input.date ? input.date : todayISO();
  if (!validDate(date)) return fail('The date is not valid.');

  const old = input.id ? data.movements.find(m => m.id === input.id && !m.deleted) : null;
  if (input.id && !old) return fail('That entry no longer exists.');

  const bal = balanceOf(data, it.id, old && old.id);
  const loaned = onLoanOf(data, it.id);
  const after = dir === 'in' ? bal + qty : bal - qty;
  if (dir === 'out' && !opts.allowNegative) {
    if (after < 0) return fail(`Only ${bal} ${it.uom} on hand.`, { code: 'NEGATIVE', onHand: bal });
    if (after < loaned) return fail(`${loaned} ${it.uom} of this item are currently borrowed, so only ${Math.max(0, bal - loaned)} can leave stock.`, { code: 'NEGATIVE', onHand: bal });
  }

  const now = nowISO();
  const rec = cleanMoveRecord({
    id: old ? old.id : uid(), itemId: it.id, dir, qty, date,
    reason: input.reason || (dir === 'in' ? IN_REASONS[0] : OUT_REASONS[0]),
    party: input.party, ref: input.ref, remarks: input.remarks, by: text(by, 60),
    src: old ? old.src : '', createdAt: old ? old.createdAt : now, updatedAt: now, deleted: false
  });
  if (old) data.movements[data.movements.indexOf(old)] = rec;
  else data.movements.push(rec);
  return { ok: true, movement: rec, onHand: Math.round(after * 1000) / 1000 };
}

// Saves many entries in one go. Rows are applied in order (so balances add up);
// rows that fail are reported and the rest are still saved.
function addMovementsBulk(data, rows, by, opts) {
  const results = [];
  let saved = 0;
  (Array.isArray(rows) ? rows : []).slice(0, 500).forEach(row => {
    const r = addMovement(data, Object.assign({}, row, { id: undefined }), by, opts);
    if (r.ok) saved++;
    results.push(r.ok ? { ok: true, id: r.movement.id } : { ok: false, error: r.error, code: r.code });
  });
  return { ok: true, saved, results };
}

// Gives a form number (WF-2026-0001 for withdrawals, BF-2026-0001 for borrowed tools)
// to the given entries. Entries that already have one keep it, so a reprint shows the same number.
function assignForm(data, moveIds, loanIds, today) {
  moveIds = Array.isArray(moveIds) ? moveIds : [];
  loanIds = Array.isArray(loanIds) ? loanIds : [];
  if (moveIds.length && loanIds.length) return fail('Make separate forms for stock-outs and borrowed tools.');
  const isLoan = loanIds.length > 0;
  const pool = isLoan ? data.loans : data.movements;
  const ids = new Set(isLoan ? loanIds : moveIds);
  const recs = pool.filter(x => ids.has(x.id) && !x.deleted);
  if (!recs.length) return fail('Nothing to make a form for.');
  if (!isLoan && recs.some(r => r.dir !== 'out')) return fail('A withdrawal form can only include stock-out entries.');
  const have = [...new Set(recs.map(r => r.formNo).filter(Boolean))];
  if (have.length > 1) return fail('These entries already belong to different forms.');
  let formNo = have[0];
  if (!formNo) {
    const prefix = isLoan ? 'BF' : 'WF';
    const year = String(validDate(today) ? today.slice(0, 4) : todayISO().slice(0, 4));
    const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
    let max = 0;
    pool.forEach(x => { const m = re.exec(x.formNo || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    formNo = `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
  }
  const now = nowISO();
  recs.forEach(r => { if (r.formNo !== formNo) { r.formNo = formNo; r.updatedAt = now; } });
  return { ok: true, formNo };
}

function deleteMovement(data, id, force) {
  const m = data.movements.find(x => x.id === id && !x.deleted);
  if (!m) return fail('That entry no longer exists.');
  if (m.dir === 'in' && !force) {
    const bal = balanceOf(data, m.itemId, m.id);
    if (bal < 0) return fail('Deleting this entry would make the stock negative. Delete or correct the later stock-out entries first.');
  }
  m.deleted = true;
  m.updatedAt = nowISO();
  return { ok: true };
}

// ---------- loans (tools lent out) ----------
function checkout(data, input, by) {
  input = input || {};
  const it = liveItem(data, input.itemId);
  if (!it) return fail('Please choose an item from the list.');
  if (it.archived) return fail('This item is archived.');
  const qty = qtyNum(input.qty);
  if (!(qty > 0) || qty > MAX_QTY) return fail('Please type a quantity greater than zero.');
  const borrower = text(input.borrower, 120);
  if (!borrower) return fail('Please type who is borrowing it.');
  const dateOut = input.dateOut ? input.dateOut : todayISO();
  if (!validDate(dateOut)) return fail('The date is not valid.');
  if (input.dueDate && (!validDate(input.dueDate) || input.dueDate < dateOut)) return fail('The expected return date must be on or after the date taken.');

  const avail = balanceOf(data, it.id) - onLoanOf(data, it.id);
  if (qty > avail) return fail(`Only ${Math.max(0, avail)} ${it.uom} available (the rest are already borrowed or not in stock).`, { code: 'NEGATIVE' });

  const now = nowISO();
  const rec = cleanLoanRecord({
    id: uid(), itemId: it.id, qty, borrower, location: input.location, ref: input.ref,
    dateOut, dueDate: input.dueDate, remarks: input.remarks, returns: [], by: text(by, 60), createdAt: now, updatedAt: now
  });
  data.loans.push(rec);
  return { ok: true, loan: rec };
}

function returnLoan(data, id, input, by) {
  input = input || {};
  const l = data.loans.find(x => x.id === id && !x.deleted);
  if (!l) return fail('That loan no longer exists.');
  const open = Math.round((l.qty - l.returnedQty) * 1000) / 1000;
  if (open <= 0) return fail('This was already returned.');
  const qty = input.qty === '' || input.qty == null ? open : qtyNum(input.qty);
  if (!(qty > 0) || qty > open) return fail(`Return a quantity between 0 and ${open}.`);
  const date = input.date ? input.date : todayISO();
  if (!validDate(date)) return fail('The date is not valid.');
  if (date < l.dateOut) return fail('The return date cannot be before the date it was taken.');
  l.returns.push({ date, qty, remarks: text(input.remarks, 300) });
  l.returnedQty = Math.min(l.qty, Math.round(l.returns.reduce((s, x) => s + x.qty, 0) * 1000) / 1000);
  l.updatedAt = nowISO();
  l.by = text(by, 60) || l.by;
  if (input.condition && CONDITIONS.includes(input.condition)) {
    const it = liveItem(data, l.itemId);
    if (it && input.condition !== 'Good') { it.condition = input.condition; it.updatedAt = nowISO(); }
  }
  return { ok: true, loan: l };
}

function deleteLoan(data, id) {
  const l = data.loans.find(x => x.id === id && !x.deleted);
  if (!l) return fail('That loan no longer exists.');
  l.deleted = true;
  l.updatedAt = nowISO();
  return { ok: true };
}

// ---------- numbers for the screens ----------
function computeStats(data, today) {
  today = validDate(today) ? today : todayISO();
  const cut90 = addDays(today, -90);
  const acc = new Map();
  for (const it of data.items) {
    if (!it.deleted) acc.set(it.id, { inQ: 0, outQ: 0, loaned: 0, last: '', first: '', out90: 0, overdue: 0 });
  }
  for (const m of data.movements) {
    if (m.deleted) continue;
    const a = acc.get(m.itemId);
    if (!a) continue;
    if (m.dir === 'in') a.inQ += m.qty;
    else {
      a.outQ += m.qty;
      if (m.date >= cut90 && m.date <= today && m.reason !== 'Count adjustment' && m.reason !== 'Transferred out') a.out90 += m.qty;
    }
    if (!a.last || m.date > a.last) a.last = m.date;
    if (m.reason !== 'Opening balance' && (!a.first || m.date < a.first)) a.first = m.date;
  }
  for (const l of data.loans) {
    if (l.deleted) continue;
    const a = acc.get(l.itemId);
    if (!a) continue;
    const open = l.qty - l.returnedQty;
    if (open > 0) {
      a.loaned += open;
      if (l.dueDate && l.dueDate < today) a.overdue += open;
    }
  }

  const rows = {};
  for (const it of data.items) {
    if (it.deleted) continue;
    const a = acc.get(it.id);
    const r3 = (n) => Math.round(n * 1000) / 1000;
    const onHand = r3(a.inQ - a.outQ);
    const loaned = r3(a.loaned);
    const windowDays = a.first ? Math.min(90, Math.max(14, daysBetween(a.first, today) + 1)) : 90;
    const avgDaily = a.out90 > 0 ? a.out90 / windowDays : 0;
    let rop = it.minQty || 0;
    if (it.leadTimeDays > 0 && avgDaily > 0) rop = Math.max(rop, Math.ceil(avgDaily * it.leadTimeDays + (it.safetyStock || 0)));
    else rop = Math.max(rop, it.safetyStock || 0);

    let status = 'ok';
    if (it.archived) status = 'archived';
    else if (onHand <= 0) status = 'out';
    else if (rop > 0 && onHand <= rop) status = 'low';
    else if (it.category === TOOLS && onHand - loaned <= 0) status = 'allout';

    let suggest = 0;
    if (status === 'low' || status === 'out') {
      if (it.reorderQty > 0) suggest = it.reorderQty;
      else if (avgDaily > 0 && it.leadTimeDays > 0) suggest = Math.max(1, Math.ceil(avgDaily * it.leadTimeDays));
      else suggest = Math.max(1, Math.ceil(rop * 2 - onHand));
    }
    rows[it.id] = {
      onHand, onLoan: loaned, available: r3(onHand - loaned), status, rop,
      last: a.last, avgDaily: Math.round(avgDaily * 100) / 100,
      coverDays: avgDaily > 0 && onHand > 0 ? Math.floor(onHand / avgDaily) : null,
      suggest, overdue: r3(a.overdue)
    };
  }
  return rows;
}

function summary(data, stats, today) {
  today = validDate(today) ? today : todayISO();
  let items = 0, low = 0, out = 0, onLoan = 0, overdue = 0, calibration = 0;
  const soon = addDays(today, 30);
  for (const it of data.items) {
    if (it.deleted || it.archived) continue;
    const s = stats[it.id];
    items++;
    if (s.status === 'low') low++;
    if (s.status === 'out') out++;
    onLoan += s.onLoan;
    if (s.overdue > 0) overdue++;
    if (it.category === TOOLS && it.calibrationDue && it.calibrationDue <= soon) calibration++;
  }
  return { items, low, out, onLoan, overdue, calibration };
}

// ---------- sharing between PCs ----------
function snapshot(data, from) {
  return { format: FORMAT, version: 1, exportedAt: nowISO(), from: text(from, 80), items: data.items, movements: data.movements, loans: data.loans };
}

function mergeData(local, rawIncoming) {
  if (!rawIncoming || rawIncoming.format !== FORMAT) throw new Error('This is not a Work Helper inventory file.');
  if (rawIncoming.version > 1) throw new Error('This file was made by a newer version of the app. Please update the app first.');
  const incoming = normalizeData(rawIncoming);
  const rep = {
    items: { added: 0, updated: 0 }, movements: { added: 0, updated: 0 }, loans: { added: 0, updated: 0 },
    renamed: [], total: { items: incoming.items.length, movements: incoming.movements.length, loans: incoming.loans.length }
  };
  for (const kind of ['items', 'movements', 'loans']) {
    const index = new Map(local[kind].map((r, i) => [r.id, i]));
    for (const r of incoming[kind]) {
      if (!index.has(r.id)) {
        local[kind].push(r);
        index.set(r.id, local[kind].length - 1);
        if (!r.deleted) rep[kind].added++;
      } else {
        const cur = local[kind][index.get(r.id)];
        if (String(r.updatedAt) > String(cur.updatedAt)) {
          local[kind][index.get(r.id)] = r;
          if (!r.deleted) rep[kind].updated++;
        }
      }
    }
  }
  // two different items that ended up with the same code: the newer one gets a fresh code
  const byCode = new Map();
  for (const it of local.items) {
    if (it.deleted) continue;
    if (!byCode.has(it.code)) byCode.set(it.code, []);
    byCode.get(it.code).push(it);
  }
  for (const [code, list] of byCode) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
    for (const it of list.slice(1)) {
      const to = nextCode(local, it.category);
      rep.renamed.push({ name: it.name, from: code, to });
      it.code = to;
      it.updatedAt = nowISO();
    }
  }
  return rep;
}

// Wipe data. mode 'all' = items, movements and loans; 'moves' = movements and loans only (the item list stays, stock goes back to zero).
function clearData(data, mode) {
  data.movements = []; data.loans = [];
  if (mode === 'all') data.items = [];
  return { ok: true };
}

// Set the minimum / reorder level of many items at once. rows: [{id, minQty, reorderQty}]
function setMinLevels(data, rows) {
  let n = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const it = liveItem(data, r && r.id);
    if (!it) continue;
    const minQty = nonNeg(r.minQty), reorderQty = nonNeg(r.reorderQty);
    if (minQty === it.minQty && reorderQty === it.reorderQty) continue;
    it.minQty = minQty; it.reorderQty = reorderQty; it.updatedAt = nowISO(); n++;
  }
  return { ok: true, changed: n };
}

module.exports = {
  clearData, setMinLevels,
  CATEGORIES, CATEGORY_NAMES, TOOLS, IN_REASONS, OUT_REASONS, CONDITIONS, FORMAT,
  uid, nowISO, todayISO, validDate, addDays, daysBetween, text, qtyNum, normName, cleanCode,
  emptyData, normalizeData, cleanLogo, cleanItemRecord, cleanMoveRecord, cleanLoanRecord,
  nextCode, balanceOf, onLoanOf, liveItem,
  saveItem, deleteItem, addMovement, addMovementsBulk, assignForm, deleteMovement, checkout, returnLoan, deleteLoan,
  computeStats, summary, snapshot, mergeData
};
