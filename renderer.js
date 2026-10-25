const $ = (id) => document.getElementById(id);

const SUMMARIZABLE = ['.pdf', '.docx', '.xlsx'];
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
const TEXT_EXTS = ['.docx', '.xlsx', '.txt', '.csv', '.md', '.log'];
const PALETTE = ['#2f81f7', '#8957e5', '#d29922', '#3fb950', '#f0883e', '#db61a2', '#1f9d8f', '#cf222e', '#6e7781', '#a371f7', '#58a6ff'];
const MAX_FILES_SHOWN = 500;

let state = { projects: [], categories: [], files: [], dirs: [] };
let fileByPath = new Map();
let view = 'folders';
let selectedPath = null;
let seq = 0;
let previewSeq = 0;
let timer = null;
let summarizing = false;
let dragPath = null;
// which folders are open is remembered between starts; saved folders (roots) start closed, except the first one on a fresh start
const EXP_KEY = 'wh-expanded';
function loadExp() { try { const o = JSON.parse(localStorage.getItem(EXP_KEY) || 'null'); return o && Array.isArray(o.open) ? o : null; } catch (e) { return null; } }
const savedExp = loadExp();
const expanded = new Set(savedExp ? savedExp.open : []);
const knownProjects = new Set(savedExp ? savedExp.known : []);
function saveExp() { try { localStorage.setItem(EXP_KEY, JSON.stringify({ open: [...expanded].slice(0, 2000), known: [...knownProjects] })); } catch (e) {} }
const seenProjects = new Set();

// ---------- helpers ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function catColor(name) {
  const i = state.categories.indexOf(name);
  return i < 0 ? '#999' : PALETTE[i % PALETTE.length];
}
function fileUrl(p) {
  return 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
}
function projectName(id) {
  const p = state.projects.find(x => x.id === id);
  return p ? p.name : '';
}
function joinPath(base, part) {
  const sep = base.includes('\\') ? '\\' : '/';
  return base.endsWith(sep) ? base + part : base + sep + part;
}

// ---------- building the trees ----------
function countFiles(node) {
  let c = node.files.length;
  for (const ch of node.children.values()) c += countFiles(ch);
  node.count = c;
  return c;
}

function ensureFolder(root, parts) {
  let node = root;
  for (const seg of parts) {
    let child = node.children.get(seg);
    if (!child) {
      child = {
        key: node.key + '/' + seg, label: seg, kind: 'folder',
        dirPath: joinPath(node.dirPath, seg), children: new Map(), files: []
      };
      node.children.set(seg, child);
    }
    node = child;
  }
  return node;
}

function buildFolderTree() {
  const roots = state.projects.map(p => ({
    key: 'p:' + p.id, label: p.name, kind: 'project', project: p,
    dirPath: p.root, children: new Map(), files: []
  }));
  const byId = new Map(roots.map(r => [r.project.id, r]));

  for (const d of state.dirs || []) {
    const root = byId.get(d.projectId);
    if (root && d.rel) ensureFolder(root, d.rel.split(/[\\/]/));
  }
  for (const f of state.files) {
    const root = byId.get(f.projectId);
    if (!root) continue;
    const parts = f.rel.split(/[\\/]/);
    ensureFolder(root, parts.slice(0, -1)).files.push(f);
  }
  roots.forEach(countFiles);
  return roots;
}

function buildCategoryTree() {
  const map = new Map();
  for (const c of state.categories) {
    map.set(c, { key: 'c:' + c, label: c, kind: 'category', children: new Map(), files: [] });
  }
  for (const f of state.files) {
    if (!map.has(f.category)) {
      map.set(f.category, { key: 'c:' + f.category, label: f.category, kind: 'category', children: new Map(), files: [] });
    }
    map.get(f.category).files.push(f);
  }
  const nodes = [...map.values()].filter(n => n.files.length);
  nodes.forEach(countFiles);
  return nodes;
}

