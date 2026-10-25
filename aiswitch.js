'use strict';
// AI on/off switch. While AI is off, nothing in the app can reach Ollama
// (the summarizer, task planner, quick add, briefings...). The choice is saved per PC.
// On the very first start it switches itself off if Ollama is not running on this PC.

const fs = require('fs');
const path = require('path');

function registerAiSwitch(ipcMain, ctx) {
  const file = () => path.join(ctx.userDataDir(), 'ai.json');
  let enabled = true;
  let ready = null;

  function save() { try { fs.writeFileSync(file(), JSON.stringify({ enabled })); } catch (e) {} }

  async function ollamaRunning() {
    try {
      const res = await realFetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch (e) { return false; }
  }

  const realFetch = globalThis.fetch.bind(globalThis);
  // Every request to Ollama (port 11434) is refused while AI is off.
  globalThis.fetch = function (url, opts) {
    const u = String(url && url.url ? url.url : url);
    if (!enabled && /:11434\b/.test(u)) return Promise.reject(new TypeError('AI is turned off'));
    return realFetch(url, opts);
  };

  function init() {
    if (!ready) ready = (async () => {
      try {
        const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
        enabled = j.enabled !== false;
      } catch (e) {
        enabled = await ollamaRunning(); // first start on this PC
        save();
      }
    })();
    return ready;
  }

  ipcMain.handle('ai-get', async () => { await init(); return { enabled }; });
  ipcMain.handle('ai-set', async (e, on) => { await init(); enabled = !!on; save(); return { enabled }; });
  // block AI right away, before the window asks (avoids a start-up briefing on a PC without Ollama)
  init();
}

module.exports = { registerAiSwitch };
