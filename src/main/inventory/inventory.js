'use strict';
// Inventory: storage, Excel import/export and sharing between PCs (the Electron side).
// The rules themselves live in inventory-core.js and inventory-import.js.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { dialog, shell, BrowserWindow } = require('electron');
const core = require('./inventory-core');
const imp = require('./inventory-import');

const MAX_BACKUPS = 30;

function registerInventory(ipcMain, ctx) {
  const dir = () => path.join(ctx.userDataDir(), 'inventory');
  const file = () => path.join(dir(), 'inventory.json');
  const backupDir = () => path.join(dir(), 'backups');

  let data = null;
  let uiScope = 'consumables';   // which screen is open: 'consumables' (everything except tools), 'tools' or 'all'
  let pending = null;       // an Excel file that was read and is waiting for "Import"
  let lastBackupDay = '';

  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };
  const pcName = () => { try { return os.hostname().replace(/[^A-Za-z0-9_-]/g, '') || 'PC'; } catch (e) { return 'PC'; } };
  const who = () => {
    if (data && data.settings.user) return data.settings.user;
    try { return os.userInfo().username; } catch (e) { return 'user'; }
  };

  // ---------- saving, loading, backups ----------
  function pruneBackups() {
    try {
      const files = fs.readdirSync(backupDir()).filter(f => /^inventory-.*\.json$/.test(f)).sort();
      for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) fs.unlinkSync(path.join(backupDir(), f));
    } catch (e) {}
  }
  function backup() {
    try {
      if (!fs.existsSync(file())) return;
      fs.mkdirSync(backupDir(), { recursive: true });
      fs.copyFileSync(file(), path.join(backupDir(), `inventory-${stamp()}.json`));
      pruneBackups();
    } catch (e) {}
  }
  function latestBackup() {
    try {
      const files = fs.readdirSync(backupDir()).filter(f => /^inventory-.*\.json$/.test(f)).sort();
      for (let i = files.length - 1; i >= 0; i--) {
        try { return core.normalizeData(JSON.parse(fs.readFileSync(path.join(backupDir(), files[i]), 'utf8'))); } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function load() {
    if (data) return data;
    try {
      data = core.normalizeData(JSON.parse(fs.readFileSync(file(), 'utf8')));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // the file is damaged: keep it aside and go back to the latest backup
        try { fs.renameSync(file(), path.join(dir(), `inventory.damaged-${stamp()}.json`)); } catch (e2) {}
        data = latestBackup() || core.emptyData();
      } else {
        data = core.emptyData();
      }
    }
    return data;
  }

  function save() {
    fs.mkdirSync(dir(), { recursive: true });
    const today = core.todayISO();
    if (lastBackupDay !== today) { backup(); lastBackupDay = today; }   // one backup per day, before the first change
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file());
  }

  // ---------- what the screens need ----------
  function state(scope) {
    scope = scope || uiScope;
    const d = load();
    const today = core.todayISO();
    const stats = core.computeStats(d, today);
    const inScope = (i) => scope === 'all' || ((i.category === core.TOOLS) === (scope === 'tools'));
    const items = d.items.filter(i => !i.deleted && inScope(i)).map(i => Object.assign({}, i, { stat: stats[i.id] }));
    const byId = new Map(items.map(i => [i.id, i]));
    const movements = d.movements.filter(m => !m.deleted && byId.has(m.itemId))
      .map(m => Object.assign({}, m, { itemCode: byId.get(m.itemId).code, itemName: byId.get(m.itemId).name, uom: byId.get(m.itemId).uom }));
    const loans = d.loans.filter(l => !l.deleted && byId.has(l.itemId))
      .map(l => Object.assign({}, l, {
        itemCode: byId.get(l.itemId).code, itemName: byId.get(l.itemId).name, uom: byId.get(l.itemId).uom,
        open: Math.round((l.qty - l.returnedQty) * 1000) / 1000
      }));
    const repairs = (d.repairs || []).filter(r => !r.deleted && byId.has(r.itemId))
      .map(r => Object.assign({}, r, { itemCode: byId.get(r.itemId).code, itemName: byId.get(r.itemId).name, uom: byId.get(r.itemId).uom }));
    const events = core.buildEvents(d).filter(x => byId.has(x.itemId)).map(x => Object.assign(x, { itemCode: byId.get(x.itemId).code, itemName: byId.get(x.itemId).name, uom: byId.get(x.itemId).uom }));
    return {
      today, scope, items, movements, loans, repairs, events, summary: core.summary({ items: items }, stats, today),
      settings: { user: d.settings.user || '', defaultUser: who(), formCompany: d.settings.formCompany || '', formDept: d.settings.formDept || '', formIssuerMode: d.settings.formIssuerMode || 'user', formIssuerName: d.settings.formIssuerName || '', formLogo: d.settings.formLogo || '' },
      categories: core.CATEGORIES.filter(c => scope === 'all' || ((c.name === core.TOOLS) === (scope === 'tools'))), inReasons: core.IN_REASONS, outReasons: core.OUT_REASONS, conditions: core.CONDITIONS, returnConditions: core.RETURN_CONDITIONS,
      folder: dir()
    };
  }

  function mutate(fn) {
    const d = load();
    const r = fn(d);
    if (r && r.ok) { save(); r.state = state(); }
    return r;
  }

  const handle = (name, fn) => ipcMain.handle(name, async (e, ...args) => {
    try { return await fn(e, ...args); }
    catch (err) { return { ok: false, error: 'Something went wrong: ' + err.message }; }
  });

  handle('inv-load', (e, scope) => {
    uiScope = scope === 'tools' ? 'tools' : 'consumables';
    return { ok: true, state: state() };
  });
  handle('inv-item-save', (e, input) => mutate(d => core.saveItem(d, input, who())));
  handle('inv-item-delete', (e, id) => mutate(d => core.deleteItem(d, id)));
  handle('inv-move-save', (e, input, opts) => mutate(d => core.addMovement(d, input, who(), { allowNegative: !!(opts && opts.allowNegative) })));
  handle('inv-move-bulk', (e, rows, opts) => mutate(d => core.addMovementsBulk(d, rows, who(), { allowNegative: !!(opts && opts.allowNegative) })));
  handle('inv-form-assign', (e, moveIds, loanIds) => mutate(d => core.assignForm(d, moveIds, loanIds, core.todayISO())));
  handle('inv-move-delete', (e, id) => mutate(d => core.deleteMovement(d, id)));
  handle('inv-checkout', (e, input) => mutate(d => core.checkout(d, input, who())));
  handle('inv-return', (e, id, input) => mutate(d => core.returnLoan(d, id, input, who())));
  handle('inv-repair-report', (e, input) => mutate(d => core.reportProblem(d, input, who())));
  handle('inv-repair-update', (e, id, input) => mutate(d => core.updateRepair(d, id, input, who())));
  handle('inv-event-undo', (e, ev, dry) => {
    if (dry) { const r = core.undoEvent(load(), ev, { dryRun: true }); return r; }
    return mutate(d => core.undoEvent(d, ev));
  });
  handle('inv-loan-delete', (e, id) => mutate(d => core.deleteLoan(d, id)));
  handle('inv-settings-set', (e, patch) => mutate(d => {
    patch = patch || {};
    if ('user' in patch) d.settings.user = core.text(patch.user, 60);
    if ('formCompany' in patch) d.settings.formCompany = core.text(patch.formCompany, 120);
    if ('formDept' in patch) d.settings.formDept = core.text(patch.formDept, 120);
    if ('formIssuerMode' in patch) d.settings.formIssuerMode = ['user', 'fixed', 'blank'].includes(patch.formIssuerMode) ? patch.formIssuerMode : 'user';
    if ('formLogo' in patch) d.settings.formLogo = core.cleanLogo(patch.formLogo);
    if ('formIssuerName' in patch) d.settings.formIssuerName = core.text(patch.formIssuerName, 120);
    return { ok: true };
  }));
  handle('inv-min-bulk', (e, rows) => mutate(d => core.setMinLevels(d, rows)));
  handle('inv-clear-all', (e, mode) => {
    const d = load();
    mode = mode === 'moves' ? 'moves' : 'all';
    backup();   // a copy of everything is kept first (Open data and backups folder)
    const r = core.clearData(d, mode);
    save();
    r.state = state();
    return r;
  });
  handle('inv-logo-pick', async () => {
    const r = await dialog.showOpenDialog(ctx.getWindow(), {
      title: 'Choose your logo',
      properties: ['openFile'],
      filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    const p = r.filePaths[0];
    if (fs.statSync(p).size > 8 * 1024 * 1024) return { ok: false, error: 'That picture is too big (over 8 MB). Please choose a smaller one.' };
    const ext = path.extname(p).toLowerCase().slice(1);
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }[ext];
    if (!mime) return { ok: false, error: 'Please choose a PNG or JPG picture.' };
    return { ok: true, dataUrl: `data:${mime};base64,${fs.readFileSync(p).toString('base64')}` };
  });
  handle('inv-open-folder', () => { fs.mkdirSync(dir(), { recursive: true }); return shell.openPath(dir()); });

  // ---------- Excel: reading ----------
  function plain(v) {
    if (v == null) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'object') {
      if ('result' in v) return plain(v.result);
      if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
      if ('text' in v) return plain(v.text);
    }
    return null;
  }
  function sheetRows(ws) {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const vals = row.values || [];
      const out = [];
      for (let c = 1; c < vals.length; c++) out.push(plain(vals[c]));
      rows[n - 1] = out;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  }
  const findSheet = (wb, name) => wb.worksheets.find(w => w.name.trim().toLowerCase() === name);

  handle('inv-import-analyze', async (e) => {
    const r = await dialog.showOpenDialog(ctx.getWindow(), {
      title: 'Choose your inventory Excel file',
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    const file0 = r.filePaths[0];

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.readFile(file0); }
    catch (err) { return { ok: false, error: 'That file could not be opened (is it open in Excel, or damaged?): ' + err.message }; }

    let parsed;
    const stock = findSheet(wb, 'stock'), moves = findSheet(wb, 'movements'), loansWs = findSheet(wb, 'borrowed tools');
    const dash = findSheet(wb, 'stock dashboard'), io = findSheet(wb, 'stock in_out_order');
    const tools = findSheet(wb, 'tools'), borrower = findSheet(wb, 'borrower');
    try {
      if (stock) parsed = imp.parseExport(sheetRows(stock), moves ? sheetRows(moves) : [], loansWs ? sheetRows(loansWs) : []);
      else if (dash) parsed = imp.parseConsumables(sheetRows(dash), io ? sheetRows(io) : []);
      else if (tools) parsed = imp.parseTools(sheetRows(tools), borrower ? sheetRows(borrower) : []);
      else return { ok: false, error: 'I could not recognise this workbook. Please choose a file made with More > Export to Excel in this app. It needs a sheet named "Stock" (and, to bring back the history, "Movements" and "Borrowed tools").' };
    } catch (err) {
      return { ok: false, error: err.message };
    }

    pending = parsed;
    const d = load();
    const src = 'import:' + parsed.kind;
    const hasPrior = d.items.some(i => !i.deleted && i.src === src);
    if (parsed.kind === 'export') {
      const live = new Set(d.items.filter(i => !i.deleted && i.src !== src).map(i => i.code));
      const dup = parsed.items.filter(i => i.code && live.has(i.code)).length;
      if (dup) parsed.issues.unshift({ level: 'note', text: `${dup} item code${dup === 1 ? ' is' : 's are'} already used by items in this app. Those items will be added again with new codes. If this file came from this same app, you probably do not need to import it.` });
    }
    return {
      ok: true,
      fileName: path.basename(file0),
      kind: parsed.kind,
      counts: parsed.counts,
      dateRange: parsed.dateRange,
      defaultOpeningDate: parsed.dateRange ? core.addDays(parsed.dateRange.from, -1) : core.todayISO(),
      reconcile: { checked: parsed.reconcile.checked, matched: parsed.reconcile.matched, mismatches: parsed.reconcile.mismatches.slice(0, 30), mismatchCount: parsed.reconcile.mismatches.length },
      issues: parsed.issues.slice(0, 80),
      issueCount: parsed.issues.length,
      hasPrior
    };
  });

  handle('inv-import-apply', (e, opts) => {
    if (!pending) return { ok: false, error: 'Please choose the Excel file again.' };
    const d = load();
    backup();
    const res = imp.applyParsed(d, pending, opts || {}, who());
    pending = null;
    save();
    return { ok: true, result: res, state: state() };
  });

  // ---------- reports: Save as PDF / Print (the page is made in the window, printed here) ----------
  async function withReportWindow(html, fn) {
    const tmp = path.join(os.tmpdir(), 'work-helper-report-' + Date.now() + '.html');
    fs.writeFileSync(tmp, html, 'utf8');
    const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
    try {
      await w.loadFile(tmp);
      return await fn(w);
    } finally {
      try { w.destroy(); } catch (e) {}
      try { fs.unlinkSync(tmp); } catch (e) {}
    }
  }

  handle('inv-report-pdf', async (e, html, opts) => {
    opts = opts || {};
    const safe = String(opts.name || 'inventory-report').replace(/[^\w\- ]+/g, '').trim() || 'inventory-report';
    const r = await dialog.showSaveDialog(ctx.getWindow(), {
      title: 'Save the report as PDF',
      defaultPath: `${safe}-${core.todayISO().replace(/-/g, '')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    const buf = await withReportWindow(String(html), (w) => w.webContents.printToPDF({
      pageSize: 'A4', landscape: !!opts.landscape, printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;color:#666;width:100%;text-align:center;font-family:Arial">Work Helper · Inventory · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margins: { top: 0.4, bottom: 0.6, left: 0.4, right: 0.4 }
    }));
    fs.writeFileSync(r.filePath, buf);
    shell.openPath(r.filePath);
    return { ok: true, path: r.filePath };
  });

  handle('inv-report-print', async (e, html, opts) => {
    opts = opts || {};
    return await withReportWindow(String(html), (w) => new Promise((resolve) => {
      w.webContents.print({ silent: false, printBackground: true, landscape: !!opts.landscape }, (success, reason) => {
        resolve(success ? { ok: true } : { ok: false, error: reason === 'cancelled' || reason === 'canceled' ? 'Printing was cancelled.' : 'Could not print: ' + reason });
      });
    }));
  });

  // ---------- sharing between PCs (email or USB) ----------
  handle('inv-sync-export', async () => {
    const d = load();
    const r = await dialog.showSaveDialog(ctx.getWindow(), {
      title: 'Save the inventory file to send',
      defaultPath: `inventory-${pcName()}-${core.todayISO().replace(/-/g, '')}.whinv`,
      filters: [{ name: 'Work Helper inventory', extensions: ['whinv'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    const snap = core.snapshot(d, pcName());
    fs.writeFileSync(r.filePath, JSON.stringify(snap));
    return {
      ok: true, path: r.filePath,
      counts: { items: snap.items.filter(i => !i.deleted).length, movements: snap.movements.filter(m => !m.deleted).length, loans: snap.loans.filter(l => !l.deleted).length }
    };
  });

  handle('inv-sync-import', async () => {
    const r = await dialog.showOpenDialog(ctx.getWindow(), {
      title: 'Choose the inventory file you received',
      filters: [{ name: 'Work Helper inventory', extensions: ['whinv', 'json'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    let raw;
    try { raw = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); }
    catch (err) { return { ok: false, error: 'That file could not be read. It may be damaged or not an inventory file.' }; }
    const d = load();
    backup();
    let report;
    try { report = core.mergeData(d, raw); }
    catch (err) { return { ok: false, error: err.message }; }
    save();
    return { ok: true, report, from: raw.from || '', exportedAt: raw.exportedAt || '', state: state() };
  });

  // ---------- Excel: writing ----------
  handle('inv-export-excel', async () => {
    const st = state('all');
    const r = await dialog.showSaveDialog(ctx.getWindow(), {
      title: 'Save the inventory report',
      defaultPath: `Inventory-${core.todayISO()}.xlsx`,
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Work Helper';
    wb.created = new Date();
    const asDate = (iso) => (iso ? new Date(iso + 'T00:00:00Z') : null);
    const statusText = { ok: 'OK', low: 'LOW', out: 'OUT OF STOCK', allout: 'ALL BORROWED', archived: 'Archived' };

    function sheet(name, columns, rows) {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = columns.map(c => ({ header: c.h, key: c.k, width: c.w, style: c.fmt ? { numFmt: c.fmt } : {} }));
      rows.forEach(x => ws.addRow(x));
      const head = ws.getRow(1);
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
      head.alignment = { vertical: 'middle', wrapText: true };
      if (columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
      return ws;
    }

    const cat = (i) => i.category;
    const stockRows = st.items.map(i => ({
      code: i.code, name: i.name, cat: cat(i), group: i.group, uom: i.uom,
      onHand: i.stat.onHand, onLoan: i.stat.onLoan, avail: i.stat.available, min: i.minQty || null, rop: i.stat.rop || null,
      status: statusText[i.stat.status] || '', loc: i.location, sup: i.supplier, last: asDate(i.stat.last)
    }));
    const ws1 = sheet('Stock', [
      { h: 'Code', k: 'code', w: 12 }, { h: 'Item', k: 'name', w: 44 }, { h: 'Category', k: 'cat', w: 18 }, { h: 'Group', k: 'group', w: 18 },
      { h: 'Unit', k: 'uom', w: 8 }, { h: 'On hand', k: 'onHand', w: 10 }, { h: 'Borrowed', k: 'onLoan', w: 10 }, { h: 'Available', k: 'avail', w: 10 },
      { h: 'Min level', k: 'min', w: 10 }, { h: 'Reorder point', k: 'rop', w: 12 }, { h: 'Status', k: 'status', w: 16 },
      { h: 'Location', k: 'loc', w: 22 }, { h: 'Supplier', k: 'sup', w: 22 }, { h: 'Last movement', k: 'last', w: 14, fmt: 'yyyy-mm-dd' }
    ], stockRows);
    ws1.eachRow((row, n) => {
      if (n === 1) return;
      const s = String(row.getCell('status').value || '');
      if (s === 'OUT OF STOCK') row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8C9CD' } };
      else if (s === 'LOW') row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE8B3' } };
    });

    sheet('Movements', [
      { h: 'Date', k: 'date', w: 12, fmt: 'yyyy-mm-dd' }, { h: 'Code', k: 'code', w: 12 }, { h: 'Item', k: 'name', w: 44 },
      { h: 'In / Out', k: 'dir', w: 9 }, { h: 'Qty', k: 'qty', w: 9 }, { h: 'Unit', k: 'uom', w: 8 }, { h: 'Reason', k: 'reason', w: 24 },
      { h: 'Department / person', k: 'party', w: 26 }, { h: 'Reference', k: 'ref', w: 16 }, { h: 'Remarks', k: 'remarks', w: 36 }, { h: 'Entered by', k: 'by', w: 14 }
    ], st.movements.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).map(m => ({
      date: asDate(m.date), code: m.itemCode, name: m.itemName, dir: m.dir === 'in' ? 'IN' : 'OUT', qty: m.qty, uom: m.uom,
      reason: m.reason, party: m.party, ref: m.ref, remarks: m.remarks, by: m.by
    })));

    const openLoans = st.loans.filter(l => l.open > 0);
    sheet('Borrowed tools', [
      { h: 'Code', k: 'code', w: 12 }, { h: 'Item', k: 'name', w: 44 }, { h: 'Qty out', k: 'qty', w: 9 }, { h: 'Borrower', k: 'who', w: 26 },
      { h: 'Location', k: 'loc', w: 22 }, { h: 'BRF / ref no.', k: 'ref', w: 16 }, { h: 'Date taken', k: 'out', w: 12, fmt: 'yyyy-mm-dd' },
      { h: 'Expected return', k: 'due', w: 14, fmt: 'yyyy-mm-dd' }, { h: 'Days out', k: 'days', w: 9 }, { h: 'Overdue', k: 'over', w: 9 }, { h: 'Remarks', k: 'remarks', w: 30 }
    ], openLoans.map(l => ({
      code: l.itemCode, name: l.itemName, qty: l.open, who: l.borrower, loc: l.location, ref: l.ref, out: asDate(l.dateOut), due: asDate(l.dueDate),
      days: core.daysBetween(l.dateOut, st.today), over: l.dueDate && l.dueDate < st.today ? 'YES' : '', remarks: l.remarks
    })));

    sheet('Repairs', [
      { h: 'Code', k: 'code', w: 12 }, { h: 'Item', k: 'name', w: 44 }, { h: 'Qty', k: 'qty', w: 8 }, { h: 'Problem', k: 'kind', w: 14 },
      { h: 'Status', k: 'status', w: 12 }, { h: 'Reported', k: 'date', w: 12, fmt: 'yyyy-mm-dd' }, { h: 'Reported by / borrower', k: 'who', w: 26 },
      { h: 'Note', k: 'note', w: 36 }, { h: 'Closed', k: 'closed', w: 12, fmt: 'yyyy-mm-dd' }, { h: 'Closing note', k: 'cnote', w: 30 }
    ], st.repairs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(r => ({
      code: r.itemCode, name: r.itemName, qty: r.qty, kind: r.kind, status: { open: 'Open', fixed: 'Repaired', scrapped: 'Written off', lost: 'Lost' }[r.status] || r.status,
      date: asDate(r.date), who: r.borrower || r.by, note: r.note, closed: asDate(r.closedDate), cnote: r.closedNote
    })));

    sheet('Reorder', [
      { h: 'Code', k: 'code', w: 12 }, { h: 'Item', k: 'name', w: 44 }, { h: 'Unit', k: 'uom', w: 8 }, { h: 'On hand', k: 'onHand', w: 10 },
      { h: 'Reorder point', k: 'rop', w: 12 }, { h: 'Suggested order qty', k: 'suggest', w: 16 }, { h: 'Supplier', k: 'sup', w: 24 }, { h: 'Lead time (days)', k: 'lead', w: 14 }
    ], st.items.filter(i => i.stat.status === 'low' || i.stat.status === 'out').map(i => ({
      code: i.code, name: i.name, uom: i.uom, onHand: i.stat.onHand, rop: i.stat.rop || null, suggest: i.stat.suggest || null, sup: i.supplier, lead: i.leadTimeDays || null
    })));

    sheet('Tools register', [
      { h: 'Code', k: 'code', w: 12 }, { h: 'Tool / equipment', k: 'name', w: 44 }, { h: 'Unit', k: 'uom', w: 8 }, { h: 'Qty', k: 'qty', w: 8 },
      { h: 'Borrowed', k: 'onLoan', w: 10 }, { h: 'Available', k: 'avail', w: 10 }, { h: 'Serial / tag', k: 'serial', w: 22 }, { h: 'Condition', k: 'cond', w: 14 },
      { h: 'Calibration due', k: 'cal', w: 15, fmt: 'yyyy-mm-dd' }, { h: 'Location', k: 'loc', w: 24 }, { h: 'Notes', k: 'notes', w: 36 }
    ], st.items.filter(i => i.category === core.TOOLS).map(i => ({
      code: i.code, name: i.name, uom: i.uom, qty: i.stat.onHand, onLoan: i.stat.onLoan, avail: i.stat.available, serial: i.serial,
      cond: i.condition, cal: asDate(i.calibrationDue), loc: i.location, notes: i.notes
    })));

    try { await wb.xlsx.writeFile(r.filePath); }
    catch (err) { return { ok: false, error: 'Could not save the file (is it open in Excel?): ' + err.message }; }
    return { ok: true, path: r.filePath };
  });
}

module.exports = { registerInventory };
