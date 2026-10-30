const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { scanTree } = require('./files/scanner');
const { extractText, SUPPORTED } = require('./files/extractor');
const { registerSummarize } = require('./files/summarizer');
const { loadRules, classify, rulesFilePath } = require('./files/categories');
const { registerOrganizer } = require('./files/organizer');
const { registerFileOps } = require('./files/fileops');
const { registerPreviews } = require('./files/previews');
const { createPool } = require('./files/extractPool');
const tasks = require('./tasks/tasks');
const { registerTasks } = tasks;
const { registerAppearance } = require('./appearance/appearance');
const { registerInventory } = require('./inventory/inventory');
const { registerAiSwitch } = require('./ai/aiswitch');
const { registerNotepad } = require('./notes/notepad');
const { registerPunch } = require('./punch/punch');

const TEXT_EXTS = ['.txt', '.csv', '.md', '.log'];
const CACHE_CHARS = 100000; // text kept per file for searching
let pool = null;
// the extraction pool is created the first time it is needed
function getPool() {
  if (!pool) pool = createPool(2);
  return pool;
}

let win = null;
let config = {
  projects: [],
  overrides: {},
  organize: { destRoot: '', structure: 'category', mode: 'copy' }
};
let allFiles = [];     // every file from every saved folder
let contentMap = {};   // path -> lowercase text
let runId = 0;

// ---------- saved settings (folders + manual categories + organize options) ----------
function configPath() { return path.join(app.getPath('userData'), 'config.json'); }

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    config = {
      projects: c.projects || [],
      overrides: c.overrides || {},
      organize: Object.assign({ destRoot: '', structure: 'category', mode: 'copy' }, c.organize || {})
    };
  } catch (e) {}
}
function saveConfig() {
  try { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)); } catch (e) {}
}

// ---------- content cache ----------
function cachePath() { return path.join(app.getPath('userData'), 'content-cache.json'); }
function loadCache() {
  try { return JSON.parse(fs.readFileSync(cachePath(), 'utf8')); } catch (e) { return {}; }
}
function saveCache(c) {
  try { fs.writeFileSync(cachePath(), JSON.stringify(c)); } catch (e) {}
}

const yieldNow = () => new Promise(r => setImmediate(r));

async function indexContents(sender) {
  const myRun = ++runId;
  const targets = allFiles.filter(f => SUPPORTED.includes(f.ext));
  const cache = loadCache();
  let done = 0, next = 0, unsaved = 0;

  const report = () => {
    if (!sender.isDestroyed()) sender.send('index-progress', { done, total: targets.length });
  };
  report();

  async function lane() {
    while (myRun === runId) {
      const i = next++;
      if (i >= targets.length) return;
      const f = targets[i];
      const c = cache[f.path];
      let text;
      if (c && c.mtime === f.modified && c.size === f.size) {
        text = String(c.text || '').slice(0, CACHE_CHARS);
      } else {
        text = (await getPool().extract(f.path, f.ext, f.size)).slice(0, CACHE_CHARS);
        cache[f.path] = { mtime: f.modified, size: f.size, text };
        unsaved++;
      }
      if (myRun !== runId) return;
      contentMap[f.path] = text.toLowerCase();
      done++;
      if (done % 5 === 0 || done === targets.length) report();
      if (done % 25 === 0) await yieldNow(); // keep the window responsive
      if (unsaved >= 400) { unsaved = 0; saveCache(cache); }
    }
  }

  await Promise.all([lane(), lane()]);
  if (unsaved > 0) saveCache(cache);
  report();
}

// ---------- scan all saved folders and classify ----------
function rebuildFileList() {
  const rules = loadRules(app.getPath('userData'));
  const files = [];
  const projects = [];
  const dirs = [];

  for (const p of config.projects) {
    const available = fs.existsSync(p.root);
    const scanned = available ? scanTree(p.root) : { files: [], dirs: [] };

    for (const d of scanned.dirs) {
      dirs.push({ projectId: p.id, rel: path.relative(p.root, d) });
    }
    for (const f of scanned.files) {
      const rel = path.relative(p.root, f.path);
      const auto = classify(rel, f.ext, rules);
      const manual = config.overrides[f.path];
      const category = manual || auto;
      files.push({
        projectId: p.id, rel, name: f.name, ext: f.ext, size: f.size,
        modified: f.modified, path: f.path, category, auto,
        overridden: !!manual,
        lower: (rel + ' ' + category).toLowerCase()
      });
    }
    projects.push({ id: p.id, name: p.name, root: p.root, available, count: scanned.files.length });
  }

  allFiles = files;
  const categories = [...new Set([...rules.map(r => r.name), 'Other'])];
  return {
    projects,
    categories,
    dirs,
    files: files.map(({ lower, ...rest }) => rest)
  };
}