// ---------- drawing the left panel ----------
function makeFileRow(f, depth) {
  const row = el('div', 'row' + (f.path === selectedPath ? ' sel' : ''));
  row.dataset.path = f.path;
  row.style.paddingLeft = (8 + depth * 16) + 'px';
  const dot = el('span', 'dot');
  dot.style.background = catColor(f.category);
  row.append(dot, el('span', 'label', f.name));
  row.title = f.path;

  row.draggable = true;
  row.addEventListener('dragstart', (e) => {
    dragPath = f.path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', f.name);
  });
  row.addEventListener('dragend', () => { dragPath = null; });
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showFileMenu(e, f);
  });

  row.addEventListener('click', () => selectFile(f.path));
  row.addEventListener('dblclick', () => window.api.openFile(f.path));
  return row;
}

function renderChildren(node, container, depth) {
  const folders = [...node.children.values()].sort((a, b) => byName(a.label, b.label));
  for (const c of folders) container.appendChild(makeNode(c, depth));

  const files = node.files.slice().sort((a, b) => byName(a.name, b.name));
  for (const f of files.slice(0, MAX_FILES_SHOWN)) container.appendChild(makeFileRow(f, depth));
  if (files.length > MAX_FILES_SHOWN) {
    const more = el('div', 'empty', `...and ${files.length - MAX_FILES_SHOWN} more files here (use search to find them)`);
    more.style.paddingLeft = (8 + depth * 16) + 'px';
    container.appendChild(more);
  }
}

function makeNode(node, depth) {
  const wrap = el('div');
  const row = el('div', 'row' + (node.kind === 'project' ? ' rootRow' : ''));
  row.style.paddingLeft = (8 + depth * 16) + 'px';

  const arrow = el('span', 'arrow');
  row.appendChild(arrow);

  if (node.kind === 'category') {
    const d = el('span', 'dot');
    d.style.background = catColor(node.label);
    row.appendChild(d);
  } else {
    row.appendChild(el('span', '', '📁'));
  }

  const missing = node.project && !node.project.available ? '  (folder not found)' : '';
  row.appendChild(el('span', 'label', node.label + missing));
  if (node.kind === 'project' && node.dirPath) {
    // show which folder it lives in, so two saved folders are easy to tell apart
    const parts = String(node.dirPath).split(/[\\/]/).filter(Boolean);
    if (parts.length > 1) row.appendChild(el('span', 'sub', '· ' + parts[parts.length - 2]));
    row.title = node.dirPath;
  }
  row.appendChild(el('span', 'count', String(node.count)));

  const addB = el('span', 'rm', '＋');
  addB.title = 'Add all files in here to the basket';
  addB.addEventListener('click', (e) => {
    e.stopPropagation();
    addNodeToBasket(node);
  });
  row.appendChild(addB);

  if (node.kind === 'project') {
    const rm = el('span', 'rm', '✕');
    rm.title = 'Remove this folder from the list (your files are not deleted)';
    rm.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Remove "' + node.label + '" from the list?\nYour files are not deleted.')) {
        applyState(await window.api.removeFolder(node.project.id));
      }
    });
    row.appendChild(rm);
  }

  // real folders (not categories): drop target + right-click menu
  if (node.dirPath) {
    row.addEventListener('dragover', (e) => {
      if (!dragPath) return;
      e.preventDefault();
      row.classList.add('dropok');
    });
    row.addEventListener('dragleave', () => row.classList.remove('dropok'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('dropok');
      if (!dragPath) return;
      const p = dragPath;
      dragPath = null;
      moveFilesTo([p], node.dirPath);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showFolderMenu(e, node);
    });
  }

  const kids = el('div');
  wrap.append(row, kids);

  const fill = () => {
    const open = expanded.has(node.key);
    arrow.textContent = open ? '▾' : '▸';
    kids.innerHTML = '';
    if (open) renderChildren(node, kids, depth + 1);
  };
  row.addEventListener('click', () => {
    if (expanded.has(node.key)) expanded.delete(node.key);
    else expanded.add(node.key);
    saveExp();
    fill();
  });
  fill();
  return wrap;
}

function renderLeft() {
  const tree = $('tree');
  tree.innerHTML = '';
  if (!state.projects.length) {
    tree.appendChild(el('div', 'empty', 'No folders yet. Click "+ Add Folder" to start.'));
    return;
  }
  const roots = view === 'folders' ? buildFolderTree() : buildCategoryTree();
  for (const n of roots) tree.appendChild(makeNode(n, 0));
}

