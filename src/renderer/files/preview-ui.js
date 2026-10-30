// Runs after renderer.js. This version of showPreview replaces the one in renderer.js
// (the old one can stay where it is; this later definition is the one used).

(function addPreviewStyles() {
  const st = document.createElement('style');
  st.textContent = `
    #preview img.pvImg { display: block; margin: 0 auto; }
    #preview img.pvImg.fit { max-width: 100%; height: auto; cursor: zoom-in; }
    #preview img.pvImg:not(.fit) { max-width: none; margin: 0; cursor: zoom-out; }
    .pvCol { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    #preview .pvCol iframe { flex: 1; height: auto; min-height: 0; background: #fff; }
    .pvTabs { display: flex; gap: 2px; flex-wrap: wrap; padding: 4px 8px 0; background: #f3f3f3; border-bottom: 1px solid #ccc; }
    .pvTab { padding: 4px 12px; border: 1px solid #ccc; border-bottom: none; background: #e8e8e8; border-radius: 4px 4px 0 0; font-size: 12px; cursor: pointer; }
    .pvTab.on { background: #fff; font-weight: 600; }
    .pvInfo { padding: 4px 12px; font-size: 11px; color: #666; background: #fafafa; border-bottom: 1px solid #ddd; }
    .pvGrid { flex: 1; min-height: 0; overflow: auto; background: #fff; }
    table.pvXl { border-collapse: collapse; font-size: 12px; font-family: Calibri, Segoe UI, Arial, sans-serif; }
    table.pvXl td { border: 1px solid #ddd; padding: 2px 6px; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
    table.pvXl td.num { text-align: right; }
    table.pvXl th { background: #f0f0f0; border: 1px solid #ccc; font-weight: 600; color: #555; padding: 2px 6px; position: sticky; top: 0; z-index: 2; }
    table.pvXl th.rn { left: 0; top: auto; z-index: 1; text-align: right; font-weight: 400; }
    table.pvXl th.corner { left: 0; z-index: 3; }
  `;
  document.head.appendChild(st);
})();

const PV_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.avif'];
const PV_TEXT_EXTS = ['.txt', '.csv', '.md', '.log'];

