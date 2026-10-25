// Runs after renderer.js and uses its variables ($, el, state, fileByPath, selectedPath, applyState).

const basket = new Set();
let orgSettings = { destRoot: '', structure: 'category', mode: 'copy' };
let lastPlan = [];
let orgBusy = false;

const STATUS_TEXT = {
  ok: 'New',
  rename: 'Renamed (name already exists)',
  duplicate: 'Skipped: already there',
  inside: 'Skipped: already in destination',
  toolong: 'Skipped: path too long',
  missing: 'Skipped: file not found'
};

// ---------- basket ----------
function updateBasketButtons() {
  $('basketTop').textContent = 'Basket (' + basket.size + ')';
  if (selectedPath) {
    $('basketBtn').textContent = basket.has(selectedPath) ? '− Remove from basket' : '+ Add to basket';
  }
}

function addPathsToBasket(paths) {
  for (const p of paths) basket.add(p);
  updateBasketButtons();
}

function collectFiles(node, out) {
  for (const f of node.files) out.push(f.path);
  for (const c of node.children.values()) collectFiles(c, out);
  return out;
}

function addNodeToBasket(node) {
  const paths = collectFiles(node, []);
  if (paths.length > 500 && !confirm('Add ' + paths.length + ' files to the basket?')) return;
  addPathsToBasket(paths);
}

$('basketBtn').addEventListener('click', () => {
  if (!selectedPath) return;
  if (basket.has(selectedPath)) basket.delete(selectedPath);
  else basket.add(selectedPath);
  updateBasketButtons();
});

// ---------- organize dialog ----------
function syncSettingsUI() {
  $('destText').textContent = orgSettings.destRoot || '(not chosen yet)';
  document.querySelectorAll('input[name="orgMode"]').forEach(r => { r.checked = r.value === orgSettings.mode; });
  $('structSel').value = orgSettings.structure;
}

function updateGoButton(items) {
  const n = items.filter(i => i.status === 'ok' || i.status === 'rename').length;
  const verb = orgSettings.mode === 'move' ? 'Move' : 'Copy';
  $('orgGo').textContent = verb + ' ' + n + ' file' + (n === 1 ? '' : 's');
  $('orgGo').disabled = orgBusy || n === 0 || !orgSettings.destRoot;
  $('orgSummary').textContent = items.length
    ? `${n} to ${verb.toLowerCase()}, ${items.length - n} will be skipped`
    : '';
  return n;
}

async function refreshPreview() {
  const box = $('orgPreview');
  box.innerHTML = '';
  lastPlan = [];

  const last = await window.api.organizeLast();
  $('undoBtn').disabled = !last;
  $('undoBtn').title = last
    ? `Last batch: ${last.count} file(s), ${last.mode === 'move' ? 'moved' : 'copied'} on ${new Date(last.time).toLocaleString()}`
    : 'Nothing to undo';

  if (!basket.size) {
    box.appendChild(el('div', 'empty', 'The basket is empty. Select a file and click "+ Add to basket", click the ＋ next to a folder, or add search results.'));
    updateGoButton([]);
    return;
  }
  if (!orgSettings.destRoot) {
    box.appendChild(el('div', 'empty', 'Choose a destination folder to see the preview.'));
    updateGoButton([]);
    return;
  }

  const res = await window.api.organizePreview([...basket]);
  if (res.error) {
    box.appendChild(el('div', 'empty', res.error));
    updateGoButton([]);
    return;
  }
  lastPlan = res.items;
  updateGoButton(lastPlan);

  const table = el('table');
  const head = el('tr');
  for (const h of ['File', 'Category', 'New location (inside the destination)', 'Result']) head.appendChild(el('th', '', h));
  table.appendChild(head);

  for (const it of lastPlan.slice(0, 300)) {
    const tr = el('tr', it.status === 'ok' || it.status === 'rename' ? '' : 'skip');
    tr.title = it.from;
    tr.appendChild(el('td', '', it.name));
    tr.appendChild(el('td', '', it.category));
    tr.appendChild(el('td', '', it.toRel));
    tr.appendChild(el('td', '', STATUS_TEXT[it.status] || it.status));
    table.appendChild(tr);
  }
  box.appendChild(table);
  if (lastPlan.length > 300) {
    box.appendChild(el('div', 'empty', `...and ${lastPlan.length - 300} more (all of them will be processed).`));
  }
}

async function openOrganize() {
  $('modal').hidden = false;
  $('orgMsg').textContent = '';
  orgSettings = await window.api.organizeSettings();
  syncSettingsUI();
  await refreshPreview();
}

function closeOrganize() { $('modal').hidden = true; }

$('basketTop').addEventListener('click', openOrganize);
$('orgCancel').addEventListener('click', closeOrganize);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOrganize(); });

$('destBtn').addEventListener('click', async () => {
  orgSettings = await window.api.chooseDest();
  syncSettingsUI();
  await refreshPreview();
});

document.querySelectorAll('input[name="orgMode"]').forEach(r => {
  r.addEventListener('change', async () => {
    orgSettings = await window.api.organizeSet({ mode: r.value });
    await refreshPreview();
  });
});

$('structSel').addEventListener('change', async () => {
  orgSettings = await window.api.organizeSet({ structure: $('structSel').value });
  await refreshPreview();
});

$('clearBasket').addEventListener('click', async () => {
  basket.clear();
  updateBasketButtons();
  await refreshPreview();
});

$('orgGo').addEventListener('click', async () => {
  const n = lastPlan.filter(i => i.status === 'ok' || i.status === 'rename').length;
  if (!n || orgBusy) return;

  if (orgSettings.mode === 'move' &&
      !confirm(`Move ${n} file(s)?\n\nThe originals go to the Recycle Bin (you can restore them from there), and "Undo last batch" puts them back.`)) {
    return;
  }

  orgBusy = true;
  $('orgGo').disabled = true;
  $('orgMsg').textContent = 'Working...';
  const r = await window.api.organizeRun([...basket]);
  orgBusy = false;

  if (!r.ok) {
    $('orgMsg').textContent = r.error;
    updateGoButton(lastPlan);
    return;
  }

  for (const p of r.finished) basket.delete(p);
  applyState(r.data);
  updateBasketButtons();

  let msg = `${r.copied} file(s) ${r.mode === 'move' ? 'moved' : 'copied'}. ${r.skipped} skipped.`;
  if (r.notRemoved) msg += ` ${r.notRemoved} original(s) could not be removed and were left in place.`;
  if (r.errors.length) msg += ' Problems: ' + r.errors.slice(0, 3).join('; ');
  $('orgMsg').textContent = msg;
  await refreshPreview();
});

$('undoBtn').addEventListener('click', async () => {
  const last = await window.api.organizeLast();
  if (!last) return;
  if (!confirm(`Undo the last batch (${last.count} file(s), ${last.mode === 'move' ? 'moved' : 'copied'} on ${new Date(last.time).toLocaleString()})?\n\nThe organized copies go to the Recycle Bin${last.mode === 'move' ? ' and the files are put back where they were' : ''}.`)) {
    return;
  }
  $('orgMsg').textContent = 'Undoing...';
  const r = await window.api.organizeUndo();
  if (!r.ok) {
    $('orgMsg').textContent = r.error;
    return;
  }
  applyState(r.data);
  $('orgMsg').textContent = `${r.restored} file(s) undone.` +
    (r.problems.length ? ' Notes: ' + r.problems.slice(0, 3).join('; ') : '');
  await refreshPreview();
});

updateBasketButtons();