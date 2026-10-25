'use strict';
// Punch list: storage, photos, PDF / print / Excel output (the Electron side).
// Data: punch.json in the app data folder; pictures: punch-img\ folder (small JPEG files).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { dialog, shell, BrowserWindow } = require('electron');

const STATUSES = ['Open', 'In progress', 'Done', 'Verified'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const MAX_PHOTOS = 6;

const text = (v, n) => String(v == null ? '' : v).slice(0, n);
const iso = () => new Date().toISOString();
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const day = (s) => (isDay(s) ? s : '');
const todayISO = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

function cleanPhoto(p) {
  if (!p || typeof p.f !== 'string' || !/^[\w\-]+\.jpg$/.test(p.f)) return null;
  return { f: p.f, w: Math.max(1, Math.min(4000, Number(p.w) || 800)), h: Math.max(1, Math.min(4000, Number(p.h) || 600)) };
}
function cleanItem(i) {
  if (!i || typeof i !== 'object') return null;
  return {
    id: typeof i.id === 'string' && i.id ? i.id.slice(0, 80) : crypto.randomUUID(),
    no: text(i.no, 30),
    title: text(i.title, 200),
    description: text(i.description, 5000),
    location: text(i.location, 200),
    category: text(i.category, 80),
    priority: PRIORITIES.includes(i.priority) ? i.priority : 'Medium',
    status: STATUSES.includes(i.status) ? i.status : 'Open',
    responsible: text(i.responsible, 120),
    raisedBy: text(i.raisedBy, 120),
    dateRaised: day(i.dateRaised),
    due: day(i.due),
    dateDone: day(i.dateDone),
    remarks: text(i.remarks, 3000),
    photos: (Array.isArray(i.photos) ? i.photos : []).map(cleanPhoto).filter(Boolean).slice(0, MAX_PHOTOS),
    createdAt: text(i.createdAt, 40) || iso(),
    updatedAt: text(i.updatedAt, 40) || iso()
  };
}
function cleanList(l) {
  if (!l || typeof l !== 'object') return null;
  return {
    id: typeof l.id === 'string' && l.id ? l.id.slice(0, 80) : crypto.randomUUID(),
    name: text(l.name, 120) || 'Punch list',
    project: text(l.project, 200),
    prefix: (text(l.prefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, '')) || 'PL',
    next: Math.max(1, Math.floor(Number(l.next) || 1)),
    items: (Array.isArray(l.items) ? l.items : []).map(cleanItem).filter(Boolean),
    createdAt: text(l.createdAt, 40) || iso(),
    updatedAt: text(l.updatedAt, 40) || iso()
  };
}

// ---------- Excel layouts (pure: takes an ExcelJS class, returns a workbook) ----------
const COLORS = { head: 'FF1F3A5F', headText: 'FFFFFFFF', band: 'FFF3F6FA', line: 'FFB8C2CC', High: 'FFF8D7DA', Medium: 'FFFFF3CD', Low: 'FFD9EAD3' };
const THIN = { style: 'thin', color: { argb: COLORS.line } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function groupItems(items, key) {
  const m = new Map();
  items.forEach(it => { const k = (key === 'none' ? '' : (it[key] || '')) || '(none)'; if (!m.has(k)) m.set(k, []); m.get(k).push(it); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
function counts(items, key, order) {
  const c = {}; (order || []).forEach(k => { c[k] = 0; });
  items.forEach(i => { const k = i[key] || '(none)'; c[k] = (c[k] || 0) + 1; });
  return c;
}

function buildWorkbook(ExcelJS, list, items, layout, o, imgOf) {
  const wb = new ExcelJS.Workbook();
  wb.creator = o.preparedBy || 'Work Helper';
  wb.created = new Date();
  const title = o.title || list.name;
  const withPhotos = !!o.photos;
  const logoId = o.logo ? (() => { try { return wb.addImage({ buffer: Buffer.from(String(o.logo).split(',')[1] || '', 'base64'), extension: /image\/png/.test(o.logo) ? 'png' : 'jpeg' }); } catch (e) { return null; } })() : null;

  function sheet(name, cols, landscape) {
    const ws = wb.addWorksheet(name.slice(0, 30), { pageSetup: { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ showGridLines: false }] });
    ws.columns = cols.map(c => ({ width: c }));
    return ws;
  }
  function heading(ws, ncols) {
    let r = 1;
    if (logoId != null) { try { ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 55 } }); } catch (e) {} }
    ws.getRow(1).height = 22; ws.getRow(2).height = 22; ws.getRow(3).height = 18;
    const put = (row, val, font) => { ws.mergeCells(row, 3, row, ncols); const c = ws.getCell(row, 3); c.value = val; c.font = font; c.alignment = { vertical: 'middle' }; };
    put(1, o.company || '', { bold: true, size: 14 });
    put(2, title, { bold: true, size: 16 });
    const bits = [o.project ? 'Project: ' + o.project : '', 'Date: ' + (o.date || todayISO()), o.preparedBy ? 'Prepared by: ' + o.preparedBy : '', 'Items: ' + items.length].filter(Boolean).join('   ·   ');
    put(3, bits, { size: 10, color: { argb: 'FF555555' } });
    return 5;
  }
  function headRow(ws, r, labels) {
    const row = ws.getRow(r);
    labels.forEach((l, i) => { const c = row.getCell(i + 1); c.value = l; c.font = { bold: true, color: { argb: COLORS.headText } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.head } }; c.border = BORDER; c.alignment = { vertical: 'middle', wrapText: true }; });
    row.height = 22;
  }
  function body(c, wrap) { c.border = BORDER; c.alignment = { vertical: 'top', wrapText: wrap !== false }; }
  function prio(c, p) { if (COLORS[p]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS[p] } }; }
  function place(ws, it, k, col, row, maxW, maxH) {
    const ph = it.photos[k]; const im = ph && imgOf(ph);
    if (!im) return false;
    const id = wb.addImage({ buffer: im, extension: 'jpeg' });
    const s = Math.min(maxW / ph.w, maxH / ph.h, 1);
    ws.addImage(id, { tl: { col, row }, ext: { width: Math.round(ph.w * s), height: Math.round(ph.h * s) } });
    return true;
  }
  const describe = (it) => (it.title ? it.title + (it.description ? '\n' : '') : '') + it.description;

  if (layout === 'register' || layout === 'closeout') {
    const closeout = layout === 'closeout';
    const cols = closeout ? [5, 11, 40, 22, 18, 12, 12, 14, 18, 22] : (withPhotos ? [11, 38, 20, 14, 9, 18, 12, 12, 24, 22] : [11, 44, 22, 14, 9, 20, 12, 12, 28]);
    const ws = sheet(closeout ? 'Close-out' : 'Register', cols, true);
    let r = heading(ws, cols.length);
    const labels = closeout ? ['Done', 'No.', 'Description', 'Location', 'Responsible', 'Due', 'Date done', 'Checked by', 'Signature', 'Remarks']
      : ['No.', 'Description', 'Location', 'Category', 'Priority', 'Responsible', 'Due', 'Status', 'Remarks'].concat(withPhotos ? ['Photo'] : []);
    headRow(ws, r++, labels);
    items.forEach(it => {
      const row = ws.getRow(r);
      const vals = closeout ? ['☐', it.no, describe(it), it.location, it.responsible, it.due, it.dateDone, '', '', it.remarks]
        : [it.no, describe(it), it.location, it.category, it.priority, it.responsible, it.due, it.status, it.remarks];
      vals.forEach((v, i) => { const c = row.getCell(i + 1); c.value = v; body(c); });
      if (closeout) { row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }; row.getCell(1).font = { size: 14 }; }
      else prio(row.getCell(5), it.priority);
      let h = Math.max(20, Math.min(180, 15 * Math.ceil(describe(it).length / (closeout ? 42 : 46)) + 6));
      if (!closeout && withPhotos) { const c = row.getCell(10); body(c); if (place(ws, it, 0, 9, r - 1, 150, 90)) h = Math.max(h, 96); }
      if (closeout) h = Math.max(h, 30);
      row.height = h; r++;
    });
    ws.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
  } else if (layout === 'cards') {
    const ws = sheet('Items', [14, 20, 20, 20, 20, 20], false);
    let r = heading(ws, 6);
    items.forEach(it => {
      ws.mergeCells(r, 1, r, 6);
      let c = ws.getCell(r, 1); c.value = it.no + (it.title ? '  ·  ' + it.title : ''); c.font = { bold: true, size: 12, color: { argb: COLORS.headText } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.head } }; c.alignment = { vertical: 'middle' }; ws.getRow(r).height = 24; r++;
      const pair = (a, b, label, val) => { const l = ws.getCell(r, a); l.value = label; l.font = { bold: true, color: { argb: 'FF555555' } }; l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.band } }; l.border = BORDER; ws.mergeCells(r, a + 1, r, b); const v = ws.getCell(r, a + 1); v.value = val; v.border = BORDER; };
      pair(1, 3, 'Location', it.location); pair(4, 6, 'Category', it.category); r++;
      pair(1, 3, 'Responsible', it.responsible); pair(4, 6, 'Priority', it.priority); prio(ws.getCell(r, 5), it.priority); r++;
      pair(1, 3, 'Raised', [it.dateRaised, it.raisedBy].filter(Boolean).join('  ')); pair(4, 6, 'Due', it.due); r++;
      pair(1, 3, 'Status', it.status + (it.dateDone ? ' (' + it.dateDone + ')' : '')); pair(4, 6, '', ''); r++;
      ws.mergeCells(r, 1, r, 6); c = ws.getCell(r, 1); c.value = [it.description, it.remarks ? 'Remarks: ' + it.remarks : ''].filter(Boolean).join('\n'); c.alignment = { wrapText: true, vertical: 'top' }; c.border = BORDER;
      ws.getRow(r).height = Math.max(30, Math.min(220, 15 * Math.ceil(c.value.length / 90) + 8)); r++;
      if (withPhotos && it.photos.length) {
        const pxW = [14, 20, 20, 20, 20, 20].map(w => w * 7 + 5);
        const colAt = (px) => { let c = 0; while (c < pxW.length - 1 && px >= pxW[c]) { px -= pxW[c]; c++; } return c + px / pxW[c]; };
        for (let rowStart = 0; rowStart < it.photos.length; rowStart += 3) {
          for (let k = rowStart; k < Math.min(rowStart + 3, it.photos.length); k++) place(ws, it, k, colAt(4 + (k - rowStart) * 270), r - 1, 255, 190);
          ws.getRow(r).height = 150; r++;
        }
      }
      r++;
    });
  } else { // grouped + summary
    const sum = sheet('Summary', [26, 12, 12, 12, 12, 12], false);
    let r = heading(sum, 6);
    const block = (label, obj) => {
      headRow(sum, r++, [label, 'Items']);
      Object.entries(obj).forEach(([k, v]) => { const a = sum.getCell(r, 1), b = sum.getCell(r, 2); a.value = k; b.value = v; body(a); body(b); b.alignment = { horizontal: 'right' }; r++; });
      r++;
    };
    const open = items.filter(i => i.status === 'Open' || i.status === 'In progress').length;
    const today = todayISO();
    const overdue = items.filter(i => i.due && i.due < today && (i.status === 'Open' || i.status === 'In progress')).length;
    block('Overview', { 'Total items': items.length, 'Still open (open + in progress)': open, 'Overdue': overdue, 'Closed (done + verified)': items.length - open });
    block('By status', counts(items, 'status', STATUSES));
    block('By priority', counts(items, 'priority', PRIORITIES));
    const gk = o.groupBy && o.groupBy !== 'none' ? o.groupBy : 'responsible';
    block('By ' + ({ responsible: 'responsible', category: 'category', location: 'location' }[gk] || gk), counts(items, gk));
    const cols = withPhotos ? [11, 44, 20, 9, 12, 12, 24] : [11, 48, 22, 9, 12, 12, 28];
    const ws = sheet('By ' + gk, cols, true);
    let q = heading(ws, cols.length);
    groupItems(items, gk).forEach(([g, list2]) => {
      ws.mergeCells(q, 1, q, cols.length); const gc = ws.getCell(q, 1); gc.value = g + '  (' + list2.length + ')'; gc.font = { bold: true, size: 12 };
      gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.band } }; ws.getRow(q).height = 22; q++;
      headRow(ws, q++, ['No.', 'Description', 'Location', 'Priority', 'Due', 'Status', withPhotos ? 'Photo' : 'Remarks']);
      list2.forEach(it => {
        const row = ws.getRow(q);
        [it.no, describe(it), it.location, it.priority, it.due, it.status, withPhotos ? '' : it.remarks].forEach((v, i) => { const c = row.getCell(i + 1); c.value = v; body(c); });
        prio(row.getCell(4), it.priority);
        let h = Math.max(20, Math.min(160, 15 * Math.ceil(describe(it).length / 50) + 6));
        if (withPhotos && place(ws, it, 0, 6, q - 1, 150, 90)) h = Math.max(h, 96);
        row.height = h; q++;
      });
      q++;
    });
  }
  return wb;
}

