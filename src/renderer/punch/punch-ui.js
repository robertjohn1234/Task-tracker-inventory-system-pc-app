// Punch list tab: write the items (with pictures), then generate a PDF or Excel file in one of four layouts.
(function () {
  'use strict';
  const view = document.getElementById('punchView');
  if (!view) return;
  const { E, esc, say } = WH;
  const STATUSES = ['Open', 'In progress', 'Done', 'Verified'];
  const PRIORITIES = ['High', 'Medium', 'Low'];

  const css = document.createElement('style');
  css.textContent = `
    #punchView .pBody { flex: 1; overflow: auto; }
    #punchView .pThumb { width: 56px; height: 42px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border, #ccc); display: block; }
    #punchView .pBadge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; border: 1px solid var(--border, #ccc); white-space: nowrap; }
    #punchView .pHigh { background: #fde2e4; color: #9b1c2c; } #punchView .pMedium { background: #fff1cc; color: #7a5b00; } #punchView .pLow { background: #dff3e1; color: #1d6b2b; }
    #punchView .sOpen { background: #e8f0ff; color: #1f4fb4; } #punchView .sIn { background: #fff1cc; color: #7a5b00; } #punchView .sDone, #punchView .sVerified { background: #dff3e1; color: #1d6b2b; }
    #punchView tr.late td:nth-child(7) { color: #c62828; font-weight: 600; }
    .pPhotos { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0; }
    .pPhotos .ph { position: relative; }
    .pPhotos img { width: 110px; height: 82px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border, #ccc); display: block; }
    .pPhotos .ph button { position: absolute; top: 2px; right: 2px; padding: 0 6px; line-height: 18px; }
    .pDrop { border: 2px dashed var(--border, #bbb); border-radius: 8px; padding: 8px; text-align: center; font-size: 12px; color: var(--muted, #777); }
    .pDlg textarea { width: 100%; box-sizing: border-box; min-height: 80px; }
    .pLay { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 8px 0; }
    .pLay label { border: 2px solid var(--border, #ccc); border-radius: 8px; padding: 8px; cursor: pointer; display: flex; gap: 8px; align-items: flex-start; }
    .pLay label.on { border-color: var(--accent, #1f6feb); background: var(--hover, #eef3ff); }
    .pLay input { margin-top: 3px; }
    .pLay b { display: block; font-size: 13px; } .pLay small { color: var(--muted, #777); font-size: 11px; display: block; }
    .pLay svg { width: 70px; height: 52px; flex: none; border: 1px solid var(--border, #ccc); background: #fff; border-radius: 3px; }
    @media (max-width: 800px) { .pLay { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(css);

  let lists = [], curId = null, fStatus = 'open', fText = '', settings = {};

  view.className = 'whView';
  const top = E('div', 'whTop');
  top.append(E('h2', '', '🚩 Punch list'));
  const bar = E('div', 'whRow');
  const listSel = E('select'); listSel.style.minWidth = '200px';
  const newList = E('button', '', '+ New list'), editList = E('button', '', 'Rename / settings');
  const addBtn = E('button', 'primary', '+ Add item'), genBtn = E('button', 'primary', '📄 Generate PDF / Excel…');
  bar.append(listSel, newList, editList, E('span', 'whGrow'), addBtn, genBtn);
  const bar2 = E('div', 'whRow');
  const stSel = WH.sel([['open', 'Still open'], ['all', 'All items'], ['late', 'Overdue'], ['closed', 'Closed (done / verified)']], fStatus);
  const find = WH.inp('search', '', { placeholder: 'Search items…' }); find.style.minWidth = '220px';
  const info = E('span', 'whMuted');
  bar2.append(stSel, find, info);
  top.append(bar, bar2);
  const wrap = E('div', 'pBody');
  view.append(top, wrap);

  const cur = () => lists.find(l => l.id === curId) || null;
  const isOpen = (i) => i.status === 'Open' || i.status === 'In progress';
  const isLate = (i) => i.due && i.due < WH.todayISO() && isOpen(i);
  function visible(l) {
    const t = fText.toLowerCase();
    return l.items.filter(i => {
      if (fStatus === 'open' && !isOpen(i)) return false;
      if (fStatus === 'closed' && isOpen(i)) return false;
      if (fStatus === 'late' && !isLate(i)) return false;
      if (!t) return true;
      return [i.no, i.title, i.description, i.location, i.category, i.responsible, i.remarks].join(' ').toLowerCase().includes(t);
    });
  }

  const thumbCache = {};
  async function thumbs(names) {
    const need = names.filter(n => !thumbCache[n]);
    if (need.length) { const r = await window.api.punchPhotos(need); if (r && r.photos) Object.assign(thumbCache, r.photos); }
    return thumbCache;
  }

  function drawSelect() {
    listSel.innerHTML = '';
    lists.forEach(l => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name + ' (' + l.items.length + ')'; listSel.appendChild(o); });
    if (curId) listSel.value = curId;
    listSel.hidden = !lists.length; editList.hidden = !lists.length; addBtn.hidden = !lists.length; genBtn.hidden = !lists.length; bar2.hidden = !lists.length;
  }

  async function draw() {
    drawSelect();
    wrap.innerHTML = '';
    const l = cur();
    if (!l) {
      const d = E('div', 'whEmpty');
      d.append(E('p', '', 'A punch list is a list of things still to be fixed or finished before a job is closed.'), E('p', '', 'Start by making your first list (for example “Level 2 Electrical”).'));
      const b = E('button', 'primary', '+ Make my first list'); b.addEventListener('click', () => listDialog(null)); d.appendChild(b);
      wrap.appendChild(d); return;
    }
    const rows = visible(l).sort((a, b) => String(a.no).localeCompare(b.no));
    const openN = l.items.filter(isOpen).length, lateN = l.items.filter(isLate).length;
    info.textContent = `${l.items.length} items · ${openN} open · ${lateN} overdue` + (l.project ? ' · ' + l.project : '') + ` · showing ${rows.length}`;
    if (!rows.length) { wrap.appendChild(E('div', 'whEmpty', l.items.length ? 'Nothing matches this filter.' : 'No items yet. Click “+ Add item”.')); return; }
    await thumbs(rows.map(r => r.photos[0] && r.photos[0].f).filter(Boolean));
    const t = E('table', 'whT');
    t.innerHTML = '<thead><tr><th>No.</th><th></th><th>What needs to be done</th><th>Location</th><th>Priority</th><th>Responsible</th><th>Due</th><th>Status</th><th></th></tr></thead>';
    const tb = E('tbody');
    rows.forEach(i => {
      const tr = E('tr', isLate(i) ? 'late' : '');
      const cell = (child) => { const td = E('td'); if (typeof child === 'string') td.textContent = child; else if (child) td.appendChild(child); tr.appendChild(td); return td; };
      cell(i.no);
      const ph = i.photos[0] && thumbCache[i.photos[0].f];
      if (ph) { const im = E('img', 'pThumb'); im.src = ph; cell(im); } else cell('');
      const d = E('div'); const b = E('b', '', i.title || i.description.split('\n')[0].slice(0, 90)); d.appendChild(b);
      if (i.title && i.description) d.append(E('div', 'whMuted', i.description.slice(0, 140) + (i.description.length > 140 ? '…' : '')));
      if (i.photos.length > 1) d.append(E('div', 'whMuted', '📷 ' + i.photos.length + ' pictures'));
      cell(d);
      cell(i.location);
      const p = E('span', 'pBadge p' + i.priority, i.priority); cell(p);
      cell(i.responsible);
      cell(i.due ? WH.fmtDate(i.due) : '');
      const sb = E('button', 'pBadge ' + ({ Open: 'sOpen', 'In progress': 'sIn', Done: 'sDone', Verified: 'sVerified' }[i.status]), i.status);
      sb.title = 'Click to move to the next status';
      sb.addEventListener('click', async (e) => { e.stopPropagation(); await setStatus(i, STATUSES[(STATUSES.indexOf(i.status) + 1) % STATUSES.length]); });
      cell(sb);
      const x = E('button', '', '✕'); x.title = 'Delete this item';
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete ' + i.no + '? Its pictures will be deleted too.')) return;
        const r = await window.api.punchItemDelete(l.id, i.id);
        if (!r.ok) { say(r.error); return; }
        l.items = l.items.filter(z => z.id !== i.id); draw();
      });
      cell(x);
      tr.addEventListener('click', () => itemDialog(i));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
  }

  async function setStatus(i, status) {
    const l = cur();
    const r = await window.api.punchItemSave(l.id, Object.assign({}, i, { status }));
    if (!r.ok) { say(r.error); return; }
    Object.assign(i, r.item); draw();
  }

  // ----- list dialog -----
  function listDialog(l) {
    const d = WH.dialog(l ? 'List settings' : 'New punch list', { small: true });
    const name = WH.inp('text', l ? l.name : '', { placeholder: 'e.g. Level 2 Electrical' });
    const proj = WH.inp('text', l ? l.project : '', { placeholder: 'Project name (shows on the printout)' });
    const prefix = WH.inp('text', l ? l.prefix : 'PL', { maxLength: 8 });
    d.content.append(WH.fld('List name', name), WH.fld('Project', proj), WH.fld('Number prefix', prefix, 'Items are numbered like PL-001, PL-002 and numbers are never reused.'));
    if (l) {
      prefix.disabled = true;
      const del = E('button', '', 'Delete this list');
      del.addEventListener('click', async () => {
        if (!confirm('Delete the whole list “' + l.name + '” with all its items and pictures?')) return;
        const r = await window.api.punchListDelete(l.id); if (!r.ok) { d.say(r.error, true); return; }
        lists = lists.filter(z => z.id !== l.id); curId = lists[0] ? lists[0].id : null; d.close(); draw();
      });
      d.content.append(del);
    }
    d.button('Save', 'primary', async () => {
      if (!name.value.trim()) { d.say('Please give the list a name.', true); return; }
      const r = await window.api.punchListSave({ id: l && l.id, name: name.value, project: proj.value, prefix: prefix.value });
      if (!r.ok) { d.say(r.error, true); return; }
      if (l) Object.assign(l, r.list); else { lists.push(r.list); curId = r.list.id; }
      d.close(); draw();
    });
    d.button('Cancel', '', d.close);
    name.focus();
  }

  // ----- item dialog -----
  function itemDialog(item) {
    const l = cur();
    const it = item || { title: '', description: '', location: '', category: '', priority: 'Medium', status: 'Open', responsible: '', raisedBy: settings.user || '', dateRaised: WH.todayISO(), due: '', remarks: '', photos: [] };
    const d = WH.dialog(item ? 'Edit ' + item.no : 'New item', { wide: true });
    d.dlg.classList.add('pDlg');
    const all = lists.flatMap(z => z.items);
    const title = WH.inp('text', it.title, { placeholder: 'Short title, e.g. Missing cover plate' });
    const desc = E('textarea'); desc.value = it.description; desc.placeholder = 'Describe what is wrong and what has to be done…';
    const loc = WH.inp('text', it.location, { placeholder: 'Area / room / grid' }); loc.setAttribute('list', WH.datalist('dlLoc', all.map(i => i.location)));
    const cat = WH.inp('text', it.category, { placeholder: 'Electrical, Civil, Safety…' }); cat.setAttribute('list', WH.datalist('dlCat', ['Electrical', 'Mechanical', 'Civil', 'Instrumentation', 'Piping', 'Safety', 'Documentation', 'Cleaning'].concat(all.map(i => i.category))));
    const pri = WH.sel(PRIORITIES, it.priority), st = WH.sel(STATUSES, it.status);
    const resp = WH.inp('text', it.responsible, { placeholder: 'Who will fix it' }); resp.setAttribute('list', WH.datalist('dlResp', all.map(i => i.responsible)));
    const by = WH.inp('text', it.raisedBy), raised = WH.inp('date', it.dateRaised), due = WH.inp('date', it.due);
    const rem = WH.inp('text', it.remarks, { placeholder: 'Optional remarks' });
    d.content.append(
      WH.fld('Title', title), WH.fld('Description', desc),
      WH.grid(WH.fld('Location', loc), WH.fld('Category', cat)),
      WH.grid(WH.fld('Priority', pri), WH.fld('Status', st)),
      WH.grid(WH.fld('Responsible', resp), WH.fld('Raised by', by)),
      WH.grid(WH.fld('Date raised', raised), WH.fld('Due date', due)),
      WH.fld('Remarks', rem));

    // pictures: kept (already saved) + new (shrunk JPEGs not saved yet)
    const keep = it.photos.slice(), added = [];
    const strip = E('div', 'pPhotos');
    const redraw = async () => {
      strip.innerHTML = '';
      const names = keep.map(p => p.f); await thumbs(names);
      keep.forEach((p, k) => { const w = E('div', 'ph'), im = E('img'); im.src = thumbCache[p.f] || ''; const x = E('button', '', '✕'); x.addEventListener('click', () => { keep.splice(k, 1); redraw(); }); w.append(im, x); strip.appendChild(w); });
      added.forEach((p, k) => { const w = E('div', 'ph'), im = E('img'); im.src = p.data; const x = E('button', '', '✕'); x.addEventListener('click', () => { added.splice(k, 1); redraw(); }); w.append(im, x); strip.appendChild(w); });
    };
    const addFiles = async (files) => {
      for (const f of files) {
        if (!/^image\//.test(f.type)) continue;
        if (keep.length + added.length >= 6) { d.say('Up to 6 pictures per item.', true); break; }
        try {
          const url = await WH.blobToDataUrl(f);
          const small = await WH.shrinkImage(url, 1280, 1280, 0.8);
          const im = await new Promise(res => { const x = new Image(); x.onload = () => res(x); x.src = small; });
          added.push({ data: small, w: im.width, h: im.height });
        } catch (e) { d.say('One picture could not be read.', true); }
      }
      redraw();
    };
    const pick = WH.inp('file', '', { accept: 'image/*', multiple: true }); pick.hidden = true;
    pick.addEventListener('change', () => { addFiles([...pick.files]); pick.value = ''; });
    const pickBtn = E('button', '', '📷 Add pictures…'); pickBtn.type = 'button'; pickBtn.addEventListener('click', () => pick.click());
    const drop = E('div', 'pDrop', 'You can also drag pictures here, or press Ctrl+V to paste a screenshot.');
    drop.addEventListener('dragover', e => e.preventDefault());
    drop.addEventListener('drop', e => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });
    const onPaste = (e) => { const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
    document.addEventListener('paste', onPaste);
    const lab = E('div', 'fld'); lab.append(E('label', '', 'Pictures'), pickBtn, pick, strip, drop);
    d.content.append(lab);
    redraw();

    const origClose = d.close;
    const close = () => { document.removeEventListener('paste', onPaste); origClose(); };
    d.button('Save', 'primary', async () => {
      if (!title.value.trim() && !desc.value.trim()) { d.say('Please write what needs to be fixed.', true); return; }
      const rec = Object.assign({}, item || {}, { title: title.value, description: desc.value, location: loc.value, category: cat.value, priority: pri.value, status: st.value, responsible: resp.value, raisedBy: by.value, dateRaised: raised.value, due: due.value, remarks: rem.value, photos: keep, newPhotos: added.map(a => ({ data: a.data, w: a.w, h: a.h })) });
      const r = await window.api.punchItemSave(l.id, rec);
      if (!r.ok) { d.say(r.error, true); return; }
      if (item) Object.assign(item, r.item); else l.items.push(r.item);
      close(); draw();
    });
    d.button('Cancel', '', close);
    title.focus();
  }

  // ----- generate -----
  const SK = (inner) => '<svg viewBox="0 0 70 52">' + inner + '</svg>';
  const LAYOUTS = [
    { id: 'register', name: 'Register (table)', note: 'The classic: one row per item. Best for sending to contractors.', ls: true, svg: SK('<rect x="4" y="5" width="62" height="6" fill="#1f3a5f"/><g stroke="#aaa"><path d="M4 18h62M4 26h62M4 34h62M4 42h62M24 11v35M44 11v35"/></g>') },
    { id: 'cards', name: 'Photo cards', note: 'One card per item with its pictures. Best for walk-down reports and photos.', ls: false, svg: SK('<rect x="5" y="4" width="60" height="19" fill="none" stroke="#999"/><rect x="8" y="7" width="14" height="13" fill="#9bb"/><path d="M26 9h34M26 14h28M26 19h22" stroke="#999"/><rect x="5" y="28" width="60" height="19" fill="none" stroke="#999"/><rect x="8" y="31" width="14" height="13" fill="#9bb"/><path d="M26 33h34M26 38h28M26 43h22" stroke="#999"/>') },
    { id: 'grouped', name: 'Summary + grouped', note: 'Totals and charts first, then items grouped by person, category or location. For managers.', ls: true, svg: SK('<rect x="4" y="4" width="14" height="10" fill="#cfe"/><rect x="21" y="4" width="14" height="10" fill="#fec"/><rect x="38" y="4" width="14" height="10" fill="#fcc"/><rect x="4" y="19" width="62" height="5" fill="#1f3a5f"/><path d="M4 30h62M4 36h62" stroke="#aaa"/><rect x="4" y="41" width="62" height="5" fill="#1f3a5f"/>') },
    { id: 'closeout', name: 'Close-out sheet', note: 'Tick boxes, date done and signature columns. Print it and sign items off on site.', ls: true, svg: SK('<rect x="4" y="5" width="62" height="6" fill="#1f3a5f"/><g stroke="#aaa"><path d="M4 18h62M4 26h62M4 34h62M4 42h62"/></g><g fill="none" stroke="#555"><rect x="6" y="20" width="5" height="5"/><rect x="6" y="28" width="5" height="5"/><rect x="6" y="36" width="5" height="5"/></g>') }
  ];

  async function generate() {
    const l = cur();
    try { const r = await window.api.invLoad(); settings = (r && r.state && r.state.settings) || settings; } catch (e) {}
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('punchGen') || '{}'); } catch (e) {}
    const d = WH.dialog('Generate punch list', { wide: true });
    let layout = LAYOUTS.some(x => x.id === saved.layout) ? saved.layout : 'register';
    const lay = E('div', 'pLay');
    const drawLay = () => {
      lay.innerHTML = '';
      LAYOUTS.forEach(L => {
        const lb = E('label', layout === L.id ? 'on' : ''); const rd = WH.inp('radio', L.id, { name: 'pl', checked: layout === L.id });
        rd.addEventListener('change', () => { layout = L.id; drawLay(); groupFld.hidden = layout !== 'grouped'; });
        const box = E('div'); box.innerHTML = '<b>' + esc(L.name) + '</b><small>' + esc(L.note) + '</small>';
        const sv = E('span'); sv.innerHTML = L.svg;
        lb.append(rd, sv, box); lay.appendChild(lb);
      });
    };
    const scope = WH.sel([['visible', 'Items shown now (' + visible(l).length + ')'], ['all', 'All items (' + l.items.length + ')'], ['open', 'Only open items (' + l.items.filter(isOpen).length + ')']], saved.scope || 'visible');
    const fmt = WH.sel([['pdf', 'PDF / print'], ['xlsx', 'Excel']], saved.fmt || 'pdf');
    const group = WH.sel([['responsible', 'Responsible person'], ['category', 'Category'], ['location', 'Location']], saved.group || 'responsible');
    const groupFld = WH.fld('Group by', group); groupFld.hidden = layout !== 'grouped';
    const photos = WH.inp('checkbox', '1', { checked: saved.photos !== false });
    const photoRow = E('label', 'whChk'); photoRow.append(photos, E('span', '', 'Include pictures (the Close-out sheet never prints them)'));
    const ttl = WH.inp('text', l.name), proj = WH.inp('text', l.project || '');
    const company = WH.inp('text', settings.formCompany || ''), by = WH.inp('text', settings.user || '');
    const useLogo = WH.inp('checkbox', '1', { checked: !!settings.formLogo }); useLogo.disabled = !settings.formLogo;
    const logoRow = E('label', 'whChk'); logoRow.append(useLogo, E('span', '', settings.formLogo ? 'Show my logo (from Inventory → More → Form heading)' : 'No logo set yet (add one in Inventory → More → Form heading)'));
    d.content.append(E('div', 'whMuted', 'Choose how it should look'), lay,
      WH.grid(WH.fld('Items to include', scope), WH.fld('File type', fmt)), groupFld, photoRow,
      WH.grid(WH.fld('Title', ttl), WH.fld('Project', proj)), WH.grid(WH.fld('Company', company), WH.fld('Prepared by', by)), logoRow);
    drawLay();
    d.button('Generate', 'primary', async () => {
      const pool = scope.value === 'all' ? l.items : scope.value === 'open' ? l.items.filter(isOpen) : visible(l);
      const items = pool.slice().sort((a, b) => String(a.no).localeCompare(b.no));
      if (!items.length) { d.say('There are no items to put in the file.', true); return; }
      try { localStorage.setItem('punchGen', JSON.stringify({ layout, scope: scope.value, fmt: fmt.value, group: group.value, photos: photos.checked })); } catch (e) {}
      const o = { title: ttl.value.trim() || l.name, project: proj.value.trim(), company: company.value.trim(), preparedBy: by.value.trim(), date: WH.todayISO(), photos: photos.checked && layout !== 'closeout', groupBy: group.value, logo: useLogo.checked ? settings.formLogo : '', itemIds: items.map(i => i.id) };
      d.say('Working…');
      if (fmt.value === 'xlsx') {
        const r = await window.api.punchExcel(l.id, layout, o);
        if (r && r.canceled) { d.say(''); return; }
        if (!r || !r.ok) { d.say((r && r.error) || 'Could not make the Excel file.', true); return; }
        d.close(); say('Excel file saved and opened.'); return;
      }
      const names = o.photos ? items.flatMap(i => i.photos.map(p => p.f)) : [];
      const pr = names.length ? await window.api.punchPhotos(names) : { photos: {} };
      const html = buildHtml(layout, l, items, o, (pr && pr.photos) || {});
      d.close();
      WH.output({ title: o.title, html, landscape: LAYOUTS.find(x => x.id === layout).ls, pdfFn: 'punchPdf', printFn: 'punchPrint' });
    });
    d.button('Cancel', '', d.close);
  }

  // ----- PDF / print pages -----
  const PCSS = `
    * { box-sizing: border-box; } body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1b1f24; margin: 0; }
    .hd { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #1f3a5f; padding-bottom: 8px; margin-bottom: 10px; }
    .hd img { max-height: 54px; max-width: 150px; } .hd .co { font-size: 13px; font-weight: 700; } .hd h1 { margin: 2px 0; font-size: 20px; } .hd .meta { color: #555; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; } th { background: #1f3a5f; color: #fff; text-align: left; padding: 5px 6px; font-size: 10px; }
    td { border-bottom: 1px solid #ccd3da; padding: 5px 6px; vertical-align: top; } tr { page-break-inside: avoid; }
    .p-High { background: #f8d7da; } .p-Medium { background: #fff3cd; } .p-Low { background: #d9ead3; }
    .th { max-width: 120px; max-height: 80px; border: 1px solid #ccc; border-radius: 3px; display: block; } .small { color: #555; font-size: 10px; }
    .card { border: 1px solid #99a5b1; border-radius: 6px; margin: 0 0 12px; page-break-inside: avoid; overflow: hidden; }
    .card .ch { background: #1f3a5f; color: #fff; padding: 6px 10px; font-weight: 700; font-size: 12px; display: flex; justify-content: space-between; }
    .card .cb { padding: 8px 10px; } .kv { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 10px; margin-bottom: 6px; } .kv span { color: #667; font-size: 9px; display: block; text-transform: uppercase; }
    .imgs { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; } .imgs img { height: 150px; max-width: 32%; object-fit: cover; border: 1px solid #ccc; border-radius: 3px; }
    .tiles { display: flex; gap: 10px; margin-bottom: 12px; } .tile { flex: 1; border: 1px solid #ccd3da; border-radius: 6px; padding: 8px 10px; } .tile b { font-size: 22px; display: block; }
    .bars div.r { display: flex; align-items: center; gap: 8px; margin: 3px 0; } .bars .lbl { width: 130px; } .bars .bar { height: 11px; background: #3b78c4; border-radius: 2px; } .bars .n { width: 24px; }
    h2 { font-size: 13px; margin: 14px 0 4px; background: #eef2f6; padding: 4px 8px; border-left: 4px solid #1f3a5f; } .cols { display: flex; gap: 20px; } .cols > div { flex: 1; }
    .box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #333; } .sig { margin-top: 28px; display: flex; gap: 30px; } .sig div { flex: 1; border-top: 1px solid #333; padding-top: 3px; font-size: 10px; color: #555; }
    .nb { page-break-inside: avoid; }`;
  function head(o, count) {
    const bits = [o.project ? 'Project: ' + esc(o.project) : '', 'Date: ' + esc(WH.fmtDate(o.date)), o.preparedBy ? 'Prepared by: ' + esc(o.preparedBy) : '', count + ' item' + (count === 1 ? '' : 's')].filter(Boolean).join(' &nbsp;·&nbsp; ');
    return '<div class="hd">' + (o.logo ? '<img src="' + o.logo + '">' : '') + '<div>' + (o.company ? '<div class="co">' + esc(o.company) + '</div>' : '') + '<h1>' + esc(o.title) + '</h1><div class="meta">' + bits + '</div></div></div>';
  }
  const nl = (s) => esc(s).replace(/\n/g, '<br>');
  const what = (i) => (i.title ? '<b>' + esc(i.title) + '</b>' + (i.description ? '<br>' : '') : '') + nl(i.description);
  const tcount = (items, key, order) => { const c = {}; (order || []).forEach(k => c[k] = 0); items.forEach(i => { const k = i[key] || '(none)'; c[k] = (c[k] || 0) + 1; }); return c; };

  function buildHtml(layout, l, items, o, ph) {
    const img = (i, k, cls) => { const p = i.photos[k]; return p && ph[p.f] ? '<img ' + (cls ? 'class="' + cls + '" ' : '') + 'src="' + ph[p.f] + '">' : ''; };
    let b = head(o, items.length);
    if (layout === 'register') {
      b += '<table><thead><tr><th>No.</th><th>Description</th><th>Location</th><th>Category</th><th>Priority</th><th>Responsible</th><th>Due</th><th>Status</th>' + (o.photos ? '<th>Photo</th>' : '') + '</tr></thead><tbody>' +
        items.map(i => '<tr><td>' + esc(i.no) + '</td><td>' + what(i) + (i.remarks ? '<div class="small">Remarks: ' + esc(i.remarks) + '</div>' : '') + '</td><td>' + esc(i.location) + '</td><td>' + esc(i.category) + '</td><td class="p-' + i.priority + '">' + i.priority + '</td><td>' + esc(i.responsible) + '</td><td>' + esc(i.due ? WH.fmtDate(i.due) : '') + '</td><td>' + esc(i.status) + '</td>' + (o.photos ? '<td>' + img(i, 0, 'th') + '</td>' : '') + '</tr>').join('') + '</tbody></table>';
    } else if (layout === 'cards') {
      b += items.map(i => '<div class="card"><div class="ch"><span>' + esc(i.no) + (i.title ? ' · ' + esc(i.title) : '') + '</span><span>' + esc(i.priority) + ' · ' + esc(i.status) + '</span></div><div class="cb"><div class="kv">' +
        '<div><span>Location</span>' + esc(i.location || '–') + '</div><div><span>Category</span>' + esc(i.category || '–') + '</div><div><span>Responsible</span>' + esc(i.responsible || '–') + '</div><div><span>Due</span>' + esc(i.due ? WH.fmtDate(i.due) : '–') + '</div></div>' +
        '<div>' + nl(i.description) + '</div>' + (i.remarks ? '<div class="small" style="margin-top:4px">Remarks: ' + esc(i.remarks) + '</div>' : '') +
        (o.photos && i.photos.length ? '<div class="imgs">' + i.photos.map((p, k) => img(i, k)).join('') + '</div>' : '') + '</div></div>').join('');
    } else if (layout === 'grouped') {
      const today = WH.todayISO();
      const open = items.filter(isOpen).length, late = items.filter(isLate).length;
      const bars = (title, obj) => { const mx = Math.max(1, ...Object.values(obj)); return '<div class="bars nb"><h2>' + title + '</h2>' + Object.entries(obj).map(([k, v]) => '<div class="r"><span class="lbl">' + esc(k) + '</span><span class="bar" style="width:' + Math.round(v / mx * 160) + 'px"></span><span class="n">' + v + '</span></div>').join('') + '</div>'; };
      const gk = o.groupBy || 'responsible';
      b += '<div class="tiles"><div class="tile"><b>' + items.length + '</b>Total items</div><div class="tile"><b>' + open + '</b>Still open</div><div class="tile" style="border-color:#c62828"><b style="color:#c62828">' + late + '</b>Overdue</div><div class="tile"><b>' + (items.length - open) + '</b>Closed</div></div>';
      b += '<div class="cols">' + bars('By status', tcount(items, 'status', STATUSES)) + bars('By priority', tcount(items, 'priority', PRIORITIES)) + bars('By ' + gk, tcount(items, gk)) + '</div>';
      const groups = new Map(); items.forEach(i => { const k = i[gk] || '(none)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
      [...groups.entries()].sort((a, c) => a[0].localeCompare(c[0])).forEach(([g, arr]) => {
        b += '<div style="page-break-inside:avoid-page"><h2>' + esc(g) + ' (' + arr.length + ')</h2><table><thead><tr><th>No.</th><th>Description</th><th>Location</th><th>Priority</th><th>Due</th><th>Status</th>' + (o.photos ? '<th>Photo</th>' : '') + '</tr></thead><tbody>' +
          arr.map(i => '<tr><td>' + esc(i.no) + '</td><td>' + what(i) + '</td><td>' + esc(i.location) + '</td><td class="p-' + i.priority + '">' + i.priority + '</td><td>' + esc(i.due ? WH.fmtDate(i.due) : '') + '</td><td>' + esc(i.status) + '</td>' + (o.photos ? '<td>' + img(i, 0, 'th') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>';
      });
    } else {
      b += '<table><thead><tr><th style="width:36px">Done</th><th>No.</th><th>Description</th><th>Location</th><th>Responsible</th><th>Due</th><th style="width:80px">Date done</th><th style="width:90px">Checked by</th><th style="width:90px">Signature</th></tr></thead><tbody>' +
        items.map(i => '<tr style="height:34px"><td style="text-align:center"><span class="box"></span></td><td>' + esc(i.no) + '</td><td>' + what(i) + '</td><td>' + esc(i.location) + '</td><td>' + esc(i.responsible) + '</td><td>' + esc(i.due ? WH.fmtDate(i.due) : '') + '</td><td></td><td></td><td></td></tr>').join('') + '</tbody></table>' +
        '<div class="sig"><div>Contractor / responsible – name, signature, date</div><div>Checked by – name, signature, date</div><div>Approved by – name, signature, date</div></div>';
    }
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(o.title) + '</title><style>' + PCSS + '</style></head><body>' + b + '</body></html>';
  }

  // ----- wiring -----
  listSel.addEventListener('change', () => { curId = listSel.value; draw(); });
  stSel.addEventListener('change', () => { fStatus = stSel.value; draw(); });
  find.addEventListener('input', () => { fText = find.value.trim(); draw(); });
  newList.addEventListener('click', () => listDialog(null));
  editList.addEventListener('click', () => listDialog(cur()));
  addBtn.addEventListener('click', () => itemDialog(null));
  genBtn.addEventListener('click', generate);

  async function load() {
    const r = await window.api.punchLoad();
    lists = (r && r.lists) || [];
    if (!lists.some(l => l.id === curId)) curId = lists[0] ? lists[0].id : null;
    try { const s = await window.api.invLoad(); settings = (s && s.state && s.state.settings) || {}; } catch (e) {}
    draw();
  }
  WH.registerTab('punch', view, load);
  window.__punchBuild = buildHtml; // used by the self-test
})();
