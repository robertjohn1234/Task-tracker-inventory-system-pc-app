// Inventory > "Tools & Equipment": its own screen for tools you lend out and take care of.
//   - picture cards (or a list), status at a glance, one-click Lend / Return
//   - a picture is needed when you add new equipment
//   - Borrowed, Repairs and History tabs, reminders for overdue returns, calibration and repairs
// It shares dialogs and helpers with the Consumables screen through window.InvKit (see the end of inventory-ui.js)
// and talks to the main process through window.api (inv* functions). Load order: inventory-mode.js, inventory-ui.js, tools-ui.js.
(function () {
  'use strict';

  const view = document.getElementById('invTools');
  const K = window.InvKit;
  if (!view || !K || !window.InvMode) return;
  const { E, say, esc, fmtQty, fmtDate, daysBetween, addDays, lc, LIMIT, dialog, fld, inp, sel, grid, datalist, itemInput, resolveItem, useState } = K;
  const S = () => K.S;

  // Set to false if you ever want to allow new tools without a picture.
  const REQUIRE_PHOTO = true;
  const TOOLS = 'Tools & Equipment';

  // ---------- styles ----------
  const st = document.createElement('style');
  st.textContent = `
    #tlTop { background: var(--panel, #fff); border-bottom: 1px solid var(--border, #ddd); padding: 10px 16px 8px; }
    #tlTop h2 { margin: 0; font-size: 18px; }
    #tlScan { flex: 1 1 260px; max-width: 460px; padding: 7px 10px; font-size: 13px; }
    #tlBody { flex: 1; overflow: auto; padding: 12px 16px 24px; }
    .tlRemind { margin: 0 0 8px; padding: 6px 10px; border: 1px solid #d97706; border-radius: 8px; background: rgba(217, 119, 6, .12); font-size: 13px; }
    .tlRemind div { padding: 1px 0; cursor: pointer; }
    .tlRemind div:hover { text-decoration: underline; }
    .tlKpi small { display: block; font-size: 11px; color: var(--muted, #666); }
    .tlGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 14px; }
    .tlCard { background: var(--panel, #fff); border: 1px solid var(--border, #ddd); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; cursor: pointer;
      transition: box-shadow .15s ease, transform .15s ease, border-color .15s ease; }
    .tlCard:hover, .tlCard:focus-visible { box-shadow: 0 6px 18px rgba(0, 0, 0, .18); transform: translateY(-2px); border-color: var(--accent, #1f6feb); outline: none; }
    .tlPhoto { position: relative; aspect-ratio: 4 / 3; background: var(--panel2, #eef0f3); display: flex; align-items: center; justify-content: center; font-size: 44px; color: var(--muted, #888); }
    .tlPhoto img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tlPhoto .tlChip { position: absolute; left: 8px; top: 8px; }
    .tlPhoto .tlChip2 { position: absolute; left: auto; right: 8px; top: 8px; }
    .tlChip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #2da44e; color: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); }
    .tlChip.info { background: #1f6feb; } .tlChip.warn { background: #d97706; } .tlChip.bad { background: #d1242f; } .tlChip.mute { background: #6b7280; }
    .tlBodyC { padding: 10px 12px 8px; flex: 1; }
    .tlName { font-weight: 700; font-size: 14px; line-height: 1.25; }
    .tlCode { font-family: Consolas, monospace; font-size: 11px; color: var(--muted, #777); }
    .tlMeta { font-size: 12px; color: var(--muted, #666); margin-top: 4px; }
    .tlAct { display: flex; gap: 6px; padding: 0 10px 10px; }
    .tlAct button { flex: 1; padding: 5px 6px; font-size: 12px; }
    .tlAct button.tlMore { flex: 0 0 34px; }
    .tlThumb { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--panel2, #eef0f3); display: inline-flex; align-items: center; justify-content: center; font-size: 18px; vertical-align: middle; }
    .tlHero { width: 100%; max-height: 300px; border-radius: 12px; object-fit: cover; background: var(--panel2, #eef0f3); }
    .tlDetail { display: grid; grid-template-columns: 250px 1fr; gap: 16px; }
    .tlPick { border: 2px dashed var(--border, #bbb); border-radius: 12px; width: 240px; height: 180px; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--muted, #777);
      font-size: 13px; overflow: hidden; background: var(--panel2, #f4f5f7); padding: 6px; box-sizing: border-box; }
    .tlDmg { display: inline-flex; align-items: center; gap: 4px; cursor: zoom-in; }
    .tlDmg img { width: 56px; height: 42px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border, #ccc); }
    .tlPick.drop { border-color: var(--accent, #1f6feb); background: rgba(31, 111, 235, .1); }
    .tlPick img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
    .tlPickBtns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .tlForm { display: grid; grid-template-columns: 250px 1fr; gap: 18px; }
    .tlSwitch { display: inline-flex; border: 1px solid var(--border, #bbb); border-radius: 6px; overflow: hidden; }
    .tlSwitch button { border: 0; border-radius: 0; border-right: 1px solid var(--border, #ccc); padding: 5px 10px; }
    .tlSwitch button:last-child { border-right: 0; }
    .tlSwitch button.on { background: var(--accent, #1f6feb); color: var(--accent-text, #fff); }
    @media (max-width: 760px) { .tlDetail, .tlForm { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(st);

  // ---------- state of this screen ----------
  let tab = 'tools';
  const F = { text: '', status: '', group: '', returned: false, closed: false, hPeriod: '30', hType: '', rPeriod: '30', iPeriod: '90' };
  const hasPrice = (v) => typeof v === 'number' && v >= 0;
  const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const pesoOr = (n) => (hasPrice(n) ? peso(n) : '');
  let layout = 'cards';
  try { const v = localStorage.getItem('wh-tools-layout'); if (v === 'list' || v === 'cards') layout = v; } catch (e) {}

  const soon = () => addDays(S().today, 30);
  const calDue = (i) => !!(i.calibrationDue && i.calibrationDue <= soon());

  // ---------- page shell ----------
  view.innerHTML = '';
  const top = E('div'); top.id = 'tlTop';
  const body = E('div'); body.id = 'tlBody';
  view.append(top, body);

  const hdr = E('div', 'invRow');
  hdr.append(E('h2', '', 'Tools & Equipment'));
  const spacer = E('span'); spacer.style.flex = '1';
  const scan = document.createElement('input');
  scan.id = 'tlScan'; scan.type = 'text'; scan.autocomplete = 'off';
  scan.placeholder = 'Scan a barcode, or type a code / name / serial…';
  const layoutSw = E('div', 'tlSwitch');
  const bCards = E('button', '', '▦ Cards'); const bList = E('button', '', '☰ List');
  bCards.type = bList.type = 'button';
  layoutSw.append(bCards, bList);
  hdr.append(spacer, scan, layoutSw);

  const bar = E('div', 'invRow');
  const btnNew = E('button', 'primary', '＋ New tool');
  const btnLend = E('button', '', '🔧 Lend a tool');
  const btnReturn = E('button', '', '↩ Return a tool');
  const btnPrint = E('button', '', '🖨 Print / PDF');
  const btnMore = E('button', '', '⋯ More');
  bar.append(btnNew, btnLend, btnReturn, btnPrint, btnMore);

  const remind = E('div', 'tlRemind'); remind.hidden = true;
  const kpis = E('div', 'invKpis');
  const tabs = E('div', 'invRow');
  const filters = E('div', 'invRow');
  top.append(hdr, bar, remind, kpis, tabs, filters);

  // ---------- small helpers ----------
  function table(columns) {
    const t = E('table', 'invT');
    const thead = E('thead'); const tr = E('tr');
    columns.forEach(c => tr.appendChild(E('th', c.num ? 'num' : '', c.label)));
    thead.appendChild(tr); t.appendChild(thead);
    const tb = E('tbody'); t.appendChild(tb);
    return { t, tb };
  }
  function td(cls, content) {
    const c = E('td', cls || '');
    if (content instanceof Node) c.appendChild(content); else if (content != null) c.textContent = content;
    return c;
  }
  function actBtn(label, title, fn) {
    const b = E('button', '', label); b.title = title; b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    return b;
  }
  function select(options, value, onChange, allLabel) {
    const s = document.createElement('select');
    if (allLabel != null) { const o = document.createElement('option'); o.value = ''; o.textContent = allLabel; s.appendChild(o); }
    options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); });
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  const itemById = (id) => S().items.find(i => i.id === id);
  function thumb(item) {
    if (item && item.photo) { const im = document.createElement('img'); im.className = 'tlThumb'; im.src = K.photoSrc(item.photo); im.loading = 'lazy'; im.alt = ''; return im; }
    return E('span', 'tlThumb', '🔧');
  }
  const words = () => lc(F.text).split(/\s+/).filter(Boolean);

  // ---------- picture helper: choose / paste / drop, shrink to a small JPEG ----------
  function shrinkPicture(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const make = (maxSide, q) => {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // transparent pictures get a white background
          g.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', q);
        };
        let out = make(440, 0.78);                 // small on purpose: thousands of tools, one file each
        if (out.length > 240000) out = make(380, 0.7);
        if (out.length > 240000) out = make(320, 0.6);
        out.length > 245000 ? reject(new Error('too big')) : resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad picture')); };
      img.src = url;
    });
  }

  // Returns { el, get(), changed() }. onError(msg) shows a message in the dialog.
  function photoPicker(initial, host, onError) {
    let value = initial || '';
    let changed = false;
    const box = E('div', 'tlPick');
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    const paint = () => {
      box.innerHTML = '';
      if (value) { const im = document.createElement('img'); im.src = K.photoSrc(value); im.alt = ''; box.appendChild(im); }
      else box.append(document.createTextNode('📷 No picture yet.\nChoose one, paste one (Ctrl+V) or drop it here.'));
      box.style.whiteSpace = 'pre-line';
    };
    async function take(blob) {
      if (!blob || !/^image\//.test(blob.type || '')) { onError('Please choose a picture file (JPG, PNG or WebP).'); return; }
      try { value = await shrinkPicture(blob); changed = true; onError(''); paint(); }
      catch (e) { onError('That picture could not be used. Try a different one.'); }
    }
    file.addEventListener('change', () => { if (file.files && file.files[0]) take(file.files[0]); file.value = ''; });
    const choose = E('button', '', '📁 Choose picture…'); choose.type = 'button';
    choose.addEventListener('click', () => file.click());
    const paste = E('button', '', '📋 Paste'); paste.type = 'button';
    paste.addEventListener('click', async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const type = it.types.find(t => /^image\//.test(t));
          if (type) { take(await it.getType(type)); return; }
        }
        onError('There is no picture in the clipboard.');
      } catch (e) { onError('Press Ctrl+V while this window is open to paste a copied picture.'); }
    });
    const remove = E('button', '', '🗑 Remove'); remove.type = 'button';
    remove.addEventListener('click', () => { value = ''; changed = true; paint(); });
    ['dragenter', 'dragover'].forEach(n => box.addEventListener(n, (e) => { e.preventDefault(); box.classList.add('drop'); }));
    ['dragleave', 'drop'].forEach(n => box.addEventListener(n, (e) => { e.preventDefault(); box.classList.remove('drop'); }));
    box.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) take(f); });
    box.addEventListener('click', () => file.click());
    host.addEventListener('paste', (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (files && files.length && /^image\//.test(files[0].type)) { e.preventDefault(); take(files[0]); }
    });
    const btns = E('div', 'tlPickBtns'); btns.append(choose, paste, remove);
    const el = E('div'); el.append(box, btns, file);
    paint();
    return { el, get: () => value, changed: () => changed };
  }

  // ---------- numbers and status of one tool ----------
  function chipsFor(i) {
    const s = i.stat, out = [];
    if (i.archived) return [['Archived', 'mute']];
    if (s.inRepair > 0 && s.available <= 0 && s.onLoan <= 0) out.push(['Damaged', 'bad']);
    else if (s.available <= 0) out.push([s.onHand <= 0 ? 'None in stock' : 'All borrowed', s.onHand <= 0 ? 'bad' : 'warn']);
    else if (s.available < s.onHand) out.push([`${fmtQty(s.available)} of ${fmtQty(s.onHand)} available`, 'info']);
    else out.push([s.onHand > 1 ? `${fmtQty(s.available)} available` : 'Available', '']);
    if (s.overdue > 0) out.push(['Overdue', 'bad']);
    else if (s.inRepair > 0 && out[0][0] !== 'Damaged') out.push([`${fmtQty(s.inRepair)} damaged`, 'bad']);
    else if (calDue(i)) out.push(['Calibration', 'warn']);
    return out;
  }
  const chip = (text, cls) => E('span', 'tlChip ' + (cls || ''), text);

  function filteredTools() {
    const w = words();
    const list = S().items.filter(i => {
      if (F.status === 'archived') { if (!i.archived) return false; }
      else if (i.archived) return false;
      if (F.status === 'available' && !(i.stat.available > 0)) return false;
      if (F.status === 'borrowed' && !(i.stat.onLoan > 0)) return false;
      if (F.status === 'broken' && !(i.stat.inRepair > 0)) return false;
      if (F.status === 'calibration' && !calDue(i)) return false;
      if (F.status === 'noprice' && hasPrice(i.price)) return false;
      if (F.status === 'noloc' && i.location) return false;
      if (F.group && i.group !== F.group) return false;
      if (!w.length) return true;
      const hay = lc([i.code, i.name, i.group, i.location, i.barcode, i.serial, i.supplier].join(' '));
      return w.every(x => hay.includes(x));
    });
    list.sort((a, b) => lc(a.name).localeCompare(lc(b.name)) || a.code.localeCompare(b.code));
    return list;
  }

  // ---------- top pieces ----------
  function renderRemind() {
    remind.innerHTML = '';
    const lines = [];
    const s = S();
    const od = s.loans.filter(l => l.open > 0 && l.dueDate && l.dueDate < s.today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (od.length) {
      const names = od.slice(0, 3).map(l => `${l.itemName} (${l.borrower}, ${daysBetween(l.dueDate, s.today)} d late)`).join('; ');
      lines.push([`⏰ ${od.length} overdue return${od.length === 1 ? '' : 's'}: ${names}${od.length > 3 ? '…' : ''}`, () => { tab = 'loans'; render(); }]);
    }
    const cal = s.items.filter(i => !i.archived && calDue(i)).sort((a, b) => a.calibrationDue.localeCompare(b.calibrationDue));
    if (cal.length) {
      const names = cal.slice(0, 3).map(i => `${i.name} (${i.calibrationDue < s.today ? 'overdue ' + daysBetween(i.calibrationDue, s.today) + ' d' : 'due ' + fmtDate(i.calibrationDue)})`).join('; ');
      lines.push([`🎯 Calibration: ${names}${cal.length > 3 ? '…' : ''}`, () => { tab = 'tools'; F.status = 'calibration'; render(); }]);
    }
    const rp = s.repairs.filter(r => r.status === 'open');
    if (rp.length) {
      const names = rp.slice(0, 3).map(r => `${r.itemName} ×${fmtQty(r.qty)} (${r.kind.toLowerCase()}, ${daysBetween(r.date, s.today)} d)`).join('; ');
      lines.push([`🛠 ${rp.length} tool${rp.length === 1 ? '' : 's'} out of service: ${names}${rp.length > 3 ? '…' : ''}`, () => { tab = 'repairs'; render(); }]);
    }
    lines.forEach(([t, go]) => { const d = E('div', '', t); d.addEventListener('click', go); remind.appendChild(d); });
    remind.hidden = !lines.length;
  }

  function renderKpis() {
    kpis.innerHTML = '';
    const s = S(), sm = s.summary;
    const live = s.items.filter(i => !i.archived);
    const units = live.reduce((n, i) => n + i.stat.onHand, 0);
    const avail = live.reduce((n, i) => n + i.stat.available, 0);
    const mk = (label, n, cls, go, sub) => {
      const k = E('div', 'invKpi tlKpi' + (cls && n > 0 ? ' ' + cls : ''));
      k.append(E('b', '', String(n)), E('span', '', label));
      if (sub) k.append(E('small', '', sub));
      if (go) k.addEventListener('click', go);
      kpis.appendChild(k);
    };
    mk('Tools & equipment', fmtQty(units), '', () => { tab = 'tools'; F.status = ''; render(); }, `${live.length} kind${live.length === 1 ? '' : 's'}`);
    mk('Available now', fmtQty(avail), '', () => { tab = 'tools'; F.status = 'available'; render(); });
    mk('Borrowed', fmtQty(sm.onLoan), '', () => { tab = 'loans'; render(); });
    mk('Overdue returns', sm.overdue, 'bad', () => { tab = 'loans'; render(); });
    mk('Damaged / in repair', fmtQty(sm.damaged || 0), 'bad', () => { tab = 'repairs'; render(); });
    mk('Calibration due (30 d)', sm.calibration, 'warn', () => { tab = 'tools'; F.status = 'calibration'; render(); });
  }

  function renderTabs() {
    tabs.innerHTML = '';
    const seg = E('div', 'invSeg');
    [['tools', 'Tools'], ['loans', 'Borrowed'], ['repairs', 'Repairs'], ['records', 'Records'], ['removed', 'Removed'], ['insights', 'Insights'], ['history', 'History']].forEach(([k, label]) => {
      const b = E('button', tab === k ? 'on' : '', label); b.type = 'button';
      b.addEventListener('click', () => { tab = k; render(); });
      seg.appendChild(b);
    });
    tabs.appendChild(seg);
  }

  function renderFilters() {
    filters.innerHTML = '';
    if (tab === 'tools') {
      const groups = [...new Set(S().items.map(i => i.group).filter(Boolean))].sort();
      filters.append(select([['available', 'Available now'], ['borrowed', 'Borrowed'], ['broken', 'Damaged / in repair'], ['calibration', 'Calibration due'], ['noprice', 'Missing price'], ['noloc', 'Missing location'], ['archived', 'Archived']], F.status, v => { F.status = v; renderBody(); }, 'Any status'));
      if (groups.length) filters.append(select(groups.map(g => [g, g]), F.group, v => { F.group = v; renderBody(); }, 'All types'));
    } else if (tab === 'loans') {
      const l = E('label', 'invChk');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = F.returned;
      c.addEventListener('change', () => { F.returned = c.checked; renderBody(); });
      l.append(c, E('span', '', 'Also show returned tools'));
      filters.appendChild(l);
    } else if (tab === 'repairs') {
      const l = E('label', 'invChk');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = F.closed;
      c.addEventListener('change', () => { F.closed = c.checked; renderBody(); });
      l.append(c, E('span', '', 'Also show closed (repaired, written off, lost)'));
      const b = E('button', 'primary', '＋ Report damaged / lost tool'); b.type = 'button'; b.addEventListener('click', () => openReport());
      const g = E('button', '', '📄 Generate report…'); g.type = 'button'; g.title = 'A formal report of damaged and missing tools, with pictures';
      g.addEventListener('click', () => window.DamagedReport && window.DamagedReport.open());
      filters.append(l, b, g);
    } else if (tab === 'insights') {
      filters.append(select([['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 6 months'], ['365', 'Last year']], F.iPeriod, v => { F.iPeriod = v; renderBody(); }, null));
      const p = E('button', '', '🖨 Print / PDF'); p.type = 'button'; p.addEventListener('click', () => K.outputReport(insightsReport()));
      filters.appendChild(p);
    } else if (tab === 'records' || tab === 'removed') {
      filters.append(select([['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']], F.rPeriod, v => { F.rPeriod = v; renderBody(); }, 'All dates'));
      const p = E('button', '', '🖨 Print / PDF'); p.type = 'button'; p.addEventListener('click', () => K.outputReport(tab === 'records' ? recordsReport() : removedReport()));
      filters.appendChild(p);
      if (tab === 'records') { const b = E('button', 'primary', '＋ Add units'); b.type = 'button'; b.addEventListener('click', () => openUnits({ dir: 'in' })); filters.appendChild(b); }
      else { const b = E('button', '', '－ Remove units'); b.type = 'button'; b.addEventListener('click', () => openUnits({ dir: 'out' })); filters.appendChild(b); }
    } else if (tab === 'history') {
      filters.append(
        select([['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']], F.hPeriod, v => { F.hPeriod = v; renderBody(); }, 'All dates'),
        select([['lend', 'Lent'], ['return', 'Returned'], ['damage', 'Damage reports'], ['repaired', 'Repaired'], ['in', 'Units added'], ['out', 'Units removed']], F.hType, v => { F.hType = v; renderBody(); }, 'Everything')
      );
    }
  }

  function render() {
    if (!S()) return;
    window.PhotoBase = S().photoBase || window.PhotoBase || '';
    bCards.className = layout === 'cards' ? 'on' : ''; bList.className = layout === 'list' ? 'on' : '';
    renderRemind(); renderKpis(); renderTabs(); renderFilters(); renderBody();
  }

  function renderBody() {
    body.innerHTML = '';
    if (tab === 'tools') renderTools();
    else if (tab === 'loans') renderLoans();
    else if (tab === 'repairs') renderRepairs();
    else if (tab === 'records') renderRecords();
    else if (tab === 'removed') renderRemoved();
    else if (tab === 'insights') renderInsights();
    else renderHistory();
  }

  // ---------- Tools tab: picture cards or list ----------
  function renderTools() {
    const s = S();
    if (!s.items.length) {
      const box = E('div', 'invEmpty');
      box.append(E('p', '', 'No tools or equipment yet.'));
      const p = E('p');
      const a = E('button', 'primary', '＋ Add your first tool'); a.type = 'button'; a.addEventListener('click', () => openTool());
      const b = E('button', '', 'Import from Excel…'); b.type = 'button'; b.addEventListener('click', () => K.openImport());
      p.append(a, document.createTextNode(' '), b);
      box.appendChild(p);
      body.appendChild(box);
      return;
    }
    const list = filteredTools();
    if (layout === 'cards') {
      const g = E('div', 'tlGrid');
      list.slice(0, LIMIT).forEach(i => g.appendChild(card(i)));
      body.appendChild(g);
    } else {
      const { t, tb } = table([{ label: '' }, { label: 'Code' }, { label: 'Tool' }, { label: 'Type' }, { label: 'Total', num: true }, { label: 'Available', num: true }, { label: 'Borrowed', num: true },
        { label: 'Damaged', num: true }, { label: 'Status' }, { label: 'Location' }, { label: 'Calibration due' }, { label: '' }]);
      list.slice(0, LIMIT).forEach(i => {
        const tr = E('tr', 'invClick');
        tr.addEventListener('click', () => openToolDetail(i.id));
        tr.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(e, i); });
        const stCell = td('');
        chipsFor(i).forEach(([tx, c]) => { stCell.append(chip(tx, c), document.createTextNode(' ')); });
        const act = td('act');
        act.append(actBtn('Lend', 'Lend this tool', () => openCheckout(i.id)), document.createTextNode(' '));
        if (i.stat.onLoan > 0) act.append(actBtn('Return', 'Return this tool', () => returnForItem(i)), document.createTextNode(' '));
        act.append(actBtn('⋯', 'More', (e) => itemMenu(e, i)));
        tr.append(td('', thumb(i)), td('code', i.code), td('', i.name), td('', i.group), td('num', fmtQty(i.stat.onHand)), td('num', fmtQty(i.stat.available)),
          td('num', i.stat.onLoan ? fmtQty(i.stat.onLoan) : ''), td('num', i.stat.inRepair ? fmtQty(i.stat.inRepair) : ''), stCell, td('', i.location), td('', fmtDate(i.calibrationDue)), act);
        tb.appendChild(tr);
      });
      body.appendChild(t);
    }
    if (!list.length) body.appendChild(E('div', 'invEmpty', 'Nothing matches. Clear the search or filters.'));
    else body.appendChild(E('div', 'invNote', list.length > LIMIT ? `Showing the first ${LIMIT} of ${list.length}. Type in the search box to narrow it down.` : `${list.length} tool${list.length === 1 ? '' : 's'}. Click one for details.`));
  }

  function card(i) {
    const c = E('div', 'tlCard');
    c.tabIndex = 0;
    c.addEventListener('click', () => openToolDetail(i.id));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') openToolDetail(i.id); });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(e, i); });
    const ph = E('div', 'tlPhoto');
    if (i.photo) { const im = document.createElement('img'); im.src = K.photoSrc(i.photo); im.alt = i.name; im.loading = 'lazy'; im.decoding = 'async'; ph.appendChild(im); } else ph.textContent = '🔧';
    const chips = chipsFor(i);
    ph.appendChild(chip(chips[0][0], chips[0][1]));
    if (chips[1]) ph.appendChild(E('span', 'tlChip tlChip2 ' + (chips[1][1] || ''), chips[1][0]));
    const b = E('div', 'tlBodyC');
    b.append(E('div', 'tlName', i.name), E('div', 'tlCode', i.code + (i.serial ? ' · ' + i.serial : '')));
    const meta = [i.group, i.location].filter(Boolean).join(' · ');
    if (meta) b.append(E('div', 'tlMeta', meta));
    if (i.stat.onLoan > 0) {
      const who = S().loans.filter(l => l.itemId === i.id && l.open > 0).map(l => l.borrower).filter(Boolean);
      if (who.length) b.append(E('div', 'tlMeta', '👤 ' + [...new Set(who)].slice(0, 2).join(', ') + (who.length > 2 ? '…' : '')));
    }
    const act = E('div', 'tlAct');
    const lend = actBtn('🔧 Lend', 'Lend this tool', () => openCheckout(i.id));
    lend.disabled = i.archived || i.stat.available <= 0;
    act.appendChild(lend);
    if (i.stat.onLoan > 0) act.appendChild(actBtn('↩ Return', 'Return this tool', () => returnForItem(i)));
    const more = actBtn('⋯', 'More', (e) => itemMenu(e, i)); more.classList.add('tlMore');
    act.appendChild(more);
    c.append(ph, b, act);
    return c;
  }

  function itemMenu(e, i) {
    const x = e.clientX != null && e.clientX !== 0 ? e : (() => { const r = e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : { left: 100, bottom: 100 }; return { clientX: r.left, clientY: r.bottom }; })();
    showMenu(x, [
      { label: 'Details', run: () => openToolDetail(i.id) },
      { label: 'Lend…', run: () => openCheckout(i.id) },
      i.stat.onLoan > 0 ? { label: 'Return…', run: () => returnForItem(i) } : null,
      { label: 'Report damage / lost…', run: () => openReport(i.id) },
      '-',
      { label: 'Add units…', run: () => openUnits({ itemId: i.id, dir: 'in' }) },
      { label: 'Remove units…', run: () => openUnits({ itemId: i.id, dir: 'out' }) },
      { label: 'Edit…', run: () => openTool(i) }
    ].filter(Boolean));
  }

  // ---------- new / edit tool (with picture) ----------
  function openTool(item) {
    const editing = !!item;
    const d = dialog(editing ? 'Edit tool' : 'New tool or equipment', { wide: true });
    const f = {
      name: inp('text', item ? item.name : '', { maxLength: 200 }),
      code: inp('text', item ? item.code : '', { maxLength: 30 }),
      uom: inp('text', item ? item.uom : 'pcs', { maxLength: 20 }),
      group: inp('text', item ? item.group : '', { maxLength: 80 }),
      serial: inp('text', item ? item.serial : '', { maxLength: 200 }),
      location: inp('text', item ? item.location : '', { maxLength: 120 }),
      supplier: inp('text', item ? item.supplier : '', { maxLength: 120 }),
      barcode: inp('text', item ? item.barcode : '', { maxLength: 60 }),
      price: inp('number', item && hasPrice(item.price) ? item.price : ''),
      condition: sel([['', '—']].concat(S().conditions.map(c => [c, c])), item ? item.condition : 'Good'),
      calibrationDue: inp('date', item ? item.calibrationDue : ''),
      startQty: inp('number', '1'),
      startDate: inp('date', S().today),
      notes: document.createElement('textarea'),
      archived: inp('checkbox', '')
    };
    f.notes.rows = 2; f.notes.value = item ? item.notes : ''; f.notes.style.width = '100%';
    f.archived.checked = !!(item && item.archived);
    datalist('tlGroups', S().items.map(i => i.group));
    datalist('tlLocs', S().items.map(i => i.location).concat(S().loans.map(l => l.location)));
    datalist('tlSups', S().items.map(i => i.supplier));
    f.group.setAttribute('list', 'tlGroups'); f.location.setAttribute('list', 'tlLocs'); f.supplier.setAttribute('list', 'tlSups');

    const prefix = (S().categories[0] || { prefix: 'TLS' }).prefix;
    let max = 0;
    S().items.forEach(i => { const m = new RegExp('^' + prefix + '-(\\d+)$').exec(i.code); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    const nextCode = prefix + '-' + String(max + 1).padStart(4, '0');

    const pic = photoPicker(item ? item.photo : '', d.overlay, (m) => d.say(m, !!m));
    const left = E('div');
    left.append(E('div', 'invSub', REQUIRE_PHOTO && !editing ? 'Picture (needed)' : 'Picture'), pic.el);
    const right = E('div');
    right.append(fld('Tool / equipment name', f.name));
    right.append(grid(fld('Type / group (optional)', f.group), fld('Serial no. / asset tag', f.serial)));
    const codeFld = fld('Code', f.code, editing ? '' : `Leave empty to get ${nextCode} automatically.`);
    right.append(grid(codeFld, fld('Unit (pcs, set…)', f.uom)));
    right.append(grid(fld('Storage location', f.location), fld('Supplier', f.supplier)));
    right.append(grid(fld('Condition', f.condition), fld('Calibration due (instruments)', f.calibrationDue)));
    if (!editing) right.append(grid(fld('How many do you have?', f.startQty), fld('As of date', f.startDate)));
    right.append(grid(fld('Price per unit, ₱ (optional)', f.price, 'Leave empty if you do not know it yet.'), fld('Manufacturer barcode (optional)', f.barcode)));
    right.append(fld('Notes', f.notes));
    if (editing) { const arch = E('label', 'invChk'); arch.append(f.archived, E('span', '', 'Archived (hide from lists; history is kept)')); right.append(arch); }
    const c = d.content;
    const wrap = E('div', 'tlForm'); wrap.append(left, right);
    c.append(wrap);

    d.button('Save', 'primary', async () => {
      d.say('');
      if (REQUIRE_PHOTO && !editing && !pic.get()) { d.say('Please add a picture of the tool or equipment first.', true); return; }
      const input = {
        id: item ? item.id : undefined, category: TOOLS,
        name: f.name.value, code: f.code.value, uom: f.uom.value, group: f.group.value, serial: f.serial.value,
        location: f.location.value, supplier: f.supplier.value, barcode: f.barcode.value,
        condition: f.condition.value, calibrationDue: f.calibrationDue.value, price: f.price.value,
        startQty: f.startQty.value, startDate: f.startDate.value, notes: f.notes.value, archived: f.archived.checked
      };
      if (pic.changed() || !editing) input.photo = pic.get();
      const r = await api.invItemSave(input);
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close();
      say(editing ? 'Tool saved.' : `${r.item.name} added (${r.item.code}).`);
    });
    d.button('Cancel', '', d.close);
    if (editing) {
      const del = d.button('Delete', '', async () => {
        if (!confirm(`Delete "${item.name}"?`)) return;
        const r = await api.invItemDelete(item.id);
        if (!r.ok) { d.say(r.error, true); return; }
        useState(r); d.close(); say('Tool deleted.');
      });
      del.style.color = '#d1242f';
    }
    f.name.focus();
  }

  // ---------- details of one tool ----------
  function openToolDetail(id) {
    const i = itemById(id);
    if (!i) return;
    const d = dialog(i.name, { wide: true });
    const c = d.content;
    const wrap = E('div', 'tlDetail');
    const left = E('div');
    if (i.photo) { const im = document.createElement('img'); im.className = 'tlHero'; im.src = K.photoSrc(i.photo); im.alt = i.name; left.appendChild(im); }
    else { const ph = E('div', 'tlPhoto', '🔧'); ph.style.borderRadius = '12px'; left.appendChild(ph); }
    const right = E('div');
    const head = E('div', 'invRow');
    head.append(E('span', 'invBig', i.code));
    chipsFor(i).forEach(([tx, cl]) => head.append(chip(tx, cl)));
    right.append(head);
    const facts = E('div', 'invFacts');
    const add = (k, v) => { if (v === '' || v == null) return; const x = E('div'); x.append(E('span', '', k), document.createTextNode(String(v))); facts.appendChild(x); };
    add('Total', fmtQty(i.stat.onHand) + ' ' + i.uom); add('Available', fmtQty(i.stat.available) + ' ' + i.uom);
    add('Borrowed', i.stat.onLoan ? fmtQty(i.stat.onLoan) + ' ' + i.uom : ''); add('Damaged / in repair', i.stat.inRepair ? fmtQty(i.stat.inRepair) + ' ' + i.uom : '');
    add('Type', i.group); add('Serial / tag', i.serial); add('Condition', i.condition); add('Calibration due', fmtDate(i.calibrationDue));
    add('Price per unit', pesoOr(i.price)); add('Value in stock', hasPrice(i.price) ? peso(i.price * i.stat.onHand) : '');
    add('Location', i.location); add('Supplier', i.supplier); add('Barcode', i.barcode); add('Last movement', fmtDate(i.stat.last)); add('Notes', i.notes);
    right.append(facts);

    const acts = E('div', 'invRow');
    const mkb = (label, fn, cls, off) => { const b = E('button', cls || '', label); b.type = 'button'; b.disabled = !!off; b.addEventListener('click', () => { d.close(); fn(); }); acts.appendChild(b); };
    mkb('🔧 Lend', () => openCheckout(i.id), 'primary', i.archived || i.stat.available <= 0);
    if (i.stat.onLoan > 0) mkb('↩ Return', () => returnForItem(i));
    mkb('⚠ Report damage', () => openReport(i.id));
    mkb('＋ Add units', () => openUnits({ itemId: i.id, dir: 'in' }));
    mkb('－ Remove units', () => openUnits({ itemId: i.id, dir: 'out' }));
    mkb('✎ Edit', () => openTool(i));
    right.append(acts);
    wrap.append(left, right);
    c.append(wrap);

    const open = S().loans.filter(l => l.itemId === i.id && l.open > 0);
    if (open.length) {
      c.append(E('div', 'invSub', 'Borrowed right now'));
      const box = E('div', 'invList');
      const { t, tb } = table([{ label: 'Borrower' }, { label: 'Qty', num: true }, { label: 'Taken' }, { label: 'Expected back' }, { label: '' }]);
      open.forEach(l => {
        const tr = E('tr');
        const over = l.dueDate && l.dueDate < S().today;
        tr.append(td('', l.borrower), td('num', fmtQty(l.open)), td('', fmtDate(l.dateOut)), td('', over ? `${fmtDate(l.dueDate)} (overdue)` : fmtDate(l.dueDate)));
        const act = td('act'); act.append(actBtn('Return', 'Return', () => { d.close(); openReturn(l); }));
        tr.append(act); tb.appendChild(tr);
      });
      box.appendChild(t); c.append(box);
    }
    const rows = historyRows().filter(r => r.itemId === i.id).slice(0, 30);
    if (rows.length) {
      c.append(E('div', 'invSub', 'Recent history'));
      const box = E('div', 'invList');
      const { t, tb } = table([{ label: 'Date' }, { label: 'What' }, { label: 'Qty', num: true }, { label: 'Person' }, { label: 'Remarks' }]);
      rows.forEach(r => { const tr = E('tr'); tr.append(td('', fmtDate(r.date)), td('', r.label), td('num', fmtQty(r.qty)), td('', r.who), td('', r.remarks)); tb.appendChild(tr); });
      box.appendChild(t); c.append(box);
    }
    d.button('Close', '', d.close);
  }

  // ---------- Borrowed tab ----------
  function renderLoans() {
    const w = words();
    const list = S().loans.filter(l => {
      if (!F.returned && l.open <= 0) return false;
      if (!w.length) return true;
      const hay = lc([l.itemCode, l.itemName, l.borrower, l.location, l.ref].join(' '));
      return w.every(x => hay.includes(x));
    }).sort((a, b) => ((a.open > 0 ? 0 : 1) - (b.open > 0 ? 0 : 1)) || a.dateOut.localeCompare(b.dateOut));
    const { t, tb } = table([{ label: '' }, { label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Borrower' }, { label: 'Used at' }, { label: 'BRF / ref' },
      { label: 'Taken' }, { label: 'Expected back' }, { label: 'Status' }, { label: '' }]);
    list.slice(0, LIMIT).forEach(l => {
      const overdue = l.open > 0 && l.dueDate && l.dueDate < S().today;
      const tr = E('tr');
      tr.append(td('', thumb(itemById(l.itemId))), td('code', l.itemCode), td('', l.itemName), td('num', fmtQty(l.open > 0 ? l.open : l.qty) + ' ' + l.uom),
        td('', l.borrower), td('', l.location), td('', l.ref), td('', fmtDate(l.dateOut)), td('', fmtDate(l.dueDate)));
      let status;
      if (l.open <= 0) {
        const last = l.returns[l.returns.length - 1];
        status = E('span', 'pill', 'Returned ' + fmtDate(last ? last.date : ''));
        if (last) status.title = `Returned by ${last.returnedBy || l.borrower}` + (last.receivedBy ? `, received by ${last.receivedBy}` : '');
      }
      else if (overdue) status = E('span', 'pill over', `Overdue ${daysBetween(l.dueDate, S().today)} d`);
      else status = E('span', 'pill doing', `Out ${daysBetween(l.dateOut, S().today)} d`);
      tr.append(td('', status));
      const act = td('act');
      act.append(actBtn('🖨', l.formNo ? 'Print form ' + l.formNo : 'Make a tool borrowing form', () => K.makeForm(null, [l.id])), document.createTextNode(' '));
      if (l.open > 0) act.append(actBtn('Return', 'Mark as returned', () => openReturn(l)), document.createTextNode(' '));
      act.append(actBtn('↩', 'Undo this lend (entered by mistake)', () => undoFlow({ type: 'lend', id: l.id })));
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    body.appendChild(t);
    if (list.length > LIMIT) body.appendChild(E('div', 'invNote', `Showing the first ${LIMIT} of ${list.length}. Type in the search box to narrow it down.`));
    if (!list.length) body.appendChild(E('div', 'invEmpty', F.returned ? 'No loan records.' : 'No tools are out right now.'));
  }

  // ---------- Repairs tab ----------
  function renderRepairs() {
    const w = words();
    const list = S().repairs.filter(r => {
      if (!F.closed && r.status !== 'open') return false;
      if (!w.length) return true;
      return w.every(x => lc([r.itemCode, r.itemName, r.borrower, r.note, r.kind].join(' ')).includes(x));
    }).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.date.localeCompare(a.date));
    const { t, tb } = table([{ label: '' }, { label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Problem' }, { label: 'Reported' },
      { label: 'Borrower / reported by' }, { label: 'Note' }, { label: 'Photos' }, { label: 'Status' }, { label: '' }]);
    const STATUS = { open: 'Out of service', fixed: 'Repaired', scrapped: 'Written off', lost: 'Lost' };
    list.slice(0, LIMIT).forEach(r => {
      const tr = E('tr');
      tr.append(td('', thumb(itemById(r.itemId))), td('code', r.itemCode), td('', r.itemName), td('num', fmtQty(r.qty) + ' ' + r.uom), td('', r.kind), td('', fmtDate(r.date)),
        td('', r.borrower || r.by), td('', r.note), td('', damageThumbs(r)));
      const stt = r.status === 'open' ? E('span', 'pill over', `${STATUS.open} ${daysBetween(r.date, S().today)} d`) : E('span', 'pill', `${STATUS[r.status]} ${fmtDate(r.closedDate)}`);
      tr.append(td('', stt));
      const act = td('act');
      if (r.status === 'open') {
        act.append(actBtn('Repaired', 'Back in service', () => openCloseRepair(r, 'fixed')), document.createTextNode(' '),
          actBtn('Write off', 'Cannot be repaired: remove from stock', () => openCloseRepair(r, 'scrap')), document.createTextNode(' '));
      }
      act.append(actBtn('📷', 'Add or mark damage photos', () => editDamagePhotos(r)), document.createTextNode(' '));
      act.append(actBtn('↩', 'Undo this entry (entered by mistake)', () => undoFlow({ type: 'damage', id: r.id })));
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    body.appendChild(t);
    if (!list.length) body.appendChild(E('div', 'invEmpty', 'No damaged tools. When a tool comes back damaged, choose its condition on Return and it appears here.'));
  }

  // small pictures of the damage in the Repairs list (click to see them big)
  function damageThumbs(r) {
    const list = r.photos || [];
    if (!list.length || !window.DamagePhotos) return '';
    const wrap = E('span', 'tlDmg');
    const im = document.createElement('img'); im.src = window.PhotoSrc(list[0]); im.loading = 'lazy'; im.alt = ''; im.title = 'Click to see the damage photos';
    wrap.append(im);
    if (list.length > 1) wrap.append(E('small', '', '+' + (list.length - 1)));
    wrap.addEventListener('click', () => window.DamagePhotos.view(list, `${r.itemName} — ${r.kind.toLowerCase()}`, () => editDamagePhotos(r)));
    return wrap;
  }
  function editDamagePhotos(r) {
    if (!window.DamagePhotos) return;
    window.DamagePhotos.edit(r.photos || [], `Damage photos — ${r.itemName}`, async (list) => {
      const x = await api.invRepairUpdate(r.id, { action: 'photos', photos: list });
      if (!x.ok) return x.error;
      useState(x); say('Photos saved.');
    });
  }

  function openCloseRepair(r, action) {
    const scrap = action === 'scrap';
    const d = dialog(scrap ? 'Write off tool' : 'Tool repaired', { small: true });
    const date = inp('date', S().today);
    const note = inp('text', '', { maxLength: 300 });
    const c = d.content;
    c.append(E('p', '', `${r.itemName} — ${fmtQty(r.qty)} ${r.uom} (${r.kind.toLowerCase()})`));
    const boss = inp('text', '', { maxLength: 120 });
    if (scrap) c.append(E('p', 'invNote', 'The units leave the stock count (a Stock Out entry is saved) and stay in this log. This needs the boss: his or her name and the admin PIN.'));
    c.append(grid(fld(scrap ? 'Date written off' : 'Date repaired', date), fld(scrap ? 'What happened (required)' : 'Note (optional)', note)));
    if (scrap) c.append(fld('Approved by (the boss)', boss));
    d.button(scrap ? 'Write off' : 'Back in service', 'primary', async () => {
      if (scrap && note.value.trim().length < 5) { d.say('Please explain what happened (a few words).', true); return; }
      if (scrap && boss.value.trim().length < 2) { d.say('Type the name of the boss who approved this.', true); return; }
      const x = scrap
        ? await K.withPin((pin) => api.invRepairUpdate(r.id, { action, date: date.value, note: note.value, approvedBy: boss.value, pin }), `Write off ${r.itemName} (${fmtQty(r.qty)})`)
        : await api.invRepairUpdate(r.id, { action, date: date.value, note: note.value });
      if (x.canceled) return;
      if (!x.ok) { d.say(x.error, true); return; }
      useState(x); d.close(); say(scrap ? 'Written off.' : 'Back in service.');
    });
    d.button('Cancel', '', d.close);
  }

  // a tool found broken in the store (not through a return)
  function openReport(itemId) {
    const preset = itemId ? itemById(itemId) : null;
    const d = dialog('Report damaged / lost tool', {});
    const pool = S().items.filter(i => !i.archived);
    const item = itemInput('tlDamList', pool, preset);
    const info = E('div', 'invInfo');
    const kind = sel(['Needs repair', 'Damaged', 'Lost'], 'Damaged');
    const qty = inp('number', '1');
    const date = inp('date', S().today);
    const note = inp('text', '', { maxLength: 500 });
    const pics = window.DamagePhotos ? window.DamagePhotos.picker([], d.overlay, (m) => d.say(m, !!m)) : null;
    const boss = inp('text', '', { maxLength: 120 });
    const bossFld = fld('Approved by (the boss) — needed for a lost tool', boss, 'A lost tool leaves the stock. The admin PIN is asked when you save.');
    const syncKind = () => { bossFld.style.display = kind.value === 'Lost' ? '' : 'none'; };
    kind.addEventListener('change', syncKind);
    const showInfo = () => { const it = resolveItem(item.value); info.textContent = it ? `In the store and in good order: ${fmtQty(it.stat.available)} of ${fmtQty(it.stat.onHand)} ${it.uom}` : ''; };
    item.addEventListener('input', showInfo); item.addEventListener('change', showInfo);
    const c = d.content;
    c.append(fld('Tool', item), info, grid(fld('Problem', kind), fld('How many', qty)), grid(fld('Date', date), fld('What happened', note)));
    if (pics) c.append(fld('Photos of the damage (optional)', pics.el, 'Add up to 3 pictures, then use ✏ Mark to circle or point at the damaged part.'));
    c.append(bossFld);
    syncKind(); showInfo();
    d.button('Save', 'primary', async () => {
      const it = resolveItem(item.value);
      if (!it) { d.say('Please pick the tool from the list.', true); return; }
      const body = { itemId: it.id, kind: kind.value, qty: qty.value, date: date.value, note: note.value, photos: pics ? pics.get() : [] };
      const r = kind.value === 'Lost'
        ? await K.withPin((pin) => api.invRepairReport(Object.assign({}, body, { approvedBy: boss.value, pin })), `Report LOST: ${it.name}`)
        : await api.invRepairReport(body);
      if (r.canceled) return;
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close(); say('Saved in the Repairs list.');
      tab = 'repairs'; render();
    });
    d.button('Cancel', '', d.close);
    (preset ? note : item).focus();
  }


  // ---------- Records tab: new tools and added units ----------
  const inPeriod = (date) => !F.rPeriod || date >= addDays(S().today, -(parseInt(F.rPeriod, 10) - 1));
  function recordRows() {
    const s = S(); const rows = [];
    const tool = (id) => itemById(id);
    s.items.forEach(i => {
      const day = String(i.createdAt || '').slice(0, 10);
      if (!day || !inPeriod(day)) return;
      const open = s.movements.find(m => m.itemId === i.id && m.dir === 'in' && m.reason === 'Opening balance' && String(m.createdAt || '').slice(0, 10) === day);
      rows.push({ type: 'tool', date: day, at: i.createdAt || '', item: i, label: 'New tool', qty: open ? open.qty : 0, party: i.supplier || '', ref: '', price: i.price, remarks: open ? 'Starting quantity' : '', by: i.by || '', m: null, skipId: open ? open.id : '' });
    });
    const skip = new Set(rows.map(r => r.skipId).filter(Boolean));
    s.movements.forEach(m => {
      if (m.dir !== 'in' || skip.has(m.id) || !inPeriod(m.date) || !tool(m.itemId)) return;
      rows.push({ type: 'units', date: m.date, at: m.createdAt || '', item: tool(m.itemId), label: 'Units added', qty: m.qty, party: m.party || '', ref: m.ref || '', price: m.price, remarks: [m.reason, m.remarks].filter(Boolean).join(' · '), by: m.by || '', m });
    });
    rows.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
    return rows;
  }
  function renderRecords() {
    const w = words();
    const rows = recordRows().filter(r => !w.length || w.every(x => lc([r.item.code, r.item.name, r.party, r.ref, r.remarks, r.by].join(' ')).includes(x)));
    const { t, tb } = table([{ label: '' }, { label: 'Date' }, { label: 'Code' }, { label: 'Tool' }, { label: 'What' }, { label: 'Qty', num: true }, { label: 'Supplier / from' }, { label: 'DR / PO no.' }, { label: 'Price / unit', num: true }, { label: 'Remarks' }, { label: 'Entered by' }, { label: '' }]);
    rows.slice(0, LIMIT).forEach(r => {
      const tr = E('tr');
      tr.append(td('', thumb(r.item)), td('', fmtDate(r.date)), td('code', r.item.code), td('', r.item.name), td('', E('span', r.type === 'tool' ? 'pill doing' : 'pill', r.label)),
        td('num', r.qty ? fmtQty(r.qty) + ' ' + (r.item.uom || '') : ''), td('', r.party), td('', r.ref), td('num', pesoOr(r.price)), td('', r.remarks), td('', r.by));
      const act = td('act');
      if (r.m) act.append(actBtn('✎', 'Correct this entry (admin PIN)', () => openUnits({ move: r.m })));
      tr.appendChild(act); tb.appendChild(tr);
    });
    body.appendChild(t);
    body.appendChild(E('div', rows.length ? 'invNote' : 'invEmpty', rows.length ? `${rows.length} record${rows.length === 1 ? '' : 's'}. Every new tool and every added unit is listed here with the supplier and delivery receipt / PO number.` : 'No new tools or added units in this period.'));
  }
  function recordsReport() {
    const rows = recordRows().map(r => `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.item.code)}</td><td>${esc(r.item.name)}</td><td>${esc(r.label)}</td><td class="num">${r.qty ? fmtQty(r.qty) + ' ' + esc(r.item.uom || '') : ''}</td><td>${esc(r.party)}</td><td>${esc(r.ref)}</td><td class="num">${esc(pesoOr(r.price))}</td><td>${esc(r.remarks)}</td><td>${esc(r.by)}</td></tr>`).join('');
    return { title: 'Tool records', html: K.reportDoc('New tools and added units', `${recordRows().length} records · ${fmtDate(S().today)}`, K.rpTable([{ label: 'Date' }, { label: 'Code' }, { label: 'Tool' }, { label: 'What' }, { label: 'Qty', num: true }, { label: 'Supplier / from' }, { label: 'DR / PO no.' }, { label: 'Price / unit', num: true }, { label: 'Remarks' }, { label: 'Entered by' }], rows) + '<div class="sign"><div>Prepared by</div><div>Noted by</div></div>'), landscape: true };
  }

  // ---------- Removed tab: every unit that left the stock, with who approved it ----------
  function removedRows() {
    return S().movements.filter(m => m.dir === 'out' && inPeriod(m.date) && itemById(m.itemId)).sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
  }
  function renderRemoved() {
    const w = words();
    const rows = removedRows().filter(m => { const it = itemById(m.itemId); return !w.length || w.every(x => lc([it.code, it.name, m.reason, m.remarks, m.approvedBy, m.by].join(' ')).includes(x)); });
    const { t, tb } = table([{ label: '' }, { label: 'Date' }, { label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Value', num: true }, { label: 'Why' }, { label: 'What happened' }, { label: 'Approved by' }, { label: 'Entered by' }, { label: '' }]);
    rows.slice(0, LIMIT).forEach(m => {
      const it = itemById(m.itemId); const tr = E('tr');
      tr.append(td('', thumb(it)), td('', fmtDate(m.date)), td('code', it.code), td('', it.name), td('num', fmtQty(m.qty) + ' ' + (it.uom || '')), td('num', hasPrice(it.price) ? peso(it.price * m.qty) : ''), td('', E('span', 'pill over', m.reason || '')), td('', m.remarks), td('', m.approvedBy || '—'), td('', m.by));
      const act = td('act');
      act.append(actBtn('🗑', 'Delete this entry (admin PIN)', () => K.deleteMove(Object.assign({}, m, { uom: it.uom, itemName: it.name }))));
      tr.appendChild(act); tb.appendChild(tr);
    });
    body.appendChild(t);
    body.appendChild(E('div', rows.length ? 'invNote' : 'invEmpty', rows.length ? `${rows.length} removal${rows.length === 1 ? '' : 's'}. Removing units needs a reason, an explanation, the boss's name and the admin PIN. Print this list for the boss to sign.` : 'No units removed in this period.'));
  }
  function removedReport() {
    const rows = removedRows().map(m => { const it = itemById(m.itemId); return `<tr><td>${esc(fmtDate(m.date))}</td><td>${esc(it.code)}</td><td>${esc(it.name)}</td><td class="num">${fmtQty(m.qty)} ${esc(it.uom || '')}</td><td class="num">${hasPrice(it.price) ? esc(peso(it.price * m.qty)) : ''}</td><td>${esc(m.reason)}</td><td>${esc(m.remarks)}</td><td>${esc(m.approvedBy)}</td><td>${esc(m.by)}</td></tr>`; }).join('');
    return { title: 'Removed units', html: K.reportDoc('Tools removed from the stock', `${removedRows().length} removals · ${fmtDate(S().today)}`, K.rpTable([{ label: 'Date' }, { label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Value', num: true }, { label: 'Why' }, { label: 'What happened' }, { label: 'Approved by' }, { label: 'Entered by' }], rows) + '<div class="sign"><div>Prepared by</div><div>Approved by (boss)</div></div>'), landscape: true };
  }


  // ---------- Insights tab ----------
  const IDLE_DAYS = 90;
  function insightsData() {
    const s = S(), today = s.today;
    const from = addDays(today, -(parseInt(F.iPeriod, 10) - 1));
    const live = s.items.filter(i => !i.archived);
    const byId = new Map(s.items.map(i => [i.id, i]));
    const secs = [];
    const val = (i, q) => (hasPrice(i.price) ? peso(i.price * q) : '');

    // 1. needs attention
    const att = [];
    s.loans.filter(l => l.open > 0 && l.dueDate && l.dueDate < today).forEach(l => att.push({ days: daysBetween(l.dueDate, today), itemId: l.itemId, cells: ['Overdue return', l.itemName, `${l.borrower} · ${fmtQty(l.open)} ${l.uom}`, `${daysBetween(l.dueDate, today)} days late`] }));
    live.filter(i => i.calibrationDue && i.calibrationDue <= addDays(today, 30)).forEach(i => { const dd = daysBetween(i.calibrationDue, today); att.push({ days: dd, itemId: i.id, cells: ['Calibration', i.name, fmtDate(i.calibrationDue), dd > 0 ? `${dd} days overdue` : `in ${-dd} days`] }); });
    s.repairs.filter(r => r.status === 'open' && daysBetween(r.date, today) > 30).forEach(r => att.push({ days: daysBetween(r.date, today), itemId: r.itemId, cells: ['Still in repair', r.itemName, `${fmtQty(r.qty)} ${r.uom} · ${r.kind}${r.borrower ? ' · ' + r.borrower : ''}`, `${daysBetween(r.date, today)} days`] }));
    att.sort((a, b) => b.days - a.days);
    secs.push({ id: 'attention', title: '1. Needs attention', note: 'Overdue returns, calibration due in 30 days or already overdue, and tools in repair for more than 30 days.', cols: [{ label: 'What' }, { label: 'Tool' }, { label: 'Who / detail' }, { label: 'When' }], rows: att.slice(0, 40), empty: 'Nothing needs attention right now.' });

    // 2. problem tools and people
    const rep = s.repairs.filter(r => r.date >= from);
    const tm = new Map();
    rep.forEach(r => { const x = tm.get(r.itemId) || { n: 0, q: 0, lost: 0 }; x.n++; x.q += r.qty; if (r.kind === 'Lost' || r.status === 'lost') x.lost += r.qty; tm.set(r.itemId, x); });
    const pt = [...tm.entries()].map(([id, x]) => ({ i: byId.get(id), x })).filter(e => e.i).sort((a, b) => b.x.q - a.x.q || b.x.n - a.x.n).slice(0, 8)
      .map(e => ({ itemId: e.i.id, cells: [e.i.name, String(e.x.n), fmtQty(e.x.q), e.x.lost ? fmtQty(e.x.lost) : '', val(e.i, e.x.q)] }));
    secs.push({ id: 'ptools', title: '2a. Problem tools', note: 'Tools reported damaged or lost most often in the period. Consider replacing them or checking how they are used.', cols: [{ label: 'Tool' }, { label: 'Reports', num: true }, { label: 'Units', num: true }, { label: 'Lost', num: true }, { label: 'Value', num: true }], rows: pt, empty: 'No damage or loss reports in this period.' });
    const pm = new Map();
    const P = (n) => { const k = lc(n.trim()); if (!pm.has(k)) pm.set(k, { name: n.trim(), loans: 0, late: 0, bad: 0 }); return pm.get(k); };
    s.loans.filter(l => l.dateOut >= from && l.borrower).forEach(l => {
      const p = P(l.borrower); p.loans++;
      (l.returns || []).forEach(r => { if (l.dueDate && r.date > l.dueDate) p.late++; });
      if (l.open > 0 && l.dueDate && l.dueDate < today) p.late++;
    });
    rep.filter(r => r.borrower).forEach(r => { P(r.borrower).bad += r.qty; });
    const pp = [...pm.values()].filter(p => p.late || p.bad).sort((a, b) => (b.late + b.bad) - (a.late + a.bad)).slice(0, 8).map(p => ({ cells: [p.name, String(p.loans), p.late ? String(p.late) : '', p.bad ? fmtQty(p.bad) : ''] }));
    secs.push({ id: 'ppeople', title: '2b. Borrowers to follow up', note: 'Late returns and damaged / lost units under a borrower\'s name in the period.', cols: [{ label: 'Borrower' }, { label: 'Loans', num: true }, { label: 'Late returns', num: true }, { label: 'Damaged / lost units', num: true }], rows: pp, empty: 'No late returns or damage in this period.' });

    // 3. idle tools
    const lastLent = new Map();
    s.loans.forEach(l => { if (!lastLent.has(l.itemId) || l.dateOut > lastLent.get(l.itemId)) lastLent.set(l.itemId, l.dateOut); });
    const idle = live.filter(i => i.stat.onHand > 0).map(i => {
      const last = lastLent.get(i.id) || '';
      const since = last || String(i.createdAt || '').slice(0, 10) || today;
      return { i, last, days: daysBetween(since, today) };
    }).filter(e => e.days >= IDLE_DAYS).sort((a, b) => b.days - a.days).slice(0, 15)
      .map(e => ({ itemId: e.i.id, cells: [e.i.name, `${fmtQty(e.i.stat.onHand)} ${e.i.uom}`, e.i.location, e.last ? fmtDate(e.last) : 'never lent', `${e.days} days`, val(e.i, e.i.stat.onHand)] }));
    secs.push({ id: 'idle', title: '3. Idle tools', note: `Not lent for ${IDLE_DAYS} days or more (or never lent). They may be misplaced, not needed, or worth moving to another site.`, cols: [{ label: 'Tool' }, { label: 'In stock', num: true }, { label: 'Location' }, { label: 'Last lent' }, { label: 'Idle', num: true }, { label: 'Value', num: true }], rows: idle, empty: 'No idle tools.' });

    // 4. always out
    const lent = new Map();
    s.loans.filter(l => l.dateOut >= from).forEach(l => lent.set(l.itemId, (lent.get(l.itemId) || 0) + 1));
    const hot = live.filter(i => i.stat.onHand > 0 && (i.stat.available <= 0 || ((lent.get(i.id) || 0) >= 3 && i.stat.available / i.stat.onHand <= 0.34)))
      .sort((a, b) => (lent.get(b.id) || 0) - (lent.get(a.id) || 0)).slice(0, 10)
      .map(i => ({ itemId: i.id, cells: [i.name, fmtQty(i.stat.onHand), fmtQty(i.stat.available), String(lent.get(i.id) || 0), i.stat.available <= 0 ? 'All out now: consider buying more' : 'Often borrowed, few left'] }));
    secs.push({ id: 'hot', title: '4. Tools that are always out', note: 'Tools with nothing available now, or borrowed often with little left. These are the ones to buy more of.', cols: [{ label: 'Tool' }, { label: 'Units', num: true }, { label: 'Available', num: true }, { label: 'Lent (period)', num: true }, { label: 'Suggestion' }], rows: hot, empty: 'No tool is short right now.' });

    // 5. losses and removals
    const outs = s.movements.filter(m => m.dir === 'out' && m.date >= from && byId.has(m.itemId));
    const agg = (keyFn) => { const m = new Map(); outs.forEach(o => { const k = keyFn(o); const x = m.get(k) || { n: 0, q: 0, v: 0, pq: 0 }; const it = byId.get(o.itemId); x.n++; x.q += o.qty; if (hasPrice(it.price)) { x.v += it.price * o.qty; x.pq += o.qty; } m.set(k, x); }); return m; };
    const monthTxt = (k) => { const [y, mo] = k.split('-'); return new Date(+y, +mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
    const rowsOf = (m, label, sortKeys) => [...m.entries()].sort(sortKeys).map(([k, x]) => ({ cells: [label(k), String(x.n), fmtQty(x.q), x.pq ? peso(x.v) + (x.pq < x.q ? ' *' : '') : ''] }));
    const totQ = outs.reduce((a, o) => a + o.qty, 0), totV = outs.reduce((a, o) => a + (hasPrice(byId.get(o.itemId).price) ? byId.get(o.itemId).price * o.qty : 0), 0);
    const note5 = `Units that left the stock (lost, written off, disposed, transferred, corrections). * = some units have no price, so the value is not complete.`;
    secs.push({ id: 'lossm', title: '5a. Removals by month', note: note5, cols: [{ label: 'Month' }, { label: 'Entries', num: true }, { label: 'Units', num: true }, { label: 'Value', num: true }], rows: rowsOf(agg(o => o.date.slice(0, 7)), monthTxt, (a, b) => b[0].localeCompare(a[0])), empty: 'No units were removed in this period.', foot: outs.length ? `Total: ${fmtQty(totQ)} units${totV ? ' · ' + peso(totV) : ''}` : '' });
    secs.push({ id: 'lossr', title: '5b. Removals by reason', note: '', cols: [{ label: 'Reason' }, { label: 'Entries', num: true }, { label: 'Units', num: true }, { label: 'Value', num: true }], rows: rowsOf(agg(o => o.reason || 'Other'), (k) => k, (a, b) => b[1].q - a[1].q), empty: 'No units were removed in this period.' });

    // 6. data quality
    const noPrice = live.filter(i => !hasPrice(i.price)), noLoc = live.filter(i => !i.location);
    const noSer = live.filter(i => hasPrice(i.price) && i.price >= 5000 && !i.serial);
    const eg = (l) => l.slice(0, 4).map(i => i.name).join(', ') + (l.length > 4 ? ', …' : '');
    const dq = [];
    if (noPrice.length) dq.push({ cells: ['No price', String(noPrice.length), eg(noPrice)], go: 'noprice' });
    if (noLoc.length) dq.push({ cells: ['No storage location', String(noLoc.length), eg(noLoc)], go: 'noloc' });
    if (noSer.length) dq.push({ cells: ['No serial number (priced ₱5,000 or more)', String(noSer.length), eg(noSer)], go: '' });
    secs.push({ id: 'dq', title: '6. Data to complete', note: 'Fill these in over time. Nothing is blocked because of them.', cols: [{ label: 'Check' }, { label: 'Tools', num: true }, { label: 'Examples' }], rows: dq, empty: 'Everything is filled in. Well done.' });

    // headline numbers
    const priced = live.filter(i => hasPrice(i.price));
    const stockVal = priced.reduce((a, i) => a + i.price * i.stat.onHand, 0);
    const repairVal = priced.reduce((a, i) => a + i.price * (i.stat.inRepair || 0), 0);
    const head = [
      ['Value of tools in stock', priced.length ? peso(stockVal) : '—', `${priced.length} of ${live.length} tools have a price`],
      ['Out of service now', repairVal ? peso(repairVal) : '—', 'damaged / in repair, priced tools only'],
      ['Removed in this period', outs.length ? fmtQty(totQ) + (totQ === 1 ? ' unit' : ' units') : '0', totV ? peso(totV) : 'no value'],
      ['Needs attention', String(att.length), 'overdue, calibration, long repairs']
    ];
    return { secs, head, from };
  }

  function renderInsights() {
    const { secs, head } = insightsData();
    const kp = E('div', 'invKpis');
    head.forEach(([label, big, sub]) => { const k = E('div', 'invKpi tlKpi'); k.append(E('b', '', big), E('span', '', label), E('small', '', sub)); kp.appendChild(k); });
    body.appendChild(kp);
    secs.forEach(sc => {
      const box = E('div'); box.style.margin = '16px 0 8px';
      const h = E('div', 'invSub', sc.title); h.style.fontWeight = '600'; h.style.fontSize = '14px';
      box.appendChild(h);
      if (sc.note) box.appendChild(E('div', 'invNote', sc.note));
      if (!sc.rows.length) { box.appendChild(E('div', 'invEmpty', sc.empty)); body.appendChild(box); return; }
      const cols = sc.cols.concat(sc.rows.some(r => r.itemId || r.go) ? [{ label: '' }] : []);
      const { t, tb } = table(cols);
      sc.rows.forEach(r => {
        const tr = E('tr');
        sc.cols.forEach((c, n) => tr.appendChild(td(c.num ? 'num' : '', r.cells[n])));
        if (cols.length > sc.cols.length) {
          const act = td('act');
          if (r.itemId) act.appendChild(actBtn('Open', 'Open this tool', () => openToolDetail(r.itemId)));
          if (r.go) act.appendChild(actBtn('Show', 'Show these tools in the Tools tab', () => { tab = 'tools'; F.status = r.go; render(); }));
          tr.appendChild(act);
        }
        tb.appendChild(tr);
      });
      box.appendChild(t);
      if (sc.foot) box.appendChild(E('div', 'invNote', sc.foot));
      body.appendChild(box);
    });
  }

  function insightsReport() {
    const { secs, head, from } = insightsData();
    const kp = `<table class="rp"><tbody><tr>${head.map(h => `<td><b>${esc(h[1])}</b><br>${esc(h[0])}<br><small>${esc(h[2])}</small></td>`).join('')}</tr></tbody></table>`;
    const html = secs.map(sc => `<h2 style="font-size:13px;margin:16px 0 4px">${esc(sc.title)}</h2>${sc.note ? `<p style="font-size:10px;color:#555;margin:0 0 4px">${esc(sc.note)}</p>` : ''}` +
      (sc.rows.length ? K.rpTable(sc.cols, sc.rows.map(r => '<tr>' + r.cells.map((c, n) => `<td${sc.cols[n].num ? ' class="num"' : ''}>${esc(c)}</td>`).join('') + '</tr>').join('')) + (sc.foot ? `<p style="font-size:10px"><b>${esc(sc.foot)}</b></p>` : '') : `<p style="font-size:10px">${esc(sc.empty)}</p>`)).join('');
    return { title: 'Tools insights', html: K.reportDoc('Tools & Equipment insights', `${fmtDate(from)} to ${fmtDate(S().today)}`, kp + html + '<div class="sign"><div>Prepared by</div><div>Noted by</div></div>'), landscape: true };
  }

  // ---------- add / remove / correct units ----------
  function openUnits(opts) {
    opts = opts || {};
    const old = opts.move || null;
    const dir = old ? old.dir : opts.dir === 'out' ? 'out' : 'in';
    const out = dir === 'out';
    const preset = itemById(old ? old.itemId : opts.itemId);
    const d = dialog(old ? (out ? 'Correct a removal' : 'Correct added units') : out ? 'Remove units from the stock' : 'Add units', {});
    const item = itemInput('tlUnitList', S().items.filter(i => !i.archived || (old && i.id === old.itemId)), preset);
    if (old) item.disabled = true;
    const info = E('div', 'invInfo');
    const qty = inp('number', old ? String(old.qty) : '1');
    const date = inp('date', old ? old.date : S().today);
    const reason = sel(out ? S().toolOutReasons : S().inReasons.filter(x => x !== 'Returned by user'), old && old.reason ? old.reason : out ? '' : S().inReasons[0]);
    if (out && !old) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Choose a reason…'; reason.insertBefore(o, reason.firstChild); reason.value = ''; }
    const party = inp('text', old ? old.party : '', { maxLength: 120 });
    datalist('tlSupList', S().items.map(i => i.supplier));
    party.setAttribute('list', 'tlSupList');
    const ref = inp('text', old ? old.ref : '', { maxLength: 60 });
    const price = inp('number', old && hasPrice(old.price) ? old.price : '');
    const note = inp('text', old ? old.remarks : '', { maxLength: 500 });
    const boss = inp('text', old ? old.approvedBy : '', { maxLength: 120 });
    const showInfo = () => { const it = resolveItem(item.value); info.textContent = it ? `Now in stock: ${fmtQty(it.stat.onHand)} ${it.uom} (${fmtQty(it.stat.available)} available)` : ''; };
    item.addEventListener('input', showInfo); item.addEventListener('change', showInfo);
    const c = d.content;
    c.append(fld('Tool', item), info, grid(fld(out ? 'Units to remove' : 'Units added', qty), fld('Date', date)), fld(out ? 'Why are the units removed?' : 'Reason', reason));
    if (out) {
      c.append(E('p', 'invNote', 'Removing units needs permission from the boss. Explain what happened, type the boss\'s name, then the boss types the admin PIN.'));
      c.append(fld('What happened (required)', note), fld('Approved by (the boss)', boss));
    } else {
      c.append(grid(fld('Supplier / from', party), fld('DR / PO no.', ref)), grid(fld('Price per unit, ₱ (optional)', price, 'Becomes the tool\'s current price.'), fld('Remarks (optional)', note)));
      if (old) c.append(E('p', 'invNote', 'Correcting an entry needs the admin PIN.'));
    }
    showInfo();
    d.button(out ? 'Remove units' : 'Save', 'primary', async () => {
      const it = old ? itemById(old.itemId) : resolveItem(item.value);
      if (!it) { d.say('Please pick the tool from the list.', true); return; }
      if (out && !reason.value) { d.say('Choose why the units are removed.', true); return; }
      if (out && note.value.trim().length < 5) { d.say('Please explain what happened (a few words).', true); return; }
      if (out && boss.value.trim().length < 2) { d.say('Type the name of the boss who approved this.', true); return; }
      if (out && !old && !confirm(`Remove ${qty.value} ${it.uom} of ${it.name} from the stock?\n\nReason: ${reason.value}\nApproved by: ${boss.value || '(not typed)'}\n\nThis is recorded and cannot be deleted without the admin PIN.`)) return;
      const base = { id: old ? old.id : undefined, itemId: it.id, dir, qty: qty.value, date: date.value, reason: reason.value, party: party.value, ref: ref.value, price: out ? '' : price.value, remarks: note.value, approvedBy: boss.value };
      const guarded = out || !!old;
      const r = guarded
        ? await K.withPin((pin) => api.invMoveSave(Object.assign({}, base, { pin })), `${old ? 'Correct' : out ? 'Remove' : 'Add'} ${qty.value} ${it.uom} of ${it.name}`)
        : await api.invMoveSave(base);
      if (r.canceled) return;
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close(); say(out ? 'Units removed and recorded.' : 'Units added and recorded.');
    });
    d.button('Cancel', '', d.close);
    (preset ? qty : item).focus();
  }

  // ---------- History tab: lends, returns, repairs and unit changes in one log ----------
  const EV_LABEL = { lend: 'Lent', return: 'Returned', damage: 'Damage reported', repaired: 'Repaired' };
  function historyRows() {
    const rows = [];
    S().events.forEach(x => rows.push({ kind: 'event', type: x.type, x, itemId: x.itemId, date: x.date, at: x.createdAt || '', label: EV_LABEL[x.type] || x.type, qty: x.qty, who: x.who || '', remarks: x.remarks || '' }));
    S().movements.forEach(m => rows.push({ kind: 'move', type: m.dir, m, itemId: m.itemId, date: m.date, at: m.createdAt || '', label: m.dir === 'in' ? 'Units added' : 'Units removed', qty: m.qty, who: m.party || '', remarks: [m.reason, m.remarks].filter(Boolean).join(' · ') }));
    rows.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
    return rows;
  }

  function renderHistory() {
    const w = words();
    const from = F.hPeriod ? addDays(S().today, -(parseInt(F.hPeriod, 10) - 1)) : '';
    const rows = historyRows().filter(r => {
      if (from && r.date < from) return false;
      if (F.hType && r.type !== F.hType) return false;
      if (!w.length) return true;
      const it = itemById(r.itemId) || {};
      return w.every(x => lc([it.code, it.name, r.who, r.remarks, r.label].join(' ')).includes(x));
    });
    const { t, tb } = table([{ label: '' }, { label: 'Date' }, { label: 'Code' }, { label: 'Tool' }, { label: 'What' }, { label: 'Qty', num: true }, { label: 'Person' }, { label: 'Reference' }, { label: 'Remarks' }, { label: 'By' }, { label: '' }]);
    rows.slice(0, LIMIT).forEach(r => {
      const it = itemById(r.itemId) || {};
      const tr = E('tr');
      const src = r.kind === 'event' ? r.x : r.m;
      const cls = r.type === 'damage' ? 'pill over' : r.type === 'lend' ? 'pill doing' : 'pill';
      tr.append(td('', thumb(it)), td('', fmtDate(r.date)), td('code', it.code), td('', it.name), td('', E('span', cls, r.label)), td('num', fmtQty(r.qty) + ' ' + (it.uom || '')),
        td('', r.who), td('', src.ref || ''), td('', r.remarks), td('', src.by || ''));
      const act = td('act');
      if (r.kind === 'event') act.append(actBtn('↩', 'Undo this entry', () => undoFlow(r.x)));
      else act.append(actBtn('✎', 'Edit this entry', () => openUnits({ move: r.m })), document.createTextNode(' '), actBtn('🗑', 'Delete this entry', () => K.deleteMove(Object.assign({}, r.m, { uom: it.uom, itemName: it.name }))));
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    body.appendChild(t);
    if (!rows.length) body.appendChild(E('div', 'invEmpty', 'No history for these filters.'));
    else body.appendChild(E('div', 'invNote', rows.length > LIMIT ? `Showing the newest ${LIMIT} of ${rows.length} entries.` : `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}. Use ↩ on a lend, return or damage line to undo it together with what came from it.`));
  }

  // undo a lend, return, damage or repair line, with a list of what will change
  async function undoFlow(ev) {
    const payload = { type: ev.type, id: ev.id, returnId: ev.returnId };
    const p = await api.invEventUndo(payload, true);
    if (!p.ok) { say(p.error); return; }
    if (!confirm('Undo this entry?\n\n' + p.effects.map(x => '• ' + x).join('\n'))) return;
    const r = await K.withPin((pin) => api.invEventUndo(payload, false, pin), 'Undo: ' + p.effects.join('; '));
    if (r.canceled) return;
    if (!r.ok) { say(r.error); return; }
    useState(r); say('Undone.');
  }

  // ---------- lend ----------
  function openCheckout(itemId) {
    const preset = itemId ? itemById(itemId) : null;
    const d = dialog('Lend a tool');
    const item = itemInput('tlToolList', S().items.filter(i => !i.archived), preset);
    const info = E('div', 'invInfo');
    const pic = E('div'); pic.style.minHeight = '0';
    const qty = inp('number', '1');
    const who = inp('text', '', { maxLength: 120 }); who.setAttribute('list', 'tlBorrowers');
    datalist('tlBorrowers', S().loans.map(l => l.borrower));
    const loc = inp('text', '', { maxLength: 120 }); loc.setAttribute('list', 'tlUsedAt');
    datalist('tlUsedAt', S().items.map(i => i.location).concat(S().loans.map(l => l.location)));
    const ref = inp('text', '', { maxLength: 80 }); ref.placeholder = 'BRF no.';
    const out = inp('date', S().today); const due = inp('date', '');
    const remarks = inp('text', '', { maxLength: 500 });
    const mkForm = document.createElement('input'); mkForm.type = 'checkbox'; mkForm.checked = true;
    const mkRow = E('label', 'invChk'); mkRow.append(mkForm, E('span', '', 'Also make a tool borrowing form (to print or save as PDF)'));
    const loanIds = [];
    const showInfo = () => {
      const it = resolveItem(item.value);
      info.textContent = it ? `Available: ${fmtQty(it.stat.available)} of ${fmtQty(it.stat.onHand)} ${it.uom}${it.stat.inRepair ? ` (${fmtQty(it.stat.inRepair)} damaged)` : ''}` : '';
      pic.innerHTML = '';
      if (it && it.photo) { const im = document.createElement('img'); im.src = K.photoSrc(it.photo); im.alt = ''; im.style.cssText = 'height:70px;border-radius:8px;margin:0 0 8px;display:block'; pic.appendChild(im); }
    };
    item.addEventListener('input', showInfo); item.addEventListener('change', showInfo);
    const c = d.content;
    c.append(fld('Tool', item), info, pic, grid(fld('Quantity', qty), fld('Borrower', who)));
    c.append(grid(fld('Where it will be used', loc), fld('BRF / reference no.', ref)));
    c.append(grid(fld('Date taken', out), fld('Expected return (optional)', due)), fld('Remarks', remarks));
    c.append(mkRow);
    showInfo();
    async function saveLoan(another) {
      const it = resolveItem(item.value);
      if (!it) { d.say('Please pick the tool from the list (or scan its code).', true); return; }
      const r = await api.invCheckout({ itemId: it.id, qty: qty.value, borrower: who.value, location: loc.value, ref: ref.value, dateOut: out.value, dueDate: due.value, remarks: remarks.value });
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); loanIds.push(r.loan.id); say(`${it.name} lent to ${r.loan.borrower}.`);
      if (another) { item.value = ''; qty.value = '1'; remarks.value = ''; showInfo(); item.focus(); d.say('Saved. Add the next tool for the same form:'); return; }
      d.close();
      if (mkForm.checked) K.makeForm(null, loanIds);
    }
    d.button('Save', 'primary', () => saveLoan(false));
    d.button('Save & add another tool', '', () => saveLoan(true));
    d.button('Cancel', '', d.close);
    (preset ? who : item).focus();
  }

  // ---------- return ----------
  function returnForItem(i) {
    const open = S().loans.filter(l => l.itemId === i.id && l.open > 0);
    if (!open.length) { say('Nothing is borrowed for this tool.'); return; }
    if (open.length === 1) { openReturn(open[0]); return; }
    const d = dialog('Who is returning ' + i.name + '?', { small: true });
    const { t, tb } = table([{ label: 'Borrower' }, { label: 'Qty', num: true }, { label: 'Taken' }, { label: '' }]);
    open.forEach(l => {
      const tr = E('tr');
      tr.append(td('', l.borrower), td('num', fmtQty(l.open)), td('', fmtDate(l.dateOut)));
      const act = td('act'); act.append(actBtn('Return', 'Return', () => { d.close(); openReturn(l); }));
      tr.append(act); tb.appendChild(tr);
    });
    d.content.append(t);
    d.button('Cancel', '', d.close);
  }

  // "Return a tool" in the top bar: pick from everything that is out
  // "Return a tool": search the tools that are out (by tool, code, borrower or reference), then press Return
  function pickReturn() {
    const all = S().loans.filter(l => l.open > 0).sort((a, b) => a.dateOut.localeCompare(b.dateOut));
    if (!all.length) { say('No tools are out right now.'); return; }
    const d = dialog('Return a tool', { wide: true });
    const find = inp('search', '', { placeholder: 'Type a tool, code, borrower or reference…' });
    find.style.width = '100%';
    const note = E('div', 'invNote');
    const box = E('div', 'invList'); box.style.maxHeight = '50vh';
    d.content.append(find, note, box);
    const SHOW = 100;
    const draw = () => {
      const w = lc(find.value).split(/\s+/).filter(Boolean);
      const list = all.filter(l => { const hay = lc([l.itemCode, l.itemName, l.borrower, l.location, l.ref].join(' ')); return w.every(x => hay.includes(x)); });
      const { t, tb } = table([{ label: '' }, { label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Borrower' }, { label: 'Taken' }, { label: '' }]);
      list.slice(0, SHOW).forEach(l => {
        const tr = E('tr');
        tr.append(td('', thumb(itemById(l.itemId))), td('code', l.itemCode), td('', l.itemName), td('num', fmtQty(l.open)), td('', l.borrower), td('', fmtDate(l.dateOut)));
        const act = td('act'); act.append(actBtn('Return', 'Return', () => { d.close(); openReturn(l); }));
        tr.append(act); tb.appendChild(tr);
      });
      box.innerHTML = '';
      box.appendChild(t);
      if (!list.length) box.appendChild(E('div', 'invEmpty', 'Nothing matches. Check the spelling, or try the borrower\'s name.'));
      note.textContent = list.length > SHOW ? `Showing the first ${SHOW} of ${list.length} tools that are out. Keep typing to narrow it down.` : `${list.length} of ${all.length} tools that are out.`;
    };
    find.addEventListener('input', draw);
    // Enter (or a barcode scanner) opens the return form when only one is left
    find.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const w = lc(find.value).split(/\s+/).filter(Boolean);
      const list = all.filter(l => { const hay = lc([l.itemCode, l.itemName, l.borrower, l.location, l.ref].join(' ')); return w.every(x => hay.includes(x)); });
      if (list.length === 1) { d.close(); openReturn(list[0]); }
    });
    draw();
    d.button('Close', '', d.close);
    setTimeout(() => find.focus(), 0);
  }

  function openReturn(l) {
    const d = dialog('Return a tool', {});
    const qty = inp('number', l.open); qty.max = String(l.open);
    const date = inp('date', S().today);
    const cond = sel(S().returnConditions || ['Good', 'Needs repair', 'Damaged', 'Lost'], 'Good');
    const bad = inp('number', l.open); bad.min = '1'; bad.max = String(l.open);
    const badFld = fld('How many are damaged / lost', bad);
    const remarks = inp('text', '', { maxLength: 300 });
    const by = inp('text', l.borrower, { maxLength: 120 });
    const recv = inp('text', S().settings.user || S().settings.defaultUser || '', { maxLength: 60 });
    const byWarn = E('div', 'invInfo');
    const hint = E('div', 'invInfo');
    const pics = window.DamagePhotos ? window.DamagePhotos.picker([], d.overlay, (m) => d.say(m, !!m)) : null;
    const picFld = pics ? fld('Photos of the damage (optional)', pics.el, 'Add up to 3 pictures, then use ✏ Mark to circle or point at the damaged part.') : null;
    const sync = () => {
      const ok = cond.value === 'Good';
      badFld.style.display = ok ? 'none' : '';
      if (picFld) picFld.style.display = ok || cond.value === 'Lost' ? 'none' : '';
      bossFld.style.display = cond.value === 'Lost' ? '' : 'none';
      hint.textContent = ok ? '' : cond.value === 'Lost'
        ? 'Lost units are removed from stock and kept in the Repairs list.'
        : 'These units stay in stock but cannot be lent until they are repaired or written off in the Repairs tab. Say what happened in Remarks.';
      if (!ok && (!bad.value || Number(bad.value) > Number(qty.value))) bad.value = qty.value;
    };
    const boss = inp('text', '', { maxLength: 120 });
    const bossFld = fld('Approved by (the boss) — needed for a lost tool', boss);
    const same = () => lc(by.value.trim()) === lc(l.borrower.trim());
    const syncBy = () => { byWarn.textContent = by.value.trim() && !same() ? `Note: this was borrowed by ${l.borrower}, but is being returned by ${by.value.trim()}.` : ''; byWarn.style.color = '#d97706'; };
    by.addEventListener('input', syncBy);
    cond.addEventListener('change', sync); qty.addEventListener('input', sync);
    const c = d.content;
    const it = itemById(l.itemId);
    const head = E('div', 'invRow'); head.append(thumb(it), E('span', '', `${l.itemName} — ${fmtQty(l.open)} ${l.uom} borrowed by ${l.borrower}`));
    c.append(head);
    c.append(grid(fld('Quantity returned', qty), fld('Date returned', date)), grid(fld('Returned by', by, 'Who brought it back'), fld('Received by', recv, 'Who checked it in')), byWarn, fld('Condition when returned', cond), badFld, hint, fld('Remarks', remarks), bossFld);
    if (picFld) c.append(picFld);
    sync();
    d.button('Mark as returned', 'primary', async () => {
      if (cond.value === 'Lost' && !confirm('Mark these units as LOST? They will be removed from your stock count.')) return;
      if (by.value.trim() && !same() && !confirm(`This tool was borrowed by ${l.borrower}, but is being returned by ${by.value.trim()}.\n\nRecord the return anyway?`)) return;
      const rb = { qty: qty.value, date: date.value, condition: cond.value, badQty: bad.value, remarks: remarks.value, returnedBy: by.value, receivedBy: recv.value, photos: pics && cond.value !== 'Good' && cond.value !== 'Lost' ? pics.get() : [] };
      const r = cond.value === 'Lost'
        ? await K.withPin((pin) => api.invReturn(l.id, Object.assign({}, rb, { approvedBy: boss.value, pin })), `Return as LOST: ${l.itemName}`)
        : await api.invReturn(l.id, rb);
      if (r.canceled) return;
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close();
      say(cond.value === 'Good' ? 'Return recorded.' : 'Return recorded. The damaged units are in the Repairs tab.');
      if (cond.value !== 'Good') { tab = 'repairs'; render(); }
    });
    d.button('Cancel', '', d.close);
  }

  // ---------- reports ----------
  function toolsReport(kind) {
    const s = S();
    const sub = (n, what) => `${n} ${what} · ${fmtDate(s.today)}`;
    if (kind === 'catalogue' || kind === 'list') {
      const withPic = kind === 'catalogue';
      const list = s.items.filter(i => !i.archived).sort((a, b) => lc(a.name).localeCompare(lc(b.name)));
      const cols = [];
      if (withPic) cols.push({ label: 'Picture' });
      cols.push({ label: 'Code' }, { label: 'Tool' }, { label: 'Type' }, { label: 'Total', num: true }, { label: 'Available', num: true }, { label: 'Borrowed', num: true }, { label: 'Damaged', num: true }, { label: 'Condition' }, { label: 'Location' }, { label: 'Calibration due' }, { label: 'Price', num: true }, { label: 'Value', num: true });
      const rows = list.map(i => `<tr>${withPic ? `<td>${i.photo ? `<img src="${esc(K.photoSrc(i.photo))}" style="height:54px;width:72px;object-fit:cover;border-radius:4px" alt="">` : ''}</td>` : ''}<td>${esc(i.code)}</td><td>${esc(i.name)}${i.serial ? `<br><small>${esc(i.serial)}</small>` : ''}</td><td>${esc(i.group)}</td><td class="num">${fmtQty(i.stat.onHand)}</td><td class="num">${fmtQty(i.stat.available)}</td><td class="num">${i.stat.onLoan ? fmtQty(i.stat.onLoan) : ''}</td><td class="num">${i.stat.inRepair ? fmtQty(i.stat.inRepair) : ''}</td><td>${esc(i.condition)}</td><td>${esc(i.location)}</td><td>${esc(fmtDate(i.calibrationDue))}</td><td class="num">${esc(pesoOr(i.price))}</td><td class="num">${hasPrice(i.price) ? esc(peso(i.price * i.stat.onHand)) : ''}</td></tr>`).join('');
      const priced = list.filter(i => hasPrice(i.price));
      const total = priced.reduce((a, i) => a + i.price * i.stat.onHand, 0);
      const title = withPic ? 'Tools & Equipment Inventory' : 'Tools list';
      return { title, html: K.reportDoc(title, sub(list.length, 'tools') + (priced.length ? ` · value ${peso(total)} (${priced.length} of ${list.length} priced)` : ''), K.rpTable(cols, rows)), landscape: true };
    }
    if (kind === 'repairs') {
      const list = s.repairs.filter(r => r.status === 'open').sort((a, b) => a.date.localeCompare(b.date));
      const rows = list.map(r => `<tr><td>${esc(r.itemCode)}</td><td>${esc(r.itemName)}</td><td class="num">${fmtQty(r.qty)} ${esc(r.uom)}</td><td>${esc(r.kind)}</td><td>${esc(fmtDate(r.date))}</td><td>${esc(r.borrower || r.by)}</td><td>${esc(r.note)}</td><td>${daysBetween(r.date, s.today)} d</td></tr>`).join('');
      return { title: 'Damaged tools', html: K.reportDoc('Damaged tools', sub(list.length, 'out of service'), K.rpTable([{ label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Problem' }, { label: 'Reported' }, { label: 'Borrower / reported by' }, { label: 'Note' }, { label: 'Days' }], rows)), landscape: true };
    }
    return K.buildReport('loans');
  }

  // ---------- buttons ----------
  btnNew.addEventListener('click', () => openTool());
  btnLend.addEventListener('click', () => openCheckout());
  btnReturn.addEventListener('click', pickReturn);
  btnPrint.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = btnPrint.getBoundingClientRect();
    const go = (k) => () => K.outputReport(toolsReport(k));
    showMenu({ clientX: r.left, clientY: r.bottom + 2 }, [
      { label: 'Tools & Equipment Inventory (with pictures)', run: go('catalogue') },
      { label: 'Tools list (no pictures)', run: go('list') },
      { label: 'Borrowed tools', run: go('loans') },
      { label: 'Damaged & missing tools report…', run: () => window.DamagedReport && window.DamagedReport.open() }
    ]);
  });
  btnMore.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = btnMore.getBoundingClientRect();
    showMenu({ clientX: r.left, clientY: r.bottom + 2 }, [
      { label: 'Import from Excel…', run: () => K.openImport() },
      { label: 'Export to Excel…', run: () => K.exportExcel() },
      '-',
      { label: 'Send / receive file for the other PC…', run: () => K.openSync() },
      '-',
      { label: 'Form heading (company, department)…', run: () => K.openFormHeading() },
      { label: 'Open data and backups folder', run: () => api.invOpenFolder() },
      { label: 'Your name (saved on entries)…', run: () => K.askName() },
      { label: S() && S().pinSet ? 'Admin PIN — change…' : 'Admin PIN — set…', run: () => K.setPinDialog() }
    ]);
  });
  const setLayout = (v) => { layout = v; try { localStorage.setItem('wh-tools-layout', v); } catch (e) {} render(); };
  bCards.addEventListener('click', () => setLayout('cards'));
  bList.addEventListener('click', () => setLayout('list'));

  // with thousands of tools, wait a moment after the last key before searching
  let scanTimer = 0;
  scan.addEventListener('input', () => { F.text = scan.value; clearTimeout(scanTimer); scanTimer = setTimeout(() => { if (S()) renderBody(); }, 120); });
  scan.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !S()) return;
    const v = scan.value.trim();
    if (!v) return;
    const it = resolveItem(v) || (filteredTools().length === 1 ? filteredTools()[0] : null);
    if (it) { openToolDetail(it.id); scan.value = ''; F.text = ''; renderBody(); }
    else say('No single tool matches "' + v + '".');
  });

  window.ToolsUI = { render };
})();
