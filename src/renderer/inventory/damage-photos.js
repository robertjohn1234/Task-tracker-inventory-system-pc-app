// Photos of damaged tools: add up to 3 pictures to a damage report, mark the damaged spot on each picture
// (pen, circle, square, arrow, text, any colour), and look at them again later.
//   DamagePhotos.picker(list, host, onError)  -> { el, get(), changed() }   put `el` in a dialog; host = the dialog overlay (for Ctrl+V)
//   DamagePhotos.markup(dataUrl)              -> Promise<dataUrl | null>    the mark-up editor, null when cancelled
//   DamagePhotos.view(list, title, onEdit?)   big view of the pictures, optional "Add / mark photos" button
//   DamagePhotos.edit(list, title, save)      dialog to change the photos of an existing entry; save(list) returns an error text or nothing
// Pure browser code (canvas). Needs window.InvKit (dialogs) only when a dialog is opened.
(function () {
  'use strict';

  const MAX = 3;
  const COLORS = ['#e11d48', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#2563eb', '#c026d3', '#ffffff', '#000000'];
  // A picture is a file name (what the app keeps) or a data URL (a new picture, not saved yet). `PhotoBase` is the photos folder link.
  window.PhotoBase = window.PhotoBase || '';
  const photoSrc = window.PhotoSrc = (v) => !v ? '' : /^data:/.test(v) ? v : (window.PhotoBase || '') + v;
  const E = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, title, fn) => { const b = E('button', '', label); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; };

  const css = document.createElement('style');
  css.textContent = `
    .dpRow { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0; }
    .dpThumb { width: 120px; border: 1px solid var(--border, #ccc); border-radius: 8px; overflow: hidden; background: var(--panel2, #f1f3f5); }
    .dpThumb img { width: 100%; height: 86px; object-fit: cover; display: block; cursor: zoom-in; }
    .dpThumb div { display: flex; gap: 4px; padding: 4px; }
    .dpThumb button { flex: 1; padding: 3px 4px; font-size: 12px; }
    .dpAdd { border: 2px dashed var(--border, #bbb); border-radius: 8px; padding: 10px; text-align: center; font-size: 12px; color: var(--muted, #777); cursor: pointer; white-space: pre-line; }
    .dpAdd.drop { border-color: var(--accent, #1f6feb); background: rgba(31, 111, 235, .1); }
    .dpBtns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .dpTools { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
    .dpTools .sep { width: 1px; align-self: stretch; background: var(--border, #ccc); margin: 0 2px; }
    .dpTools button.on { background: var(--accent, #1f6feb); color: #fff; border-color: var(--accent, #1f6feb); }
    .dpSw { width: 24px; height: 24px; padding: 0 !important; border-radius: 50%; border: 2px solid var(--border, #999); }
    .dpSw.on { outline: 3px solid var(--accent, #1f6feb); outline-offset: 1px; }
    .dpColor { width: 30px; height: 28px; padding: 0; border: 1px solid var(--border, #999); background: none; cursor: pointer; }
    .dpStage { position: relative; display: inline-block; max-width: 100%; line-height: 0; background: #222; border-radius: 6px; }
    .dpStage canvas { max-width: 100%; max-height: 62vh; cursor: crosshair; touch-action: none; border-radius: 6px; }
    .dpText { position: absolute; z-index: 5; font: bold 16px Arial, sans-serif; padding: 1px 4px; border: 2px dashed #fff; background: rgba(0, 0, 0, .55); color: #fff; min-width: 120px; line-height: 1.3; }
    .dpBig { display: flex; flex-direction: column; gap: 10px; max-height: 70vh; overflow: auto; }
    .dpBig img { max-width: 100%; border-radius: 8px; border: 1px solid var(--border, #ccc); }
  `;
  document.head.appendChild(css);

  // ---------- make a picture small enough to keep inside the data file ----------
  function shrink(blob) {
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
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', q);
        };
        let out = make(800, 0.8);
        if (out.length > 170000) out = make(680, 0.72);
        if (out.length > 170000) out = make(560, 0.65);
        out.length > 240000 ? reject(new Error('too big')) : resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad picture')); };
      img.src = url;
    });
  }

  // ---------- the mark-up editor ----------
  function markup(src) {
    return new Promise((resolve) => {
      const K = window.InvKit;
      if (!K) { resolve(null); return; }
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const g = cv.getContext('2d');
        const d = K.dialog('Mark the damage', { wide: true });
        let done = false;
        const finish = (v) => { if (done) return; done = true; obs.disconnect(); resolve(v); };
        const obs = new MutationObserver(() => { if (!document.body.contains(d.overlay)) finish(null); });   // closed with Esc
        obs.observe(document.body, { childList: true });

        const shapes = [];
        let tool = 'pen', color = COLORS[0], thick = 1, cur = null;
        const widthPx = () => Math.max(2, Math.round(cv.width / 170 * [0.6, 1, 1.8][thick]));
        const textPx = () => Math.round(cv.width / 24 * [0.75, 1, 1.5][thick]);

        function lum(c) { const n = parseInt(c.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
        function drawShape(s) {
          g.save();
          g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = s.w;
          if (s.t === 'pen') {
            g.beginPath(); s.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
            if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
            g.stroke();
          } else if (s.t === 'ell') {
            g.beginPath(); g.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2); g.stroke();
          } else if (s.t === 'rect') {
            g.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
          } else if (s.t === 'arrow') {
            const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), h = s.w * 4 + 12;
            g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke();
            g.beginPath(); g.moveTo(s.x2, s.y2);
            g.lineTo(s.x2 - h * Math.cos(a - 0.45), s.y2 - h * Math.sin(a - 0.45));
            g.lineTo(s.x2 - h * Math.cos(a + 0.45), s.y2 - h * Math.sin(a + 0.45));
            g.closePath(); g.fill();
          } else if (s.t === 'text') {
            g.font = `bold ${s.size}px Arial, sans-serif`; g.textBaseline = 'top';
            g.lineWidth = Math.max(3, s.size / 6); g.strokeStyle = lum(s.c) > 0.6 ? '#000' : '#fff';
            s.s.split('\n').forEach((line, i) => { g.strokeText(line, s.x, s.y + i * s.size * 1.2); g.fillText(line, s.x, s.y + i * s.size * 1.2); });
          }
          g.restore();
        }
        function paint(extra) {
          g.clearRect(0, 0, cv.width, cv.height);
          g.drawImage(img, 0, 0, cv.width, cv.height);
          shapes.forEach(drawShape);
          if (extra) drawShape(extra);
        }
        paint();

        // toolbar
        const bar = E('div', 'dpTools');
        const toolBtns = {};
        [['pen', '✏ Pen'], ['ell', '◯ Circle'], ['rect', '▭ Square'], ['arrow', '➜ Arrow'], ['text', 'T Text']].forEach(([id, label]) => {
          const b = btn(label, '', () => { tool = id; Object.keys(toolBtns).forEach(k => toolBtns[k].classList.toggle('on', k === id)); });
          toolBtns[id] = b; bar.appendChild(b);
        });
        toolBtns.pen.classList.add('on');
        bar.appendChild(E('span', 'sep'));
        const sws = [];
        const pick = (c) => { color = c; sws.forEach(s => s.classList.toggle('on', s.dataset.c === c)); custom.value = /^#[0-9a-f]{6}$/i.test(c) ? c : '#e11d48'; };
        COLORS.forEach(c => { const b = btn('', c, () => pick(c)); b.className = 'dpSw'; b.style.background = c; b.dataset.c = c; sws.push(b); bar.appendChild(b); });
        const custom = document.createElement('input'); custom.type = 'color'; custom.className = 'dpColor'; custom.title = 'Any other colour'; custom.value = COLORS[0];
        custom.addEventListener('input', () => { color = custom.value; sws.forEach(s => s.classList.remove('on')); });
        bar.appendChild(custom);
        sws[0].classList.add('on');
        bar.appendChild(E('span', 'sep'));
        const size = document.createElement('select');
        [['Thin', 0], ['Medium', 1], ['Thick', 2]].forEach(([t, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; size.appendChild(o); });
        size.value = '1'; size.title = 'Line and text size';
        size.addEventListener('change', () => { thick = Number(size.value); });
        bar.appendChild(size);
        bar.appendChild(E('span', 'sep'));
        bar.appendChild(btn('↶ Undo', 'Remove the last mark (Ctrl+Z)', () => { shapes.pop(); paint(); }));
        bar.appendChild(btn('Clear marks', 'Remove all marks', () => { shapes.length = 0; paint(); }));

        const stage = E('div', 'dpStage');
        stage.appendChild(cv);
        d.content.append(bar, stage, E('p', 'invNote', 'Choose a tool and a colour, then draw on the picture to show where the damage is.'));

        const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
        cv.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          const [x, y] = pos(e);
          if (tool === 'text') { e.preventDefault(); askLabel(e, x, y); return; }
          cv.setPointerCapture(e.pointerId);
          cur = tool === 'pen' ? { t: 'pen', pts: [[x, y]], c: color, w: widthPx() } : { t: tool, x1: x, y1: y, x2: x, y2: y, c: color, w: widthPx() };
          paint(cur);
        });
        cv.addEventListener('pointermove', (e) => {
          if (!cur) return;
          const [x, y] = pos(e);
          if (cur.t === 'pen') cur.pts.push([x, y]); else { cur.x2 = x; cur.y2 = y; }
          paint(cur);
        });
        const up = () => {
          if (!cur) return;
          const tiny = cur.t !== 'pen' && Math.abs(cur.x2 - cur.x1) + Math.abs(cur.y2 - cur.y1) < 6;
          if (!tiny) shapes.push(cur);
          cur = null; paint();
        };
        cv.addEventListener('pointerup', up);
        cv.addEventListener('pointercancel', up);

        // text label: a small box on the picture, Enter to place it
        let box = null;
        function askLabel(e, x, y) {
          if (box) { box.blur(); }
          const r = cv.getBoundingClientRect(), st = stage.getBoundingClientRect();
          box = document.createElement('input');
          box.className = 'dpText'; box.type = 'text'; box.maxLength = 60; box.placeholder = 'Type, then Enter';
          box.style.left = Math.min(e.clientX - st.left, Math.max(0, r.width - 140)) + 'px'; box.style.top = (e.clientY - st.top) + 'px';
          stage.appendChild(box);
          const mine = box; const col = color, sz = textPx();
          let placed = false;
          const place = () => {
            if (placed) return; placed = true;
            const v = mine.value.trim();
            mine.remove(); if (box === mine) box = null;
            if (v) { shapes.push({ t: 'text', x, y, s: v, c: col, size: sz }); paint(); }
          };
          mine.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); place(); } else if (ev.key === 'Escape') { ev.stopPropagation(); placed = true; mine.remove(); if (box === mine) box = null; } });
          mine.addEventListener('blur', place);
          setTimeout(() => mine.focus(), 0);
        }
        d.overlay.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target && e.target.tagName === 'INPUT' && e.target.type === 'text')) { e.preventDefault(); shapes.pop(); paint(); } });

        d.button('Done', 'primary', () => {
          if (box) box.blur();
          paint();
          let out = cv.toDataURL('image/jpeg', 0.85);
          if (out.length > 240000) out = cv.toDataURL('image/jpeg', 0.7);
          if (out.length > 240000) { d.say('This picture is too large. Choose a smaller one.', true); return; }
          d.close(); finish(out);
        });
        d.button('Cancel', '', () => { d.close(); finish(null); });
      };
      img.src = src;
    });
  }

  // ---------- the picker used inside the report forms ----------
  function picker(initial, host, onError) {
    const K = window.InvKit;
    let list = (initial || []).slice(0, MAX);   // file names (saved) or data URLs (new)
    let changed = false;
    const el = E('div');
    const row = E('div', 'dpRow');
    const addBox = E('div', 'dpAdd', '📷 Add a photo of the damage\nChoose, paste (Ctrl+V) or drop it here.');
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
    const info = E('div', 'invSub');

    function paint() {
      row.innerHTML = '';
      list.forEach((src, i) => {
        const t = E('div', 'dpThumb');
        const im = document.createElement('img'); im.src = photoSrc(src); im.alt = ''; im.loading = 'lazy'; im.title = 'Click to see it bigger';
        im.addEventListener('click', () => view(list, 'Damage photos'));
        const b = E('div');
        b.append(
          btn('✏ Mark', 'Draw on this picture to show the damaged spot', async () => {
            let src = list[i];
            if (!/^data:/.test(src)) {            // a saved picture: ask for its data first (a canvas cannot be saved after drawing a file link)
              const r = await window.api.invPhotoData([src]);
              src = r && r.photos && r.photos[src];
              if (!src) { onError('That picture could not be opened.'); return; }
            }
            const out = await markup(src); if (out) { list[i] = out; changed = true; paint(); }
          }),
          btn('🗑', 'Remove this photo', () => { list.splice(i, 1); changed = true; paint(); })
        );
        t.append(im, b); row.appendChild(t);
      });
      addBox.hidden = list.length >= MAX;
      info.textContent = list.length ? `${list.length} of ${MAX} photos.` : '';
    }
    async function take(blobs) {
      for (const blob of blobs) {
        if (list.length >= MAX) { onError(`You can add up to ${MAX} photos.`); break; }
        if (!blob || !/^image\//.test(blob.type || '')) { onError('Please choose a picture file (JPG, PNG or WebP).'); continue; }
        try { list.push(await shrink(blob)); changed = true; onError(''); }
        catch (e) { onError('That picture could not be used. Try a different one.'); }
      }
      paint();
    }
    file.addEventListener('change', () => { take([...file.files]); file.value = ''; });
    addBox.addEventListener('click', () => file.click());
    ['dragenter', 'dragover'].forEach(n => addBox.addEventListener(n, (e) => { e.preventDefault(); addBox.classList.add('drop'); }));
    ['dragleave', 'drop'].forEach(n => addBox.addEventListener(n, (e) => { e.preventDefault(); addBox.classList.remove('drop'); }));
    addBox.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files) take([...e.dataTransfer.files]); });
    if (host) host.addEventListener('paste', (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (files && files.length && /^image\//.test(files[0].type)) { e.preventDefault(); take([...files]); }
    });
    const pasteBtn = btn('📋 Paste', 'Paste a copied picture', async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) { const type = it.types.find(t => /^image\//.test(t)); if (type) { take([await it.getType(type)]); return; } }
        onError('There is no picture in the clipboard.');
      } catch (e) { onError('Press Ctrl+V while this window is open to paste a copied picture.'); }
    });
    const chooseBtn = btn('📁 Choose photo…', '', () => file.click());
    const btns = E('div', 'dpBtns'); btns.append(chooseBtn, pasteBtn);
    el.append(row, addBox, btns, info, file);
    paint();
    return { el, get: () => list.slice(), changed: () => changed };
  }

  // ---------- look at the photos ----------
  function view(list, title, onEdit) {
    const K = window.InvKit;
    if (!K || !list || !list.length) return;
    const d = K.dialog(title || 'Damage photos', { wide: true });
    const big = E('div', 'dpBig');
    list.forEach(src => { const im = document.createElement('img'); im.src = photoSrc(src); im.alt = ''; big.appendChild(im); });
    d.content.append(big);
    if (onEdit) d.button('✏ Add / mark photos…', '', () => { d.close(); onEdit(); });
    d.button('Close', 'primary', d.close);
  }

  function edit(list, title, save) {
    const K = window.InvKit;
    if (!K) return;
    const d = K.dialog(title || 'Damage photos', { wide: true });
    const pk = picker(list, d.overlay, (m) => d.say(m, !!m));
    d.content.append(pk.el);
    d.button('Save', 'primary', async () => {
      const err = await save(pk.get());
      if (err) { d.say(err, true); return; }
      d.close();
    });
    d.button('Cancel', '', d.close);
  }

  window.DamagePhotos = { picker, markup, view, edit, MAX };
})();