function refreshAll(sender) {
  const data = rebuildFileList();
  contentMap = {};
  indexContents(sender).catch(console.error);
  return data;
}

function known(p) {
  return allFiles.some(f => f.path === p);
}

// ---------- IPC ----------
ipcMain.handle('refresh', (e) => refreshAll(e.sender));

ipcMain.handle('add-folder', async (e) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  const root = r.filePaths[0];
  if (!config.projects.some(p => p.root.toLowerCase() === root.toLowerCase())) {
    config.projects.push({ id: Date.now().toString(36), name: path.basename(root) || root, root });
    saveConfig();
  }
  return refreshAll(e.sender);
});

ipcMain.handle('remove-folder', (e, id) => {
  config.projects = config.projects.filter(p => p.id !== id);
  saveConfig();
  return refreshAll(e.sender);
});

ipcMain.handle('search', (e, query) => {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const rows = [];
  let total = 0;

  for (const f of allFiles) {
    let snippet = '';
    if (words.length) {
      const content = contentMap[f.path] || '';
      let ok = true;
      for (const w of words) {
        if (!f.lower.includes(w) && !content.includes(w)) { ok = false; break; }
      }
      if (!ok) continue;
      const w = words.find(x => content.includes(x));
      if (w) {
        const i = content.indexOf(w);
        snippet = '…' + content.slice(Math.max(0, i - 60), i + 100) + '…';
      }
    }
    total++;
    if (rows.length < 200) rows.push({ path: f.path, snippet });
  }
  return { total, rows };
});

ipcMain.handle('set-category', (e, filePath, category) => {
  const f = allFiles.find(x => x.path === filePath);
  if (!f) return null;
  if (category) config.overrides[filePath] = category;
  else delete config.overrides[filePath];
  saveConfig();
  f.category = category || f.auto;
  f.overridden = !!category;
  f.lower = (f.rel + ' ' + f.category).toLowerCase();
  return { category: f.category, overridden: f.overridden };
});

ipcMain.handle('open-file', (e, p) => { if (known(p)) return shell.openPath(p); });
ipcMain.handle('show-in-folder', (e, p) => { if (known(p)) shell.showItemInFolder(p); });

ipcMain.handle('open-categories-file', () => {
  const dir = app.getPath('userData');
  loadRules(dir); // makes sure the file exists
  return shell.openPath(rulesFilePath(dir));
});

ipcMain.handle('preview-text', async (e, filePath) => {
  const f = allFiles.find(x => x.path === filePath);
  if (!f) return '';
  try {
    if (SUPPORTED.includes(f.ext)) {
      const t = await extractText(f.path, f.ext, f.size, true);
      return t.slice(0, 20000);
    }
    if (TEXT_EXTS.includes(f.ext)) {
      const fd = fs.openSync(f.path, 'r');
      const buf = Buffer.alloc(Math.min(f.size, 40000));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      return buf.toString('utf8').slice(0, 20000);
    }
  } catch (err) {}
  return '';
});

registerSummarize(ipcMain, () => allFiles);

const shared = {
  getFiles: () => allFiles,
  getConfig: () => config,
  saveConfig,
  refreshAll,
  getWindow: () => win,
  userDataDir: () => app.getPath('userData')
};
registerOrganizer(ipcMain, shared);
registerFileOps(ipcMain, shared);
registerPreviews(ipcMain, shared);
registerTasks(ipcMain, shared);
registerAppearance(ipcMain, shared);
registerInventory(ipcMain, shared);
registerAiSwitch(ipcMain, shared);
registerNotepad(ipcMain, shared);
registerPunch(ipcMain, shared);

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 850,
    minWidth: 600,
    minHeight: 450,
    title: 'Work Helper',
    icon: path.join(__dirname, '../../assets/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  if (tasks.start) tasks.start();
});
app.on('before-quit', () => { if (pool) pool.close(); });
app.on('window-all-closed', () => app.quit());
