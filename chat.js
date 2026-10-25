'use strict';
// AI chat: sends the conversation to the local Ollama model and streams the answer back.
// The data it answers from (inventory, punch list, notes) is prepared in the window and arrives as `context`.
// Uses the app's patched fetch, so nothing is sent while the AI switch is off.

const PREFERRED = 'llama3.2:3b';
const BASE = 'http://127.0.0.1:11434';

function registerChat(ipcMain, ctx) {
  const running = new Map();
  const send = (channel, payload) => { try { const w = ctx.getWindow(); if (w && !w.isDestroyed()) w.webContents.send(channel, payload); } catch (e) {} };

  async function pickModel() {
    const res = await fetch(BASE + '/api/tags', { signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    const names = (j.models || []).map(m => m.name);
    if (!names.length) return null;
    return names.find(n => n === PREFERRED) || names.find(n => n.startsWith('llama3.2')) || names[0];
  }
  const friendly = (err) => {
    const m = String(err && err.message || err);
    if (/AI is turned off/i.test(m)) return 'The AI is turned off. Click “AI” in the left bar to turn it on.';
    if (/fetch failed|ECONNREFUSED|timeout|aborted due to timeout/i.test(m)) return 'I could not reach Ollama. Please start Ollama on this PC and try again.';
    return 'The AI had a problem: ' + m;
  };

  ipcMain.handle('chat-ask', async (e, reqId, messages, context) => {
    const id = String(reqId || Date.now());
    const ac = new AbortController();
    running.set(id, ac);
    try {
      const model = await pickModel();
      if (!model) return { ok: false, error: 'Ollama has no model installed. Run: ollama pull llama3.2:3b' };
      const system = 'You are the helper inside the Work Helper app, used by an engineer and a document controller. ' +
        'Answer ONLY from the DATA below. If the answer is not in the DATA, say you do not have it — never guess or invent numbers, names or dates. ' +
        'Be short and plain. Use a short list when listing several things. Quote item codes and punch numbers exactly as written.\n\nDATA:\n' + String(context || '').slice(0, 24000);
      const msgs = [{ role: 'system', content: system }].concat(
        (Array.isArray(messages) ? messages : []).slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) })));
      const res = await fetch(BASE + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ model, messages: msgs, stream: true, options: { num_ctx: 8192, temperature: 0.2 } })
      });
      if (!res.ok) return { ok: false, error: 'Ollama answered with an error (' + res.status + ').' };
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = '', full = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          try { const j = JSON.parse(line); const t = j.message && j.message.content; if (t) { full += t; send('chat-token', { id, text: t }); } } catch (err) {}
        }
      }
      return { ok: true, text: full, model };
    } catch (err) {
      if (ac.signal.aborted) return { ok: true, stopped: true };
      return { ok: false, error: friendly(err) };
    } finally { running.delete(id); }
  });
  ipcMain.handle('chat-stop', (e, id) => { const ac = running.get(String(id)); if (ac) ac.abort(); return { ok: true }; });
}

module.exports = { registerChat };
