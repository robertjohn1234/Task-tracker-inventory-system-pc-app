// Notes tab: list on the left, editor on the right, saves by itself.
(function () {
  'use strict';
  const view = document.getElementById('notesView');
  if (!view) return;
  const { E, say } = WH;
  const css = document.createElement('style');
  css.textContent = `
    #notesView .nBody { flex: 1; display: flex; min-height: 0; }
    #notesView .nList { width: 300px; flex: none; border-right: 1px solid var(--border, #ddd); display: flex; flex-direction: column; min-height: 0; background: var(--panel, #fff); }
    #notesView .nItems { flex: 1; overflow: auto; }
    #notesView .nItem { padding: 9px 12px; border-bottom: 1px solid var(--border, #e5e5e5); cursor: pointer; }
    #notesView .nItem:hover { background: var(--hover, #f2f6ff); }
    #notesView .nItem.on { background: var(--hover, #e8f0ff); border-left: 3px solid var(--accent, #1f6feb); padding-left: 9px; }
    #notesView .nItem b { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #notesView .nItem span { display: block; font-size: 12px; color: var(--muted, #777); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #notesView .nEd { flex: 1; display: flex; flex-direction: column; min-width: 0; padding: 12px 16px; gap: 8px; min-height: 0; }
    #notesView .nTitle { font-size: 20px; font-weight: 600; width: 100%; box-sizing: border-box; }
    #notesView .nText { flex: 1; width: 100%; box-sizing: border-box; resize: none; font: 14px/1.5 system-ui, sans-serif; padding: 10px; min-height: 120px; }
    #notesView .nChips { display: flex; gap: 6px; flex-wrap: wrap; padding: 6px 12px; }
    #notesView .nChip { border: 1px solid var(--border, #ccc); border-radius: 12px; padding: 1px 9px; font-size: 12px; cursor: pointer; background: var(--panel2, #f4f4f4); }
    #notesView .nChip.on { background: var(--accent, #1f6feb); color: var(--accent-text, #fff); }
    #notesView .nFile { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--border, #ccc); border-radius: 6px; padding: 2px 6px; font-size: 12px; margin: 2px 4px 2px 0; }
    #notesView .nFile a { cursor: pointer; color: var(--accent, #1f6feb); }
    @media (max-width: 800px) { #notesView .nList { width: 40%; } }
  `;
  document.head.appendChild(css);

  let notes = [], cur = null, q = '', tag = '', timer = null, dirty = false;

  view.className = 'whView';
  const top = E('div', 'whTop');
  const h = E('h2', '', '📝 Notes');
  const bar = E('div', 'whRow');
  const search = WH.inp('search', '', { placeholder: 'Search notes…' });
  search.style.minWidth = '220px';
  const newBtn = E('button', 'primary', '+ New note');
  const cnt = E('span', 'whMuted');
  bar.append(search, newBtn, E('span', 'whGrow'), cnt);
  top.append(h, bar);
  const chips = E('div', 'nChips');
  const body = E('div', 'nBody');
  const listBox = E('div', 'nList'); const items = E('div', 'nItems'); listBox.append(items);
  const ed = E('div', 'nEd');
  body.append(listBox, ed);
  view.append(top, chips, body);

  function matches(n) {
    if (tag && !n.tags.includes(tag)) return false;
    if (!q) return true;
    const hay = (n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase();
    return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
  }
  const sorted = () => notes.filter(matches).sort((a, b) => (b.pinned - a.pinned) || String(b.updatedAt).localeCompare(a.updatedAt));
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

  function drawChips() {
    chips.innerHTML = '';
    const all = [...new Set(notes.flatMap(n => n.tags))].sort();
    if (!all.length) return;
    all.forEach(t => {
      const c = E('span', 'nChip' + (tag === t ? ' on' : ''), '#' + t);
      c.addEventListener('click', () => { tag = tag === t ? '' : t; drawChips(); drawList(); });
      chips.appendChild(c);
    });
  }
  function drawList() {
    items.innerHTML = '';
    const list = sorted();
    cnt.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
    if (!list.length) { items.append(E('div', 'whEmpty', notes.length ? 'No notes match.' : 'No notes yet. Click “+ New note”.')); return; }
    list.forEach(n => {
      const d = E('div', 'nItem' + (cur && cur.id === n.id ? ' on' : ''));
      const first = (n.body.split('\n').find(l => l.trim()) || '').slice(0, 80);
      d.append(E('b', '', (n.pinned ? '📌 ' : '') + (n.title || first || 'Untitled')), E('span', '', when(n.updatedAt) + (first && n.title ? ' · ' + first : '')));
      d.addEventListener('click', async () => { await flush(); cur = notes.find(x => x.id === n.id); drawList(); drawEditor(); });
      items.appendChild(d);
    });
  }

  async function flush() {
    clearTimeout(timer);
    if (!dirty || !cur) return;
    dirty = false;
    const r = await window.api.noteSave(cur);
    if (r && r.ok) { cur.updatedAt = r.note.updatedAt; drawList(); } else say((r && r.error) || 'Could not save the note.');
  }
  function changed() { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 700); }

  function drawEditor() {
    ed.innerHTML = '';
    if (!cur) { ed.append(E('div', 'whEmpty', 'Pick a note on the left, or make a new one.')); return; }
    const n = cur;
    const title = WH.inp('text', n.title, { placeholder: 'Title', className: 'nTitle' });
    title.addEventListener('input', () => { n.title = title.value; changed(); });
    const text = E('textarea', 'nText'); text.value = n.body; text.placeholder = 'Write here… (saves by itself)';
    text.addEventListener('input', () => { n.body = text.value; changed(); });
    const tags = WH.inp('text', n.tags.join(', '), { placeholder: 'tags, separated by commas' });
    tags.addEventListener('change', () => { n.tags = [...new Set(tags.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean))]; changed(); drawChips(); });
    const files = E('div');
    const drawFiles = () => {
      files.innerHTML = '';
      n.files.forEach((p, i) => {
        const s = E('span', 'nFile');
        const a = E('a', '', '📎 ' + p.split(/[\\/]/).pop()); a.title = p;
        a.addEventListener('click', async () => { await flush(); const r = await window.api.noteOpenPath(p); if (!r.ok) say(r.error); });
        const x = E('a', '', '✕'); x.title = 'Unlink';
        x.addEventListener('click', () => { n.files.splice(i, 1); changed(); drawFiles(); });
        s.append(a, x); files.appendChild(s);
      });
    };
    drawFiles();
    const row = E('div', 'whRow');
    const pin = E('button', '', n.pinned ? '📌 Unpin' : '📌 Pin');
    pin.addEventListener('click', async () => { n.pinned = !n.pinned; dirty = true; await flush(); drawEditor(); });
    const link = E('button', '', '📎 Link a file');
    link.addEventListener('click', async () => {
      await flush();
      const r = await window.api.notePickFile();
      if (!r || !r.ok) return;
      if (!n.files.includes(r.path)) n.files.push(r.path);
      dirty = true; await flush(); drawEditor();
    });
    const ex = E('button', '', 'Save as .txt');
    ex.addEventListener('click', async () => { await flush(); const r = await window.api.noteExportTxt(n.id); if (r && r.ok) say('Saved.'); else if (r && !r.canceled) say(r.error); });
    const del = E('button', '', '🗑 Delete');
    del.addEventListener('click', async () => {
      if (!confirm('Delete this note?')) return;
      dirty = false; clearTimeout(timer);
      const r = await window.api.noteDelete(n.id);
      if (!r.ok) { say(r.error); return; }
      notes = notes.filter(x => x.id !== n.id); cur = null; drawChips(); drawList(); drawEditor();
    });
    const info = E('span', 'whMuted', 'Edited ' + when(n.updatedAt));
    row.append(pin, link, ex, del, E('span', 'whGrow'), info);
    ed.append(title, row, text, tags, files);
    if (!n.title && !n.body) title.focus();
  }

  newBtn.addEventListener('click', async () => {
    await flush();
    q = ''; tag = ''; search.value = '';
    const n = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title: '', body: '', tags: [], pinned: false, files: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const r = await window.api.noteSave(n);
    if (!r.ok) { say(r.error); return; }
    notes.push(r.note); cur = r.note; drawChips(); drawList(); drawEditor();
  });
  search.addEventListener('input', () => { q = search.value.trim(); drawList(); });

  async function load() {
    const r = await window.api.notesLoad();
    notes = (r && r.notes) || [];
    if (cur) cur = notes.find(n => n.id === cur.id) || null;
    drawChips(); drawList(); if (!dirty) drawEditor();
  }
  WH.registerTab('notes', view, load);
  window.addEventListener('beforeunload', () => { if (dirty && cur) window.api.noteSave(cur); });
})();
