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
// Tools & Equipment: units can only leave the stock for one of these reasons, and the boss must approve (see needApproval)
const TOOL_OUT_REASONS = ['Lost', 'Written off (damaged beyond repair)', 'Disposed / sold', 'Transferred to another site', 'Correction of a wrong entry'];
const OUT_REASONS = ['Issued / withdrawn', 'Lent to other dept', 'Transferred out', 'Damaged / lost / expired', 'Count adjustment', 'Other'];
const CONDITIONS = ['Good', 'Needs repair', 'Under repair', 'Damaged', 'Lost'];
const RETURN_CONDITIONS = ['Good', 'Needs repair', 'Damaged', 'Lost'];   // what you can pick when a tool comes back
const BAD_KINDS = ['Needs repair', 'Under repair', 'Damaged'];           // tools that are out of service until fixed

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
  return { format: FORMAT, version: 1, items: [], movements: [], loans: [], repairs: [], settings: { user: '', formCompany: '', formDept: '', formIssuerMode: 'user', formIssuerName: '', formLogo: '' } };
}

// a price: a number (two decimals) or null when it is not known. Never required.
function priceNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[,₱\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? Math.round(n * 100) / 100 : null;
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
    price: priceNum(r.price),
    condition: CONDITIONS.includes(r.condition) ? r.condition : '',
    calibrationDue: validDate(r.calibrationDue) ? r.calibrationDue : '',
    photo: cleanPhoto(r.photo),
    by: text(r.by, 60),
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
    approvedBy: text(r.approvedBy, 120),
    party: text(r.party, 120),
    ref: text(r.ref, 80),
    price: priceNum(r.price),
    remarks: text(r.remarks, 500),
    by: text(r.by, 60),
    formNo: text(r.formNo, 30),
    repairId: text(r.repairId, 80),
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
    .map((x, n) => ({ id: text(x && x.id, 80) || (String(r.id).slice(0, 60) + ':' + n), date: validDate(x && x.date) ? x.date : '1970-01-01', qty: qtyNum(x && x.qty), remarks: text(x && x.remarks, 300), returnedBy: text(x && x.returnedBy, 120), receivedBy: text(x && x.receivedBy, 60) }))
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

// A damage / repair log entry: one tool (some units of it) that is out of service, or was lost.
function cleanRepairRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null;
  const qty = qtyNum(r.qty);
  if (!r.deleted && !(qty > 0 && qty <= MAX_QTY)) return null;
  return {
    id: r.id.slice(0, 80),
    itemId: text(r.itemId, 80),
    qty: qty > 0 ? qty : 0,
    kind: ['Needs repair', 'Under repair', 'Damaged', 'Lost'].includes(r.kind) ? r.kind : 'Damaged',
    status: ['open', 'fixed', 'scrapped', 'lost'].includes(r.status) ? r.status : 'open',
    loanId: text(r.loanId, 80),
    returnId: text(r.returnId, 80),
    borrower: text(r.borrower, 120),
    date: validDate(r.date) ? r.date : todayISO(),
    note: text(r.note, 500),
    photos: cleanPhotoList(r.photos),
    closedDate: validDate(r.closedDate) ? r.closedDate : '',
    closedNote: text(r.closedNote, 300),
    by: text(r.by, 60),
    src: text(r.src, 40),
    createdAt: text(r.createdAt, 40) || nowISO(),
    updatedAt: text(r.updatedAt, 40) || nowISO(),
    deleted: !!r.deleted
  };
}

// An equipment picture is kept as a small JPEG / PNG / WebP inside the item (data URL), never a path to a file,
// so it travels with backups and with the file you send to the other PC.
const MAX_PHOTO = 250000;
// A picture is either the name of a file in the photos folder (what is stored: "ph-<20 hex>.jpg") or, on its way in
// from the screen / from a file sent by another PC, a data URL that the Electron side turns into such a file.
const PHOTO_NAME = /^ph-[0-9a-f]{16,40}\.(jpg|png|webp)$/;
const PHOTO_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
function cleanPhoto(v) {
  v = typeof v === 'string' ? v : '';
  if (PHOTO_NAME.test(v)) return v;
  return PHOTO_DATA.test(v) && v.length <= MAX_PHOTO ? v : '';
}

