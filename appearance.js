const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const MAX_BYTES = 25 * 1024 * 1024;
const EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

function registerAppearance(ipcMain, ctx) {
  const dir = () => path.join(ctx.userDataDir(), 'backgrounds');

  // removes the app's own copies of earlier background pictures (never your originals)
  function clearOld(keep) {
    try {
      for (const f of fs.readdirSync(dir())) {
        const p = path.join(dir(), f);
        if (p !== keep && /^bg-\d+\.\w+$/.test(f)) fs.unlinkSync(p);
      }
    } catch (e) {}
  }

  ipcMain.handle('ui-pick-background', async () => {
    const r = await dialog.showOpenDialog(ctx.getWindow(), {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: EXTS }]
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };

    const src = r.filePaths[0];
    try {
      const ext = path.extname(src).slice(1).toLowerCase();
      if (!EXTS.includes(ext)) return { ok: false, error: 'Please choose a PNG, JPG, WEBP, GIF or BMP image.' };
      if (fs.statSync(src).size > MAX_BYTES) return { ok: false, error: 'That image is too large (over 25 MB). Please choose a smaller one.' };

      fs.mkdirSync(dir(), { recursive: true });
      const dest = path.join(dir(), `bg-${Date.now()}.${ext}`);
      fs.copyFileSync(src, dest);
      clearOld(dest);
      return { ok: true, path: dest };
    } catch (e) {
      return { ok: false, error: 'Could not use that image: ' + e.message };
    }
  });

  ipcMain.handle('ui-clear-background', () => {
    clearOld('');
    return { ok: true };
  });
}

module.exports = { registerAppearance };