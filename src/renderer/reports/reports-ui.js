// Reports tab: one place for every report maker.
//   - 🚩 Punch list                      (the punch-list screen lives inside this tab now)
//   - 🔧 Damaged & missing tools         (live list + "Generate report" button)
// To add another report later: call  Reports.register({ id, label, el, onShow })  from your own file
//   id     short name              label  text on the button, e.g. '📈 Stock report'
//   el     the element to show     onShow called each time the section is opened (load / refresh your data here)
// Load order (index.html): ui-kit.js, inventory/*, punch-ui.js, damaged-report.js, reports-ui.js (reports-ui last)
(function () {
  'use strict';
  const pSrc = (v) => (window.PhotoSrc ? window.PhotoSrc(v) : v);   // damage-photos.js turns a saved file name into a picture link
  const view = document.getElementById('reportsView');
  if (!view || !window.WH) return;
  const { E } = WH;
  const KEY = 'wh-reports-section';

  const css = document.createElement('style');
  css.textContent = `
    #reportsView { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    #rpHead { background: var(--panel, #fff); border-bottom: 1px solid var(--border, #ddd); padding: 10px 16px 0; }
    #rpHead h2 { margin: 0 0 6px; font-size: 18px; }
    #rpTabs { display: flex; gap: 4px; flex-wrap: wrap; }
    #rpTabs button { border: 1px solid var(--border, #ccc); border-bottom: 0; border-radius: 8px 8px 0 0; background: var(--panel2, #f1f3f5); color: inherit; padding: 7px 14px; cursor: pointer; font-size: 13px; }
    #rpTabs button.on { background: var(--bg, #fff); font-weight: 700; border-color: var(--accent, #1f6feb); color: var(--accent, #1f6feb); }
    #rpBody { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    #rpBody > .rpSec { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    #rpBody > .rpSec[hidden] { display: none; }
    .rpDamTop { padding: 10px 16px 6px; }
    .rpDamList { flex: 1; overflow: auto; padding: 0 16px 20px; }
    .rpThumb { width: 48px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border, #ccc); display: block; }
    .rpDmg img { width: 48px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border, #ccc); vertical-align: middle; }
    .rpPill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; border: 1px solid var(--border, #ccc); white-space: nowrap; }
    .rpPill.bad { background: #fde2e4; color: #9b1c2c; } .rpPill.warn { background: #fff1cc; color: #7a5b00; } .rpPill.mute { background: #e5e7eb; color: #374151; } .rpPill.ok { background: #dff3e1; color: #1d6b2b; }
  `;
  document.head.appendChild(css);

  view.classList.add('whView');
  const head = E('div'); head.id = 'rpHead';
  head.append(E('h2', '', '📑 Reports'));
  const tabs = E('div'); tabs.id = 'rpTabs';
  head.appendChild(tabs);
  const body = E('div'); body.id = 'rpBody';
  view.prepend(head);
  view.appendChild(body);

  const sections = [];
  let current = null;

  function select(id) {
    const s = sections.find(x => x.id === id) || sections[0];
    if (!s) return;
    current = s;
    try { localStorage.setItem(KEY, s.id); } catch (e) {}
    sections.forEach(x => { x.el.hidden = x !== s; x.btn.classList.toggle('on', x === s); });
    if (s.onShow) s.onShow();
  }

  function register(sec) {
    if (!sec || !sec.id || !sec.el || sections.some(x => x.id === sec.id)) return;
    sec.el.classList.add('rpSec');
    sec.el.hidden = true;
    body.appendChild(sec.el);
    sec.btn = E('button', '', sec.label || sec.id);
    sec.btn.type = 'button';
    sec.btn.addEventListener('click', () => select(sec.id));
    tabs.appendChild(sec.btn);
    sections.push(sec);
  }

  // ---------- section 1: punch list (its screen is built by punch/punch-ui.js) ----------
  const punch = document.getElementById('punchView');
  if (punch && window.PunchUI) register({ id: 'punch', label: '🚩 Punch list', el: punch, onShow: () => window.PunchUI.load() });

  // ---------- section 2: damaged & missing tools ----------
  (function () {
    const el = E('div');
    const top = E('div', 'rpDamTop');
    top.append(E('h3', '', '🔧 Damaged & missing tools / equipment'));
    top.append(E('p', 'whMuted', 'Every tool that came back broken, was found damaged, or went missing. Make a formal report (PDF or print) with pictures with one click.'));
    const row = E('div', 'whRow');
    const filt = WH.sel([['open', 'Out of service + missing'], ['all', 'Everything (including repaired / written off)'], ['lost', 'Missing only']], 'open');
    const gen = E('button', 'primary', '📄 Generate report…');
    const info = E('span', 'whMuted');
    row.append(filt, E('span', 'whGrow'), info, gen);
    top.appendChild(row);
    const list = E('div', 'rpDamList');
    el.append(top, list);

    let state = null;
    const STATUS = { open: ['Out of service', 'bad'], fixed: ['Repaired', 'ok'], scrapped: ['Written off', 'mute'], lost: ['Missing', 'mute'] };

    function draw() {
      list.innerHTML = '';
      if (!state) { list.appendChild(E('div', 'whEmpty', 'Loading…')); return; }
      const byId = new Map(state.items.map(i => [i.id, i]));
      const rows = state.repairs.filter(r => filt.value === 'all' || (filt.value === 'lost' ? r.status === 'lost' : (r.status === 'open' || r.status === 'lost')))
        .sort((a, b) => (a.status === 'open' ? 0 : a.status === 'lost' ? 1 : 2) - (b.status === 'open' ? 0 : b.status === 'lost' ? 1 : 2) || b.date.localeCompare(a.date));
      const openN = state.repairs.filter(r => r.status === 'open').length, lostN = state.repairs.filter(r => r.status === 'lost').length;
      info.textContent = `${openN} out of service · ${lostN} missing`;
      if (!rows.length) { list.appendChild(E('div', 'whEmpty', 'Nothing here. Damaged tools appear when a tool is returned damaged or reported in Inventory → Tools & Equipment.')); return; }
      const t = E('table', 'whT');
      t.innerHTML = '<thead><tr><th></th><th>Code</th><th>Tool</th><th>Qty</th><th>Issue</th><th>Reported</th><th>By / borrower</th><th>Days</th><th>Status</th><th>Note</th><th>Damage photos</th></tr></thead>';
      const tb = E('tbody');
      const today = state.today;
      rows.forEach(r => {
        const tr = E('tr');
        const td = (c) => { const x = E('td'); if (c && c.nodeType) x.appendChild(c); else x.textContent = c == null ? '' : String(c); tr.appendChild(x); return x; };
        const it = byId.get(r.itemId);
        if (it && it.photo) { const im = E('img', 'rpThumb'); im.src = pSrc(it.photo); im.loading = 'lazy'; im.alt = ''; td(im); } else td('🔧');
        td(r.itemCode); td(r.itemName); td(r.qty + ' ' + r.uom);
        td(E('span', 'rpPill ' + (r.kind === 'Lost' ? 'mute' : r.kind === 'Damaged' ? 'bad' : 'warn'), r.kind === 'Lost' ? 'Missing' : r.kind));
        td(r.date); td(r.borrower || r.by);
        const end = r.status === 'fixed' || r.status === 'scrapped' ? (r.closedDate || today) : today;
        td(Math.max(0, Math.round((Date.parse(end) - Date.parse(r.date)) / 86400000)) + ' d');
        const st = STATUS[r.status] || STATUS.open;
        td(E('span', 'rpPill ' + st[1], st[0]));
        td(r.note || r.closedNote);
        if ((r.photos || []).length && window.DamagePhotos) {
          const w = E('span', 'rpDmg'); const im = E('img'); im.src = pSrc(r.photos[0]); im.alt = ''; w.append(im);
          if (r.photos.length > 1) w.append(E('small', '', ' +' + (r.photos.length - 1)));
          w.title = 'Click to see the damage photos'; w.style.cursor = 'zoom-in';
          w.addEventListener('click', () => window.DamagePhotos.view(r.photos, r.itemName + ' — ' + r.kind));
          td(w);
        } else td('');
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      list.appendChild(t);
    }

    async function load() {
      draw();
      try {
        const r = await window.api.invLoad('tools');
        if (r && r.ok) { state = r.state; window.PhotoBase = state.photoBase || ''; draw(); }
      } catch (e) { list.innerHTML = ''; list.appendChild(E('div', 'whEmpty', 'Could not load the tools data.')); }
    }
    filt.addEventListener('change', draw);
    gen.addEventListener('click', () => { if (!window.DamagedReport) return; window.DamagedReport.open(state || undefined); });
    register({ id: 'damaged', label: 'Damaged Tools', el, onShow: load });
  })();

  window.Reports = { register, select, current: () => current && current.id };

  // ---------- show / hide with the left bar ----------
  function openTab() {
    view.hidden = false;
    let saved = '';
    try { saved = localStorage.getItem(KEY) || ''; } catch (e) {}
    select(saved);
  }
  document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'reports') openTab(); else view.hidden = true;
  }));
  // other code can switch tabs without a click (reminders, intro)
  ['filesView', 'tasksView', 'inventoryView', 'notesView'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(() => { if (!el.hidden) view.hidden = true; }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  });
})();
