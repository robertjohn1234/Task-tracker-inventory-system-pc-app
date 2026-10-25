const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');

const MAX_PATH_LEN = 250;
const SAME_TIME_MS = 2000;

function sanitize(name) {
  const s = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/, '').trim();
  return s || '_';
}

function isInside(p, root) {
  if (!root) return false;
  const rel = path.relative(root, p);
  return !!rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function sameFile(a, b) {
  return a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < SAME_TIME_MS;
}

// Picks a free file name in dir. Never overwrites.
function pickTarget(dir, name, st, claimed) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const first = path.join(dir, name);
  let candidate = first;
  let n = 2;
  for (;;) {
    const key = candidate.toLowerCase();
    const c = claimed.get(key);
    if (c) {
      if (sameFile(c, st)) return { to: candidate, status: 'duplicate' };
    } else if (!fs.existsSync(candidate)) {
      return { to: candidate, status: candidate === first ? 'ok' : 'rename' };
    } else {
      try {
        if (sameFile(fs.statSync(candidate), st)) return { to: candidate, status: 'duplicate' };
      } catch (e) {}
    }
    candidate = path.join(dir, `${base} (${n++})${ext}`);
  }
}

function registerOrganizer(ipcMain, ctx) {
  const logFile = () => path.join(ctx.userDataDir(), 'organize-log.json');

  function loadLog() {
    try {
      const l = JSON.parse(fs.readFileSync(logFile(), 'utf8'));
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  function saveLog(l) {
    try { fs.writeFileSync(logFile(), JSON.stringify(l.slice(-30), null, 1)); } catch (e) {}
  }
  function projectName(id) {
    const p = ctx.getConfig().projects.find(x => x.id === id);
    return p ? p.name : 'Project';
  }

  // Works out where every file would go. Changes nothing on disk.
  function buildPlan(paths) {
    const cfg = ctx.getConfig();
    const dest = cfg.organize.destRoot;
    const byPath = new Map(ctx.getFiles().map(f => [f.path, f]));
    const claimed = new Map();
    const items = [];

    for (const p of paths) {
      const f = byPath.get(p);
      if (!f) continue;
      const item = { from: f.path, name: f.name, category: f.category, to: '', toRel: '', status: 'ok' };
      items.push(item);

      let st;
      try { st = fs.statSync(f.path); } catch (e) { item.status = 'missing'; continue; }
      if (isInside(f.path, dest)) { item.status = 'inside'; continue; }

      const parts = [dest];
      if (cfg.organize.structure === 'project-category') parts.push(sanitize(projectName(f.projectId)));
      parts.push(sanitize(f.category));
      const dir = path.join(...parts);

      const r = pickTarget(dir, f.name, st, claimed);
      item.to = r.to;
      item.toRel = path.relative(dest, r.to);
      item.status = r.status;
      if (item.status !== 'duplicate' && r.to.length > MAX_PATH_LEN) item.status = 'toolong';
      if (item.status === 'ok' || item.status === 'rename') claimed.set(r.to.toLowerCase(), st);
    }
    return items;
  }

  // Copies each file, checks the copy, and (Move mode only) sends the original to the Recycle Bin.
  async function runPlan(items, mode) {
    const done = [];
    const errors = [];
    const finished = [];
    for (const it of items) {
      if (it.status === 'duplicate' || it.status === 'inside') { finished.push(it.from); continue; }
      if (it.status !== 'ok' && it.status !== 'rename') continue;
      try {
        const st = fs.statSync(it.from);
        fs.mkdirSync(path.dirname(it.to), { recursive: true });
        fs.copyFileSync(it.from, it.to, fs.constants.COPYFILE_EXCL);
        try { fs.utimesSync(it.to, st.atime, st.mtime); } catch (e) {}
        if (fs.statSync(it.to).size !== st.size) {
          try { fs.unlinkSync(it.to); } catch (e) {}
          throw new Error('the copy did not match the original, so it was discarded');
        }
        let removedOriginal = false;
        if (mode === 'move') {
          try { await shell.trashItem(it.from); removedOriginal = true; } catch (e) {}
        }
        done.push({ from: it.from, to: it.to, size: st.size, category: it.category, removedOriginal });
        finished.push(it.from);
      } catch (e) {
        errors.push(`${it.name}: ${e.message}`);
      }
    }
    return { done, errors, finished };
  }

  ipcMain.handle('organize-settings', () => ctx.getConfig().organize);

  ipcMain.handle('organize-set', (e, patch) => {
    const cfg = ctx.getConfig();
    if (patch && (patch.structure === 'category' || patch.structure === 'project-category')) cfg.organize.structure = patch.structure;
    if (patch && (patch.mode === 'copy' || patch.mode === 'move')) cfg.organize.mode = patch.mode;
    ctx.saveConfig();
    return cfg.organize;
  });

  ipcMain.handle('choose-dest', async () => {
    const cfg = ctx.getConfig();
    const r = await dialog.showOpenDialog(ctx.getWindow(), { properties: ['openDirectory', 'createDirectory'] });
    if (!r.canceled && r.filePaths.length) {
      cfg.organize.destRoot = r.filePaths[0];
      ctx.saveConfig();
    }
    return cfg.organize;
  });

  ipcMain.handle('organize-preview', (e, paths) => {
    if (!ctx.getConfig().organize.destRoot) return { error: 'Choose a destination folder first.' };
    return { items: buildPlan(paths) };
  });

  ipcMain.handle('organize-run', async (e, paths) => {
    const cfg = ctx.getConfig();
    const dest = cfg.organize.destRoot;
    if (!dest) return { ok: false, error: 'Choose a destination folder first.' };

    const plan = buildPlan(paths);
    const skipped = plan.filter(i => i.status !== 'ok' && i.status !== 'rename').length;
    const mode = cfg.organize.mode;
    const res = await runPlan(plan, mode);

    if (res.done.length) {
      for (const d of res.done) {
        cfg.overrides[d.to] = d.category;          // keep the category you saw
        if (d.removedOriginal) delete cfg.overrides[d.from];
      }
      const log = loadLog();
      log.push({ id: Date.now(), time: new Date().toISOString(), mode, items: res.done });
      saveLog(log);

      // show the organized folder in the tree (once)
      const covered = cfg.projects.some(p =>
        p.root.toLowerCase() === dest.toLowerCase() || isInside(dest, p.root));
      if (!covered) {
        cfg.projects.push({ id: Date.now().toString(36), name: path.basename(dest) || dest, root: dest });
      }
      ctx.saveConfig();
    }

    const data = ctx.refreshAll(e.sender);
    return {
      ok: true,
      mode,
      copied: res.done.length,
      skipped,
      notRemoved: mode === 'move' ? res.done.filter(d => !d.removedOriginal).length : 0,
      errors: res.errors,
      finished: res.finished,
      data
    };
  });

  ipcMain.handle('organize-last', () => {
    const log = loadLog();
    const b = log[log.length - 1];
    return b ? { time: b.time, mode: b.mode, count: b.items.length } : null;
  });

  ipcMain.handle('organize-undo', async (e) => {
    const cfg = ctx.getConfig();
    const log = loadLog();
    const batch = log.pop();
    if (!batch) return { ok: false, error: 'Nothing to undo.' };

    let restored = 0;
    const problems = [];
    const remaining = [];

    for (const it of batch.items) {
      const label = path.basename(it.to);
      try {
        if (!fs.existsSync(it.to)) { problems.push(`${label}: no longer in the organized folder`); continue; }
        const st = fs.statSync(it.to);
        if (st.size !== it.size) {
          problems.push(`${label}: was changed after copying, left in place`);
          remaining.push(it);
          continue;
        }
        if (it.removedOriginal) {
          if (fs.existsSync(it.from)) {
            problems.push(`${label}: the original location already has a file, left in place`);
            remaining.push(it);
            continue;
          }
          fs.mkdirSync(path.dirname(it.from), { recursive: true });
          fs.copyFileSync(it.to, it.from, fs.constants.COPYFILE_EXCL);
          try { fs.utimesSync(it.from, st.atime, st.mtime); } catch (e2) {}
        }
        await shell.trashItem(it.to);   // goes to the Recycle Bin
        delete cfg.overrides[it.to];
        restored++;
      } catch (err) {
        problems.push(`${label}: ${err.message}`);
        remaining.push(it);
      }
    }

    if (remaining.length) { batch.items = remaining; log.push(batch); }
    saveLog(log);
    ctx.saveConfig();
    const data = ctx.refreshAll(e.sender);
    return { ok: true, restored, problems, data };
  });
}

module.exports = { registerOrganizer };
