'use strict';
// Notes: storage and file actions (the Electron side). Notes are saved in notes.json in the app data folder.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dialog, shell } = require('electron');

const MAX_NOTES = 5000;

function text(v, n) { return String(v == null ? '' : v).slice(0, n); }
const iso = () => new Date().toISOString();

function cleanNote(n) {
  if (!n || typeof n !== 'object') return null;
  const id = typeof n.id === 'string' && n.id ? n.id.slice(0, 80) : crypto.randomUUID();
  const tags = (Array.isArray(n.tags) ? n.tags : []).map(t => text(t, 30).trim().replace(/^#/, '')).filter(Boolean);
  return {
    id,
    title: text(n.title, 200),
    body: text(n.body, 200000),
    tags: [...new Set(tags)].slice(0, 12),
    pinned: !!n.pinned,
    files: (Array.isArray(n.files) ? n.files : []).map(f => text(f, 500)).filter(Boolean).slice(0, 20),
    createdAt: text(n.createdAt, 40) || iso(),
    updatedAt: text(n.updatedAt, 40) || iso()
  };
}

function registerNotepad(ipcMain, ctx) {
  const file = () => path.join(ctx.userDataDir(), 'notes.json');
  let notes = null;

  function load() {
    if (notes) return notes;
    try {
      const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
      notes = (Array.isArray(j.notes) ? j.notes : []).map(cleanNote).filter(Boolean);
    } catch (e) { notes = []; }
    return notes;
  }
  function save() {
    fs.mkdirSync(ctx.userDataDir(), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, notes }));
    try { if (fs.existsSync(file())) fs.copyFileSync(file(), file() + '.bak'); } catch (e) {}
    fs.renameSync(tmp, file());
  }
  const handle = (name, fn) => ipcMain.handle(name, async (e, ...a) => {
    try { return await fn(e, ...a); } catch (err) { return { ok: false, error: 'Something went wrong: ' + err.message }; }
  });

  handle('notes-load', () => ({ ok: true, notes: load() }));
  handle('note-save', (e, input) => {
    const list = load();
    const rec = cleanNote(input);
    if (!rec) return { ok: false, error: 'Could not save this note.' };
    const i = list.findIndex(n => n.id === rec.id);
    rec.updatedAt = iso();
    if (i >= 0) { rec.createdAt = list[i].createdAt; list[i] = rec; }
    else { if (list.length >= MAX_NOTES) return { ok: false, error: 'Too many notes. Please delete some old ones.' }; list.push(rec); }
    save();
    return { ok: true, note: rec };
  });
  handle('note-delete', (e, id) => {
    const list = load();
    const i = list.findIndex(n => n.id === id);
    if (i < 0) return { ok: false, error: 'That note no longer exists.' };
    list.splice(i, 1); save();
    return { ok: true };
  });
  handle('note-pick-file', async () => {
    const r = await dialog.showOpenDialog(ctx.getWindow(), { title: 'Link a file to this note', properties: ['openFile'] });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    return { ok: true, path: r.filePaths[0] };
  });
  handle('note-open-path', async (e, p) => {
    // only files that are linked in a note can be opened from here
    if (!load().some(n => n.files.includes(p))) return { ok: false, error: 'That file is not linked in a note.' };
    if (!fs.existsSync(p)) return { ok: false, error: 'The file was moved or deleted.' };
    const err = await shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true };
  });
  handle('note-export-txt', async (e, id) => {
    const n = load().find(x => x.id === id);
    if (!n) return { ok: false, error: 'That note no longer exists.' };
    const safe = (n.title || 'note').replace(/[^\w\- ]+/g, '').trim() || 'note';
    const r = await dialog.showSaveDialog(ctx.getWindow(), { title: 'Save the note as a text file', defaultPath: safe + '.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    fs.writeFileSync(r.filePath, (n.title ? n.title + '\r\n\r\n' : '') + n.body.replace(/\r?\n/g, '\r\n'), 'utf8');
    return { ok: true, path: r.filePath };
  });
}

module.exports = { registerNotepad, cleanNote };
