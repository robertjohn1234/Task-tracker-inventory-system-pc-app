const { extractText } = require('./extractor');

const OLLAMA = 'http://127.0.0.1:11434';
const MODEL = 'llama3.2:3b';
const CHUNK_CHARS = 12000;   // text per part
const MAX_CHARS = 120000;    // longest text we summarize (about 10 parts)

const STYLE = 'You are an assistant for an engineer. Be factual and concise. ' +
  'Keep tag numbers, document numbers, revisions, dates, quantities and names exactly as written. ' +
  'Do not invent anything that is not in the text.';

async function generate(prompt, onToken) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: true,
      options: { num_ctx: 8192, temperature: 0.2 }
    })
  });
  if (!res.ok) throw new Error('Ollama error ' + res.status + ': ' + (await res.text()));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const obj = JSON.parse(line);
      if (obj.error) throw new Error(obj.error);
      if (obj.response) {
        full += obj.response;
        if (onToken) onToken(obj.response);
      }
    }
  }
  return full;
}

function splitChunks(text) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + CHUNK_CHARS, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + CHUNK_CHARS * 0.5) end = nl;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

async function summarize(text, fileName, onProgress, onToken) {
  let truncated = false;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    truncated = true;
  }
  const chunks = splitChunks(text);
  const format = 'Write: one short paragraph on what the document is, then 5-8 bullet points of key facts, ' +
    'then any open issues, deadlines or required actions.';

  if (chunks.length === 1) {
    onProgress('Summarizing...');
    await generate(`${STYLE}\n\nSummarize the document "${fileName}" below.\n${format}\n\nDOCUMENT:\n${chunks[0]}`, onToken);
    return { truncated };
  }

  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress(`Reading part ${i + 1} of ${chunks.length}...`);
    const p = await generate(
      `${STYLE}\n\nThis is part ${i + 1} of ${chunks.length} of the document "${fileName}". ` +
      `Summarize the key facts in this part as at most 8 bullet points.\n\nTEXT:\n${chunks[i]}`
    );
    partials.push(p);
  }

  onProgress('Combining into final summary...');
  await generate(
    `${STYLE}\n\nBelow are notes from every part of the document "${fileName}". Write the final summary.\n${format}\n\nNOTES:\n${partials.join('\n\n')}`,
    onToken
  );
  return { truncated };
}

let busy = false;

function registerSummarize(ipcMain, getFiles) {
  ipcMain.handle('summarize', async (e, filePath) => {
    if (busy) return { ok: false, error: 'Another summary is still running.' };
    const f = getFiles().find(x => x.path === filePath);
    if (!f) return { ok: false, error: 'File is not in the current folder list.' };

    const send = (ch, d) => { if (!e.sender.isDestroyed()) e.sender.send(ch, d); };
    busy = true;
    try {
      send('summary-progress', 'Reading file...');
      const text = await extractText(f.path, f.ext, f.size, true);
      if (!text.trim()) {
        return { ok: false, error: 'No readable text in this file (it may be a scanned PDF, an unsupported type, or too large).' };
      }
      const r = await summarize(text, f.name, p => send('summary-progress', p), t => send('summary-token', t));
      return { ok: true, truncated: r.truncated };
    } catch (err) {
      return { ok: false, error: 'Could not get a summary. Make sure Ollama is running and the model is downloaded. (' + err.message + ')' };
    } finally {
      busy = false;
    }
  });
}

module.exports = { registerSummarize };