function registerPunch(ipcMain, ctx) {
  const dir = () => ctx.userDataDir();
  const file = () => path.join(dir(), 'punch.json');
  const imgDir = () => path.join(dir(), 'punch-img');
  let lists = null;

  function load() {
    if (lists) return lists;
    try { lists = (JSON.parse(fs.readFileSync(file(), 'utf8')).lists || []).map(cleanList).filter(Boolean); } catch (e) { lists = []; }
    return lists;
  }
  function save() {
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, lists }));
    try { if (fs.existsSync(file())) fs.copyFileSync(file(), file() + '.bak'); } catch (e) {}
    fs.renameSync(tmp, file());
  }
  const handle = (name, fn) => ipcMain.handle(name, async (e, ...a) => {
    try { return await fn(e, ...a); } catch (err) { return { ok: false, error: 'Something went wrong: ' + err.message }; }
  });
  const findList = (id) => load().find(l => l.id === id);
  const readImg = (name) => { try { return fs.readFileSync(path.join(imgDir(), name)); } catch (e) { return null; } };
  const dropImg = (name) => { try { fs.unlinkSync(path.join(imgDir(), name)); } catch (e) {} };
  function writeImgs(dataUrls) {
    fs.mkdirSync(imgDir(), { recursive: true });
    const out = [];
    for (const d of dataUrls) {
      const m = /^data:image\/jpeg;base64,(.+)$/.exec(String(d.data || ''));
      if (!m) continue;
      const buf = Buffer.from(m[1], 'base64');
      if (!buf.length || buf.length > 4000000) continue;
      const f = crypto.randomUUID() + '.jpg';
      fs.writeFileSync(path.join(imgDir(), f), buf);
      out.push(cleanPhoto({ f, w: d.w, h: d.h }));
    }
    return out.filter(Boolean);
  }

  handle('punch-load', () => ({ ok: true, lists: load() }));

  handle('punch-list-save', (e, input) => {
    const all = load();
    const i = all.findIndex(l => l.id === (input && input.id));
    if (i >= 0) {
      const cur = all[i];
      cur.name = text(input.name, 120) || cur.name; cur.project = text(input.project, 200);
      cur.prefix = (text(input.prefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, '')) || cur.prefix;
      cur.updatedAt = iso();
      save(); return { ok: true, list: cur };
    }
    const fresh = cleanList({ name: input && input.name, project: input && input.project, prefix: input && input.prefix, items: [] });
    all.push(fresh); save();
    return { ok: true, list: fresh };
  });
  handle('punch-list-delete', (e, id) => {
    const all = load(); const i = all.findIndex(l => l.id === id);
    if (i < 0) return { ok: false, error: 'That list no longer exists.' };
    all[i].items.forEach(it => it.photos.forEach(p => dropImg(p.f)));
    all.splice(i, 1); save(); return { ok: true };
  });

  // input.newPhotos = [{data:'data:image/jpeg;base64,…', w, h}]; input.photos = pictures to keep
  handle('punch-item-save', (e, listId, input) => {
    const list = findList(listId);
    if (!list) return { ok: false, error: 'That list no longer exists.' };
    const rec = cleanItem(input);
    if (!rec) return { ok: false, error: 'Could not save this item.' };
    if (!rec.title && !rec.description) return { ok: false, error: 'Please write what needs to be fixed.' };
    const i = list.items.findIndex(x => x.id === rec.id);
    const old = i >= 0 ? list.items[i] : null;
    const keep = rec.photos.filter(p => !old || old.photos.some(o => o.f === p.f));
    const added = writeImgs(Array.isArray(input.newPhotos) ? input.newPhotos.slice(0, MAX_PHOTOS) : []);
    rec.photos = keep.concat(added).slice(0, MAX_PHOTOS);
    if (old) old.photos.forEach(p => { if (!rec.photos.some(k => k.f === p.f)) dropImg(p.f); });
    rec.updatedAt = iso();
    if (old) { rec.no = old.no; rec.createdAt = old.createdAt; list.items[i] = rec; }
    else { rec.no = list.prefix + '-' + String(list.next).padStart(3, '0'); list.next++; list.items.push(rec); }
    if (rec.status === 'Done' || rec.status === 'Verified') { if (!rec.dateDone) rec.dateDone = todayISO(); } else rec.dateDone = '';
    list.updatedAt = iso();
    save();
    return { ok: true, item: rec };
  });
  handle('punch-item-delete', (e, listId, itemId) => {
    const list = findList(listId); if (!list) return { ok: false, error: 'That list no longer exists.' };
    const i = list.items.findIndex(x => x.id === itemId); if (i < 0) return { ok: false, error: 'That item no longer exists.' };
    list.items[i].photos.forEach(p => dropImg(p.f));
    list.items.splice(i, 1); list.updatedAt = iso(); save();
    return { ok: true };
  });
  handle('punch-photos', (e, names) => {
    const out = {};
    (Array.isArray(names) ? names : []).slice(0, 400).forEach(n => {
      if (!/^[\w\-]+\.jpg$/.test(String(n))) return;
      const b = readImg(n); if (b) out[n] = 'data:image/jpeg;base64,' + b.toString('base64');
    });
    return { ok: true, photos: out };
  });

  // ---------- PDF / print ----------
  async function withWindow(html, fn) {
    const tmp = path.join(os.tmpdir(), 'work-helper-punch-' + Date.now() + '.html');
    fs.writeFileSync(tmp, html, 'utf8');
    const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
    try { await w.loadFile(tmp); return await fn(w); }
    finally { try { w.destroy(); } catch (e) {} try { fs.unlinkSync(tmp); } catch (e) {} }
  }
  const safeName = (s) => String(s || 'punch-list').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'punch-list';
  handle('punch-pdf', async (e, html, opts) => {
    opts = opts || {};
    const r = await dialog.showSaveDialog(ctx.getWindow(), { title: 'Save the punch list as PDF', defaultPath: `${safeName(opts.name)}-${todayISO().replace(/-/g, '')}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    const buf = await withWindow(String(html), (w) => w.webContents.printToPDF({
      pageSize: 'A4', landscape: !!opts.landscape, printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;color:#666;width:100%;text-align:center;font-family:Arial">Punch list · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margins: { top: 0.4, bottom: 0.6, left: 0.4, right: 0.4 }
    }));
    fs.writeFileSync(r.filePath, buf); shell.openPath(r.filePath);
    return { ok: true, path: r.filePath };
  });
  handle('punch-print', async (e, html, opts) => {
    opts = opts || {};
    return await withWindow(String(html), (w) => new Promise((resolve) => {
      w.webContents.print({ silent: false, printBackground: true, landscape: !!opts.landscape }, (ok, reason) => {
        resolve(ok ? { ok: true } : { ok: false, error: reason === 'cancelled' || reason === 'canceled' ? 'Printing was cancelled.' : 'Could not print: ' + reason });
      });
    }));
  });

  // ---------- Excel ----------
  handle('punch-excel', async (e, listId, layout, o) => {
    const list = findList(listId); if (!list) return { ok: false, error: 'That list no longer exists.' };
    o = o || {};
    const ids = new Set(Array.isArray(o.itemIds) ? o.itemIds : list.items.map(i => i.id));
    const items = list.items.filter(i => ids.has(i.id));
    if (!items.length) return { ok: false, error: 'There are no items to put in the file.' };
    if (!['register', 'cards', 'grouped', 'closeout'].includes(layout)) layout = 'register';
    const r = await dialog.showSaveDialog(ctx.getWindow(), { title: 'Save the punch list as Excel', defaultPath: `${safeName(o.title || list.name)}-${todayISO().replace(/-/g, '')}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    const ExcelJS = require('exceljs');
    const cache = {};
    const wb = buildWorkbook(ExcelJS, list, items, layout, o, (p) => (cache[p.f] !== undefined ? cache[p.f] : (cache[p.f] = readImg(p.f))));
    try { await wb.xlsx.writeFile(r.filePath); }
    catch (err) { return { ok: false, error: 'Could not save the file (is it open in Excel?): ' + err.message }; }
    shell.openPath(r.filePath);
    return { ok: true, path: r.filePath };
  });
}

module.exports = { registerPunch, buildWorkbook, cleanItem, cleanList };
