// Report: "Damaged & missing tools / equipment" - a formal A4 landscape document with pictures, a summary,
// one table for damaged tools, one for missing tools, and signature lines.
// Used by two screens: Reports tab and Inventory > Tools & Equipment > Repairs tab (button "Generate report").
//   DamagedReport.open(state?)   state = the data from api.invLoad('tools'); when left out, the Inventory screen's data is used.
// Needs window.InvKit (inventory-ui.js).  Output: Save as PDF or Print (same dialog as the other inventory reports).
(function () {
  'use strict';
  const pSrc = (v) => (window.PhotoSrc ? window.PhotoSrc(v) : v);   // damage-photos.js turns a saved file name into a picture link

  const CSS = `
    .dr-meta { width: 100%; border-collapse: collapse; margin: 0 0 10px; }
    .dr-meta td { border: 1px solid #c9cfd8; padding: 4px 7px; font-size: 11px; }
    .dr-meta td.k { background: #eef1f5; width: 120px; font-weight: bold; color: #444; }
    .dr-sum { display: flex; gap: 8px; margin: 0 0 12px; }
    .dr-sum div { flex: 1; border: 1px solid #c9cfd8; border-radius: 4px; padding: 6px 8px; text-align: center; }
    .dr-sum b { display: block; font-size: 20px; line-height: 1.1; }
    .dr-sum small { font-size: 10px; color: #555; }
    .dr-sum .bad b { color: #d1242f; } .dr-sum .warn b { color: #b45309; } .dr-sum .ok b { color: #1a7f37; }
    h2.dr-h { font-size: 13px; margin: 14px 0 5px; padding: 3px 7px; background: #1f2d3d; color: #fff; border-radius: 3px; }
    .dr-pic { width: 76px; height: 56px; object-fit: cover; border-radius: 3px; display: block; }
    .dr-dmg { display: flex; flex-wrap: wrap; gap: 4px; max-width: 330px; }
    .dr-dmg img { height: auto; border-radius: 3px; border: 1px solid #c9cfd8; display: block; }
    .dr-dmg.n1 img { width: 230px; } .dr-dmg.n2 img { width: 160px; } .dr-dmg.n3 img { width: 104px; }
    .dr-nopic { width: 76px; height: 56px; background: #eef1f5; border-radius: 3px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 20px; }
    .dr-tag { display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: 10px; font-weight: bold; color: #fff; white-space: nowrap; }
    .dr-tag.d { background: #d1242f; } .dr-tag.n { background: #d97706; } .dr-tag.l { background: #6b7280; }
    .dr-st-open { color: #d1242f; font-weight: bold; } .dr-st-done { color: #1a7f37; }
    .dr-note { margin: 10px 0 0; font-size: 10px; color: #555; }
    .dr-sign { margin-top: 34px; display: flex; gap: 40px; page-break-inside: avoid; }
    .dr-sign div { flex: 1; border-top: 1px solid #444; padding-top: 3px; font-size: 10px; color: #555; }
    .dr-sign b { color: #222; display: block; font-size: 11px; }
    .dr-empty { color: #777; font-style: italic; padding: 6px 2px; }
  `;

  const K = () => window.InvKit;

  // The page frame (own copy, so the report also works from the Reports tab before the Inventory screen has been opened)
  const BASE_CSS = `
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 11px; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #666; margin: 0 0 10px; font-size: 11px; }
    table.rp { width: 100%; border-collapse: collapse; } table.rp thead { display: table-header-group; }
    table.rp th { background: #eef1f5; text-align: left; font-size: 10px; padding: 4px 5px; border: 1px solid #c9cfd8; }
    table.rp td { padding: 3px 5px; border: 1px solid #d5dae1; vertical-align: top; } table.rp tr { page-break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }`;
  function frame(title, subtitle, inner, state) {
    const { esc, fmtDate } = K();
    const S = state.settings || {};
    const who = S.user || S.defaultUser || '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}${CSS}</style></head><body>` +
      (S.formLogo ? `<img src="${esc(S.formLogo)}" alt="" style="float:right;max-height:44px;max-width:160px;object-fit:contain">` : '') +
      `<h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}${subtitle ? ' · ' : ''}Printed ${esc(fmtDate(state.today))}${who ? ' by ' + esc(who) : ''}</p>${inner}</body></html>`;
  }
  const rpTable = (cols, rows) => { const { esc } = K(); return `<table class="rp"><thead><tr>${cols.map(c => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`; };

  const KIND_CLASS = { 'Damaged': 'd', 'Needs repair': 'n', 'Under repair': 'n', 'Lost': 'l' };

  // ---- which records belong in the report ----
  function pick(state, o) {
    const inRange = (r) => (!o.from || r.date >= o.from) && (!o.to || r.date <= o.to);
    const all = (state.repairs || []).filter(inRange);
    const damaged = all.filter(r => r.status === 'open' || (o.closed && (r.status === 'fixed' || r.status === 'scrapped')))
      .sort((a, b) => a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName));
    const missing = all.filter(r => r.status === 'lost').sort((a, b) => a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName));
    return { damaged, missing };
  }

  // ---- the document ----
  function build(state, o) {
    const { esc, fmtQty, fmtDate, daysBetween } = K();
    const { damaged, missing } = pick(state, o);
    const byId = new Map((state.items || []).map(i => [i.id, i]));
    const today = state.today;
    const S = state.settings || {};
    window.PhotoBase = state.photoBase || window.PhotoBase || '';

    const pic = (r) => {
      if (!o.pictures) return '';
      const it = byId.get(r.itemId);
      return `<td>${it && it.photo ? `<img class="dr-pic" src="${esc(pSrc(it.photo))}" alt="">` : '<div class="dr-nopic">🔧</div>'}</td>`;
    };
    const dmg = (r) => {
      if (!o.damagePhotos) return '';
      const list = r.photos || [];
      return `<td>${list.length ? `<div class="dr-dmg n${list.length}">${list.map(p => `<img src="${esc(pSrc(p))}" alt="">`).join('')}</div>` : ''}</td>`;
    };
    const head = (cols) => (o.pictures ? [{ label: 'No.' }, { label: 'Picture' }] : [{ label: 'No.' }]).concat(cols).concat(o.damagePhotos ? [{ label: 'Damage photos' }] : []);
    const sum = (list) => list.reduce((s, r) => s + r.qty, 0);

    const openList = damaged.filter(r => r.status === 'open');
    const doneList = damaged.filter(r => r.status !== 'open');
    const damagedUnits = sum(openList.filter(r => r.kind === 'Damaged'));
    const repairUnits = sum(openList.filter(r => r.kind !== 'Damaged'));
    const lostUnits = sum(missing);

    const metaRows = [
      ['Report date', fmtDate(today)],
      ['Period', o.from || o.to ? `${o.from ? fmtDate(o.from) : 'start'} to ${o.to ? fmtDate(o.to) : fmtDate(today)}` : 'All records'],
      ['Prepared by', o.preparedBy || ''],
      ['Project / reference', o.ref || ''],
      ['Covers', o.closed ? 'Out of service, repaired, written off and missing' : 'Tools still out of service, and missing tools']
    ];
    const meta = `<table class="dr-meta"><tr><td class="k">${metaRows[0][0]}</td><td>${esc(metaRows[0][1])}</td><td class="k">${metaRows[2][0]}</td><td>${esc(metaRows[2][1])}</td></tr>` +
      `<tr><td class="k">${metaRows[1][0]}</td><td>${esc(metaRows[1][1])}</td><td class="k">${metaRows[3][0]}</td><td>${esc(metaRows[3][1])}</td></tr>` +
      `<tr><td class="k">${metaRows[4][0]}</td><td colspan="3">${esc(metaRows[4][1])}</td></tr></table>`;

    const box = (cls, n, label) => `<div class="${cls}"><b>${fmtQty(n)}</b><small>${esc(label)}</small></div>`;
    const summary = `<div class="dr-sum">${box('bad', damagedUnits, 'Damaged (units)')}${box('warn', repairUnits, 'Needs / under repair (units)')}${box('bad', lostUnits, 'Missing / lost (units)')}` +
      (o.closed ? box('ok', sum(doneList), 'Repaired / written off (units)') : '') + `${box('', damagedUnits + repairUnits + lostUnits, 'Total out of service or missing')}</div>`;

    const empty = (cols, text) => `<tr><td colspan="${cols}" class="dr-empty">${esc(text)}</td></tr>`;
    const ncols = 10 + (o.pictures ? 1 : 0) + (o.damagePhotos ? 1 : 0);

    const damagedRows = damaged.map((r, n) => {
      const days = r.status === 'open' ? daysBetween(r.date, today) : daysBetween(r.date, r.closedDate || today);
      const st = r.status === 'open' ? '<span class="dr-st-open">Out of service</span>'
        : `<span class="dr-st-done">${r.status === 'fixed' ? 'Repaired' : 'Written off'}<br>${esc(fmtDate(r.closedDate))}</span>`;
      const it = byId.get(r.itemId);
      return `<tr><td class="num">${n + 1}</td>${pic(r)}<td>${esc(r.itemCode)}</td><td><b>${esc(r.itemName)}</b>${it && it.serial ? `<br><small>S/N ${esc(it.serial)}</small>` : ''}</td>` +
        `<td class="num">${fmtQty(r.qty)} ${esc(r.uom)}</td><td><span class="dr-tag ${KIND_CLASS[r.kind] || 'd'}">${esc(r.kind)}</span></td><td>${esc(fmtDate(r.date))}</td>` +
        `<td>${esc(r.borrower || r.by)}</td><td class="num">${days} d</td><td>${st}</td><td>${esc(r.note || r.closedNote)}</td>${dmg(r)}</tr>`;
    }).join('') || empty(ncols, 'No damaged tools for these choices.');

    const missingRows = missing.map((r, n) => {
      const it = byId.get(r.itemId);
      return `<tr><td class="num">${n + 1}</td>${pic(r)}<td>${esc(r.itemCode)}</td><td><b>${esc(r.itemName)}</b>${it && it.serial ? `<br><small>S/N ${esc(it.serial)}</small>` : ''}</td>` +
        `<td class="num">${fmtQty(r.qty)} ${esc(r.uom)}</td><td><span class="dr-tag l">Missing</span></td><td>${esc(fmtDate(r.date))}</td>` +
        `<td>${esc(r.borrower || r.by)}</td><td class="num">${daysBetween(r.date, today)} d</td><td><span class="dr-st-open">Removed from stock</span></td><td>${esc(r.note)}</td>${dmg(r)}</tr>`;
    }).join('') || empty(ncols, 'No missing tools for these choices.');

    const cols = [{ label: 'Code' }, { label: 'Tool / equipment' }, { label: 'Qty', num: true }, { label: 'Issue' }, { label: 'Date reported' },
      { label: 'Reported by / last borrower' }, { label: 'Days', num: true }, { label: 'Status' }, { label: 'Remarks' }];
    const inner = meta + summary +
      `<h2 class="dr-h">A. Damaged tools and equipment (${damaged.length} record${damaged.length === 1 ? '' : 's'})</h2>` + rpTable(head(cols), damagedRows) +
      `<h2 class="dr-h">B. Missing / lost tools and equipment (${missing.length} record${missing.length === 1 ? '' : 's'})</h2>` + rpTable(head(cols), missingRows) +
      `<p class="dr-note">Damaged tools are counted as out of service until they are repaired or written off. Missing tools have been removed from the stock count. "Days" is the time since the problem was reported.</p>` +
      `<div class="dr-sign"><div><b>${esc(o.preparedBy || ' ')}</b>Prepared by / date</div><div><b>&nbsp;</b>Checked by / date</div><div><b>&nbsp;</b>Approved by / date</div></div>`;

    const sub = [S.formCompany, S.formDept].filter(Boolean).join(' · ');
    return {
      title: 'Damaged and missing tools report',
      html: frame('Damaged & missing tools / equipment report', sub, inner, state),
      landscape: true,
      counts: { damaged: damaged.length, missing: missing.length }
    };
  }

  // ---- the options dialog ----
  function open(given) {
    const k = K();
    if (!k) { alert('Open the Inventory tab once, then try again.'); return; }
    const state = given || k.S;
    if (!state) { k.say('The inventory is still loading. Try again in a moment.'); return; }
    const { E, dialog, fld, inp, grid } = k;
    const S = state.settings || {};

    const d = dialog('Generate damaged & missing tools report', {});
    const from = inp('date', ''), to = inp('date', '');
    const who = inp('text', S.user || S.defaultUser || '', { maxLength: 80 });
    const ref = inp('text', '', { maxLength: 120, placeholder: 'e.g. Project name or job number' });
    const mk = (label, checked) => { const l = E('label', 'invChk'); const c = inp('checkbox', '1', { checked }); l.append(c, E('span', '', ' ' + label)); return { l, c }; };
    const closed = mk('Also include tools already repaired or written off', false);
    const pics = mk('Show a picture of each tool', true);
    const dpics = mk('Show the damage photos (with the marks)', true);
    const count = E('p', 'invNote', '');

    d.content.append(E('p', '', 'A formal A4 report with a summary, a table of damaged tools, a table of missing tools, and signature lines.'),
      grid(fld('Reported from (optional)', from), fld('Reported to (optional)', to)),
      grid(fld('Prepared by', who), fld('Project / reference (optional)', ref)),
      closed.l, pics.l, dpics.l, count);

    const opts = () => ({ from: from.value, to: to.value, preparedBy: who.value.trim(), ref: ref.value.trim(), closed: closed.c.checked, pictures: pics.c.checked, damagePhotos: dpics.c.checked });
    const refresh = () => {
      const p = pick(state, opts());
      const n = p.damaged.length + p.missing.length;
      count.textContent = n ? `${p.damaged.length} damaged and ${p.missing.length} missing record${n === 1 ? '' : 's'} will be in the report.` : 'There is nothing to report with these choices.';
    };
    [from, to, closed.c].forEach(x => x.addEventListener('change', refresh));
    refresh();

    d.button('Create report', 'primary', () => {
      const o = opts();
      if (o.from && o.to && o.from > o.to) { d.say('"From" must be before "to".', true); return; }
      const p = pick(state, o);
      if (!p.damaged.length && !p.missing.length) { d.say('There is nothing to report with these choices.', true); return; }
      const rep = build(state, o);
      d.close();
      k.outputReport(rep);
    });
    d.button('Cancel', '', d.close);
  }

  window.DamagedReport = { open, build, pick };
})();
