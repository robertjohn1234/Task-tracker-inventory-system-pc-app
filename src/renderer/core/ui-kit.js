// Small shared helpers for the Notes and Punch list tabs (loaded before them).
(function () {
  'use strict';
  const WH = window.WH = {};

  const st = document.createElement('style');
  st.textContent = `
    .whView { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    .whTop { background: var(--panel, #fff); border-bottom: 1px solid var(--border, #ddd); padding: 10px 16px 8px; }
    .whTop h2 { margin: 0; font-size: 18px; }
    .whRow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
    .whGrow { flex: 1; }
    .whMuted { color: var(--muted, #777); font-size: 12px; }
    .whT { width: 100%; border-collapse: collapse; font-size: 13px; }
    .whT th { text-align: left; font-size: 12px; color: var(--muted, #666); background: var(--panel2, #f4f4f4); padding: 7px 8px; position: sticky; top: 0; border-bottom: 1px solid var(--border, #ddd); white-space: nowrap; }
    .whT td { padding: 7px 8px; border-bottom: 1px solid var(--border, #e5e5e5); vertical-align: top; }
    .whT tbody tr:hover { background: var(--hover, #f2f6ff); }
    .whT .num { text-align: right; white-space: nowrap; }
    .whWide { width: min(860px, 100%) !important; }
    .whChk { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; font-size: 13px; }
    .whSeg { display: inline-flex; border: 1px solid var(--border, #bbb); border-radius: 6px; overflow: hidden; }
    .whSeg button { border: 0; border-radius: 0; border-right: 1px solid var(--border, #ccc); }
    .whSeg button:last-child { border-right: 0; }
    .whSeg button.on { background: var(--accent, #1f6feb); color: var(--accent-text, #fff); }
    .whEmpty { padding: 28px 12px; text-align: center; color: var(--muted, #777); }
  `;
  document.head.appendChild(st);

  WH.E = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  WH.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  WH.say = (m) => { if (typeof toast === 'function') toast(m); };
  WH.todayISO = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  WH.addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  WH.daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
  WH.fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00Z');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  WH.inp = (type, value, extra) => { const i = document.createElement('input'); i.type = type; i.value = value == null ? '' : value; if (extra) Object.assign(i, extra); return i; };
  WH.sel = (options, value) => {
    const s = document.createElement('select');
    options.forEach(o => { const op = document.createElement('option'); op.value = Array.isArray(o) ? o[0] : o; op.textContent = Array.isArray(o) ? o[1] : o; s.appendChild(op); });
    if (value != null) s.value = value;
    return s;
  };
  WH.fld = (label, input, hint) => { const d = WH.E('div', 'fld'); d.append(WH.E('label', '', label), input); if (hint) d.append(WH.E('div', 'whMuted', hint)); return d; };
  WH.grid = (...kids) => { const g = WH.E('div', 'grid2'); kids.forEach(k => g.appendChild(k)); return g; };
  WH.datalist = (id, values) => {
    let dl = document.getElementById(id);
    if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
    dl.innerHTML = '';
    [...new Set(values.filter(Boolean))].slice(0, 300).forEach(v => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); });
    return id;
  };

  let openCount = 0;
  WH.dialog = (title, opts) => {
    opts = opts || {};
    const E = WH.E;
    const overlay = E('div', 'overlay');
    overlay.style.zIndex = String(40 + openCount++);
    const dlg = E('div', 'dialog' + (opts.wide ? ' whWide' : '') + (opts.small ? ' small' : ''));
    dlg.append(E('h3', '', title));
    const content = E('div');
    const msg = E('span', 'msg');
    const foot = E('div', 'dlgFoot');
    const sp = E('span'); sp.style.flex = '1';
    foot.append(msg, sp);
    dlg.append(content, foot);
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    const mine = overlay.style.zIndex;
    const onKey = (e) => { if (e.key === 'Escape' && overlay.style.zIndex === String(40 + openCount - 1) && !opts.noEsc) close(); };
    document.addEventListener('keydown', onKey);
    function close() { document.removeEventListener('keydown', onKey); overlay.remove(); openCount = Math.max(0, openCount - 1); if (opts.onClose) opts.onClose(); }
    function button(label, cls, fn) { const b = E('button', cls || '', label); b.type = 'button'; b.addEventListener('click', fn); foot.appendChild(b); return b; }
    return { overlay, dlg, content, msg, foot, close, button, say: (t, bad) => { msg.textContent = t; msg.style.color = bad ? '#d1242f' : ''; } };
  };

  // shrink a picture (data URL) so saved data stays light; returns a JPEG data URL
  WH.shrinkImage = (dataUrl, maxW, maxH, quality) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width, maxH / img.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality || 0.8));
    };
    img.onerror = () => reject(new Error('bad picture'));
    img.src = dataUrl;
  });
  WH.blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

  // Save as PDF / Print for a ready page { title, html, landscape }
  WH.output = (rep) => {
    const d = WH.dialog(rep.title, { small: true });
    d.content.append(WH.E('p', '', 'How do you want it?'));
    d.button('Save as PDF…', 'primary', async () => {
      d.say('Making the PDF…');
      const r = await window.api[rep.pdfFn || 'invReportPdf'](rep.html, { name: String(rep.title).toLowerCase().replace(/[^a-z0-9]+/g, '-'), landscape: !!rep.landscape });
      if (r && r.canceled) { d.say(''); return; }
      if (!r || !r.ok) { d.say((r && r.error) || 'Could not make the PDF.', true); return; }
      d.close(); WH.say('PDF saved and opened.');
    });
    d.button('Print…', '', async () => {
      d.say('Opening the print window…');
      const r = await window.api[rep.printFn || 'invReportPrint'](rep.html, { landscape: !!rep.landscape });
      if (!r || !r.ok) { d.say((r && r.error) || 'Could not print.', true); return; }
      d.close();
    });
    d.button('Cancel', '', d.close);
  };

  // A tab: shows its view when its left-bar button is clicked and hides it when another tab is chosen
  WH.registerTab = (tabName, view, onShow) => {
    const others = () => ['filesView', 'tasksView', 'inventoryView', 'notesView', 'punchView'].filter(id => id !== view.id);
    document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.tab === tabName) { view.hidden = false; onShow(); } else view.hidden = true;
    }));
    others().forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(() => { if (!el.hidden) view.hidden = true; }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
  };
})();
