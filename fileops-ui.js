// Runs after renderer.js and organize-ui.js.
// Uses: $, el, selectedPath, fileByPath, expanded, basket, applyState, selectFile, updateBasketButtons ...

let toastTimer = null;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 7000);
}

// Stops Electron from opening a file if one is dropped on the window by mistake.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());
document.addEventListener('dragend', () => {
  document.querySelectorAll('.dropok').forEach(x => x.classList.remove('dropok'));
});

// ---------- right-click menu ----------
function hideMenu() { $('ctxMenu').hidden = true; }

function showMenu(e, items) {
  const m = $('ctxMenu');
  m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { m.appendChild(el('div', 'sep')); continue; }
    const d = el('div', 'item' + (it.disabled ? ' off' : ''), it.label);
    if (!it.disabled) d.addEventListener('click', () => { hideMenu(); it.run(); });
    m.appendChild(d);
  }
  m.hidden = false;
  const w = m.offsetWidth;
  const h = m.offsetHeight;
  m.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - w - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - h - 4)) + 'px';
}

document.addEventListener('click', hideMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
window.addEventListener('blur', hideMenu);

// ---------- ask for a name ----------
function askText(title, placeholder) {
  return new Promise((resolve) => {
    const inp = $('askInput');
    $('askTitle').textContent = title;
    inp.value = '';
    inp.placeholder = placeholder || '';
    $('askModal').hidden = false;
    inp.focus();

    const done = (val) => {
      $('askModal').hidden = true;
      $('askOk').onclick = null;
      $('askCancel').onclick = null;
      inp.onkeydown = null;
      resolve(val);
    };
    $('askOk').onclick = () => done(inp.value.trim());
    $('askCancel').onclick = () => done(null);
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') done(inp.value.trim());
      else if (e.key === 'Escape') done(null);
    };
  });
}

// ---------- helpers ----------
function isUnder(p, dir) {
  const a = p.toLowerCase().replace(/\//g, '\\');
  const b = dir.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '');
  return a.startsWith(b + '\\');
}

// A file shown in the preview can be locked by Windows, so release it before moving or deleting.
async function releasePreview(isAffected) {
  if (selectedPath && isAffected(selectedPath)) {
    $('preview').innerHTML = '';
    await new Promise(r => setTimeout(r, 200));
  }
}

function restoreSelection() {
  if (selectedPath && fileByPath.has(selectedPath)) selectFile(selectedPath);
}

function remapAfterMove(moves) {
  for (const m of moves) {
    if (selectedPath === m.from) selectedPath = m.to;
    if (basket.has(m.from)) {
      basket.delete(m.from);
      basket.add(m.to);
    }
  }
}

// ---------- moving files ----------
async function moveFilesTo(paths, destDir) {
  if (!paths.length) return;
  await releasePreview(p => paths.includes(p));
  finishMove(await window.api.moveFiles(paths, destDir));
}

async function moveWithDialog(paths) {
  if (!paths.length) return;
  await releasePreview(p => paths.includes(p));
  finishMove(await window.api.moveFilesDialog(paths));
}

function finishMove(r) {
  if (!r || r.canceled) { restoreSelection(); return; }
  if (!r.ok) { toast(r.error); restoreSelection(); return; }

  remapAfterMove(r.moves);
  applyState(r.data);
  updateBasketButtons();
  restoreSelection();
  refreshUndoMove();

  let msg = `${r.moves.length} file${r.moves.length === 1 ? '' : 's'} moved.`;
  if (r.skipped) msg += ` ${r.skipped} skipped (already in that folder, or an identical file is already there).`;
  if (r.errors.length) msg += ' Problems: ' + r.errors.slice(0, 2).join('; ');
  toast(msg);
}

async function refreshUndoMove() {
  const last = await window.api.moveLast();
  const b = $('undoMove');
  b.disabled = !last;
  b.title = last
    ? `Undo the last move (${last.count} file${last.count === 1 ? '' : 's'}, ${new Date(last.time).toLocaleString()})`
    : 'No move to undo';
}