async function runSearch() {
  const q = $('search').value.trim();
  if (!q) { renderLeft(); return; }

  const mySeq = ++seq;
  const res = await window.api.search(q);
  if (mySeq !== seq) return;

  const tree = $('tree');
  tree.innerHTML = '';
  const shown = res.rows.length < res.total ? ` (showing first ${res.rows.length})` : '';
  tree.appendChild(el('div', 'empty', `${res.total} match${res.total === 1 ? '' : 'es'}${shown}`));

  if (res.rows.length) {
    const bar = el('div', 'empty');
    const ab = el('button', '', 'Add the ' + res.rows.length + ' shown to the basket');
    ab.addEventListener('click', () => addPathsToBasket(res.rows.map(r => r.path)));
    bar.appendChild(ab);
    tree.appendChild(bar);
  }

  for (const r of res.rows) {
    const f = fileByPath.get(r.path);
    if (!f) continue;
    const item = el('div', 'hit' + (f.path === selectedPath ? ' sel' : ''));
    item.dataset.path = f.path;

    const top = el('div', 'hitname');
    const dot = el('span', 'dot');
    dot.style.background = catColor(f.category);
    top.append(dot, el('span', 'label', f.name));
    item.appendChild(top);

    const dir = f.rel.slice(0, Math.max(0, f.rel.length - f.name.length - 1)).replace(/\\/g, ' / ');
    item.appendChild(el('div', 'p', projectName(f.projectId) + (dir ? ' / ' + dir : '')));
    if (r.snippet) item.appendChild(el('div', 's', r.snippet));

    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      dragPath = f.path;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', f.name);
    });
    item.addEventListener('dragend', () => { dragPath = null; });
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showFileMenu(e, f);
    });
    item.addEventListener('click', () => selectFile(f.path));
    item.addEventListener('dblclick', () => window.api.openFile(f.path));
    tree.appendChild(item);
  }
}

function updateLeft() {
  if ($('search').value.trim()) runSearch();
  else renderLeft();
}

function markSelected() {
  document.querySelectorAll('.sel').forEach(e => e.classList.remove('sel'));
  document.querySelectorAll('[data-path]').forEach(e => {
    if (e.dataset.path === selectedPath) e.classList.add('sel');
  });
}

// ---------- right panel ----------
function fillHeader(f) {
  $('fileName').textContent = f.name;
  $('filePath').textContent = f.path;
  $('sumBtn').disabled = summarizing || !SUMMARIZABLE.includes(f.ext);

  const sel = $('catSel');
  sel.innerHTML = '';
  const auto = el('option', '', 'Auto: ' + f.auto);
  auto.value = '__auto__';
  sel.appendChild(auto);
  const names = new Set(state.categories);
  names.add(f.category);
  for (const c of names) {
    const o = el('option', '', c);
    o.value = c;
    sel.appendChild(o);
  }
  sel.value = f.overridden ? f.category : '__auto__';
}

async function showPreview(f) {
  const box = $('preview');
  box.innerHTML = '';
  const token = ++previewSeq;

  if (f.ext === '.pdf') {
    const fr = document.createElement('iframe');
    fr.src = fileUrl(f.path) + '#view=FitH';
    box.appendChild(fr);
  } else if (IMAGE_EXTS.includes(f.ext)) {
    const img = document.createElement('img');
    img.src = fileUrl(f.path);
    box.appendChild(img);
  } else if (TEXT_EXTS.includes(f.ext)) {
    if (f.ext === '.docx' || f.ext === '.xlsx') {
      box.appendChild(el('div', 'note', 'Text preview only (layout, images and formatting are not shown). Use Open to see the original.'));
    }
    const pre = el('pre', '', 'Loading...');
    box.appendChild(pre);
    const t = await window.api.previewText(f.path);
    if (token !== previewSeq) return;
    pre.textContent = t || 'No readable text found in this file.';
  } else {
    box.appendChild(el('div', 'nopreview',
      'No preview for this file type (' + (f.ext || 'no extension') + '). Use Open to view it in its own program.'));
  }
}