// Photos of the damage (up to 3 per report, each may carry the user's own mark-up). Same rules as cleanPhoto.
const MAX_DAMAGE_PHOTOS = 3;
function cleanPhotoList(v) {
  return Array.isArray(v) ? v.map(cleanPhoto).filter(Boolean).slice(0, MAX_DAMAGE_PHOTOS) : [];
}
// null when the list is fine (or not sent), otherwise a fail() result
function checkPhotoList(v) {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) return fail('The photos could not be used.');
  if (v.length > MAX_DAMAGE_PHOTOS) return fail(`You can add up to ${MAX_DAMAGE_PHOTOS} photos to one damage report.`);
  if (v.some(x => !cleanPhoto(x))) return fail('One of the photos could not be used. Please choose JPG, PNG or WebP pictures.');
  return null;
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
  d.repairs = (Array.isArray(raw.repairs) ? raw.repairs : []).map(cleanRepairRecord).filter(Boolean);
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
// units of this item that are out of service (damaged / waiting for repair)
function inRepairOf(data, itemId) {
  let n = 0;
  for (const r of data.repairs || []) {
    if (r.deleted || r.itemId !== itemId || r.status !== 'open') continue;
    n += r.qty;
  }
  return Math.round(n * 1000) / 1000;
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
  if (input.price !== undefined && input.price !== '' && input.price != null && priceNum(input.price) === null) return fail('The price must be a number, zero or more.');
  if (input.calibrationDue && !validDate(input.calibrationDue)) return fail('The calibration date is not a valid date.');
  // the picture: keep the old one unless a new one (or an empty one, meaning "remove") was sent
  let photo = old ? old.photo : '';
  if (input.photo !== undefined) {
    photo = cleanPhoto(input.photo);
    if (input.photo && !photo) return fail('That picture could not be used. Please choose a JPG, PNG or WebP picture.');
  }
  if (category === TOOLS && !photo && !(old && old.category === TOOLS && !old.photo && input.photo === undefined)) {
    return fail('Please add a picture of the tool or equipment, so everyone can recognise it.', { code: 'PHOTO' });
  }

  const now = nowISO();
  const rec = cleanItemRecord({
    id: old ? old.id : uid(), code, name, category,
    group: input.group, uom, location: input.location, supplier: input.supplier, barcode: input.barcode,
    minQty: input.minQty, reorderQty: input.reorderQty, leadTimeDays: input.leadTimeDays, safetyStock: input.safetyStock,
    serial: input.serial, price: input.price !== undefined ? input.price : (old ? old.price : null), condition: input.condition, calibrationDue: input.calibrationDue, photo,
    notes: input.notes, archived: input.archived,
    formNo: old ? old.formNo : '',
    by: old ? old.by : text(by, 60),
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

// Removing tools from the stock needs the boss: a reason, a note about what happened and the name of the person who approved it.
// (The admin PIN itself is checked on the Electron side, see inventory.js.)
function needApproval(input, noteText) {
  if (text(noteText, 500).length < 5) return fail('Please explain what happened (at least a few words).', { code: 'NOTE' });
  if (text(input && input.approvedBy, 120).length < 2) return fail('Type the name of the boss who approved this.', { code: 'APPROVER' });
  return null;
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

  if (dir === 'in' && input.price !== undefined && input.price !== '' && input.price != null && priceNum(input.price) === null) return fail('The price must be a number, zero or more.');
  if (dir === 'out' && it.category === TOOLS) {
    if (!TOOL_OUT_REASONS.includes(input.reason)) return fail('Choose why the units are being removed.', { code: 'REASON' });
    const bad = needApproval(input, input.remarks);
    if (bad) return bad;
  }

  const bal = balanceOf(data, it.id, old && old.id);
  const loaned = onLoanOf(data, it.id);
  const broken = inRepairOf(data, it.id);
  const after = dir === 'in' ? bal + qty : bal - qty;
  // a returned tool must go through Borrowed tools > Return, otherwise the stock goes up and the borrowed count never goes down
  if (dir === 'in' && it.category === TOOLS && loaned > 0 && !old && /return|bumalik|back/i.test(String(input.reason || ''))) {
    return fail(`${it.name} has ${loaned} borrowed. To record a returned tool, use Borrowed tools > Return. Stock In would add new units and the borrowed count would not go down.`, { code: 'USE_RETURN' });
  }
  if (dir === 'out' && !opts.allowNegative) {
    if (after < 0) return fail(`Only ${bal} ${it.uom} on hand.`, { code: 'NEGATIVE', onHand: bal });
    if (after < loaned) return fail(`${loaned} ${it.uom} of this item are currently borrowed, so only ${Math.max(0, bal - loaned)} can leave stock.`, { code: 'NEGATIVE', onHand: bal });
    if (after < loaned + broken) return fail(`${broken} ${it.uom} of this item are damaged or under repair. Use the Repairs tab to write them off.`, { code: 'NEGATIVE', onHand: bal });
  }

  const now = nowISO();
  const rec = cleanMoveRecord({
    id: old ? old.id : uid(), itemId: it.id, dir, qty, date,
    reason: input.reason || (dir === 'in' ? IN_REASONS[0] : OUT_REASONS[0]),
    party: input.party, ref: input.ref, price: dir === 'in' ? input.price : null, remarks: input.remarks, by: text(by, 60), approvedBy: dir === 'out' && it.category === TOOLS ? input.approvedBy : '',
    src: old ? old.src : '', createdAt: old ? old.createdAt : now, updatedAt: now, deleted: false
  });
  if (old) data.movements[data.movements.indexOf(old)] = rec;
  else data.movements.push(rec);
  // a purchase price typed with new units becomes the tool's current value (the latest price wins)
  if (dir === 'in' && rec.price != null && !old) { it.price = rec.price; it.updatedAt = now; }
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
    if (bal < onLoanOf(data, m.itemId) + inRepairOf(data, m.itemId)) return fail('Deleting this entry would leave fewer tools in stock than are borrowed or damaged. Undo the lend / damage entries first.');
  }
  m.deleted = true;
  m.updatedAt = nowISO();
  // a stock-out made by "Lost" or "Write off" also undoes its repair entry
  if (m.repairId) {
    const r = (data.repairs || []).find(x => x.id === m.repairId && !x.deleted);
    if (r) {
      if (r.status === 'scrapped') { r.status = 'open'; r.closedDate = ''; r.closedNote = ''; }
      else { r.deleted = true; }
      r.updatedAt = nowISO();
      const it = liveItem(data, r.itemId);
      if (it) syncCondition(data, it);
    }
  }
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

  const avail = balanceOf(data, it.id) - onLoanOf(data, it.id) - inRepairOf(data, it.id);
  if (qty > avail) return fail(`Only ${Math.max(0, avail)} ${it.uom} available (the rest are already borrowed, damaged or not in stock).`, { code: 'NEGATIVE' });

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
  const badPhotos = RETURN_CONDITIONS.includes(input.condition) && input.condition !== 'Good' ? checkPhotoList(input.photos) : null;
  if (badPhotos) return badPhotos;
  const noApproval = input.condition === 'Lost' ? needApproval(input, input.remarks) : null;
  if (noApproval) return noApproval;
  const retId = uid();
  // who brought it back (the borrower unless someone else did) and who checked it in
  l.returns.push({ id: retId, date, qty, remarks: text(input.remarks, 300), returnedBy: text(input.returnedBy, 120) || l.borrower, receivedBy: text(input.receivedBy, 60) || text(by, 60) });
  l.returnedQty = Math.min(l.qty, Math.round(l.returns.reduce((s, x) => s + x.qty, 0) * 1000) / 1000);
  l.updatedAt = nowISO();
  l.by = text(by, 60) || l.by;
  const cond = RETURN_CONDITIONS.includes(input.condition) ? input.condition : 'Good';
  if (cond !== 'Good') {
    const it = liveItem(data, l.itemId);
    if (it) {
      let bad = input.badQty === '' || input.badQty == null ? qty : qtyNum(input.badQty);
      if (!(bad > 0)) bad = qty;
      bad = Math.min(bad, qty);
      logProblem(data, it, { kind: cond, qty: bad, date, note: input.remarks, photos: input.photos, approvedBy: input.approvedBy, loanId: l.id, returnId: retId, borrower: l.borrower }, by);
    }
  }
  return { ok: true, loan: l };
}

// ---------- damaged / lost tools ----------
function stockOut(data, it, qty, date, remarks, by, reason, repairId, approvedBy) {
  const now = nowISO();
  data.movements.push(cleanMoveRecord({
    id: uid(), itemId: it.id, dir: 'out', qty, date, reason: reason || 'Damaged / lost / expired',
    remarks, by: text(by, 60), approvedBy: text(approvedBy, 120), repairId: repairId || '', createdAt: now, updatedAt: now
  }));
}

// keeps the item's Condition field in step with its open repairs
function syncCondition(data, it) {
  const open = (data.repairs || []).filter(r => !r.deleted && r.itemId === it.id && r.status === 'open');
  let c = it.condition;
  if (open.length) c = ['Damaged', 'Under repair', 'Needs repair'].find(k => open.some(r => r.kind === k)) || 'Damaged';
  else if (BAD_KINDS.includes(c)) c = 'Good';
  if (c !== it.condition) { it.condition = c; it.updatedAt = nowISO(); }
}

function logProblem(data, it, x, by) {
  const now = nowISO();
  const lost = x.kind === 'Lost';
  const rec = cleanRepairRecord({
    id: uid(), itemId: it.id, qty: x.qty, kind: x.kind, status: lost ? 'lost' : 'open', loanId: x.loanId, returnId: x.returnId, borrower: x.borrower,
    date: x.date, note: x.note, photos: x.photos, closedDate: lost ? x.date : '', closedNote: lost ? 'Lost, removed from stock' : '', by: text(by, 60), createdAt: now, updatedAt: now
  });
  data.repairs.push(rec);
  if (lost) stockOut(data, it, x.qty, rec.date, 'Lost' + (x.borrower ? ' by ' + x.borrower : '') + (x.note ? ': ' + x.note : ''), by, 'Lost', rec.id, x.approvedBy);
  syncCondition(data, it);
  return rec;
}

// Report a damaged / lost tool without a return (found broken in the store, for example)
function reportProblem(data, input, by) {
  input = input || {};
  const it = liveItem(data, input.itemId);
  if (!it) return fail('Please choose an item from the list.');
  const kind = ['Needs repair', 'Damaged', 'Lost'].includes(input.kind) ? input.kind : '';
  if (!kind) return fail('Choose Needs repair, Damaged or Lost.');
  const qty = qtyNum(input.qty);
  if (!(qty > 0) || qty > MAX_QTY) return fail('Please type a quantity greater than zero.');
  const date = input.date ? input.date : todayISO();
  if (!validDate(date)) return fail('The date is not valid.');
  const free = balanceOf(data, it.id) - onLoanOf(data, it.id) - inRepairOf(data, it.id);
  if (qty > free) return fail(`Only ${Math.max(0, free)} ${it.uom} are in the store and in good order. Borrowed tools are reported when they are returned.`);
  const bad = checkPhotoList(input.photos) || (kind === 'Lost' ? needApproval(input, input.note) : null);
  if (bad) return bad;
  const rec = logProblem(data, it, { kind, qty, date, note: input.note, photos: input.photos, approvedBy: input.approvedBy }, by);
  return { ok: true, repair: rec };
}

// action: 'fixed' (back in service), 'scrap' (write off, leaves stock), 'delete' (entered by mistake)
function updateRepair(data, id, input, by) {
  input = input || {};
  const r = (data.repairs || []).find(x => x.id === id && !x.deleted);
  if (!r) return fail('That repair entry no longer exists.');
  const it = liveItem(data, r.itemId);
  const date = input.date ? input.date : todayISO();
  if (!validDate(date)) return fail('The date is not valid.');
  const now = nowISO();
  if (input.action === 'delete') {
    r.deleted = true; r.updatedAt = now;
  } else if (input.action === 'photos') {
    // add / replace the damage photos of an entry at any time (also after it is closed)
    const bad = checkPhotoList(input.photos);
    if (bad) return bad;
    r.photos = cleanPhotoList(input.photos); r.updatedAt = now;
  } else if (r.status !== 'open') {
    return fail('This entry is already closed.');
  } else if (input.action === 'fixed') {
    r.status = 'fixed'; r.closedDate = date; r.closedNote = text(input.note, 300); r.updatedAt = now;
  } else if (input.action === 'scrap') {
    if (!it) return fail('The item no longer exists.');
    const bad = needApproval(input, input.note);
    if (bad) return bad;
    r.status = 'scrapped'; r.closedDate = date; r.closedNote = text(input.note, 300); r.updatedAt = now;
    stockOut(data, it, r.qty, date, 'Written off after damage' + (input.note ? ': ' + text(input.note, 200) : ''), by, 'Written off (damaged beyond repair)', r.id, input.approvedBy);
  } else {
    return fail('Unknown action.');
  }
  if (it) syncCondition(data, it);
  return { ok: true };
}

// ---------- the log: every lend, return, damage report and repair as one line each ----------
function buildEvents(data) {
  const ev = [];
  for (const l of data.loans) {
    if (l.deleted || !liveItem(data, l.itemId)) continue;
    ev.push({ key: 'lend:' + l.id, type: 'lend', id: l.id, itemId: l.itemId, date: l.dateOut, qty: l.qty, who: l.borrower, ref: l.ref, remarks: l.remarks, by: l.by, formNo: l.formNo, createdAt: l.createdAt });
    for (const x of l.returns) {
      ev.push({ key: 'return:' + x.id, type: 'return', id: l.id, returnId: x.id, itemId: l.itemId, date: x.date, qty: x.qty, who: x.returnedBy || l.borrower, ref: l.ref, remarks: [x.remarks, x.receivedBy ? 'Received by ' + x.receivedBy : ''].filter(Boolean).join(' · '), by: l.by, createdAt: x.date + 'T23:59' });
    }
  }
  for (const r of data.repairs || []) {
    if (r.deleted || r.status === 'lost' || !liveItem(data, r.itemId)) continue;
    ev.push({ key: 'damage:' + r.id, type: 'damage', id: r.id, itemId: r.itemId, date: r.date, qty: r.qty, who: r.borrower, remarks: r.kind + (r.note ? ': ' + r.note : ''), by: r.by, createdAt: r.createdAt });
    if (r.status === 'fixed') {
      ev.push({ key: 'repaired:' + r.id, type: 'repaired', id: r.id, itemId: r.itemId, date: r.closedDate, qty: r.qty, who: '', remarks: r.closedNote, by: r.by, createdAt: r.updatedAt });
    }
  }
  return ev;
}

// Undo one line of the log and everything that came from it. opts.dryRun only lists what would happen.
function undoEvent(data, ev, opts) {
  opts = opts || {};
  ev = ev || {};
  const effects = [];
  const touched = new Set();
  const repairs = data.repairs || [];
  const linkedMoves = (rid) => data.movements.filter(m => !m.deleted && m.repairId === rid);
  const killRepair = (r) => {
    effects.push(`Remove the "${r.kind}" report for ${r.qty} unit${r.qty === 1 ? '' : 's'}`);
    linkedMoves(r.id).forEach(m => effects.push(`Remove the stock-out entry of ${m.qty} (${m.reason})`));
    touched.add(r.itemId);
  };
  const doKill = (r) => {
    r.deleted = true; r.updatedAt = nowISO();
    linkedMoves(r.id).forEach(m => { m.deleted = true; m.updatedAt = nowISO(); });
  };
  let apply;

  if (ev.type === 'lend' || ev.type === 'return') {
    const l = data.loans.find(x => x.id === ev.id && !x.deleted);
    if (!l) return fail('That record no longer exists.');
    if (ev.type === 'lend') {
      const reps = repairs.filter(r => !r.deleted && r.loanId === l.id);
      effects.push(`Cancel the loan of ${l.qty} to ${l.borrower || '(no name)'}`);
      if (l.returns.length) effects.push(`Remove its ${l.returns.length} return entr${l.returns.length === 1 ? 'y' : 'ies'}`);
      reps.forEach(killRepair);
      apply = () => { l.deleted = true; l.updatedAt = nowISO(); reps.forEach(doKill); };
    } else {
      const ret = l.returns.find(x => x.id === ev.returnId);
      if (!ret) return fail('That return no longer exists.');
      const reps = repairs.filter(r => !r.deleted && r.returnId === ret.id);
      effects.push(`Mark ${ret.qty} unit${ret.qty === 1 ? '' : 's'} as borrowed by ${l.borrower || '(no name)'} again`);
      reps.forEach(killRepair);
      // the tools must still be in the store to be borrowed again
      const back = reps.reduce((n, r) => n + linkedMoves(r.id).reduce((a, m) => a + m.qty, 0), 0);
      const brokenAfter = inRepairOf(data, l.itemId) - reps.filter(r => r.status === 'open').reduce((n, r) => n + r.qty, 0);
      if (balanceOf(data, l.itemId) + back - onLoanOf(data, l.itemId) - ret.qty - brokenAfter < 0) {
        return fail('Those tools are not free any more (they were lent again or are damaged). Undo the later entries first.');
      }
      apply = () => {
        l.returns = l.returns.filter(x => x.id !== ret.id);
        l.returnedQty = Math.min(l.qty, Math.round(l.returns.reduce((n, x) => n + x.qty, 0) * 1000) / 1000);
        l.updatedAt = nowISO();
        reps.forEach(doKill);
      };
    }
    touched.add(l.itemId);
  } else if (ev.type === 'damage') {
    const r = repairs.find(x => x.id === ev.id && !x.deleted);
    if (!r) return fail('That record no longer exists.');
    killRepair(r);
    apply = () => doKill(r);
  } else if (ev.type === 'repaired') {
    const r = repairs.find(x => x.id === ev.id && !x.deleted && x.status === 'fixed');
    if (!r) return fail('That record no longer exists.');
    effects.push(`Put ${r.qty} unit${r.qty === 1 ? '' : 's'} back to "${r.kind}" (out of service)`);
    touched.add(r.itemId);
    apply = () => { r.status = 'open'; r.closedDate = ''; r.closedNote = ''; r.updatedAt = nowISO(); };
  } else {
    return fail('Unknown entry.');
  }

  if (opts.dryRun) return { ok: true, effects };
  apply();
  touched.forEach(id => { const it = liveItem(data, id); if (it) syncCondition(data, it); });
  return { ok: true, effects };
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
    if (!it.deleted) acc.set(it.id, { inQ: 0, outQ: 0, loaned: 0, broken: 0, last: '', first: '', out90: 0, overdue: 0 });
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

  for (const r of data.repairs || []) {
    if (r.deleted || r.status !== 'open') continue;
    const a = acc.get(r.itemId);
    if (a) a.broken += r.qty;
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
    else if (it.category === TOOLS && onHand - loaned - a.broken <= 0) status = 'allout';

    let suggest = 0;
    if (status === 'low' || status === 'out') {
      if (it.reorderQty > 0) suggest = it.reorderQty;
      else if (avgDaily > 0 && it.leadTimeDays > 0) suggest = Math.max(1, Math.ceil(avgDaily * it.leadTimeDays));
      else suggest = Math.max(1, Math.ceil(rop * 2 - onHand));
    }
    rows[it.id] = {
      onHand, onLoan: loaned, inRepair: r3(a.broken), available: Math.max(0, r3(onHand - loaned - a.broken)), status, rop,
      last: a.last, avgDaily: Math.round(avgDaily * 100) / 100,
      coverDays: avgDaily > 0 && onHand > 0 ? Math.floor(onHand / avgDaily) : null,
      suggest, overdue: r3(a.overdue)
    };
  }
  return rows;
}

function summary(data, stats, today) {
  today = validDate(today) ? today : todayISO();
  let items = 0, low = 0, out = 0, onLoan = 0, overdue = 0, calibration = 0, damaged = 0;
  const soon = addDays(today, 30);
  for (const it of data.items) {
    if (it.deleted || it.archived) continue;
    const s = stats[it.id];
    items++;
    if (s.status === 'low') low++;
    if (s.status === 'out') out++;
    onLoan += s.onLoan;
    damaged += s.inRepair || 0;
    if (s.overdue > 0) overdue++;
    if (it.category === TOOLS && it.calibrationDue && it.calibrationDue <= soon) calibration++;
  }
  return { items, low, out, onLoan, overdue, calibration, damaged };
}

// ---------- sharing between PCs ----------
function snapshot(data, from) {
  return { format: FORMAT, version: 1, exportedAt: nowISO(), from: text(from, 80), items: data.items, movements: data.movements, loans: data.loans, repairs: data.repairs || [] };
}

function mergeData(local, rawIncoming) {
  if (!rawIncoming || rawIncoming.format !== FORMAT) throw new Error('This is not a Work Helper inventory file.');
  if (rawIncoming.version > 1) throw new Error('This file was made by a newer version of the app. Please update the app first.');
  const incoming = normalizeData(rawIncoming);
  const rep = {
    items: { added: 0, updated: 0 }, movements: { added: 0, updated: 0 }, loans: { added: 0, updated: 0 }, repairs: { added: 0, updated: 0 },
    renamed: [], total: { items: incoming.items.length, movements: incoming.movements.length, loans: incoming.loans.length }
  };
  for (const kind of ['items', 'movements', 'loans', 'repairs']) {
    if (!local[kind]) local[kind] = [];
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
  data.movements = []; data.loans = []; data.repairs = [];
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
  CATEGORIES, CATEGORY_NAMES, TOOLS, IN_REASONS, OUT_REASONS, TOOL_OUT_REASONS, CONDITIONS, FORMAT,
  uid, nowISO, todayISO, validDate, addDays, daysBetween, text, qtyNum, normName, cleanCode,
  emptyData, normalizeData, cleanLogo, cleanItemRecord, cleanPhoto, PHOTO_NAME, PHOTO_DATA, cleanPhotoList, MAX_DAMAGE_PHOTOS, cleanMoveRecord, cleanLoanRecord, cleanRepairRecord,
  nextCode, balanceOf, onLoanOf, inRepairOf, liveItem, RETURN_CONDITIONS, BAD_KINDS,
  saveItem, deleteItem, addMovement, addMovementsBulk, assignForm, deleteMovement, checkout, returnLoan, reportProblem, updateRepair, buildEvents, undoEvent, deleteLoan,
  computeStats, summary, snapshot, mergeData
};