function pvColName(i) {
  let s = '';
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function pvDocHtml(body) {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
    '<base target="_blank">' +
    '<style>' +
    'body{font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;background:#fff;margin:0;padding:24px 32px;max-width:900px}' +
    'table{border-collapse:collapse;margin:10px 0}td,th{border:1px solid #bbb;padding:4px 8px;vertical-align:top}' +
    'img{max-width:100%;height:auto}h1,h2,h3,h4{margin:18px 0 8px}p{margin:6px 0}' +
    '</style></head><body>' + body + '</body></html>';
}

function pvImage(box, f) {
  const wrap = el('div');
  const info = el('div', 'note', 'Loading image...');
  const img = document.createElement('img');
  img.className = 'pvImg fit';
  img.src = fileUrl(f.path);
  img.addEventListener('load', () => {
    info.textContent = `${img.naturalWidth} × ${img.naturalHeight} px. Click the image to switch between fit-to-window and actual size.`;
  });
  img.addEventListener('error', () => {
    info.textContent = 'This image could not be displayed. Use Open to view it in its own program.';
    img.remove();
  });
  img.addEventListener('click', () => img.classList.toggle('fit'));
  wrap.append(info, img);
  box.appendChild(wrap);
}

async function pvDocx(box, f, stale) {
  const col = el('div', 'pvCol');
  box.appendChild(col);
  col.appendChild(el('div', 'note', 'Loading document...'));

  const r = await window.api.previewDocx(f.path);
  if (stale()) return;
  col.innerHTML = '';
  if (!r.ok) { col.appendChild(el('div', 'nopreview', r.error)); return; }

  col.appendChild(el('div', 'note',
    'Simplified Word preview: text, headings, lists, tables and pictures. Page layout, headers/footers and some formatting are not shown, and links are not clickable. Use Open for the original.'));
  const fr = document.createElement('iframe');
  fr.setAttribute('sandbox', '');          // no scripts, no navigation
  fr.srcdoc = pvDocHtml(r.html);
  col.appendChild(fr);
}

function pvSheetTable(s) {
  const table = el('table', 'pvXl');
  const thead = el('thead');
  const hr = el('tr');
  hr.appendChild(el('th', 'corner', ''));
  for (let c = 0; c < s.cols; c++) hr.appendChild(el('th', '', pvColName(c)));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  s.rows.forEach((row, ri) => {
    const tr = el('tr');
    tr.appendChild(el('th', 'rn', String(ri + 1)));
    for (let c = 0; c < s.cols; c++) {
      const text = row[c] || '';
      const td = el('td', /^-?[\d.,]+%?$/.test(text) ? 'num' : '', text);
      if (text.length > 40) td.title = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

async function pvXlsx(box, f, stale) {
  const col = el('div', 'pvCol');
  box.appendChild(col);
  col.appendChild(el('div', 'note', 'Loading spreadsheet (large files can take a few seconds)...'));

  const r = await window.api.previewXlsx(f.path);
  if (stale()) return;
  col.innerHTML = '';
  if (!r.ok) { col.appendChild(el('div', 'nopreview', r.error)); return; }
  if (!r.sheets.length) { col.appendChild(el('div', 'nopreview', 'No visible sheets in this workbook.')); return; }

  const tabs = el('div', 'pvTabs');
  const info = el('div', 'pvInfo');
  const grid = el('div', 'pvGrid');
  col.append(tabs, info, grid);

  const tabButtons = [];
  const show = (i) => {
    const s = r.sheets[i];
    tabButtons.forEach((b, j) => b.classList.toggle('on', j === i));
    info.textContent = `${s.totalRows} rows × ${s.totalCols} columns` +
      (s.truncated ? ` (showing the first ${s.rows.length} rows and ${s.cols} columns). ` : '. ') +
      'Values only: formulas, colors and formatting are not shown.';
    grid.innerHTML = '';
    grid.appendChild(pvSheetTable(s));
  };

  r.sheets.forEach((s, i) => {
    const b = el('button', 'pvTab', s.name);
    b.addEventListener('click', () => show(i));
    tabs.appendChild(b);
    tabButtons.push(b);
  });
  show(0);
}

async function showPreview(f) {
  const box = $('preview');
  box.innerHTML = '';
  const token = ++previewSeq;
  const stale = () => token !== previewSeq;

  if (f.ext === '.pdf') {
    const fr = document.createElement('iframe');
    fr.src = fileUrl(f.path) + '#view=FitH&pagemode=none'; // sidebar starts hidden; the menu button in the viewer shows it
    box.appendChild(fr);
  } else if (PV_IMAGE_EXTS.includes(f.ext)) {
    pvImage(box, f);
  } else if (f.ext === '.docx') {
    await pvDocx(box, f, stale);
  } else if (f.ext === '.xlsx') {
    await pvXlsx(box, f, stale);
  } else if (PV_TEXT_EXTS.includes(f.ext)) {
    const pre = el('pre', '', 'Loading...');
    box.appendChild(pre);
    const t = await window.api.previewText(f.path);
    if (stale()) return;
    pre.textContent = t || 'No readable text found in this file.';
  } else if (f.ext === '.doc' || f.ext === '.xls') {
    box.appendChild(el('div', 'nopreview',
      'This is an old Word/Excel format (' + f.ext + ') that cannot be previewed here. Use Open to view it in its own program.'));
  } else if (['.tif', '.tiff', '.heic', '.heif'].includes(f.ext)) {
    box.appendChild(el('div', 'nopreview',
      'This image format (' + f.ext + ') cannot be shown here. Use Open to view it in its own program.'));
  } else {
    box.appendChild(el('div', 'nopreview',
      'No preview for this file type (' + (f.ext || 'no extension') + '). Use Open to view it in its own program.'));
  }
}