$('undoMove').addEventListener('click', async () => {
  const last = await window.api.moveLast();
  if (!last) return;
  if (!confirm(`Undo the last move (${last.count} file${last.count === 1 ? '' : 's'})?\n\nThe files go back to where they were.`)) return;

  await releasePreview(() => true);
  const r = await window.api.moveUndo();
  if (!r.ok) { toast(r.error); restoreSelection(); return; }

  remapAfterMove(r.moves);
  applyState(r.data);
  updateBasketButtons();
  restoreSelection();
  refreshUndoMove();
  toast(`${r.moves.length} file${r.moves.length === 1 ? '' : 's'} put back.` +
    (r.problems.length ? ' Notes: ' + r.problems.slice(0, 2).join('; ') : ''));
});

$('moveBtn').addEventListener('click', () => { if (selectedPath) moveWithDialog([selectedPath]); });

// ---------- folders: create and delete ----------
async function createFolderIn(node) {
  const name = await askText('New folder in "' + node.label + '"', 'Folder name');
  if (!name) return;
  const r = await window.api.createFolder(node.dirPath, name);
  if (!r.ok) { toast(r.error); return; }
  expanded.add(node.key);
  applyState(r.data);
  toast('Folder "' + name + '" created.');
}

async function deleteFolder(node) {
  const n = node.count;
  if (!confirm(`Delete the folder "${node.label}" and everything inside it (${n} file${n === 1 ? '' : 's'})?\n\nIt goes to the Recycle Bin, so you can restore it from there.`)) return;

  await releasePreview(p => isUnder(p, node.dirPath));
  const r = await window.api.deleteFolder(node.dirPath);
  if (!r.ok) { toast(r.error); restoreSelection(); return; }

  applyState(r.data);
  for (const p of [...basket]) if (!fileByPath.has(p)) basket.delete(p);
  updateBasketButtons();
  restoreSelection();
  toast('Folder "' + node.label + '" moved to the Recycle Bin.');
}

async function renameFolder(node) {
  const name = await askText('Rename "' + node.label + '" to', node.label);
  if (!name || name === node.label) return;

  await releasePreview(p => isUnder(p, node.dirPath));
  const r = await window.api.renameFolder(node.dirPath, name);
  finishFolderChange(r, 'Folder renamed to "' + name + '".');
}

async function moveFolder(node) {
  await releasePreview(p => isUnder(p, node.dirPath));
  const r = await window.api.moveFolder(node.dirPath);
  finishFolderChange(r, 'Folder "' + node.label + '" moved.');
}

function finishFolderChange(r, okMessage) {
  if (!r || r.canceled) { restoreSelection(); return; }
  if (!r.ok) { toast(r.error); restoreSelection(); return; }

  remapAfterMove(r.moves);
  try { window.api.tasksRemapFiles(r.moves); } catch (e) {}   // keep task file links working
  applyState(r.data);
  updateBasketButtons();
  restoreSelection();
  toast(okMessage + ' (' + r.moves.length + ' file' + (r.moves.length === 1 ? '' : 's') + ' inside.)');
}

// ---------- menus ----------
function showFolderMenu(e, node) {
  const isTop = node.kind === 'project';
  const n = basket.size;
  showMenu(e, [
    { label: 'New folder here…', run: () => createFolderIn(node) },
    {
      label: n ? `Move basket (${n} file${n === 1 ? '' : 's'}) here` : 'Move basket here (basket is empty)',
      disabled: !n,
      run: () => moveFilesTo([...basket], node.dirPath)
    },
    { label: 'Show in Explorer', run: () => window.api.openFolder(node.dirPath) },
    '-',
    { label: 'Rename folder…', disabled: isTop, run: () => renameFolder(node) },
    { label: 'Move folder to…', disabled: isTop, run: () => moveFolder(node) },
    '-',
    { label: 'Delete folder…', disabled: isTop, run: () => deleteFolder(node) }
  ]);
}

function showFileMenu(e, f) {
  const inBasket = basket.has(f.path);
  const several = inBasket && basket.size > 1;
  showMenu(e, [
    { label: 'Open', run: () => window.api.openFile(f.path) },
    { label: 'Show in folder', run: () => window.api.showInFolder(f.path) },
    '-',
    several
      ? { label: `Move basket (${basket.size} files) to…`, run: () => moveWithDialog([...basket]) }
      : { label: 'Move to…', run: () => moveWithDialog([f.path]) },
    {
      label: inBasket ? 'Remove from basket' : 'Add to basket',
      run: () => {
        if (inBasket) basket.delete(f.path);
        else basket.add(f.path);
        updateBasketButtons();
      }
    }
  ]);
}

window.addEventListener('load', refreshUndoMove);
