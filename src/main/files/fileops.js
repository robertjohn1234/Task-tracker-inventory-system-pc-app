const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');

const MAX_PATH_LEN = 250;
const SAME_TIME_MS = 2000;
const BAD_NAME = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function samePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function isInside(p, root) {
  if (!root) return false;
  const rel = path.relative(root, p);
  return !!rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function sameFile(a, b) {
  return a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < SAME_TIME_MS;
}

function friendly(err) {
  if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
    return 'the file is in use or access is denied (close it in other programs and try again)';
  }
  return err.message;
}

// Finds a free name in dir. Never overwrites an existing file.
function pickTarget(dir, name, st) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const first = path.join(dir, name);
  let candidate = first;
  let n = 2;
  for (;;) {
    if (!fs.existsSync(candidate)) {
      return { to: candidate, status: candidate === first ? 'ok' : 'rename' };
    }
    try {
      if (sameFile(fs.statSync(candidate), st)) return { to: candidate, status: 'duplicate' };
    } catch (e) {}
    candidate = path.join(dir, `${base} (${n++})${ext}`);
  }
}

function registerFileOps(ipcMain, ctx) {
  const logFile = () => path.join(ctx.userDataDir(), 'move-log.json');

  function loadLog() {
    try {
      const l = JSON.parse(fs.readFileSync(logFile(), 'utf8'));
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  function saveLog(l) {
    try { fs.writeFileSync(logFile(), JSON.stringify(l.slice(-30), null, 1)); } catch (e) {}
  }

  function roots() { return ctx.getConfig().projects.map(p => p.root); }
  function insideProjects(p) { return roots().some(r => samePath(p, r) || isInside(p, r)); }

  // ---------- create folder ----------
  ipcMain.handle('folder-create', (e, parentDir, name) => {
    try {
      name = String(name || '').trim();
      if (!name) return { ok: false, error: 'Please type a folder name.' };
      if (BAD_NAME.test(name) || name === '.' || name === '..' || RESERVED.test(name) || /[. ]$/.test(name)) {
        return { ok: false, error: 'That name is not allowed in Windows (avoid \\ / : * ? " < > | and a trailing dot or space).' };
      }
      if (!insideProjects(parentDir)) {
        return { ok: false, error: 'That location is not inside one of your added folders.' };
      }
      if (!fs.statSync(parentDir).isDirectory()) return { ok: false, error: 'The parent folder was not found.' };

      const target = path.join(parentDir, name);
      if (target.length > MAX_PATH_LEN) return { ok: false, error: 'The path would be too long.' };
      if (fs.existsSync(target)) return { ok: false, error: 'A file or folder with that name already exists here.' };

      fs.mkdirSync(target);
      return { ok: true, path: target, data: ctx.refreshAll(e.sender) };
    } catch (err) {
      return { ok: false, error: 'Could not create the folder: ' + err.message };
    }
  });

  // ---------- delete folder (to the Recycle Bin) ----------
  ipcMain.handle('folder-delete', async (e, dir) => {
    try {
      const cfg = ctx.getConfig();
      if (!insideProjects(dir) || roots().some(r => samePath(dir, r))) {
        return { ok: false, error: 'Only folders inside your added folders can be deleted (not the top folder itself).' };
      }
      let isDir = false;
      try { isDir = fs.statSync(dir).isDirectory(); } catch (e2) {}
      if (!isDir) return { ok: false, error: 'The folder was not found.' };

      const dest = cfg.organize && cfg.organize.destRoot;
      if (roots().some(r => isInside(r, dir)) || (dest && (samePath(dest, dir) || isInside(dest, dir)))) {
        return { ok: false, error: 'This folder contains another added folder or your organize destination, so it is protected.' };
      }

      await shell.trashItem(dir);
      return { ok: true, data: ctx.refreshAll(e.sender) };
    } catch (err) {
      return { ok: false, error: 'Could not delete the folder (nothing was deleted): ' + err.message };
    }
  });

  // ---------- rename / move a whole folder ----------
  function folderProblem(dir) {
    // returns an error text if this folder may not be renamed or moved, else ''
    if (!dir || !insideProjects(dir) || roots().some(r => samePath(dir, r))) {
      return 'Only folders inside your added folders can be renamed or moved (not the top folder itself).';
    }
    let isDir = false;
    try { isDir = fs.statSync(dir).isDirectory(); } catch (e) {}
    if (!isDir) return 'The folder was not found.';
    const dest = ctx.getConfig().organize && ctx.getConfig().organize.destRoot;
    if (roots().some(r => isInside(r, dir)) || (dest && (samePath(dest, dir) || isInside(dest, dir)))) {
      return 'This folder contains another added folder or your organize destination, so it is protected.';
    }
    return '';
  }

  // Every known file inside dir, with where it will be after the folder becomes newDir.
  function fileMovesFor(dir, newDir) {
    return ctx.getFiles()
      .filter(f => isInside(f.path, dir))
      .map(f => ({ from: f.path, to: path.join(newDir, path.relative(dir, f.path)) }));
  }

  function finishFolderMove(e, dir, newDir) {
    const cfg = ctx.getConfig();
    const moves = fileMovesFor(dir, newDir);
    for (const m of moves) {
      if (cfg.overrides[m.from]) {
        cfg.overrides[m.to] = cfg.overrides[m.from];
        delete cfg.overrides[m.from];
      }
    }
    ctx.saveConfig();
    return { ok: true, newPath: newDir, moves, data: ctx.refreshAll(e.sender) };
  }

  ipcMain.handle('folder-rename', (e, dir, newName) => {
    try {
      const bad = folderProblem(dir);
      if (bad) return { ok: false, error: bad };

      newName = String(newName || '').trim();
      if (!newName) return { ok: false, error: 'Please type a new name.' };
      if (BAD_NAME.test(newName) || newName === '.' || newName === '..' || RESERVED.test(newName) || /[. ]$/.test(newName)) {
        return { ok: false, error: 'That name is not allowed in Windows (avoid \\ / : * ? " < > | and a trailing dot or space).' };
      }
      const target = path.join(path.dirname(dir), newName);
      if (target === dir) return { ok: false, error: 'That is already the folder name.' };
      if (target.length > MAX_PATH_LEN) return { ok: false, error: 'The path would be too long.' };
      // a name that only changes capital letters is fine; anything else must be free
      if (!samePath(target, dir) && fs.existsSync(target)) {
        return { ok: false, error: 'A file or folder with that name already exists here.' };
      }

      try {
        fs.renameSync(dir, target);
      } catch (err) {
        return { ok: false, error: 'Could not rename the folder (nothing was changed): ' + friendly(err) };
      }
      return finishFolderMove(e, dir, target);
    } catch (err) {
      return { ok: false, error: 'Could not rename the folder: ' + err.message };
    }
  });

  // destDir is optional: without it the user picks the destination in a dialog.
  ipcMain.handle('folder-move', async (e, dir, destDir) => {
    try {
      const bad = folderProblem(dir);
      if (bad) return { ok: false, error: bad };

      if (!destDir) {
        const r = await dialog.showOpenDialog(ctx.getWindow(), {
          title: 'Move the folder "' + path.basename(dir) + '" into which folder?',
          defaultPath: path.dirname(dir),
          properties: ['openDirectory', 'createDirectory']
        });
        if (r.canceled || !r.filePaths.length) return { canceled: true };
        destDir = r.filePaths[0];
      }

      let isDir = false;
      try { isDir = fs.statSync(destDir).isDirectory(); } catch (e2) {}
      if (!isDir) return { ok: false, error: 'The destination folder was not found.' };
      if (!insideProjects(destDir)) {
        return { ok: false, error: 'Choose a destination inside one of your added folders.' };
      }
      if (samePath(destDir, dir) || isInside(destDir, dir)) {
        return { ok: false, error: 'A folder cannot be moved into itself or into one of its own subfolders.' };
      }
      if (samePath(path.dirname(dir), destDir)) {
        return { ok: false, error: 'That folder is already in the chosen location.' };
      }

      // never overwrite or merge: pick a free name
      const base = path.basename(dir);
      let target = path.join(destDir, base);
      for (let n = 2; fs.existsSync(target); n++) target = path.join(destDir, `${base} (${n})`);
      if (target.length > MAX_PATH_LEN) return { ok: false, error: 'The new path would be too long.' };

      try {
        fs.renameSync(dir, target);
      } catch (err) {
        if (err.code === 'EXDEV') {
          return { ok: false, error: 'That location is on a different drive. Folders can only be moved within the same drive (nothing was changed).' };
        }
        return { ok: false, error: 'Could not move the folder (nothing was changed): ' + friendly(err) };
      }
      return finishFolderMove(e, dir, target);
    } catch (err) {
      return { ok: false, error: 'Could not move the folder: ' + err.message };
    }
  });

  // ---------- move files ----------
  async function movePaths(paths, destDir) {
    const moves = [];
    const errors = [];
    let skipped = 0;

    let isDir = false;
    try { isDir = fs.statSync(destDir).isDirectory(); } catch (e) {}
    if (!isDir) return { ok: false, error: 'The destination folder was not found.' };

    const known = new Set(ctx.getFiles().map(f => f.path));

    for (const from of paths) {
      const name = path.basename(from);
      if (!known.has(from)) { skipped++; continue; }
      try {
        const st = fs.statSync(from);
        if (samePath(path.dirname(from), destDir)) { skipped++; continue; }

        const pick = pickTarget(destDir, name, st);
        if (pick.status === 'duplicate') { skipped++; continue; }
        if (pick.to.length > MAX_PATH_LEN) {
          errors.push(`${name}: the new path would be too long`);
          continue;
        }

        let via = 'rename';
        try {
          fs.renameSync(from, pick.to);
        } catch (err) {
          if (err.code !== 'EXDEV') throw err;
          // different drive: copy, check the copy, then send the original to the Recycle Bin
          via = 'copy';
          fs.copyFileSync(from, pick.to, fs.constants.COPYFILE_EXCL);
          try { fs.utimesSync(pick.to, st.atime, st.mtime); } catch (e2) {}
          if (fs.statSync(pick.to).size !== st.size) {
            try { fs.unlinkSync(pick.to); } catch (e3) {}
            throw new Error('the copy did not match the original, nothing was moved');
          }
          try {
            await shell.trashItem(from);
          } catch (e4) {
            try { fs.unlinkSync(pick.to); } catch (e5) {}
            throw new Error('could not send the original to the Recycle Bin (network drive?), nothing was moved');
          }
        }
        moves.push({ from, to: pick.to, size: st.size, via });
      } catch (err) {
        errors.push(`${name}: ${friendly(err)}`);
      }
    }
    return { ok: true, moves, errors, skipped };
  }

  async function doMove(e, paths, destDir) {
    const cfg = ctx.getConfig();
    const res = await movePaths(paths, destDir);
    if (!res.ok) return res;

    if (res.moves.length) {
      for (const m of res.moves) {
        // a category you picked by hand follows the file
        if (cfg.overrides[m.from]) {
          cfg.overrides[m.to] = cfg.overrides[m.from];
          delete cfg.overrides[m.from];
        }
      }
      ctx.saveConfig();
      const log = loadLog();
      log.push({ id: Date.now(), time: new Date().toISOString(), destDir, items: res.moves });
      saveLog(log);
    }

    return {
      ok: true,
      moves: res.moves.map(m => ({ from: m.from, to: m.to })),
      skipped: res.skipped,
      errors: res.errors,
      data: ctx.refreshAll(e.sender)
    };
  }

  ipcMain.handle('files-move', (e, paths, destDir) => {
    if (!Array.isArray(paths) || !paths.length || !destDir) return { ok: false, error: 'Nothing to move.' };
    if (!insideProjects(destDir)) {
      return { ok: false, error: 'Drop files on a folder inside your added folders, or use "Move to…".' };
    }
    return doMove(e, paths, destDir);
  });

  ipcMain.handle('files-move-dialog', async (e, paths) => {
    if (!Array.isArray(paths) || !paths.length) return { ok: false, error: 'Nothing to move.' };
    const r = await dialog.showOpenDialog(ctx.getWindow(), {
      title: 'Move to which folder?',
      defaultPath: path.dirname(paths[0]),
      properties: ['openDirectory', 'createDirectory']
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    return doMove(e, paths, r.filePaths[0]);
  });

  ipcMain.handle('move-last', () => {
    const log = loadLog();
    const b = log[log.length - 1];
    return b ? { time: b.time, count: b.items.length } : null;
  });

  ipcMain.handle('move-undo', async (e) => {
    const cfg = ctx.getConfig();
    const log = loadLog();
    const batch = log.pop();
    if (!batch) return { ok: false, error: 'Nothing to undo.' };

    const moves = [];
    const problems = [];
    const remaining = [];

    for (const it of batch.items) {
      const label = path.basename(it.to);
      try {
        if (!fs.existsSync(it.to)) { problems.push(`${label}: no longer at the new location`); continue; }
        const st = fs.statSync(it.to);
        if (st.size !== it.size) {
          problems.push(`${label}: was changed after moving, left in place`);
          remaining.push(it);
          continue;
        }
        if (fs.existsSync(it.from)) {
          problems.push(`${label}: the original location already has a file, left in place`);
          remaining.push(it);
          continue;
        }
        fs.mkdirSync(path.dirname(it.from), { recursive: true });

        let renamed = false;
        if (it.via === 'rename') {
          try {
            fs.renameSync(it.to, it.from);
            renamed = true;
          } catch (err) {
            if (err.code !== 'EXDEV') throw err;
          }
        }
        if (!renamed) {
          fs.copyFileSync(it.to, it.from, fs.constants.COPYFILE_EXCL);
          try { fs.utimesSync(it.from, st.atime, st.mtime); } catch (e2) {}
          await shell.trashItem(it.to);
        }

        if (cfg.overrides[it.to]) {
          cfg.overrides[it.from] = cfg.overrides[it.to];
          delete cfg.overrides[it.to];
        }
        moves.push({ from: it.to, to: it.from });
      } catch (err) {
        problems.push(`${label}: ${friendly(err)}`);
        remaining.push(it);
      }
    }

    if (remaining.length) { batch.items = remaining; log.push(batch); }
    saveLog(log);
    ctx.saveConfig();
    return { ok: true, moves, problems, data: ctx.refreshAll(e.sender) };
  });

  ipcMain.handle('open-folder', (e, dir) => {
    if (insideProjects(dir)) return shell.openPath(dir);
  });
}

module.exports = { registerFileOps };