function selectFile(path) {
  const f = fileByPath.get(path);
  if (!f) return;
  selectedPath = path;
  markSelected();
  $('emptyMsg').hidden = true;
  $('fileView').hidden = false;
  fillHeader(f);
  updateBasketButtons();
  if (!summarizing) $('sumBox').hidden = true;
  showPreview(f);
}

// ---------- state from the main process ----------
function applyState(data) {
  if (!data) return;
  state = data;
  fileByPath = new Map(data.files.map(f => [f.path, f]));

  const firstRun = !savedExp && !knownProjects.size;
  let first = true;
  for (const p of data.projects) {
    if (!seenProjects.has(p.id)) {
      seenProjects.add(p.id);
      if (!knownProjects.has(p.id)) {
        knownProjects.add(p.id);
        // a folder you just added opens; on the very first start only the first folder opens
        if (!firstRun || first) expanded.add('p:' + p.id);
      }
    }
    first = false;
  }
  saveExp();

  if (selectedPath) {
    const f = fileByPath.get(selectedPath);
    if (f) {
      fillHeader(f);
    } else {
      selectedPath = null;
      $('fileView').hidden = true;
      $('emptyMsg').hidden = false;
    }
  }
  updateLeft();
}

// ---------- buttons ----------
$('addFolder').addEventListener('click', async () => {
  applyState(await window.api.addFolder());
});

$('refresh').addEventListener('click', async () => {
  $('indexStatus').textContent = 'Scanning folders...';
  applyState(await window.api.refresh());
});

$('editCats').addEventListener('click', () => window.api.openCategoriesFile());

document.querySelectorAll('#viewToggle button').forEach(b => {
  b.addEventListener('click', () => {
    view = b.dataset.v;
    document.querySelectorAll('#viewToggle button').forEach(x => x.classList.toggle('on', x === b));
    updateLeft();
  });
});

$('search').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(runSearch, 150);
});

$('openBtn').addEventListener('click', () => { if (selectedPath) window.api.openFile(selectedPath); });
$('showBtn').addEventListener('click', () => { if (selectedPath) window.api.showInFolder(selectedPath); });

$('catSel').addEventListener('change', async () => {
  const f = fileByPath.get(selectedPath);
  if (!f) return;
  const v = $('catSel').value;
  const r = await window.api.setCategory(f.path, v === '__auto__' ? null : v);
  if (!r) return;
  f.category = r.category;
  f.overridden = r.overridden;
  updateLeft();
});

$('sumBtn').addEventListener('click', async () => {
  const f = fileByPath.get(selectedPath);
  if (!f || summarizing) return;
  summarizing = true;
  $('sumBtn').disabled = true;
  $('sumBox').hidden = false;
  $('sumTitle').textContent = 'Summary: ' + f.name;
  $('sumText').textContent = '';
  $('sumStatus').textContent = 'Starting (the first summary loads the model, so it may take a few extra seconds)...';

  const r = await window.api.summarize(f.path);
  summarizing = false;
  const cur = fileByPath.get(selectedPath);
  $('sumBtn').disabled = !cur || !SUMMARIZABLE.includes(cur.ext);

  if (!r.ok) {
    $('sumStatus').textContent = '';
    $('sumText').textContent = r.error;
    return;
  }
  $('sumStatus').textContent = r.truncated
    ? 'Done. This file is very long, so only the first part was summarized.'
    : 'Done.';
});

$('sumClose').addEventListener('click', () => { if (!summarizing) $('sumBox').hidden = true; });

window.api.onSummaryProgress((m) => { $('sumStatus').textContent = m; });
window.api.onSummaryToken((t) => { $('sumText').textContent += t; });

window.api.onProgress(({ done, total }) => {
  const s = $('indexStatus');
  if (total === 0) {
    s.textContent = '';
  } else if (done < total) {
    s.textContent = `Reading contents: ${done} / ${total} files...`;
  } else {
    s.textContent = `Contents ready: ${total} files indexed.`;
    if ($('search').value.trim()) runSearch();
  }
});

// ---------- start (after organize-ui.js and fileops-ui.js have also loaded) ----------
window.addEventListener('load', () => window.api.refresh().then(applyState));
