// Builds the Inventory tab. Runs after tasks-ui.js.
// Uses from other files: toast(), showMenu(), askText() (fileops-ui.js) and window.api.
(function () {
  'use strict';

  const view = document.getElementById('inventoryView');
  if (!view) return;

  // ---------- styles (colors come from the theme variables when a dark theme is on) ----------
  const st = document.createElement('style');
  st.textContent = `
    #inventoryView { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    #inventoryView[hidden] { display: none; }
    #invTop { background: var(--panel, #fff); border-bottom: 1px solid var(--border, #ddd); padding: 10px 16px 8px; }
    .invRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    #invTop h2 { margin: 0; font-size: 18px; }
    #invScan { flex: 1 1 260px; max-width: 460px; padding: 7px 10px; font-size: 13px; }
    .invKpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: 8px; }
    .invKpi { background: var(--panel2, #f6f7f9); border: 1px solid var(--border, #e1e4e8); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
    .invKpi b { display: block; font-size: 20px; }
    .invKpi span { font-size: 11px; color: var(--muted, #666); }
    .invKpi.bad b { color: #d1242f; }
    .invKpi.warn b { color: #c27a00; }
    #invBody { flex: 1; overflow: auto; padding: 10px 16px 24px; }
    .invNote { color: var(--muted, #666); font-size: 12px; margin: 6px 0; }
    .invEmpty { color: var(--muted, #666); padding: 30px 10px; text-align: center; }
    table.invT { border-collapse: collapse; width: 100%; font-size: 13px; background: var(--panel, #fff); }
    table.invT th { position: sticky; top: 0; z-index: 2; background: var(--panel2, #f0f0f0); color: var(--muted, #555); text-align: left; font-weight: 600; font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--border, #ccc); white-space: nowrap; user-select: none; }
    table.invT th.sortable { cursor: pointer; }
    table.invT td { padding: 5px 8px; border-bottom: 1px solid var(--border, #eee); vertical-align: middle; }
    table.invT tr.invClick { cursor: pointer; }
    table.invT tr.invClick:hover td { background: var(--hover, #eef4ff); }
    table.invT td.num, table.invT th.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.invT td.code { font-family: Consolas, monospace; white-space: nowrap; }
    table.invT td.act { white-space: nowrap; text-align: right; }
    table.invT td.act button { padding: 1px 8px; }
    .invSub { color: var(--muted, #666); font-size: 11px; }
    .invStatus { white-space: nowrap; }
    .invMoveIn { color: #1a7f37; font-weight: 600; }
    .invMoveOut { color: #c2410c; font-weight: 600; }
    .invBig { font-family: Consolas, monospace; font-size: 22px; letter-spacing: 0.06em; font-weight: 700; }
    .invFacts { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin: 10px 0; font-size: 13px; }
    .invFacts div span { color: var(--muted, #666); display: inline-block; min-width: 110px; }
    .invList { max-height: 190px; overflow: auto; border: 1px solid var(--border, #ddd); border-radius: 6px; margin: 6px 0 10px; }
    .invIssues { max-height: 170px; overflow: auto; border: 1px solid var(--border, #ddd); border-radius: 6px; padding: 6px 10px; font-size: 12px; margin: 6px 0; }
    .invIssues div { margin: 3px 0; overflow-wrap: anywhere; }
    .invOk { color: #1a7f37; font-weight: 600; }
    .invWarn { color: #b45309; }
    .invChk { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; font-size: 13px; }
    .invChk input { margin-top: 3px; }
    .invDlgWide { width: min(860px, 100%) !important; }
    .insBox { padding-bottom: 20px; }
    @media (max-width: 900px) { .insGrid, .insKpis { grid-template-columns: 1fr !important; } }
    
    .invBulkDlg { width: min(1100px, 96%) !important; }
    .invBulkWrap { max-height: 52vh; overflow: auto; margin: 8px 0; border: 1px solid var(--border, #ddd); border-radius: 6px; }
    table.invBulk { width: 100%; border-collapse: collapse; }
    table.invBulk th { text-align: left; font-size: 12px; padding: 6px; position: sticky; top: 0; background: var(--panel2, #f4f4f4); }
    table.invBulk td { padding: 3px 4px; vertical-align: top; }
    table.invBulk input, table.invBulk select { width: 100%; }
    table.invBulk td:nth-child(1) { width: 140px; } table.invBulk td:nth-child(2) { width: 80px; }
    table.invBulk td:nth-child(4) { width: 90px; } table.invBulk td:nth-child(7) { width: 36px; }
    table.invBulk tr.bad { background: rgba(209, 36, 47, .12); }
    .invInfo { font-size: 12px; color: var(--muted, #666); min-height: 16px; margin: -4px 0 8px; }
    .invSeg { display: inline-flex; border: 1px solid var(--border, #bbb); border-radius: 6px; overflow: hidden; }
    .invSeg button { border: 0; border-radius: 0; border-right: 1px solid var(--border, #ccc); }
    .invSeg button:last-child { border-right: 0; }
    .invSeg button.on { background: var(--accent, #1f6feb); color: var(--accent-text, #fff); }
    @media (max-width: 820px) { .invFacts { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(st);

  // ---------- small helpers ----------
  function E(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const say = (m) => { if (typeof toast === 'function') toast(m); };
  const fmtQty = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100));
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const lc = (s) => String(s || '').toLowerCase();

  let S = null;            // everything the main process sends us
  let tab = 'stock';
  const F = { text: '', category: '', status: '', sort: 'name', desc: false, mvPeriod: '30', insPeriod: 90, insCat: '', insItem: '', mvDir: '', showReturned: false };
  const LIMIT = 400;

  const STATUS_LABEL = { ok: 'OK', low: 'LOW', out: 'OUT', allout: 'ALL BORROWED', archived: 'Archived' };
  const STATUS_ORDER = { out: 0, low: 1, allout: 2, ok: 3, archived: 4 };

  function statusPill(s) {
    const cls = s === 'out' ? 'pill over' : s === 'low' ? 'pill today' : s === 'allout' ? 'pill doing' : 'pill';
    return E('span', cls + ' invStatus', STATUS_LABEL[s] || s);
  }

  // ---------- page shell ----------
  view.innerHTML = '';
  const top = E('div'); top.id = 'invTop';
  const body = E('div'); body.id = 'invBody';
  view.append(top, body);

  const hdr = E('div', 'invRow');
  hdr.append(E('h2', '', 'Inventory'));
  const spacer = E('span'); spacer.style.flex = '1';
  const scan = document.createElement('input');
  scan.id = 'invScan'; scan.type = 'text';
  scan.placeholder = 'Scan a barcode, or type a code / name…';
  scan.autocomplete = 'off';
  hdr.append(spacer, scan);

  const bar = E('div', 'invRow');
  const btnNew = E('button', 'primary', '＋ New item');
  const btnIn = E('button', '', '⬇ Stock In');
  const btnOut = E('button', '', '⬆ Stock Out');
  const btnBulk = E('button', '', '📋 Bulk entry');
  const btnLend = E('button', '', '🔧 Lend a tool');
  const btnPrint = E('button', '', '🖨 Print / PDF');
  const btnMore = E('button', '', '⋯ More');
  bar.append(btnNew, btnIn, btnOut, btnBulk, btnLend, btnPrint, btnMore);

  const kpis = E('div', 'invKpis');
  const tabs = E('div', 'invRow');
  const filters = E('div', 'invRow');
  top.append(hdr, bar, kpis, tabs, filters);

  // ---------- loading ----------
  async function load() {
    const r = await api.invLoad();
    if (!r || !r.ok) { body.textContent = (r && r.error) || 'Could not load the inventory.'; return; }
    S = r.state;
    renderAll();
  }
  function useState(r) { if (r && r.state) { S = r.state; renderAll(); } }

  // ---------- top bar pieces ----------
  function renderKpis() {
    kpis.innerHTML = '';
    const s = S.summary;
    const mk = (label, n, cls, go) => {
      const k = E('div', 'invKpi' + (cls && n > 0 ? ' ' + cls : ''));
      k.append(E('b', '', String(n)), E('span', '', label));
      if (go) k.addEventListener('click', go);
      kpis.appendChild(k);
    };
    mk('Items', s.items, '', () => { tab = 'stock'; F.status = ''; renderAll(); });
    mk('Low stock', s.low, 'warn', () => { tab = 'stock'; F.status = 'low'; renderAll(); });
    mk('Out of stock', s.out, 'bad', () => { tab = 'stock'; F.status = 'out'; renderAll(); });
    mk('Tools borrowed', s.onLoan, '', () => { tab = 'loans'; renderAll(); });
    mk('Overdue returns', s.overdue, 'bad', () => { tab = 'loans'; renderAll(); });
    mk('Calibration due (30 d)', s.calibration, 'warn', () => { tab = 'stock'; F.category = 'Tools & Equipment'; renderAll(); });
  }

  function renderTabs() {
    tabs.innerHTML = '';
    const seg = E('div', 'invSeg');
    [['stock', 'Stock'], ['moves', 'Movements'], ['loans', 'Borrowed tools'], ['reorder', 'Reorder'], ['insights', 'Insights']].forEach(([k, label]) => {
      const b = E('button', tab === k ? 'on' : '', label);
      b.addEventListener('click', () => { tab = k; renderAll(); });
      seg.appendChild(b);
    });
    tabs.appendChild(seg);
  }

  function select(options, value, onChange, allLabel) {
    const s = document.createElement('select');
    if (allLabel != null) { const o = document.createElement('option'); o.value = ''; o.textContent = allLabel; s.appendChild(o); }
    options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); });
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  function renderFilters() {
    filters.innerHTML = '';
    if (tab === 'stock') {
      filters.append(
        select(S.categories.map(c => [c.name, c.name]), F.category, v => { F.category = v; renderBody(); }, 'All categories'),
        select([['low', 'Low stock'], ['out', 'Out of stock'], ['ok', 'OK'], ['archived', 'Archived']], F.status, v => { F.status = v; renderBody(); }, 'Any status')
      );
    } else if (tab === 'moves') {
      filters.append(
        select([['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']], F.mvPeriod, v => { F.mvPeriod = v; renderBody(); }, 'All dates'),
        select([['in', 'Stock in'], ['out', 'Stock out']], F.mvDir, v => { F.mvDir = v; renderBody(); }, 'In and out')
      );
    } else if (tab === 'insights') {
      filters.append(
        select([['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 6 months'], ['365', 'Last 12 months']], String(F.insPeriod), v => { F.insPeriod = +v; renderBody(); }),
        select(S.categories.map(c => [c.name, c.name]), F.insCat, v => { F.insCat = v; F.insItem = ''; renderBody(); }, 'All except tools')
      );
    } else if (tab === 'loans') {
      const l = E('label', 'invChk');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = F.showReturned;
      c.addEventListener('change', () => { F.showReturned = c.checked; renderBody(); });
      l.append(c, E('span', '', 'Also show returned tools'));
      filters.appendChild(l);
    }
  }

  function renderAll() {
    if (!S) return;
    renderKpis(); renderTabs(); renderFilters(); renderBody();
  }

  // ---------- body ----------
  function renderBody() {
    body.innerHTML = '';
    if (tab === 'stock') renderStock();
    else if (tab === 'moves') renderMoves();
    else if (tab === 'loans') renderLoans();
    else if (tab === 'insights') renderInsights();
    else renderReorder();
  }

  function table(columns) {
    const t = E('table', 'invT');
    const thead = E('thead'); const tr = E('tr');
    columns.forEach(c => {
      const th = E('th', (c.num ? 'num ' : '') + (c.sort ? 'sortable' : ''), c.label + (c.sort && F.sort === c.sort ? (F.desc ? ' ▼' : ' ▲') : ''));
      if (c.sort) th.addEventListener('click', () => { if (F.sort === c.sort) F.desc = !F.desc; else { F.sort = c.sort; F.desc = false; } renderBody(); });
      tr.appendChild(th);
    });
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
    const b = E('button', '', label); b.title = title;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    return b;
  }

  function filteredItems() {
    const words = lc(F.text).split(/\s+/).filter(Boolean);
    let list = S.items.filter(i => {
      if (F.category && i.category !== F.category) return false;
      if (F.status) { if (i.stat.status !== F.status) return false; }
      else if (i.archived) return false;
      if (!words.length) return true;
      const hay = lc([i.code, i.name, i.group, i.location, i.barcode, i.supplier, i.serial].join(' '));
      return words.every(w => hay.includes(w));
    });
    const dir = F.desc ? -1 : 1;
    const val = (i) => {
      switch (F.sort) {
        case 'code': return i.code;
        case 'category': return i.category;
        case 'onHand': return i.stat.onHand;
        case 'status': return STATUS_ORDER[i.stat.status];
        case 'last': return i.stat.last || '';
        default: return lc(i.name);
      }
    };
    list.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.code.localeCompare(b.code); });
    return list;
  }

  function renderStock() {
    const list = filteredItems();
    if (!S.items.length) {
      const box = E('div', 'invEmpty');
      box.append(E('p', '', 'No items yet.'));
      const p = E('p');
      const a = E('button', 'primary', 'Import from Excel…'); a.addEventListener('click', openImport);
      const b = E('button', '', '＋ New item'); b.addEventListener('click', () => openItem());
      p.append(a, document.createTextNode(' '), b);
      box.appendChild(p);
      body.appendChild(box);
      return;
    }
    const { t, tb } = table([
      { label: 'Code', sort: 'code' }, { label: 'Item', sort: 'name' }, { label: 'Category', sort: 'category' },
      { label: 'On hand', sort: 'onHand', num: true }, { label: 'Reorder pt', num: true }, { label: 'Status', sort: 'status' },
      { label: 'Location' }, { label: 'Last movement', sort: 'last' }, { label: '' }
    ]);
    list.slice(0, LIMIT).forEach(i => {
      const tr = E('tr', 'invClick');
      tr.addEventListener('click', () => openDetail(i.id));
      tr.addEventListener('contextmenu', (e) => { e.preventDefault(); rowMenu(e, i); });
      tr.append(td('code', i.code));
      const nameCell = td('');
      nameCell.append(E('div', '', i.name));
      if (i.group) nameCell.append(E('div', 'invSub', i.group));
      tr.appendChild(nameCell);
      tr.append(td('', i.category === 'Tools & Equipment' ? 'Tools' : i.category));
      const q = td('num', fmtQty(i.stat.onHand) + ' ' + i.uom);
      if (i.stat.onLoan > 0) q.append(E('div', 'invSub', fmtQty(i.stat.onLoan) + ' borrowed'));
      tr.appendChild(q);
      tr.append(td('num', i.stat.rop ? fmtQty(i.stat.rop) : ''));
      tr.append(td('', statusPill(i.stat.status)));
      tr.append(td('', i.location));
      tr.append(td('', fmtDate(i.stat.last)));
      const act = td('act');
      act.append(actBtn('＋', 'Stock in', () => openMove({ itemId: i.id, dir: 'in' })), document.createTextNode(' '),
        actBtn('－', 'Stock out', () => openMove({ itemId: i.id, dir: 'out' })));
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    body.appendChild(t);
    if (!list.length) body.appendChild(E('div', 'invEmpty', 'Nothing matches. Clear the search or filters.'));
    else if (list.length > LIMIT) body.appendChild(E('div', 'invNote', `Showing the first ${LIMIT} of ${list.length} items. Type in the search box to narrow it down.`));
    else body.appendChild(E('div', 'invNote', `${list.length} item${list.length === 1 ? '' : 's'}. Click a row for details, or right-click for quick actions.`));
  }

  function rowMenu(e, i) {
    showMenu(e, [
      { label: 'Details', run: () => openDetail(i.id) },
      { label: 'Stock in…', run: () => openMove({ itemId: i.id, dir: 'in' }) },
      { label: 'Stock out…', run: () => openMove({ itemId: i.id, dir: 'out' }) },
      i.category === 'Tools & Equipment' ? { label: 'Lend this tool…', run: () => openCheckout(i.id) } : { label: 'Lend…', run: () => openCheckout(i.id) },
      '-',
      { label: 'Edit item…', run: () => openItem(i) }
    ]);
  }

  function renderMoves() {
    const words = lc(F.text).split(/\s+/).filter(Boolean);
    const from = F.mvPeriod ? addDays(S.today, -(parseInt(F.mvPeriod, 10) - 1)) : '';
    let list = S.movements.filter(m => {
      if (from && m.date < from) return false;
      if (F.mvDir && m.dir !== F.mvDir) return false;
      if (!words.length) return true;
      const hay = lc([m.itemCode, m.itemName, m.party, m.ref, m.remarks, m.reason].join(' '));
      return words.every(w => hay.includes(w));
    });
    list.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    const { t, tb } = table([
      { label: 'Date' }, { label: 'Code' }, { label: 'Item' }, { label: 'In / Out' }, { label: 'Qty', num: true },
      { label: 'Reason' }, { label: 'Department / supplier' }, { label: 'Reference' }, { label: 'Form' }, { label: 'Remarks' }, { label: 'By' }, { label: '' }
    ]);
    list.slice(0, LIMIT).forEach(m => {
      const tr = E('tr');
      tr.append(td('', fmtDate(m.date)), td('code', m.itemCode), td('', m.itemName));
      tr.append(td('', E('span', m.dir === 'in' ? 'invMoveIn' : 'invMoveOut', m.dir === 'in' ? 'IN' : 'OUT')));
      tr.append(td('num', fmtQty(m.qty) + ' ' + m.uom), td('', m.reason), td('', m.party), td('', m.ref), td('code', m.formNo || ''), td('', m.remarks), td('', m.by));
      const act = td('act');
      if (m.dir === 'out') act.append(actBtn('🖨', m.formNo ? 'Print form ' + m.formNo : 'Make a withdrawal form', () => makeForm([m.id], null)), document.createTextNode(' '));
      act.append(actBtn('✎', 'Edit this entry', () => openMove({ move: m })), document.createTextNode(' '),
        actBtn('🗑', 'Delete this entry', () => deleteMove(m)));
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    body.appendChild(t);
    if (!list.length) body.appendChild(E('div', 'invEmpty', 'No movements for these filters.'));
    else body.appendChild(E('div', 'invNote', list.length > LIMIT ? `Showing the newest ${LIMIT} of ${list.length} entries.` : `${list.length} entr${list.length === 1 ? 'y' : 'ies'}.`));
  }

  async function deleteMove(m) {
    if (!confirm(`Delete this entry?\n\n${m.dir === 'in' ? 'IN' : 'OUT'} ${fmtQty(m.qty)} ${m.uom} of ${m.itemName} on ${fmtDate(m.date)}`)) return;
    const r = await api.invMoveDelete(m.id);
    if (!r.ok) { say(r.error); return; }
    useState(r); say('Entry deleted.');
  }

  function renderLoans() {
    const words = lc(F.text).split(/\s+/).filter(Boolean);
    let list = S.loans.filter(l => {
      if (!F.showReturned && l.open <= 0) return false;
      if (!words.length) return true;
      return words.every(w => lc([l.itemCode, l.itemName, l.borrower, l.location, l.ref].join(' ')).includes(w));
    });
    list.sort((a, b) => {
      const ao = a.open > 0 ? 0 : 1, bo = b.open > 0 ? 0 : 1;
      return ao - bo || a.dateOut.localeCompare(b.dateOut);
    });
    const { t, tb } = table([
      { label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Borrower' }, { label: 'Location' }, { label: 'BRF / ref' },
      { label: 'Taken' }, { label: 'Expected back' }, { label: 'Status' }, { label: '' }
    ]);
    list.slice(0, LIMIT).forEach(l => {
      const overdue = l.open > 0 && l.dueDate && l.dueDate < S.today;
      const tr = E('tr');
      tr.append(td('code', l.itemCode), td('', l.itemName), td('num', fmtQty(l.open > 0 ? l.open : l.qty) + ' ' + l.uom),
        td('', l.borrower), td('', l.location), td('', l.ref), td('', fmtDate(l.dateOut)), td('', fmtDate(l.dueDate)));
      let status;
      if (l.open <= 0) status = E('span', 'pill', 'Returned ' + fmtDate(l.returns.length ? l.returns[l.returns.length - 1].date : ''));
      else if (overdue) status = E('span', 'pill over', `Overdue ${daysBetween(l.dueDate, S.today)} d`);
      else status = E('span', 'pill doing', `Out ${daysBetween(l.dateOut, S.today)} d`);
      tr.append(td('', status));
      const act = td('act');
      act.append(actBtn('🖨', l.formNo ? 'Print form ' + l.formNo : 'Make a tool borrowing form', () => makeForm(null, [l.id])), document.createTextNode(' '));
      if (l.open > 0) act.append(actBtn('Return', 'Mark as returned', () => openReturn(l)), document.createTextNode(' '));
      act.append(actBtn('🗑', 'Delete this record', () => deleteLoan(l)));
      tr.appendChild(act);
      tb.appendChild(tr);
    });
    body.appendChild(t);
    if (!list.length) body.appendChild(E('div', 'invEmpty', F.showReturned ? 'No loan records.' : 'No tools are out right now.'));
  }

  async function deleteLoan(l) {
    if (!confirm(`Delete this loan record?\n\n${l.itemName} - ${l.borrower}`)) return;
    const r = await api.invLoanDelete(l.id);
    if (!r.ok) { say(r.error); return; }
    useState(r); say('Loan record deleted.');
  }

  function renderReorder() {
    const list = S.items.filter(i => i.stat.status === 'low' || i.stat.status === 'out')
      .sort((a, b) => STATUS_ORDER[a.stat.status] - STATUS_ORDER[b.stat.status] || lc(a.name).localeCompare(lc(b.name)));
    const row = E('div', 'invRow');
    const mk = E('button', 'primary', '＋ Make a reminder task');
    mk.disabled = !list.length;
    mk.addEventListener('click', () => reorderTask(list));
    const ex = E('button', '', 'Export to Excel…'); ex.addEventListener('click', exportExcel);
    row.append(mk, ex);
    body.appendChild(row);
    body.appendChild(E('div', 'invNote', 'The reorder point is the larger of your "Min level" and (average daily use × lead time + safety stock). Fill in lead times on the items to get better suggestions.'));
    if (!list.length) { body.appendChild(E('div', 'invEmpty', 'Nothing needs reordering right now.')); return; }
    const { t, tb } = table([
      { label: 'Code' }, { label: 'Item' }, { label: 'On hand', num: true }, { label: 'Reorder pt', num: true },
      { label: 'Suggested order', num: true }, { label: 'Daily use', num: true }, { label: 'Supplier' }, { label: 'Status' }
    ]);
    list.forEach(i => {
      const tr = E('tr', 'invClick');
      tr.addEventListener('click', () => openDetail(i.id));
      tr.append(td('code', i.code), td('', i.name), td('num', fmtQty(i.stat.onHand) + ' ' + i.uom), td('num', i.stat.rop ? fmtQty(i.stat.rop) : ''),
        td('num', fmtQty(i.stat.suggest) + ' ' + i.uom), td('num', i.stat.avgDaily ? String(i.stat.avgDaily) : ''), td('', i.supplier), td('', statusPill(i.stat.status)));
      tb.appendChild(tr);
    });
    body.appendChild(t);
  }

  async function reorderTask(list) {
    const due = addDays(S.today, 3);
    const checklist = list.slice(0, 100).map(i => ({ text: `${i.code} ${i.name}: order about ${fmtQty(i.stat.suggest)} ${i.uom} (have ${fmtQty(i.stat.onHand)})`, done: false }));
    const r = await api.taskSave({
      title: `Reorder inventory (${list.length} item${list.length === 1 ? '' : 's'})`,
      notes: 'Made from the Inventory tab, Reorder list, on ' + fmtDate(S.today) + '.',
      priority: 'high', due, tags: ['inventory'], checklist
    });
    if (!r || !r.ok) { say((r && r.error) || 'Could not make the task.'); return; }
    say('Task added to your Tasks tab (due ' + fmtDate(due) + ').');
  }

  // ---------- dialogs ----------
  let openCount = 0;
  function dialog(title, opts) {
    opts = opts || {};
    const overlay = E('div', 'overlay');
    overlay.style.zIndex = String(16 + openCount++);
    const dlg = E('div', 'dialog' + (opts.wide ? ' invDlgWide' : '') + (opts.small ? ' small' : ''));
    dlg.append(E('h3', '', title));
    const content = E('div');
    const msg = E('span', 'msg');
    const foot = E('div', 'dlgFoot');
    const sp = E('span'); sp.style.flex = '1';
    foot.append(msg, sp);
    dlg.append(content, foot);
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    const onKey = (e) => { if (e.key === 'Escape' && overlay.style.zIndex === String(16 + openCount - 1)) close(); };
    document.addEventListener('keydown', onKey);
    function close() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      openCount = Math.max(0, openCount - 1);
    }
    function button(label, cls, fn) {
      const b = E('button', cls || '', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      foot.appendChild(b);
      return b;
    }
    return { overlay, dlg, content, msg, foot, close, button, say: (t, bad) => { msg.textContent = t; msg.style.color = bad ? '#d1242f' : ''; } };
  }

  function fld(label, input, hint) {
    const d = E('div', 'fld');
    d.append(E('label', '', label), input);
    if (hint) d.append(E('div', 'invSub', hint));
    return d;
  }
  function inp(type, value, extra) {
    const i = document.createElement('input');
    i.type = type; i.value = value == null ? '' : value;
    if (type === 'number') { i.step = 'any'; i.min = '0'; }
    if (extra) Object.assign(i, extra);
    return i;
  }
  function sel(options, value) {
    const s = document.createElement('select');
    options.forEach(o => { const op = document.createElement('option'); op.value = Array.isArray(o) ? o[0] : o; op.textContent = Array.isArray(o) ? o[1] : o; s.appendChild(op); });
    if (value != null) s.value = value;
    return s;
  }
  function grid(...kids) { const g = E('div', 'grid2'); kids.forEach(k => g.appendChild(k)); return g; }
  function datalist(id, values) {
    let dl = document.getElementById(id);
    if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
    dl.innerHTML = '';
    [...new Set(values.filter(Boolean))].slice(0, 400).forEach(v => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); });
    return id;
  }

  // ----- item picker used by the stock and lend dialogs -----
  const itemLabel = (i) => `${i.code} — ${i.name}`;
  function resolveItem(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const live = S.items.filter(i => !i.archived);
    let hit = live.find(i => itemLabel(i) === t);
    if (hit) return hit;
    const up = t.toUpperCase();
    hit = live.find(i => i.code === up || (i.barcode && i.barcode.toUpperCase() === up));
    if (hit) return hit;
    const nm = t.toLowerCase().replace(/\s+/g, ' ');
    const byName = live.filter(i => i.name.toLowerCase().replace(/\s+/g, ' ') === nm);
    return byName.length === 1 ? byName[0] : null;
  }
  function itemInput(listId, itemsList, preset) {
    datalist(listId, itemsList.map(itemLabel));
    const i = inp('text', preset ? itemLabel(preset) : '');
    i.setAttribute('list', listId);
    i.placeholder = 'Scan a code or type to search…';
    i.autocomplete = 'off';
    return i;
  }

  // ----- new / edit item -----
  function nextCodePreview(category) {
    const c = S.categories.find(x => x.name === category);
    const prefix = c ? c.prefix : 'OTH';
    const re = new RegExp('^' + prefix + '-(\\d+)$');
    let max = 0;
    S.items.forEach(i => { const m = re.exec(i.code); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return prefix + '-' + String(max + 1).padStart(4, '0');
  }

  function openItem(item) {
    const editing = !!item;
    const d = dialog(editing ? 'Edit item' : 'New item', { wide: true });
    const f = {
      name: inp('text', item ? item.name : '', { maxLength: 200 }),
      category: sel(S.categories.map(c => c.name), item ? item.category : 'Consumables'),
      code: inp('text', item ? item.code : '', { maxLength: 30 }),
      uom: inp('text', item ? item.uom : '', { maxLength: 20 }),
      group: inp('text', item ? item.group : '', { maxLength: 80 }),
      location: inp('text', item ? item.location : '', { maxLength: 120 }),
      supplier: inp('text', item ? item.supplier : '', { maxLength: 120 }),
      barcode: inp('text', item ? item.barcode : '', { maxLength: 60 }),
      minQty: inp('number', item ? item.minQty || '' : ''),
      reorderQty: inp('number', item ? item.reorderQty || '' : ''),
      leadTimeDays: inp('number', item ? item.leadTimeDays || '' : ''),
      safetyStock: inp('number', item ? item.safetyStock || '' : ''),
      serial: inp('text', item ? item.serial : '', { maxLength: 200 }),
      condition: sel([['', '—']].concat(S.conditions.map(c => [c, c])), item ? item.condition : ''),
      calibrationDue: inp('date', item ? item.calibrationDue : ''),
      startQty: inp('number', ''),
      startDate: inp('date', S.today),
      notes: document.createElement('textarea'),
      archived: inp('checkbox', '')
    };
    f.notes.rows = 2; f.notes.value = item ? item.notes : ''; f.notes.style.width = '100%';
    f.archived.checked = !!(item && item.archived);
    datalist('invGroups', S.items.map(i => i.group));
    datalist('invLocs', S.items.map(i => i.location).concat(S.loans.map(l => l.location)));
    datalist('invSups', S.items.map(i => i.supplier));
    f.group.setAttribute('list', 'invGroups'); f.location.setAttribute('list', 'invLocs'); f.supplier.setAttribute('list', 'invSups');

    const codeHint = E('div', 'invSub');
    const updHint = () => {
      codeHint.textContent = f.code.value.trim() ? 'Used as the barcode / label text.' : (editing ? '' : `Leave empty to get ${nextCodePreview(f.category.value)} automatically.`);
    };
    f.code.addEventListener('input', updHint);

    const toolBox = E('div');
    toolBox.append(grid(fld('Serial no. / asset tag', f.serial), fld('Condition', f.condition)), fld('Calibration due (instruments)', f.calibrationDue));
    const toggleTools = () => { toolBox.hidden = f.category.value !== 'Tools & Equipment'; updHint(); };
    f.category.addEventListener('change', toggleTools);

    const c = d.content;
    c.append(fld('Item name', f.name));
    c.append(grid(fld('Category', f.category), fld('Unit (pcs, set, kg, m…)', f.uom)));
    const codeFld = fld('Code', f.code); codeFld.append(codeHint);
    c.append(grid(codeFld, fld('Group / section (optional)', f.group)));
    c.append(grid(fld('Storage location', f.location), fld('Supplier', f.supplier)));
    c.append(fld('Manufacturer barcode (optional)', f.barcode, 'If the item already has a printed barcode, scan it here. Scanning it later finds this item.'));
    c.append(E('div', 'invSub', 'Reordering'));
    c.append(grid(fld('Minimum level', f.minQty, 'Warn when stock falls to this'), fld('Usual order quantity', f.reorderQty)));
    c.append(grid(fld('Supplier lead time (days)', f.leadTimeDays), fld('Safety stock', f.safetyStock)));
    c.append(toolBox);
    if (!editing) c.append(grid(fld('Starting quantity (what you have now)', f.startQty), fld('As of date', f.startDate)));
    c.append(fld('Notes', f.notes));
    const arch = E('label', 'invChk'); arch.append(f.archived, E('span', '', 'Archived (hide from lists; history is kept)'));
    c.append(arch);
    toggleTools();

    d.button('Save', 'primary', async () => {
      d.say('');
      const input = {
        id: item ? item.id : undefined,
        name: f.name.value, category: f.category.value, code: f.code.value, uom: f.uom.value, group: f.group.value,
        location: f.location.value, supplier: f.supplier.value, barcode: f.barcode.value,
        minQty: f.minQty.value, reorderQty: f.reorderQty.value, leadTimeDays: f.leadTimeDays.value, safetyStock: f.safetyStock.value,
        serial: f.serial.value, condition: f.condition.value, calibrationDue: f.calibrationDue.value,
        startQty: f.startQty.value, startDate: f.startDate.value, notes: f.notes.value, archived: f.archived.checked
      };
      const r = await api.invItemSave(input);
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close();
      say(editing ? 'Item saved.' : `Item ${r.item.code} created.`);
    });
    d.button('Cancel', '', d.close);
    if (editing) {
      const del = d.button('Delete', '', async () => {
        if (!confirm(`Delete "${item.name}"?`)) return;
        const r = await api.invItemDelete(item.id);
        if (!r.ok) { d.say(r.error, true); return; }
        useState(r); d.close(); say('Item deleted.');
      });
      del.style.color = '#d1242f';
    }
    f.name.focus();
  }

  // ----- stock in / out -----
  function openMove(opts) {
    opts = opts || {};
    const mv = opts.move || null;
    const preset = mv ? S.items.find(i => i.id === mv.itemId) : (opts.itemId ? S.items.find(i => i.id === opts.itemId) : null);
    let dir = mv ? mv.dir : (opts.dir || 'in');
    const d = dialog(mv ? 'Edit entry' : 'Stock in / out');

    const dirSeg = E('div', 'invSeg');
    const bIn = E('button', '', '⬇ Stock IN'); const bOut = E('button', '', '⬆ Stock OUT');
    bIn.type = bOut.type = 'button';
    dirSeg.append(bIn, bOut);

    const item = itemInput('invItemList', S.items.filter(i => !i.archived), preset);
    const info = E('div', 'invInfo');
    const qty = inp('number', mv ? mv.qty : '');
    const date = inp('date', mv ? mv.date : S.today);
    const reason = inp('text', mv ? mv.reason : '', { maxLength: 120 });
    reason.setAttribute('list', 'invReasons');
    const party = inp('text', mv ? mv.party : '', { maxLength: 120 });
    party.setAttribute('list', 'invParties');
    datalist('invParties', S.movements.map(m => m.party).concat(S.loans.map(l => l.borrower)));
    const ref = inp('text', mv ? mv.ref : '', { maxLength: 80 });
    ref.placeholder = 'PO / DR / WO / BRF no.';
    const remarks = inp('text', mv ? mv.remarks : '', { maxLength: 500 });
    const mkForm = document.createElement('input'); mkForm.type = 'checkbox'; mkForm.checked = true;
    const mkRow = E('label', 'invChk'); mkRow.append(mkForm, E('span', '', 'Also make a withdrawal form (to print or save as PDF)'));
    const sessionIds = [];

    const fillReasons = () => {
      // free text: the list only suggests; leave it empty to use the first reason
      const list = dir === 'in' ? S.inReasons : S.outReasons;
      const used = S.movements.filter(m => m.dir === dir).map(m => m.reason);
      datalist('invReasons', list.concat(used));
      reason.placeholder = list[0] + '  (or type your own reason)';
    };
    const setDir = (x) => {
      dir = x;
      bIn.className = dir === 'in' ? 'on' : ''; bOut.className = dir === 'out' ? 'on' : '';
      fillReasons();
      mkRow.style.display = (dir === 'out' && !mv) ? '' : 'none';
      party.placeholder = dir === 'in' ? 'Supplier, or department that returned it' : 'Department that took it (e.g. Piping)';
    };
    bIn.addEventListener('click', () => setDir('in'));
    bOut.addEventListener('click', () => setDir('out'));
    if (mv) { bIn.disabled = bOut.disabled = true; }

    const showInfo = () => {
      const it = resolveItem(item.value);
      info.textContent = it ? `On hand: ${fmtQty(it.stat.onHand)} ${it.uom}${it.stat.onLoan ? ` (${fmtQty(it.stat.onLoan)} borrowed)` : ''}${it.location ? ' · ' + it.location : ''}` : (item.value.trim() ? 'No item found for this text yet.' : '');
    };
    item.addEventListener('input', showInfo);
    item.addEventListener('change', showInfo);

    const c = d.content;
    c.append(fld('Direction', dirSeg));
    if (mv) item.disabled = true;
    c.append(fld('Item', item), info);
    c.append(grid(fld('Quantity', qty), fld('Date', date)));
    c.append(grid(fld('Reason', reason), fld('Department / supplier', party)));
    c.append(grid(fld('Reference', ref), fld('Remarks', remarks)));
    c.append(mkRow);
    setDir(dir); showInfo();

    async function save(another, allowNegative) {
      d.say('');
      const it = mv ? preset : resolveItem(item.value);
      if (!it) { d.say('Please pick an item from the list (or scan its code).', true); return; }
      const r = await api.invMoveSave({
        id: mv ? mv.id : undefined, itemId: it.id, dir, qty: qty.value, date: date.value,
        reason: reason.value, party: party.value, ref: ref.value, remarks: remarks.value
      }, { allowNegative });
      if (!r.ok) {
        if (r.code === 'NEGATIVE' && !allowNegative && confirm(r.error + '\n\nRecord it anyway? (The stock will go below zero.)')) return save(another, true);
        d.say(r.error, true);
        return;
      }
      useState(r);
      if (!mv && dir === 'out') sessionIds.push(r.movement.id);
      say(`${dir === 'in' ? 'Stock in' : 'Stock out'}: ${fmtQty(r.movement.qty)} ${it.uom} of ${it.name}. On hand now ${fmtQty(r.onHand)}.`);
      if (another) { item.value = ''; qty.value = ''; remarks.value = ''; showInfo(); item.focus(); d.say('Saved. Next one:'); }
      else { d.close(); if (mkForm.checked && sessionIds.length) makeForm(sessionIds, null); }
    }
    d.button('Save', 'primary', () => save(false));
    if (!mv) d.button('Save & add another', '', () => save(true));
    d.button('Cancel', '', d.close);
    (preset ? qty : item).focus();
  }

  // =====================================================================
  // INSIGHTS (charts and lists worked out from the movements) + REPORTS
  // =====================================================================
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const isUse = (m) => m.dir === 'out' && m.reason !== 'Count adjustment' && m.reason !== 'Transferred out';
  const SCREEN_PAL = { bar: 'var(--accent, #1f6feb)', bar2: '#9aa5b5', text: 'var(--text, #222)', muted: 'var(--muted, #777)', grid: 'var(--border, #ddd)', warn: '#d97706' };
  const PRINT_PAL = { bar: '#1f6feb', bar2: '#9aa5b5', text: '#222', muted: '#666', grid: '#ddd', warn: '#d97706' };

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function svgBarsH(rows, pal, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="insEmpty">Nothing to show for this period yet.</div>';
    const W = 640, labelW = 215, rowH = 26, top = 4, valW = 110;
    const max = Math.max.apply(null, rows.map(r => r.value)) || 1;
    const H = top + rows.length * rowH + 4;
    let g = '';
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const w = Math.max(2, (W - labelW - valW) * r.value / max);
      g += `<text x="${labelW - 8}" y="${y + 15}" text-anchor="end" font-size="12" style="fill:${pal.text}">${esc(short(r.label, 34))}</text>`;
      g += `<rect x="${labelW}" y="${y + 3}" width="${w}" height="16" rx="3" style="fill:${r.color || pal.bar}"/>`;
      g += `<text x="${labelW + w + 6}" y="${y + 15}" font-size="11" style="fill:${pal.muted}">${esc(r.text)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.label || 'bar chart')}">${g}</svg>`;
  }

  function svgBarsV(labels, series, pal, opts) {
    opts = opts || {};
    const W = 640, H = 230, left = 38, right = 8, top = 22, bottom = 26;
    const all = [].concat.apply([], series.map(s => s.values));
    const max = niceMax(Math.max.apply(null, all.concat([0])));
    if (!all.some(v => v > 0)) return '<div class="insEmpty">No movements recorded in these months yet.</div>';
    const plotW = W - left - right, plotH = H - top - bottom;
    const slot = plotW / labels.length;
    const bw = Math.min(26, (slot - 6) / series.length);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const y = top + plotH - plotH * k / 4;
      g += `<line x1="${left}" x2="${W - right}" y1="${y}" y2="${y}" style="stroke:${pal.grid}" stroke-width="1"/>`;
      g += `<text x="${left - 5}" y="${y + 4}" text-anchor="end" font-size="10" style="fill:${pal.muted}">${fmtQty(Math.round(max * k / 4 * 10) / 10)}</text>`;
    }
    labels.forEach((lb, i) => {
      const cx = left + slot * i + slot / 2;
      g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" style="fill:${pal.muted}">${esc(lb)}</text>`;
      series.forEach((s, j) => {
        const v = s.values[i];
        const h = plotH * v / max;
        const x = cx - (bw * series.length) / 2 + j * bw;
        if (v > 0) g += `<rect x="${x}" y="${top + plotH - h}" width="${bw - 1}" height="${h}" rx="2" style="fill:${s.color}"><title>${esc(lb)}: ${fmtQty(v)}</title></rect>`;
      });
    });
    if (opts.avg > 0) {
      const y = top + plotH - plotH * opts.avg / max;
      g += `<line x1="${left}" x2="${W - right}" y1="${y}" y2="${y}" stroke-dasharray="5 4" style="stroke:${pal.warn}" stroke-width="1.5"/>`;
      g += `<text x="${W - right}" y="${y - 4}" text-anchor="end" font-size="10" style="fill:${pal.warn}">average ${fmtQty(Math.round(opts.avg * 10) / 10)}</text>`;
    }
    let lg = '', lx = left;
    if (series.length > 1 || opts.legend) series.forEach(s => {
      lg += `<rect x="${lx}" y="5" width="10" height="10" rx="2" style="fill:${s.color}"/><text x="${lx + 14}" y="14" font-size="11" style="fill:${pal.text}">${esc(s.name)}</text>`;
      lx += 24 + s.name.length * 6.5;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.label || 'chart')}">${lg}${g}</svg>`;
  }

  function monthList(today, n) {
    const out = [];
    let y = +today.slice(0, 4), m = +today.slice(5, 7);
    for (let i = 0; i < n; i++) { out.unshift({ key: y + '-' + String(m).padStart(2, '0'), label: MONTHS[m - 1] + (m === 1 || i === n - 1 ? " '" + String(y).slice(2) : '') }); m--; if (m === 0) { m = 12; y--; } }
    return out;
  }

  function computeInsights(period, cat) {
    const today = S.today;
    const from = addDays(today, -period + 1);
    const inCat = (i) => cat ? i.category === cat : i.category !== 'Tools & Equipment';
    const items = S.items.filter(i => !i.archived && inCat(i));
    const ids = new Map(items.map(i => [i.id, i]));
    const mv = S.movements.filter(m => ids.has(m.itemId));
    const per = new Map(items.map(i => [i.id, { it: i, qty: 0, n: 0, prev: 0, cur30: 0, lastUse: '' }]));
    const parties = new Map();
    const c30 = addDays(today, -29), p30 = addDays(today, -59);
    let issues = 0, receipts = 0;
    mv.forEach(m => {
      const a = per.get(m.itemId);
      if (isUse(m)) {
        if (!a.lastUse || m.date > a.lastUse) a.lastUse = m.date;
        if (m.date >= from && m.date <= today) {
          a.qty += m.qty; a.n++; issues++;
          const pn = (m.party || '').trim() || '(not recorded)';
          const p = parties.get(pn) || { name: pn, n: 0, items: new Set() };
          p.n++; p.items.add(m.itemId); parties.set(pn, p);
        }
        if (m.date >= c30 && m.date <= today) a.cur30 += m.qty;
        else if (m.date >= p30 && m.date < c30) a.prev += m.qty;
      } else if (m.dir === 'in' && m.reason !== 'Opening balance' && m.reason !== 'Count adjustment' && m.date >= from && m.date <= today) receipts++;
    });
    const rows = [...per.values()];
    const used = rows.filter(r => r.n > 0);
    const top = used.slice().sort((a, b) => b.qty - a.qty).slice(0, 10);
    const freq = used.slice().sort((a, b) => b.n - a.n).slice(0, 10);
    const rising = rows.filter(r => r.cur30 > r.prev && r.cur30 > 0).map(r => Object.assign({ diff: r.cur30 - r.prev }, r)).sort((a, b) => b.diff - a.diff).slice(0, 6);
    const falling = rows.filter(r => r.prev > r.cur30 && r.prev > 0).map(r => Object.assign({ diff: r.prev - r.cur30 }, r)).sort((a, b) => b.diff - a.diff).slice(0, 6);
    const attention = items.filter(i => (i.stat.status === 'out' && i.stat.avgDaily > 0) || (i.stat.coverDays != null && i.stat.coverDays <= 30))
      .sort((a, b) => (a.stat.coverDays == null ? -1 : a.stat.coverDays) - (b.stat.coverDays == null ? -1 : b.stat.coverDays)).slice(0, 12);
    const dead = rows.filter(r => r.it.stat.onHand > 0 && (!r.lastUse || r.lastUse < addDays(today, -180)))
      .map(r => Object.assign({ idle: r.lastUse ? daysBetween(r.lastUse, today) : null }, r))
      .sort((a, b) => (b.idle == null ? 1e9 : b.idle) - (a.idle == null ? 1e9 : a.idle));
    const nomin = used.filter(r => !(r.it.minQty > 0) && !(r.it.leadTimeDays > 0)).sort((a, b) => b.n - a.n).slice(0, 8);
    // ABC by number of issues
    const sorted = used.slice().sort((a, b) => b.n - a.n);
    const totalN = sorted.reduce((s, r) => s + r.n, 0) || 1;
    let run = 0; const abc = { A: [], B: [], C: [] };
    sorted.forEach(r => { const before = run / totalN; run += r.n; (before < 0.8 ? abc.A : before < 0.95 ? abc.B : abc.C).push(r); });
    const takers = [...parties.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    return { today, from, period, items, rows, used, top, freq, rising, falling, attention, dead, nomin, abc, takers, issues, receipts, mv };
  }

  function monthlyFor(mv, today, pred, valueFn) {
    const ml = monthList(today, 12);
    const idx = new Map(ml.map((m, i) => [m.key, i]));
    const vals = ml.map(() => 0);
    mv.forEach(m => { if (!pred(m)) return; const i = idx.get(m.date.slice(0, 7)); if (i != null) vals[i] += valueFn(m); });
    return { ml, vals };
  }

  const pctText = (cur, prev) => prev > 0 ? (cur >= prev ? '▲ ' : '▼ ') + Math.round(Math.abs(cur - prev) / prev * 100) + '%' : (cur > 0 ? 'new use' : '');

  // Builds the whole Insights page as HTML (used on screen and in the PDF report).
  function insightsHtml(period, cat, pal, itemId) {
    const R = computeInsights(period, cat);
    const label = cat || 'All except tools';
    const nm = (r) => `<a data-item="${esc(r.it.id)}">${esc(r.it.name)}</a>`;
    let h = '';
    h += `<div class="insKpis">
      <div><b>${R.issues}</b><span>Issue entries (${period} days)</span></div>
      <div><b>${R.used.length}</b><span>Items used</span></div>
      <div><b>${R.rows.length - R.used.length}</b><span>Items not used</span></div>
      <div><b>${R.receipts}</b><span>Deliveries / stock-ins</span></div></div>`;

    h += `<div class="insGrid">`;
    h += `<section class="insWide"><h4>Most used items — by quantity taken (last ${period} days)</h4>${svgBarsH(R.top.map(r => ({ label: r.it.name, value: r.qty, text: `${fmtQty(r.qty)} ${r.it.uom} · ${r.n}×` })), pal, { label: 'Most used items' })}
      <p class="insNote">Different units are not added together, so each item has its own bar. "${'3×'}" means it was issued 3 times.</p></section>`;

    const all = monthlyFor(R.mv, R.today, m => isUse(m) || (m.dir === 'in' && m.reason !== 'Opening balance' && m.reason !== 'Count adjustment'), () => 1);
    const outM = monthlyFor(R.mv, R.today, isUse, () => 1);
    const inM = monthlyFor(R.mv, R.today, m => m.dir === 'in' && m.reason !== 'Opening balance' && m.reason !== 'Count adjustment', () => 1);
    h += `<section class="insWide"><h4>Activity by month — number of entries, last 12 months</h4>${svgBarsV(outM.ml.map(m => m.label), [{ name: 'Issued out', values: outM.vals, color: pal.bar }, { name: 'Delivered / stock in', values: inM.vals, color: pal.bar2 }], pal, { label: 'Activity by month' })}</section>`;

    // trend for one item
    const pick = itemId && R.rows.find(r => r.it.id === itemId) ? R.rows.find(r => r.it.id === itemId) : (R.top[0] || null);
    if (pick) {
      const tm = monthlyFor(S.movements.filter(m => m.itemId === pick.it.id), R.today, isUse, m => m.qty);
      const last3 = tm.vals.slice(-3).reduce((a, b) => a + b, 0), prev3 = tm.vals.slice(-6, -3).reduce((a, b) => a + b, 0);
      const avg = tm.vals.reduce((a, b) => a + b, 0) / 12;
      h += `<section class="insWide"><h4>Usage trend of one item: <span class="insPick" data-pick="1">${esc(pick.it.code + ' — ' + pick.it.name)}</span></h4>
        ${svgBarsV(tm.ml.map(m => m.label), [{ name: 'Quantity issued per month (' + pick.it.uom + ')', values: tm.vals, color: pal.bar }], pal, { avg, legend: true, label: 'Item usage trend' })}
        <p class="insNote">Last 3 months: <b>${fmtQty(last3)} ${esc(pick.it.uom)}</b>${prev3 > 0 || last3 > 0 ? ' · previous 3 months: <b>' + fmtQty(prev3) + '</b> · ' + pctText(last3, prev3) : ''}. Current stock: ${fmtQty(pick.it.stat.onHand)} ${esc(pick.it.uom)}${pick.it.stat.coverDays != null ? ' (about ' + pick.it.stat.coverDays + ' days left at the recent pace)' : ''}.</p></section>`;
    }

    const tbl = (head, rowsHtml) => rowsHtml ? `<table class="insT"><thead><tr>${head.map(x => `<th${x[1] ? ' class="num"' : ''}>${esc(x[0])}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>` : '<div class="insEmpty">Nothing here. Good.</div>';

    h += `<section><h4>Needs attention — running out soon</h4>${tbl([['Item'], ['On hand', 1], ['Days left', 1]],
      R.attention.map(i => `<tr><td><a data-item="${esc(i.id)}">${esc(i.name)}</a></td><td class="num">${fmtQty(i.stat.onHand)} ${esc(i.uom)}</td><td class="num">${i.stat.onHand <= 0 ? '<b class="insBad">OUT</b>' : i.stat.coverDays + ' d'}</td></tr>`).join(''))}
      <p class="insNote">Based on the average use of the last 90 days.</p></section>`;

    h += `<section><h4>Rising use (last 30 days vs the 30 before)</h4>${tbl([['Item'], ['Now', 1], ['Before', 1], ['Change', 1]],
      R.rising.map(r => `<tr><td>${nm(r)}</td><td class="num">${fmtQty(r.cur30)}</td><td class="num">${fmtQty(r.prev)}</td><td class="num insBad">${pctText(r.cur30, r.prev)}</td></tr>`).join(''))}</section>`;
    h += `<section><h4>Falling use (last 30 days vs the 30 before)</h4>${tbl([['Item'], ['Now', 1], ['Before', 1], ['Change', 1]],
      R.falling.map(r => `<tr><td>${nm(r)}</td><td class="num">${fmtQty(r.cur30)}</td><td class="num">${fmtQty(r.prev)}</td><td class="num insOk">${pctText(r.cur30, r.prev)}</td></tr>`).join(''))}</section>`;

    h += `<section><h4>Which department takes the most — number of issue entries</h4>${svgBarsH(R.takers.map(p => ({ label: p.name, value: p.n, text: `${p.n} entries · ${p.items.size} items` })), pal, { label: 'Top users' })}
      <p class="insNote">Filling in the Department on every stock-out makes this list useful.</p></section>`;

    const A = R.abc.A.length, B = R.abc.B.length, C = R.abc.C.length;
    h += `<section><h4>ABC classes — how often items are issued</h4>
      <div class="insAbc"><div><b>A · ${A}</b><span>items = 80% of all issues</span></div><div><b>B · ${B}</b><span>next 15%</span></div><div><b>C · ${C}</b><span>last 5%</span></div></div>
      ${R.abc.A.length ? `<p class="insNote"><b>Never run out of these (class A):</b> ${R.abc.A.slice(0, 12).map(nm).join(', ')}${R.abc.A.length > 12 ? '…' : ''}</p>` : ''}</section>`;

    h += `<section><h4>Not moving — stock but no use in 180 days (${R.dead.length})</h4>${tbl([['Item'], ['On hand', 1], ['Idle', 1]],
      R.dead.slice(0, 12).map(r => `<tr><td>${nm(r)}</td><td class="num">${fmtQty(r.it.stat.onHand)} ${esc(r.it.uom)}</td><td class="num">${r.idle == null ? 'never used' : r.idle + ' d'}</td></tr>`).join(''))}
      <p class="insNote">Candidates to stop buying, or to check whether the count is right.</p></section>`;

    h += `<section><h4>Set a minimum level for these</h4>${tbl([['Item'], ['Issued', 1], ['On hand', 1]],
      R.nomin.map(r => `<tr><td>${nm(r)}</td><td class="num">${r.n}×</td><td class="num">${fmtQty(r.it.stat.onHand)} ${esc(r.it.uom)}</td></tr>`).join(''))}
      <p class="insNote">These are used often but have no minimum level, so "Low stock" can't warn you. Open the item → Edit item → Minimum level.</p></section>`;
    h += `</div>`;
    return { html: h, R, label, pickId: pick ? pick.it.id : '' };
  }

  const INSIGHTS_CSS = (pal) => `
    .insKpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:12px; }
    .insKpis div { border:1px solid ${pal.grid}; border-radius:8px; padding:8px 12px; }
    .insKpis b { display:block; font-size:22px; } .insKpis span { font-size:12px; color:${pal.muted}; }
    .insGrid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; width:100%; }
    .insGrid section { border:1px solid ${pal.grid}; border-radius:8px; padding:10px 14px; min-width:0; break-inside:avoid; }
    .insGrid section.insWide { grid-column:1 / -1; }
    .insGrid h4 { margin:0 0 8px; font-size:14px; }
    .insGrid svg { max-width:760px; display:block; }
    .insNote { font-size:12px; color:${pal.muted}; margin:6px 0 0; }
    .insEmpty { color:${pal.muted}; font-size:13px; padding:8px 0; }
    table.insT { width:100%; border-collapse:collapse; font-size:13px; }
    table.insT th { text-align:left; font-size:11px; color:${pal.muted}; border-bottom:1px solid ${pal.grid}; padding:4px 6px; }
    table.insT td { padding:4px 6px; border-bottom:1px solid ${pal.grid}; }
    table.insT .num, .insT th.num { text-align:right; white-space:nowrap; }
    .insBad { color:#d1242f; } .insOk { color:#1a7f37; }
    .insAbc { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .insAbc div { border:1px solid ${pal.grid}; border-radius:6px; padding:6px 10px; } .insAbc b { display:block; font-size:18px; } .insAbc span { font-size:12px; color:${pal.muted}; }
    .insPick { text-decoration:underline dotted; cursor:pointer; }
    a[data-item] { color:inherit; cursor:pointer; text-decoration:underline dotted; }`;

  function renderInsights() {
    if (!document.getElementById('insStyle')) { const sx = document.createElement('style'); sx.id = 'insStyle'; sx.textContent = INSIGHTS_CSS(SCREEN_PAL); document.head.appendChild(sx); }
    const R = insightsHtml(F.insPeriod, F.insCat, SCREEN_PAL, F.insItem);
    F.insItem = R.pickId || F.insItem;
    const box = E('div', 'insBox');
    box.innerHTML = R.html;
    body.appendChild(box);
    box.addEventListener('click', (e) => {
      const a = e.target.closest('[data-item]');
      if (a) { openDetail(a.dataset.item); return; }
      if (e.target.closest('[data-pick]')) pickInsightItem();
    });
    if (!S.movements.length) body.insertBefore(E('div', 'invEmpty', 'Insights appear once there are stock-in and stock-out entries.'), box);
  }

  function pickInsightItem() {
    const d = dialog('Choose an item to see its trend', { small: true });
    const it = itemInput('invPickList', S.items.filter(i => !i.archived), null);
    d.content.append(fld('Item', it));
    d.button('Show', 'primary', () => {
      const x = resolveItem(it.value);
      if (!x) { d.say('Please pick the item from the list.', true); return; }
      F.insItem = x.id; d.close(); renderBody();
    });
    d.button('Cancel', '', d.close);
    it.focus();
  }

  // ---------- printing / PDF ----------
  const REPORT_CSS = `
    @page { size: A4; }
    * { box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color:#222; font-size:11px; margin:0; }
    table.rp td:first-child { white-space:nowrap; }
    h1 { font-size:18px; margin:0 0 2px; } .sub { color:#666; margin:0 0 10px; font-size:11px; }
    table.rp { width:100%; border-collapse:collapse; } table.rp thead { display:table-header-group; }
    table.rp th { background:#eef1f5; text-align:left; font-size:10px; padding:4px 5px; border:1px solid #c9cfd8; }
    table.rp td { padding:3px 5px; border:1px solid #d5dae1; vertical-align:top; } table.rp tr { page-break-inside:avoid; }
    .num { text-align:right; white-space:nowrap; } .blank { height:20px; min-width:70px; }
    .cat td { background:#f6f7f9; font-weight:bold; }
    .low { color:#b45309; font-weight:bold; } .out { color:#d1242f; font-weight:bold; }
    .sign { margin-top:28px; display:flex; gap:40px; } .sign div { flex:1; border-top:1px solid #444; padding-top:3px; font-size:10px; color:#555; }`;

  function reportDoc(title, subtitle, inner, extraCss) {
    const who = (S.settings && (S.settings.user || S.settings.defaultUser)) || '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${REPORT_CSS}${extraCss || ''}</style></head><body>
      ${S.settings.formLogo ? `<img src="${esc(S.settings.formLogo)}" alt="" style="float:right;max-height:44px;max-width:160px;object-fit:contain">` : ''}<h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}${subtitle ? ' · ' : ''}Printed ${esc(fmtDate(S.today))}${who ? ' by ' + esc(who) : ''}</p>${inner}</body></html>`;
  }
  const rpTable = (cols, rows) => `<table class="rp"><thead><tr>${cols.map(c => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;

  function buildReport(kind, o) {
    o = o || {};
    if (kind === 'stock' || kind === 'count') {
      const count = kind === 'count';
      const cat = o.category || '';
      const list = S.items.filter(i => !i.archived && (!cat || i.category === cat))
        .sort((a, b) => a.category.localeCompare(b.category) || lc(a.name).localeCompare(lc(b.name)));
      const cols = [{ label: 'Code' }, { label: 'Item' }, { label: 'Unit' }, { label: 'On hand', num: true }, { label: 'Location' }];
      if (count) cols.push({ label: 'Counted' }, { label: 'Remarks' }); else { cols.push({ label: 'Status' }); }
      let rows = '', last = '';
      list.forEach(i => {
        if (i.category !== last) { last = i.category; rows += `<tr class="cat"><td colspan="${cols.length}">${esc(last)}</td></tr>`; }
        const st = i.stat.status;
        rows += `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td>${esc(i.uom)}</td><td class="num">${fmtQty(i.stat.onHand)}</td><td>${esc(i.location)}</td>` +
          (count ? '<td class="blank"></td><td class="blank"></td>' : `<td class="${st === 'low' ? 'low' : st === 'out' ? 'out' : ''}">${esc(STATUS_LABEL[st] || st)}</td>`) + '</tr>';
      });
      const inner = rpTable(cols, rows) + (count ? '<div class="sign"><div>Counted by / date</div><div>Checked by / date</div></div>' : '');
      return { title: count ? 'Stock count sheet' : 'Stock list', html: reportDoc(count ? 'Stock count sheet' : 'Stock list', (cat || 'All categories') + ' · ' + list.length + ' items', inner), landscape: false };
    }
    if (kind === 'reorder') {
      const list = S.items.filter(i => i.stat.status === 'low' || i.stat.status === 'out').sort((a, b) => STATUS_ORDER[a.stat.status] - STATUS_ORDER[b.stat.status] || lc(a.name).localeCompare(lc(b.name)));
      const rows = list.map(i => `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td class="num">${fmtQty(i.stat.onHand)} ${esc(i.uom)}</td><td class="num">${i.stat.rop ? fmtQty(i.stat.rop) : ''}</td><td class="num"><b>${fmtQty(i.stat.suggest)} ${esc(i.uom)}</b></td><td>${esc(i.supplier)}</td><td class="${i.stat.status === 'out' ? 'out' : 'low'}">${esc(STATUS_LABEL[i.stat.status])}</td></tr>`).join('');
      return { title: 'Reorder list', html: reportDoc('Reorder list', list.length + ' items need ordering', rpTable([{ label: 'Code' }, { label: 'Item' }, { label: 'On hand', num: true }, { label: 'Reorder point', num: true }, { label: 'Suggested order', num: true }, { label: 'Supplier' }, { label: 'Status' }], rows)), landscape: false };
    }
    if (kind === 'loans') {
      const list = S.loans.filter(l => l.open > 0).sort((a, b) => a.dateOut.localeCompare(b.dateOut));
      const rows = list.map(l => { const od = l.dueDate && l.dueDate < S.today; return `<tr><td>${esc(l.itemCode)}</td><td>${esc(l.itemName)}</td><td class="num">${fmtQty(l.open)} ${esc(l.uom)}</td><td>${esc(l.borrower)}</td><td>${esc(l.location)}</td><td>${esc(l.ref)}</td><td>${esc(fmtDate(l.dateOut))}</td><td>${esc(fmtDate(l.dueDate))}</td><td class="${od ? 'out' : ''}">${od ? 'Overdue ' + daysBetween(l.dueDate, S.today) + ' d' : 'Out ' + daysBetween(l.dateOut, S.today) + ' d'}</td></tr>`; }).join('');
      return { title: 'Borrowed tools', html: reportDoc('Borrowed tools', list.length + ' records still out', rpTable([{ label: 'Code' }, { label: 'Tool' }, { label: 'Qty', num: true }, { label: 'Borrower' }, { label: 'Where used' }, { label: 'BRF / ref' }, { label: 'Taken' }, { label: 'Expected back' }, { label: 'Status' }], rows) + '<div class="sign"><div>Prepared by</div><div>Noted by</div></div>'), landscape: true };
    }
    if (kind === 'moves') {
      const days = o.days || 30;
      const from = o.from || addDays(S.today, -days + 1);
      const list = S.movements.filter(m => m.date >= from && m.date <= S.today).sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
      const rows = list.map(m => `<tr><td>${esc(fmtDate(m.date))}</td><td>${esc(m.itemCode)}</td><td>${esc(m.itemName)}</td><td>${m.dir === 'in' ? 'IN' : 'OUT'}</td><td class="num">${fmtQty(m.qty)} ${esc(m.uom)}</td><td>${esc(m.reason)}</td><td>${esc(m.party)}</td><td>${esc(m.ref)}</td><td>${esc(m.by)}</td></tr>`).join('');
      return { title: 'Stock movements', html: reportDoc('Stock movements', fmtDate(from) + ' to ' + fmtDate(S.today) + ' · ' + list.length + ' entries', rpTable([{ label: 'Date' }, { label: 'Code' }, { label: 'Item' }, { label: 'In/Out' }, { label: 'Qty', num: true }, { label: 'Reason' }, { label: 'Department / supplier' }, { label: 'Reference' }, { label: 'By' }], rows)), landscape: true };
    }
    // insights
    const R = insightsHtml(o.period || 90, o.cat || '', PRINT_PAL, o.item || '');
    return { title: 'Inventory insights', html: reportDoc('Inventory insights', (o.cat || 'All except tools') + ' · last ' + (o.period || 90) + ' days', R.html, INSIGHTS_CSS(PRINT_PAL)), landscape: false };
  }

  function outputReport(rep) {
    const d = dialog(rep.title, { small: true });
    d.content.append(E('p', '', 'How do you want it?'));
    d.button('Save as PDF…', 'primary', async () => {
      d.say('Making the PDF…');
      const r = await api.invReportPdf(rep.html, { name: rep.title.toLowerCase().replace(/\s+/g, '-'), landscape: rep.landscape });
      if (r && r.canceled) { d.say(''); return; }
      if (!r || !r.ok) { d.say((r && r.error) || 'Could not make the PDF.', true); return; }
      d.close(); say('PDF saved and opened.');
    });
    d.button('Print…', '', async () => {
      d.say('Opening the print window…');
      const r = await api.invReportPrint(rep.html, { landscape: rep.landscape });
      if (!r || !r.ok) { d.say((r && r.error) || 'Could not print.', true); return; }
      d.close();
    });
    d.button('Cancel', '', d.close);
  }

  function openPrintMenu(btn) {
    const r = btn.getBoundingClientRect();
    const go = (kind, o) => () => outputReport(buildReport(kind, o));
    showMenu({ clientX: r.left, clientY: r.bottom + 2 }, [
      { label: 'Stock list (all items)', run: go('stock') },
      { label: 'Stock count sheet (blank "Counted" column)', run: go('count') },
      { label: 'Reorder list', run: go('reorder') },
      { label: 'Borrowed tools', run: go('loans') },
      '-',
      { label: 'Movements — last 7 days', run: go('moves', { days: 7 }) },
      { label: 'Movements — last 30 days', run: go('moves', { days: 30 }) },
      { label: 'Movements — last 90 days', run: go('moves', { days: 90 }) },
      '-',
      { label: 'Insights report (charts)', run: go('insights', { period: F.insPeriod, cat: F.insCat, item: F.insItem }) }
    ]);
  }

  // =====================================================================
  // WITHDRAWAL FORM (stock out) and TOOL BORROWING FORM
  // =====================================================================
  const FORM_CSS = `
    .fhead { text-align:center; margin-bottom:8px; }
    .fhead .flogo { display:block; margin:0 auto 4px; max-height:64px; max-width:220px; object-fit:contain; } .fco { font-size:15px; font-weight:bold; } .fdept { font-size:11px; color:#555; }
    .fhead h1 { font-size:17px; letter-spacing:1px; margin:8px 0 0; }
    table.meta { width:100%; border-collapse:collapse; margin:8px 0; } table.meta td { border:1px solid #888; padding:5px 7px; font-size:11px; }
    table.meta td.k { width:18%; background:#eef1f5; font-weight:bold; }
    table.rp.lines td { height:24px; } table.rp.lines th { background:#e3e8ef; text-align:center; }
    .fnote { margin:10px 0 4px; font-size:11px; }
    .sigs { display:grid; grid-template-columns:1fr 1fr; gap:14px 24px; margin-top:16px; }
    .sig { border:1px solid #888; padding:6px 8px; font-size:10px; min-height:84px; break-inside:avoid; }
    .sig b { display:block; font-size:11px; margin-bottom:4px; } .sig .ln { margin-top:15px; border-top:1px solid #444; padding-top:2px; color:#555; }
    .retbox { border:2px solid #444; margin-top:16px; padding:8px 10px; break-inside:avoid; } .retbox h3 { margin:0 0 4px; font-size:12px; }
    .ffoot { margin-top:10px; font-size:9px; color:#777; text-align:right; }`;

  function buildForm(formNo) {
    const isLoan = /^BF-/.test(formNo);
    const lines = (isLoan ? S.loans : S.movements).filter(x => x.formNo === formNo)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const uniq = (arr) => [...new Set(arr.map(x => String(x || '').trim()).filter(Boolean))].join('; ');
    const itemOf = (x) => S.items.find(i => i.id === x.itemId) || {};
    const company = S.settings.formCompany || '', dept = S.settings.formDept || '';
    const mode = S.settings.formIssuerMode || 'user';
    const me = mode === 'blank' ? '' : mode === 'fixed' ? (S.settings.formIssuerName || '') : (S.settings.user || S.settings.defaultUser || '');
    const date = lines.map(x => isLoan ? x.dateOut : x.date).sort()[0] || S.today;
    const MIN_ROWS = isLoan ? 8 : 12;
    let cols, rows = '';
    const blank = (n) => '<td></td>'.repeat(n);
    if (isLoan) {
      cols = ['No.', 'Code', 'Tool / equipment', 'Serial / tag no.', 'Qty', 'Condition when issued', 'Expected return'];
      lines.forEach((l, i) => { const it = itemOf(l); rows += `<tr><td class="num">${i + 1}</td><td>${esc(l.itemCode)}</td><td>${esc(l.itemName)}</td><td>${esc(it.serial || '')}</td><td class="num">${fmtQty(l.qty)} ${esc(l.uom)}</td><td>${esc(it.condition || '')}</td><td>${esc(fmtDate(l.dueDate))}</td></tr>`; });
      for (let i = lines.length; i < MIN_ROWS; i++) rows += `<tr><td class="num">${i + 1}</td>${blank(6)}</tr>`;
    } else {
      cols = ['No.', 'Code', 'Description', 'Unit', 'Qty', 'Remarks'];
      lines.forEach((m, i) => { rows += `<tr><td class="num">${i + 1}</td><td>${esc(m.itemCode)}</td><td>${esc(m.itemName)}</td><td>${esc(m.uom)}</td><td class="num">${fmtQty(m.qty)}</td><td>${esc(m.remarks || '')}</td></tr>`; });
      for (let i = lines.length; i < MIN_ROWS; i++) rows += `<tr><td class="num">${i + 1}</td>${blank(5)}</tr>`;
    }
    const title = isLoan ? 'TOOL BORROWING FORM' : 'MATERIAL WITHDRAWAL FORM';
    const who = isLoan ? uniq(lines.map(l => l.borrower)) : uniq(lines.map(m => m.party));
    const ref = uniq(lines.map(x => x.ref));
    const meta = `<table class="meta">
      <tr><td class="k">Form no.</td><td><b>${esc(formNo)}</b></td><td class="k">Date</td><td>${esc(fmtDate(date))}</td></tr>
      <tr><td class="k">${isLoan ? 'Borrower' : 'Department'}</td><td>${esc(who)}</td><td class="k">Reference (WO / BRF / PO)</td><td>${esc(ref)}</td></tr>
      ${isLoan ? `<tr><td class="k">Where it will be used</td><td colspan="3">${esc(uniq(lines.map(l => l.location)))}</td></tr>` : ''}</table>`;
    const sig = (title2, name) => `<div class="sig"><b>${esc(title2)}</b>Name: ${esc(name || '')}<div class="ln">Signature / date</div></div>`;
    const sigs = isLoan
      ? `<div class="sigs">${sig('Requested by (borrower)', who)}${sig('Approved by')}${sig('Issued by (storekeeper)', me)}${sig('Received by', who)}</div>
         <div class="retbox"><h3>RETURN OF TOOLS</h3>Date returned: ______________ &nbsp; Condition on return: ____________________________<br><br>Returned by: ______________________ &nbsp; Received back by: ______________________ &nbsp; Signature: ______________</div>`
      : `<div class="sigs">${sig('Requested by')}${sig('Approved by')}${sig('Issued by (storekeeper)', me)}${sig('Received by')}</div>`;
    const remarks = uniq(lines.map(x => isLoan ? x.remarks : '')) ;
    const logo = S.settings.formLogo || '';
    const inner = `<div class="fhead">${logo ? `<img class="flogo" src="${esc(logo)}" alt="">` : ''}${company ? `<div class="fco">${esc(company)}</div>` : ''}${dept ? `<div class="fdept">${esc(dept)}</div>` : ''}<h1>${title}</h1></div>
      ${meta}<table class="rp lines"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      ${remarks ? `<div class="fnote"><b>Remarks:</b> ${esc(remarks)}</div>` : ''}${sigs}<div class="ffoot">${esc(formNo)} · printed ${esc(fmtDate(S.today))}</div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(formNo)}</title><style>${REPORT_CSS}${FORM_CSS}</style></head><body>${inner}</body></html>`;
    return { title: formNo, html, landscape: false };
  }

  async function makeForm(moveIds, loanIds) {
    const r = await api.invFormAssign(moveIds || [], loanIds || []);
    if (!r || !r.ok) { say((r && r.error) || 'Could not make the form.'); return; }
    useState(r);
    if (!S.settings.formCompany) say('Tip: set the company / department name for the form heading in More → Form heading.');
    outputReport(buildForm(r.formNo));
  }

  // makes the logo small (so the saved data stays light) and returns a PNG/JPEG data URL
  function shrinkLogo(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 360 / img.width, 180 / img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let out = c.toDataURL('image/png');
        if (out.length > 500000) {
          const g = c.getContext('2d'); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', 0.85);
        }
        out.length > 600000 ? reject(new Error('too big')) : resolve(out);
      };
      img.onerror = () => reject(new Error('bad picture'));
      img.src = dataUrl;
    });
  }

  function openFormHeading() {
    const d = dialog('Form heading', { small: true });
    const co = inp('text', S.settings.formCompany, { maxLength: 120 });
    const dp = inp('text', S.settings.formDept, { maxLength: 120 });
    const mode = sel([['user', 'Name of the person using the app'], ['fixed', 'A fixed name (type it below)'], ['blank', 'Leave blank (to write by hand)']], S.settings.formIssuerMode || 'user');
    const fx = inp('text', S.settings.formIssuerName, { maxLength: 120 });
    const syncFx = () => { fx.disabled = mode.value !== 'fixed'; };
    mode.addEventListener('change', syncFx); syncFx();
    d.content.append(fld('Company / project name', co, 'Printed at the top of every form'), fld('Department (optional)', dp));
    d.content.append(fld('Issued by (storekeeper) name on forms', mode), fld('Fixed name', fx));
    let logoData = S.settings.formLogo || '';
    const prev = E('img'); prev.style.cssText = 'max-height:60px;max-width:200px;display:block;margin:4px 0;object-fit:contain';
    const noLogo = E('div', 'invSub', 'No logo yet');
    const pickB = E('button', '', 'Choose logo…'); pickB.type = 'button';
    const delB = E('button', '', 'Remove logo'); delB.type = 'button';
    const showLogo = () => { prev.src = logoData || ''; prev.style.display = logoData ? 'block' : 'none'; noLogo.style.display = logoData ? 'none' : ''; delB.disabled = !logoData; };
    pickB.addEventListener('click', async () => {
      const r0 = await api.invLogoPick();
      if (!r0 || r0.canceled) return;
      if (!r0.ok) { d.say(r0.error, true); return; }
      try { logoData = await shrinkLogo(r0.dataUrl); d.say(''); showLogo(); } catch (e) { d.say('Could not read that picture. Try a PNG or JPG.', true); }
    });
    delB.addEventListener('click', () => { logoData = ''; showLogo(); });
    const logoBox = E('div'); logoBox.append(prev, noLogo, pickB, document.createTextNode(' '), delB);
    d.content.append(fld('Logo (shown on forms and reports)', logoBox, 'A square or wide picture on a white or transparent background works best.'));
    showLogo();
    d.button('Save', 'primary', async () => {
      const r = await api.invSettingsSet({ formCompany: co.value, formDept: dp.value, formIssuerMode: mode.value, formIssuerName: fx.value, formLogo: logoData });
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close(); say('Saved.');
    });
    d.button('Cancel', '', d.close);
    co.focus();
  }

  // ----- bulk entry grid (type or paste many lines, save once) -----
  function parseDateText(t) {
    t = String(t || '').trim();
    if (!t) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    if (/^\d+(\.\d+)?$/.test(t) && +t > 20000 && +t < 80000) { // Excel serial date
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(+t) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    const ms = Date.parse(t.replace(/(\d)(st|nd|rd|th)\b/, '$1'));
    if (isNaN(ms)) return '';
    const d = new Date(ms);
    const p2 = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function parseDirText(t) {
    const x = String(t || '').trim().toLowerCase();
    if (!x) return '';
    if (/^(in|\+|receive|received|stock ?in|add|purchase|return|returned)/.test(x)) return 'in';
    if (/^(out|-|−|issue|issued|withdraw|withdrawn|stock ?out|use|used|release)/.test(x)) return 'out';
    return '';
  }
  function findItemLoose(text) {
    const hit = resolveItem(text);
    if (hit) return hit;
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    const live = S.items.filter(i => !i.archived);
    const words = t.split(/[^a-z0-9"./]+/).filter(Boolean);
    const m = live.filter(i => { const n = (i.code + ' ' + i.name).toLowerCase(); return words.every(w => n.includes(w)); });
    return m.length === 1 ? m[0] : null;
  }
  function looseCount(text) {
    const words = String(text || '').trim().toLowerCase().split(/[^a-z0-9"./]+/).filter(Boolean);
    if (!words.length) return 0;
    return S.items.filter(i => !i.archived && words.every(w => (i.code + ' ' + i.name).toLowerCase().includes(w))).length;
  }
  const HEAD_MAP = {
    date: 'date', 'date out': 'date', 'date in': 'date', 'in/out': 'dir', inout: 'dir', type: 'dir', direction: 'dir', movement: 'dir',
    code: 'item', item: 'item', name: 'item', 'item name': 'item', description: 'item', material: 'item',
    qty: 'qty', quantity: 'qty', 'qty.': 'qty', person: 'party', department: 'party', 'department / person': 'party', party: 'party',
    'taken by': 'party', 'issued to': 'party', who: 'party', ref: 'ref', reference: 'ref', 'ref no': 'ref', 'ref no.': 'ref', remarks: 'remarks', reason: 'reason'
  };

  function openBulk() {
    const d = dialog('Bulk entry — many stock in / out lines at once', { wide: true });
    d.dlg.classList.add('invBulkDlg');
    const c = d.content;
    c.append(E('div', 'invNote', 'Type line by line (Enter in the last box adds a new line) or paste rows copied from Excel. Pasting a table: columns in this order — Date, In/Out, Item (code or name), Qty, Department, Ref. A first row with headings is also understood.'));
    const tbl = E('table', 'invBulk');
    const thead = E('thead'); const hr = E('tr');
    ['Date', 'In / Out', 'Item', 'Qty', 'Department', 'Reference', ''].forEach(h => hr.appendChild(E('th', '', h)));
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = E('tbody'); tbl.appendChild(tb);
    const wrap = E('div', 'invBulkWrap'); wrap.appendChild(tbl);
    c.appendChild(wrap);
    datalist('invBulkItems', S.items.filter(i => !i.archived).map(itemLabel));
    datalist('invParties', S.movements.map(m => m.party).concat(S.loans.map(l => l.borrower)));
    const neg = document.createElement('input'); neg.type = 'checkbox';
    const negRow = E('label', 'invChk'); negRow.append(neg, E('span', '', 'Allow stock to go below zero (only if you are sure)'));
    const bar2 = E('div', 'invRow');
    const addB = E('button', '', '＋ Add line'); addB.type = 'button';
    const clrB = E('button', '', 'Clear all'); clrB.type = 'button';
    bar2.append(addB, clrB);
    const formChk = document.createElement('input'); formChk.type = 'checkbox'; formChk.checked = true;
    const formRow = E('label', 'invChk'); formRow.append(formChk, E('span', '', 'Make one withdrawal form for the stock-out lines (to print or save as PDF)'));
    const savedOut = [];
    c.append(bar2, negRow, formRow);

    const rows = [];
    function lastVals() {
      const r = rows[rows.length - 1];
      return r ? { date: r.date.value, dir: r.dir.value, party: r.party.value, ref: r.ref.value } : { date: S.today, dir: 'out', party: '', ref: '' };
    }
    function addRow(v) {
      v = Object.assign(lastVals(), { item: '', qty: '' }, v || {});
      const tr = E('tr');
      const date = inp('date', v.date);
      const dir = sel([['out', 'OUT'], ['in', 'IN']], v.dir);
      const item = inp('text', v.item); item.setAttribute('list', 'invBulkItems'); item.placeholder = 'Code or name'; item.autocomplete = 'off';
      const qty = inp('number', v.qty);
      const party = inp('text', v.party, { maxLength: 120 }); party.setAttribute('list', 'invParties');
      const ref = inp('text', v.ref, { maxLength: 80 });
      const info = E('div', 'invSub');
      const del = E('button', '', '✕'); del.type = 'button'; del.title = 'Remove this line';
      const cell = (x) => { const t = E('td'); t.appendChild(x); return t; };
      const itemCell = cell(item); itemCell.appendChild(info);
      tr.append(cell(date), cell(dir), itemCell, cell(qty), cell(party), cell(ref), cell(del));
      const row = { tr, date, dir, item, qty, party, ref, info };
      const upd = () => {
        const it = findItemLoose(item.value);
        row.it = it;
        if (it && item.value !== itemLabel(it) && item.value.trim().toUpperCase() !== it.code) { /* keep what was typed */ }
        info.style.color = '';
        const cnt = it ? 1 : looseCount(item.value);
        info.textContent = it ? `${it.name} · on hand ${fmtQty(it.stat.onHand)} ${it.uom}` : (item.value.trim() ? (cnt > 1 ? `${cnt} items match — type the exact code (e.g. CON-0001)` : 'Item not found') : '');
        if (item.value.trim() && !it) info.style.color = '#d1242f';
        tr.classList.remove('bad');
      };
      item.addEventListener('input', upd); item.addEventListener('change', upd);
      del.addEventListener('click', () => { rows.splice(rows.indexOf(row), 1); tr.remove(); if (!rows.length) addRow(); });
      qty.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (rows[rows.length - 1] === row) { addRow({ item: '', qty: '' }); }
          rows[rows.indexOf(row) + 1].item.focus();
        }
      });
      row.upd = upd;
      rows.push(row); tb.appendChild(tr); upd();
      return row;
    }
    function isBlank(r) { return !r.item.value.trim() && !r.qty.value; }

    // paste a table from Excel
    function pasteTable(text) {
      const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
      if (!lines.length) return 0;
      let cols = lines[0].split('\t');
      let map = ['date', 'dir', 'item', 'qty', 'party', 'ref'];
      const heads = cols.map(x => HEAD_MAP[x.trim().toLowerCase()]);
      if (heads.filter(Boolean).length >= 2 && heads.includes('item')) { map = heads; lines.shift(); }
      let n = 0;
      lines.forEach(l => {
        const cells = l.split('\t');
        const rec = {};
        map.forEach((k, i) => { if (k && cells[i] != null && rec[k] === undefined) rec[k] = cells[i].trim(); });
        if (!rec.item && !rec.qty) return;
        const target = rows.find(isBlank) || addRow();
        const dt = parseDateText(rec.date); const dr = parseDirText(rec.dir);
        if (dt) target.date.value = dt;
        if (dr) target.dir.value = dr;
        else if (/^-/.test(String(rec.qty || ''))) target.dir.value = 'out';
        target.item.value = rec.item || '';
        target.qty.value = String(rec.qty || '').replace(/[^0-9.]/g, '');
        if (rec.party != null) target.party.value = rec.party;
        if (rec.ref != null) target.ref.value = rec.ref;
        target.upd(); n++;
      });
      return n;
    }
    d.overlay.addEventListener('paste', (e) => {
      const t = (e.clipboardData || window.clipboardData).getData('text');
      if (!t || (!t.includes('\t') && !t.includes('\n'))) return; // normal single-cell paste
      e.preventDefault();
      const n = pasteTable(t);
      d.say(n ? `Pasted ${n} line${n === 1 ? '' : 's'}. Check them, then press Save.` : 'Nothing to paste.', !n);
    });

    addB.addEventListener('click', () => { addRow().item.focus(); });
    clrB.addEventListener('click', () => { rows.splice(0).forEach(r => r.tr.remove()); addRow(); });
    const todays = S.today;
    for (let i = 0; i < 5; i++) addRow({ date: todays, dir: 'out' });

    async function saveAll() {
      d.say('');
      const todo = rows.filter(r => !isBlank(r));
      if (!todo.length) { d.say('Nothing to save yet.', true); return; }
      let bad = 0;
      todo.forEach(r => { r.upd(); r.tr.classList.remove('bad'); });
      const send = [];
      todo.forEach(r => {
        if (!r.it) { bad++; r.tr.classList.add('bad'); r.info.textContent = r.item.value.trim() ? (looseCount(r.item.value) > 1 ? looseCount(r.item.value) + ' items match — type the exact code' : 'Item not found — pick it from the list') : 'Choose an item'; r.info.style.color = '#d1242f'; }
        send.push(r);
      });
      if (bad) { d.say(`${bad} line${bad === 1 ? ' needs' : 's need'} an item. Fix the red lines, then Save again.`, true); return; }
      const res = await api.invMoveBulk(send.map(r => ({
        itemId: r.it.id, dir: r.dir.value, qty: r.qty.value, date: r.date.value, party: r.party.value, ref: r.ref.value
      })), { allowNegative: neg.checked });
      if (!res.ok) { d.say(res.error, true); return; }
      useState(res);
      let failed = 0;
      res.results.forEach((x, i) => {
        const r = send[i];
        if (x.ok) { if (r.dir.value === 'out' && x.id) savedOut.push(x.id); rows.splice(rows.indexOf(r), 1); r.tr.remove(); }
        else { failed++; r.tr.classList.add('bad'); r.info.textContent = x.error; r.info.style.color = '#d1242f'; }
      });
      if (!failed) { d.close(); say(`${res.saved} entr${res.saved === 1 ? 'y' : 'ies'} saved.`); if (formChk.checked && savedOut.length) makeForm(savedOut, null); return; }
      if (!rows.length) addRow();
      say(`${res.saved} saved. ${failed} line${failed === 1 ? '' : 's'} left in red — fix them and Save again.`);
      d.say(`${res.saved} saved, ${failed} to fix (red).`, true);
    }
    d.button('Save all', 'primary', saveAll);
    d.button('Cancel', '', d.close);
    rows[0].item.focus();
  }

  // ----- lend / return tools -----
  function openCheckout(itemId) {
    const preset = itemId ? S.items.find(i => i.id === itemId) : null;
    const d = dialog('Lend a tool');
    const pool = S.items.filter(i => !i.archived && i.category === 'Tools & Equipment');
    const item = itemInput('invToolList', pool.length ? pool : S.items.filter(i => !i.archived), preset);
    const info = E('div', 'invInfo');
    const qty = inp('number', '1');
    const who = inp('text', '', { maxLength: 120 }); who.setAttribute('list', 'invBorrowers');
    datalist('invBorrowers', S.loans.map(l => l.borrower));
    const loc = inp('text', '', { maxLength: 120 }); loc.setAttribute('list', 'invLocs');
    datalist('invLocs', S.items.map(i => i.location).concat(S.loans.map(l => l.location)));
    const ref = inp('text', '', { maxLength: 80 }); ref.placeholder = 'BRF no.';
    const out = inp('date', S.today); const due = inp('date', '');
    const remarks = inp('text', '', { maxLength: 500 });
    const mkForm = document.createElement('input'); mkForm.type = 'checkbox'; mkForm.checked = true;
    const mkRow = E('label', 'invChk'); mkRow.append(mkForm, E('span', '', 'Also make a tool borrowing form (to print or save as PDF)'));
    const loanIds = [];
    const showInfo = () => {
      const it = resolveItem(item.value);
      info.textContent = it ? `Available: ${fmtQty(it.stat.available)} of ${fmtQty(it.stat.onHand)} ${it.uom}` : '';
    };
    item.addEventListener('input', showInfo); item.addEventListener('change', showInfo);
    const c = d.content;
    c.append(fld('Tool', item), info, grid(fld('Quantity', qty), fld('Borrower', who)));
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
      if (mkForm.checked) makeForm(null, loanIds);
    }
    d.button('Save', 'primary', () => saveLoan(false));
    d.button('Save & add another tool', '', () => saveLoan(true));
    d.button('Cancel', '', d.close);
    (preset ? who : item).focus();
  }

  function openReturn(l) {
    const d = dialog('Return a tool', { small: true });
    const qty = inp('number', l.open); qty.max = String(l.open);
    const date = inp('date', S.today);
    const cond = sel(S.conditions, 'Good');
    const remarks = inp('text', '', { maxLength: 300 });
    const c = d.content;
    c.append(E('p', '', `${l.itemName} — ${fmtQty(l.open)} ${l.uom} borrowed by ${l.borrower}`));
    c.append(grid(fld('Quantity returned', qty), fld('Date returned', date)), fld('Condition', cond), fld('Remarks', remarks));
    d.button('Mark as returned', 'primary', async () => {
      const r = await api.invReturn(l.id, { qty: qty.value, date: date.value, condition: cond.value, remarks: remarks.value });
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close(); say('Return recorded.');
    });
    d.button('Cancel', '', d.close);
  }

  // ----- item details -----
  function openDetail(id) {
    const i = S.items.find(x => x.id === id);
    if (!i) return;
    const d = dialog('Item details', { wide: true });
    const c = d.content;
    const head = E('div', 'invRow');
    head.append(E('span', 'invBig', i.code), statusPill(i.stat.status));
    const copy = E('button', '', 'Copy code'); copy.type = 'button';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(i.code); say('Code copied.'); } catch (e) { say('Could not copy.'); } });
    head.append(copy);
    c.append(head, E('div', '', i.name));
    const facts = E('div', 'invFacts');
    const add = (k, v) => { if (v === '' || v == null) return; const x = E('div'); x.append(E('span', '', k), document.createTextNode(String(v))); facts.appendChild(x); };
    add('Category', i.category); add('Group', i.group);
    add('On hand', fmtQty(i.stat.onHand) + ' ' + i.uom);
    if (i.stat.onLoan) { add('Borrowed', fmtQty(i.stat.onLoan) + ' ' + i.uom); add('Available', fmtQty(i.stat.available) + ' ' + i.uom); }
    add('Reorder point', i.stat.rop ? fmtQty(i.stat.rop) + ' ' + i.uom : '');
    add('Suggested order', i.stat.suggest ? fmtQty(i.stat.suggest) + ' ' + i.uom : '');
    add('Daily use (90 d)', i.stat.avgDaily ? String(i.stat.avgDaily) : '');
    add('Lasts about', i.stat.coverDays != null ? (i.stat.coverDays < 1 ? 'under 1 day' : i.stat.coverDays + (i.stat.coverDays === 1 ? ' day' : ' days')) : '');
    add('Location', i.location); add('Supplier', i.supplier); add('Lead time', i.leadTimeDays ? i.leadTimeDays + ' days' : '');
    add('Manufacturer barcode', i.barcode); add('Serial / tag', i.serial); add('Condition', i.condition);
    add('Calibration due', fmtDate(i.calibrationDue)); add('Last movement', fmtDate(i.stat.last)); add('Notes', i.notes);
    c.append(facts);

    const acts = E('div', 'invRow');
    const mkb = (label, fn, cls) => { const b = E('button', cls || '', label); b.type = 'button'; b.addEventListener('click', () => { d.close(); fn(); }); acts.appendChild(b); };
    mkb('⬇ Stock in', () => openMove({ itemId: i.id, dir: 'in' }), 'primary');
    mkb('⬆ Stock out', () => openMove({ itemId: i.id, dir: 'out' }));
    if (i.category === 'Tools & Equipment') mkb('🔧 Lend', () => openCheckout(i.id));
    mkb('Edit item', () => openItem(i));
    c.append(acts);

    const moves = S.movements.filter(m => m.itemId === i.id).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 40);
    if (moves.length) {
      c.append(E('div', 'invSub', 'Recent movements'));
      const box = E('div', 'invList');
      const { t, tb } = table([{ label: 'Date' }, { label: 'In / Out' }, { label: 'Qty', num: true }, { label: 'Reason' }, { label: 'Department / supplier' }, { label: 'Ref' }]);
      moves.forEach(m => {
        const tr = E('tr');
        tr.append(td('', fmtDate(m.date)), td('', E('span', m.dir === 'in' ? 'invMoveIn' : 'invMoveOut', m.dir === 'in' ? 'IN' : 'OUT')), td('num', fmtQty(m.qty)), td('', m.reason), td('', m.party), td('', m.ref));
        tb.appendChild(tr);
      });
      box.appendChild(t); c.append(box);
    }
    const loans = S.loans.filter(l => l.itemId === i.id).sort((a, b) => b.dateOut.localeCompare(a.dateOut)).slice(0, 20);
    if (loans.length) {
      c.append(E('div', 'invSub', 'Borrowing history'));
      const box = E('div', 'invList');
      const { t, tb } = table([{ label: 'Taken' }, { label: 'Borrower' }, { label: 'Qty', num: true }, { label: 'Status' }]);
      loans.forEach(l => {
        const tr = E('tr');
        tr.append(td('', fmtDate(l.dateOut)), td('', l.borrower), td('num', fmtQty(l.qty)), td('', l.open > 0 ? 'Out' : 'Returned'));
        tb.appendChild(tr);
      });
      box.appendChild(t); c.append(box);
    }
    d.button('Close', '', d.close);
  }

  // ----- Excel import wizard -----
  async function openImport() {
    const d = dialog('Import from Excel', { wide: true });
    const c = d.content;
    c.append(E('p', '', 'Choose an Excel file made with More > Export to Excel in this app (sheets "Stock", "Movements" and "Borrowed tools"). You will see a preview and a check of your balances before anything is saved.'));
    const area = E('div');
    c.append(area);
    let ctrl = null, goBtn = null;
    const pick = d.button('Choose Excel file…', 'primary', async () => {
      pick.disabled = true; d.say('Reading the file (large files take a few seconds)…');
      const a = await api.invImportAnalyze();
      pick.disabled = false;
      if (a.canceled) { d.say(''); return; }
      if (!a.ok) { d.say(a.error, true); return; }
      d.say('');
      showAnalysis(a);
    });
    d.button('Close', '', d.close);

    function showAnalysis(a) {
      area.innerHTML = '';
      area.append(E('div', '', `${a.fileName} — ${a.kind === 'export' ? 'Work Helper export' : a.kind === 'tools' ? 'tools workbook' : 'consumables workbook'}`));
      const parts = [`${a.counts.items} items`];
      if (a.kind !== 'tools') parts.push(`${a.counts.movements} stock in/out entries` + (a.dateRange ? ` (${fmtDate(a.dateRange.from)} – ${fmtDate(a.dateRange.to)})` : ''));
      if (a.kind !== 'consumables') parts.push(`${a.counts.loans} borrowed-tool records`);
      area.append(E('div', 'invNote', 'Found: ' + parts.join(', ') + '.'));

      if (a.kind !== 'tools') {
        if (a.reconcile.checked) {
          const ok = a.reconcile.mismatchCount === 0;
          area.append(E('div', ok ? 'invOk' : 'invWarn', ok
            ? `✔ Balance check: all ${a.reconcile.checked} balances in your Excel match what the app calculates from the entries.`
            : `Balance check: ${a.reconcile.matched} of ${a.reconcile.checked} match. ${a.reconcile.mismatchCount} differ (the entries add up to less than the balance, so the balance cannot be reached):`));
          if (!ok) {
            const box = E('div', 'invIssues');
            a.reconcile.mismatches.forEach(m => box.append(E('div', '', `Row ${m.row}: ${m.name} — Excel ${m.excel}, app ${m.app}`)));
            area.append(box);
          }
        }
        area.append(E('div', 'invNote', a.kind === 'export' ? 'Any balance the entries do not explain is recorded as opening stock, so each item ends with exactly the balance on the Stock sheet.' : 'Rows that only have a typed balance (no opening stock) are imported so that the app ends up with exactly that balance.'));
      }
      if (a.issueCount) {
        area.append(E('div', 'invWarn', `${a.issueCount} thing${a.issueCount === 1 ? '' : 's'} to check (these do not stop the import):`));
        const box = E('div', 'invIssues');
        a.issues.forEach(x => box.append(E('div', x.level === 'skip' ? 'invWarn' : '', (x.level === 'skip' ? 'Skipped. ' : '') + x.text)));
        if (a.issueCount > a.issues.length) box.append(E('div', 'invSub', `…and ${a.issueCount - a.issues.length} more.`));
        area.append(box);
      }
      const od = inp('date', a.defaultOpeningDate);
      area.append(fld('Opening stock date', od, 'Opening stock is recorded on this date, just before your first movement.'));
      let replace = null, loans = null;
      if (a.hasPrior) {
        replace = inp('checkbox', ''); replace.checked = true;
        const l = E('label', 'invChk'); l.append(replace, E('span', '', 'Replace what I imported from this kind of file before (recommended when you import a corrected file). Items you added by hand are not touched.'));
        area.append(l);
      }
      if (a.kind !== 'consumables' && a.counts.loans) {
        loans = inp('checkbox', ''); loans.checked = true;
        const l = E('label', 'invChk'); l.append(loans, E('span', '', `Also import the ${a.counts.loans} borrowed-tool records from the file`));
        area.append(l);
      }
      ctrl = { od, replace, loans };
      if (!goBtn) {
        goBtn = d.button('Import now', 'primary', async () => {
          goBtn.disabled = true; d.say('Importing…');
          const r = await api.invImportApply({ openingDate: ctrl.od.value, replace: ctrl.replace ? ctrl.replace.checked : false, includeLoans: ctrl.loans ? ctrl.loans.checked : true });
          goBtn.disabled = false;
          if (!r.ok) { d.say(r.error, true); return; }
          useState(r); d.close();
          const x = r.result;
          say(`Imported: ${x.itemsAdded} new items${x.itemsUpdated ? `, ${x.itemsUpdated} updated` : ''}, ${x.movementsAdded} entries${x.loansAdded ? `, ${x.loansAdded} borrowed tools` : ''}. A backup was saved first.`);
        });
      }
    }
  }

  // ----- Excel export -----
  async function exportExcel() {
    const r = await api.invExportExcel();
    if (r.canceled) return;
    if (!r.ok) { say(r.error); return; }
    say('Report saved: ' + r.path);
  }

  // ----- sharing between PCs -----
  function openSync() {
    const d = dialog('Send / receive inventory (email or USB)', { wide: true });
    const c = d.content;
    c.append(E('p', '', '1. On the PC that has the newest entries, press "Send my inventory file", then email the file or copy it to a USB stick.'));
    c.append(E('p', '', '2. On the other PC, press "Receive a file" and choose it. The two inventories are combined: nothing is lost, entries from both PCs are kept, and if you both changed the same item the newer change wins.'));
    c.append(E('p', 'invNote', 'You can send and receive as often as you like. Receiving the same file twice does no harm. A backup is saved before every merge.'));
    const out = E('div', 'invList'); out.style.maxHeight = '220px'; out.hidden = true;
    c.append(out);
    d.button('Send my inventory file…', 'primary', async () => {
      const r = await api.invSyncExport();
      if (r.canceled) return;
      if (!r.ok) { d.say(r.error, true); return; }
      out.hidden = false; out.innerHTML = '';
      out.append(E('div', 'invOk', 'File saved:'), E('div', '', r.path), E('div', 'invNote', `${r.counts.items} items, ${r.counts.movements} movements, ${r.counts.loans} loans.`));
    });
    d.button('Receive a file…', '', async () => {
      const r = await api.invSyncImport();
      if (r.canceled) return;
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r);
      const x = r.report;
      out.hidden = false; out.innerHTML = '';
      out.append(E('div', 'invOk', 'Merged' + (r.from ? ' (file from ' + r.from + ')' : '') + ':'));
      out.append(E('div', '', `New items: ${x.items.added}, updated items: ${x.items.updated}`));
      out.append(E('div', '', `New movements: ${x.movements.added}, updated: ${x.movements.updated}`));
      out.append(E('div', '', `New loan records: ${x.loans.added}, updated: ${x.loans.updated}`));
      if (x.renamed.length) {
        out.append(E('div', 'invWarn', 'Two PCs gave different items the same code. These items got a new code (re-print their labels if you already did):'));
        x.renamed.forEach(n => out.append(E('div', 'invWarn', `${n.name}: ${n.from} → ${n.to}`)));
      }
    });
    d.button('Close', '', d.close);
  }

  // ---------- buttons and top bar wiring ----------
  // ---------- minimum levels for many items at once ----------
  function openMinLevels() {
    const d = dialog('Minimum levels — set low-stock limits for many items', { wide: true });
    d.content.append(E('div', 'invNote', 'An item shows as low when its stock goes down to the minimum. Type the numbers, then Save. Leave 0 for “no limit”. Tip: you can paste a column of numbers from Excel into the first Minimum box.'));
    const wrap = E('div', 'invBulkWrap'); const tbl = E('table', 'invBulk');
    const hr = E('tr'); ['Code', 'Item', 'On hand', 'Minimum', 'Reorder qty'].forEach(h => hr.appendChild(E('th', '', h)));
    const th = E('thead'); th.appendChild(hr); tbl.appendChild(th);
    const tb = E('tbody'); tbl.appendChild(tb); wrap.appendChild(tbl); d.content.appendChild(wrap);
    const q = E('input'); q.type = 'search'; q.placeholder = 'Filter…'; q.style.margin = '6px 0';
    d.content.insertBefore(q, wrap);
    const rows = S.items.filter(i => !i.archived && i.category !== 'Tools & Equipment').sort((a, b) => a.code.localeCompare(b.code)).map(i => {
      const mk = (v) => { const x = E('input'); x.type = 'number'; x.min = '0'; x.step = 'any'; x.value = v || 0; x.style.width = '90px'; return x; };
      const tr = E('tr'); const mi = mk(i.minQty), ro = mk(i.reorderQty);
      tr.append(E('td', '', i.code), E('td', '', i.name), E('td', 'num', fmtQty(i.stat.onHand) + ' ' + i.uom));
      const t1 = E('td'); t1.appendChild(mi); const t2 = E('td'); t2.appendChild(ro); tr.append(t1, t2);
      tb.appendChild(tr);
      return { i, tr, mi, ro };
    });
    if (!rows.length) tb.appendChild(E('tr')).appendChild(E('td', '', 'No consumable items yet.'));
    q.addEventListener('input', () => { const t = q.value.toLowerCase(); rows.forEach(r => { r.tr.hidden = !!t && !(r.i.code + ' ' + r.i.name).toLowerCase().includes(t); }); });
    rows.forEach((r, k) => r.mi.addEventListener('paste', (e) => {
      const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
      if (!/[\n\t]/.test(t.trim())) return;
      e.preventDefault();
      t.trim().split(/\r?\n/).forEach((line, n) => { const row = rows[k + n]; if (!row) return; const v = Number(line.split('\t')[0].replace(/,/g, '')); if (v >= 0) row.mi.value = v; });
    }));
    d.button('Save', 'primary', async () => {
      const out = rows.map(r => ({ id: r.i.id, minQty: r.mi.value, reorderQty: r.ro.value }));
      const r = await api.invMinBulk(out);
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close(); say(r.changed ? r.changed + ' item' + (r.changed === 1 ? '' : 's') + ' updated.' : 'Nothing changed.');
    });
    d.button('Cancel', '', d.close);
  }

  // ---------- clear data (with a warning first) ----------
  function openClearAll() {
    const d = dialog('Sure ka?!', { small: true });
    const warn = E('div', 'invNote', '⚠ This removes data from this PC. A backup copy is saved first (More → Open data and backups folder), but if you later receive a file from another PC it may bring old entries back.');
    warn.style.color = '#c62828'; warn.style.fontWeight = '600';
    const a = E('label', 'invChk'), b = E('label', 'invChk');
    const r1 = E('input'); r1.type = 'radio'; r1.name = 'clr'; r1.value = 'moves'; r1.checked = true;
    const r2 = E('input'); r2.type = 'radio'; r2.name = 'clr'; r2.value = 'all';
    a.append(r1, E('span', '', ' Clear all stock movements and borrowed tools only. The item list stays (stock goes back to zero).'));
    b.append(r2, E('span', '', ' Clear EVERYTHING: items, movements and borrowed tools. Your name, company and logo stay.'));
    [a, b].forEach(l => { l.style.display = 'block'; l.style.margin = '8px 0'; });
    const box = E('input'); box.type = 'text'; box.placeholder = 'Type CLEAR to continue'; box.style.width = '100%';
    d.content.append(warn, a, b, E('div', 'invNote', 'To continue, type the word CLEAR below.'), box);
    const go = d.button('Clear data', 'primary', async () => {
      if (box.value.trim().toUpperCase() !== 'CLEAR') { d.say('Please type CLEAR first.', true); return; }
      const r = await api.invClearAll(r2.checked ? 'all' : 'moves');
      if (!r.ok) { d.say(r.error, true); return; }
      useState(r); d.close(); say('Cleared. A backup was saved first.');
    });
    d.button('Cancel', '', d.close);
    box.focus();
  }

  btnNew.addEventListener('click', () => openItem());
  btnBulk.addEventListener('click', openBulk);
  btnPrint.addEventListener('click', (e) => { e.stopPropagation(); openPrintMenu(btnPrint); });
  btnIn.addEventListener('click', () => openMove({ dir: 'in' }));
  btnOut.addEventListener('click', () => openMove({ dir: 'out' }));
  btnLend.addEventListener('click', () => openCheckout());
  btnMore.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = btnMore.getBoundingClientRect();
    showMenu({ clientX: r.left, clientY: r.bottom + 2 }, [
      { label: 'Import from Excel…', run: openImport },
      { label: 'Export to Excel…', run: exportExcel },
      '-',
      { label: 'Send / receive file for the other PC…', run: openSync },
      '-',
      { label: 'Form heading (company, department)…', run: openFormHeading },
      { label: 'Minimum levels (low-stock limits)…', run: openMinLevels },
      { label: 'Open data and backups folder', run: () => api.invOpenFolder() },
      { label: 'Your name (saved on entries)…', run: async () => {
        const n = await askText('Your name (saved on every entry you make)', S.settings.user || S.settings.defaultUser);
        if (n == null) return;
        const r2 = await api.invSettingsSet({ user: n });
        if (r2.ok) { useState(r2); say('Saved.'); }
      } },
      '-',
      { label: 'Clear all data…', run: openClearAll }
    ]);
  });

  scan.addEventListener('input', () => { F.text = scan.value; if (S) renderBody(); });
  scan.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !S) return;
    const v = scan.value.trim();
    if (!v) return;
    const it = resolveItem(v) || (filteredItems().length === 1 ? filteredItems()[0] : null);
    if (it) { openDetail(it.id); scan.value = ''; F.text = ''; renderBody(); }
    else say('No single item matches "' + v + '".');
  });

  // ---------- show / hide with the sidebar ----------
  let loadedOnce = false;
  function show() {
    view.hidden = false;
    if (!loadedOnce) { loadedOnce = true; load(); }
    else load();
  }
  document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'inventory') show(); else view.hidden = true;
  }));
  // other code (reminders, intro) can switch tabs without a click
  ['filesView', 'tasksView'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(() => { if (!el.hidden) view.hidden = true; }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  });
  window.addEventListener('focus', () => { if (!view.hidden && !document.querySelector('.overlay')) load(); });
})();
