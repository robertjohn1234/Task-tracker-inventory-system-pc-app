const fs = require('fs');
const path = require('path');
const { app, dialog, shell, Notification } = require('electron');

const OLLAMA = 'http://127.0.0.1:11434';
const MODEL = 'llama3.2:3b';   // same model as summarizer.js; change both together

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['todo', 'doing', 'done'];
const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
const MOVE_OFFERS = ['punch', 'any', 'never'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BLOCKED_EXTS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.scr', '.lnk', '.hta', '.reg', '.jar'];

// ---------- dates (always local time, never UTC) ----------
const pad = (n) => String(n).padStart(2, '0');
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayISO() { return isoDate(new Date()); }
function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function validISO(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  return isoDate(parseISO(s)) === s;
}
function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
function addMonths(iso, n) {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoDate(d);
}
function dayDiff(iso) {
  const t = new Date();
  const base = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((parseISO(iso) - base) / 86400000);
}
function weekStart(iso) {            // the Monday of that week
  const dow = (parseISO(iso).getDay() + 6) % 7;
  return addDays(iso, -dow);
}
function nextDue(due, repeat) {
  const today = todayISO();
  let next = due;
  do {
    next = repeat === 'daily' ? addDays(next, 1) : repeat === 'weekly' ? addDays(next, 7) : addMonths(next, 1);
  } while (next < today);
  return next;
}

// ---------- cleaning input ----------
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cleanTag = (x) => String(x).replace(/^#/, '').trim().toLowerCase().slice(0, 30);

function cleanTask(t, old) {
  const now = new Date().toISOString();
  const status = STATUSES.includes(t.status) ? t.status : 'todo';
  const tags = [...new Set((Array.isArray(t.tags) ? t.tags : []).map(cleanTag).filter(Boolean))].slice(0, 10);
  const checklist = (Array.isArray(t.checklist) ? t.checklist : [])
    .slice(0, 100)
    .map(c => ({ text: String((c && c.text) || '').trim().slice(0, 300), done: !!(c && c.done) }))
    .filter(c => c.text);
  const files = [...new Set((Array.isArray(t.files) ? t.files : []).map(String).filter(Boolean))].slice(0, 20);
  return {
    id: old ? old.id : newId(),
    title: String(t.title || '').trim().slice(0, 300),
    notes: String(t.notes || '').slice(0, 10000),
    status,
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'normal',
    due: validISO(t.due) ? t.due : '',
    tags,
    repeat: REPEATS.includes(t.repeat) ? t.repeat : 'none',
    checklist,
    files,
    createdAt: old ? old.createdAt : now,
    updatedAt: now,
    completedAt: status === 'done' ? ((old && old.status === 'done' && old.completedAt) || now) : ''
  };
}

// ---------- Ollama (runs on this PC) ----------
async function ollamaStream(prompt, onToken) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model: MODEL, prompt, stream: true, options: { num_ctx: 4096, temperature: 0.3 } })
  });
  if (!res.ok) throw new Error('Ollama error ' + res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
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

async function ollamaJson(prompt) {
  const res = await fetch(OLLAMA + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model: MODEL, prompt, stream: false, format: 'json', options: { num_ctx: 4096, temperature: 0.1 } })
  });
  if (!res.ok) throw new Error('Ollama error ' + res.status);
  const j = await res.json();
  return JSON.parse(j.response);
}

const AI_ERROR = 'Could not reach the AI. Make sure Ollama is running and the model is downloaded.';

function buildPlanPrompt(tasks) {
  const open = tasks.filter(t => t.status !== 'done');
  if (!open.length) return '';
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  open.sort((a, b) =>
    (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99') || rank[a.priority] - rank[b.priority]);

  const lines = open.slice(0, 40).map(t => {
    let when = 'no date';
    if (t.due) {
      const n = dayDiff(t.due);
      when = n < 0 ? `overdue by ${-n} day${-n === 1 ? '' : 's'}`
        : n === 0 ? 'due today'
        : n === 1 ? 'due tomorrow'
        : `due in ${n} days (${t.due})`;
    }
    const steps = t.checklist.length ? `, ${t.checklist.filter(c => c.done).length}/${t.checklist.length} steps done` : '';
    return `- ${t.priority.toUpperCase()}: ${t.title} (${when}, ${t.status === 'doing' ? 'in progress' : 'not started'}${steps})`;
  });

  return `You are a calm, practical assistant for an engineer. Today is ${todayISO()} (${DAY_NAMES[new Date().getDay()]}).\n` +
    `These are their open tasks:\n${lines.join('\n')}\n\n` +
    `Write a short plan for today with exactly these three headings:\n` +
    `Do first (up to 3 tasks, with a short reason each)\nWatch out (overdue or at-risk tasks)\nCan wait\n` +
    `Rules: use only the tasks listed above, do not invent tasks or dates, keep it under 150 words, plain text with no markdown symbols.`;
}

function buildReviewPrompt(tasks) {
  const today = todayISO();
  const from = addDays(today, -6);                 // the last 7 days, including today
  const localDay = (s) => (s ? isoDate(new Date(s)) : '');

  const doneWeek = tasks.filter(t => t.status === 'done' && localDay(t.completedAt) >= from);
  const addedWeek = tasks.filter(t => localDay(t.createdAt) >= from).length;
  const open = tasks.filter(t => t.status !== 'done');
  const overdue = open.filter(t => t.due && t.due < today);
  const coming = open.filter(t => t.due && t.due >= today && t.due <= addDays(today, 7));
  if (!doneWeek.length && !open.length) return '';

  const doneLine = (t) => {
    let when = 'no target date';
    if (t.due) {
      const late = Math.round((parseISO(localDay(t.completedAt)) - parseISO(t.due)) / 86400000);
      when = late <= 0 ? 'on time' : `${late} day${late === 1 ? '' : 's'} late`;
    }
    return `- ${t.title} (${when})`;
  };
  const openLine = (t) => `- ${t.priority.toUpperCase()}: ${t.title} (due ${t.due})`;
  const list = (arr, fn) => (arr.length ? arr.slice(0, 25).map(fn).join('\n') : '- none');

  return `You are a calm, practical assistant for an engineer. Today is ${today} (${DAY_NAMES[new Date().getDay()]}).\n` +
    `Here is their task activity for the last 7 days.\n\n` +
    `Completed (${doneWeek.length}):\n${list(doneWeek, doneLine)}\n\n` +
    `Still open and overdue (${overdue.length}):\n${list(overdue, openLine)}\n\n` +
    `Due in the next 7 days (${coming.length}):\n${list(coming, openLine)}\n\n` +
    `New tasks added this week: ${addedWeek}.\n\n` +
    `Write a short weekly review with exactly these four headings:\n` +
    `Done this week\nWhat slipped\nNext week's focus (up to 3 tasks)\nOne suggestion\n` +
    `Rules: use only the information above, do not invent tasks or numbers, keep it under 180 words, plain text with no markdown symbols.`;
}

// ---------- main ----------
function registerTasks(ipcMain, ctx) {
  const file = () => path.join(ctx.userDataDir(), 'tasks.json');
  let data = null;
  let planBusy = false;
  const live = [];   // keeps notifications alive until they are closed

  function load() {
    if (data) return data;
    let d = {};
    const f = file();
    try {
      d = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      if (fs.existsSync(f)) {
        // never overwrite a damaged file: keep a copy first
        try { fs.copyFileSync(f, f.replace(/\.json$/, '') + '-damaged-' + Date.now() + '.json'); } catch (e2) {}
      }
      d = {};
    }
    data = {
      tasks: Array.isArray(d.tasks) ? d.tasks : [],
      settings: Object.assign({ notify: true, aiBriefing: false, aiWeekly: false, moveOffer: 'punch' }, d.settings || {}),
      notified: d.notified || {},
      briefing: d.briefing || null,
      weekly: d.weekly || null
    };
    return data;
  }

  function save() {
    try {
      const tmp = file() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
      fs.renameSync(tmp, file());
    } catch (e) {
      console.error('Could not save tasks:', e.message);
    }
  }

  function notify(title, body) {
    try {
      if (!Notification.isSupported()) return false;
      const n = new Notification({ title, body });
      n.on('click', () => {
        const w = ctx.getWindow();
        if (w && !w.isDestroyed()) {
          if (w.isMinimized()) w.restore();
          w.show();
          w.focus();
          w.webContents.send('goto-tab', 'tasks');
        }
      });
      n.on('close', () => { const i = live.indexOf(n); if (i >= 0) live.splice(i, 1); });
      live.push(n);
      n.show();
      return true;
    } catch (e) { return false; }
  }

  // ----- data -----
  ipcMain.handle('tasks-load', () => {
    const d = load();
    return { tasks: d.tasks, settings: d.settings, briefing: d.briefing, weekly: d.weekly };
  });

  ipcMain.handle('task-save', (e, input) => {
    const d = load();
    const idx = input && input.id ? d.tasks.findIndex(t => t.id === input.id) : -1;
    const old = idx >= 0 ? d.tasks[idx] : null;
    const t = cleanTask(input || {}, old);
    if (!t.title) return { ok: false, error: 'Please type a title.' };

    if (old) d.tasks[idx] = t;
    else d.tasks.push(t);

    // finishing a repeating task creates the next one
    let spawned = null;
    const becameDone = t.status === 'done' && (!old || old.status !== 'done');
    if (becameDone && t.repeat !== 'none' && t.due) {
      const now = new Date().toISOString();
      spawned = Object.assign({}, t, {
        id: newId(), status: 'todo', due: nextDue(t.due, t.repeat),
        createdAt: now, updatedAt: now, completedAt: '',
        checklist: t.checklist.map(c => ({ text: c.text, done: false }))
      });
      d.tasks.push(spawned);
    }
    save();
    return { ok: true, tasks: d.tasks, task: t, spawned };
  });

  ipcMain.handle('task-delete', (e, id) => {
    const d = load();
    d.tasks = d.tasks.filter(t => t.id !== id);
    for (const k of Object.keys(d.notified)) if (k.startsWith(id + ':')) delete d.notified[k];
    save();
    return { ok: true, tasks: d.tasks };
  });

  ipcMain.handle('tasks-settings-set', (e, patch) => {
    const d = load();
    if (patch && typeof patch.notify === 'boolean') d.settings.notify = patch.notify;
    if (patch && typeof patch.aiBriefing === 'boolean') d.settings.aiBriefing = patch.aiBriefing;
    if (patch && typeof patch.aiWeekly === 'boolean') d.settings.aiWeekly = patch.aiWeekly;
    if (patch && MOVE_OFFERS.includes(patch.moveOffer)) d.settings.moveOffer = patch.moveOffer;
    save();
    return d.settings;
  });

  // keeps linked files correct after files are moved in the Files tab
  ipcMain.handle('tasks-remap-files', (e, moves) => {
    const d = load();
    const map = new Map();
    for (const m of Array.isArray(moves) ? moves : []) {
      if (m && typeof m.from === 'string' && typeof m.to === 'string') map.set(m.from.toLowerCase(), m.to);
    }
    let changed = false;
    for (const t of d.tasks) {
      let touched = false;
      const next = t.files.map(p => {
        const n = map.get(String(p).toLowerCase());
        if (n) { touched = true; return n; }
        return p;
      });
      if (touched) {
        t.files = [...new Set(next)];
        t.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) save();
    return { ok: true, tasks: d.tasks, changed };
  });

  // ----- linked files -----
  ipcMain.handle('task-pick-file', async () => {
    const r = await dialog.showOpenDialog(ctx.getWindow(), { properties: ['openFile'] });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  ipcMain.handle('task-open-path', async (e, p) => {
    if (typeof p !== 'string' || !fs.existsSync(p)) return 'That file was not found (it may have been moved or deleted).';
    if (BLOCKED_EXTS.includes(path.extname(p).toLowerCase())) return 'For safety, programs and scripts are not opened from here.';
    return await shell.openPath(p);   // '' when it worked
  });

  // ----- AI -----
  ipcMain.handle('task-ai-status', async () => {
    try {
      const res = await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return { running: false, model: false };
      const j = await res.json();
      const has = (j.models || []).some(m => m.name === MODEL || m.model === MODEL);
      return { running: true, model: has };
    } catch (e) {
      return { running: false, model: false };
    }
  });

  ipcMain.handle('task-ai-parse', async (e, text) => {
    text = String(text || '').trim().slice(0, 1000);
    if (!text) return { ok: false, error: 'Type a sentence first.' };
    const prompt =
      `You turn a short note into a task for an engineer. Today is ${todayISO()} (${DAY_NAMES[new Date().getDay()]}).\n` +
      `Reply with JSON only, in exactly this shape:\n` +
      `{"title": "", "due": "", "priority": "normal", "tags": [], "notes": ""}\n` +
      `Rules:\n` +
      `- "title": short and clear (max 80 characters), written as an action.\n` +
      `- "due": YYYY-MM-DD only if the note mentions a date or a day, otherwise "".\n` +
      `- "priority": one of low, normal, high, urgent. Use urgent only if the note says urgent, asap, immediately or critical.\n` +
      `- "tags": up to 3 short lowercase words, only if obvious.\n` +
      `- "notes": extra details from the note, or "".\n` +
      `- Never invent details that are not in the note.\n\nNOTE: ${text}`;
    try {
      const j = await ollamaJson(prompt);
      return {
        ok: true,
        draft: {
          title: String(j.title || text).trim().slice(0, 300),
          notes: String(j.notes || '').slice(0, 2000),
          due: validISO(j.due) ? j.due : '',
          priority: PRIORITIES.includes(j.priority) ? j.priority : 'normal',
          tags: Array.isArray(j.tags) ? j.tags.map(cleanTag).filter(Boolean).slice(0, 3) : []
        }
      };
    } catch (err) {
      return { ok: false, error: AI_ERROR };
    }
  });

  ipcMain.handle('task-ai-steps', async (e, title, notes) => {
    title = String(title || '').trim().slice(0, 300);
    if (!title) return { ok: false, error: 'Type a title first.' };
    const prompt =
      `List 4 to 8 short, concrete steps to complete this task for an engineer.\n` +
      `Reply with JSON only: {"steps": ["step", "step"]}\n` +
      `TASK: ${title}\nNOTES: ${String(notes || '').slice(0, 1000)}`;
    try {
      const j = await ollamaJson(prompt);
      const steps = (Array.isArray(j.steps) ? j.steps : [])
        .map(s => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 8);
      if (!steps.length) return { ok: false, error: 'The AI did not suggest any steps. Try a more specific title.' };
      return { ok: true, steps };
    } catch (err) {
      return { ok: false, error: AI_ERROR };
    }
  });

  // streams the answer into the card on the Tasks tab (used by the plan and the weekly review)
  async function streamToUi(e, prompt) {
    if (planBusy) return { ok: false, error: 'An AI summary is already being written.' };
    const send = (ch, v) => { if (!e.sender.isDestroyed()) e.sender.send(ch, v); };
    planBusy = true;
    try {
      send('task-plan-status', 'Thinking (the first time loads the model, so it can take a few seconds)...');
      await ollamaStream(prompt, (t) => send('task-plan-token', t));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: AI_ERROR };
    } finally {
      planBusy = false;
    }
  }

  ipcMain.handle('task-plan', (e) => {
    const prompt = buildPlanPrompt(load().tasks);
    if (!prompt) return { ok: true, empty: true };
    return streamToUi(e, prompt);
  });

  ipcMain.handle('task-review', (e) => {
    const prompt = buildReviewPrompt(load().tasks);
    if (!prompt) return { ok: true, empty: true };
    return streamToUi(e, prompt);
  });

  ipcMain.handle('task-test-notify', () =>
    notify('Work Helper reminder test', 'If you can see this, desktop reminders work.'));

  // ----- reminders -----
  function checkReminders() {
    const d = load();
    if (!d.settings.notify) return;
    const today = todayISO();
    for (const k of Object.keys(d.notified)) if (!k.endsWith(':' + today)) delete d.notified[k];

    const fresh = [];
    for (const t of d.tasks) {
      if (t.status === 'done' || !t.due) continue;
      const n = dayDiff(t.due);
      let kind = '';
      if (n < 0) kind = 'overdue';
      else if (n === 0) kind = 'today';
      else if (n === 1 && (t.priority === 'urgent' || t.priority === 'high')) kind = 'soon';
      if (!kind) continue;
      const key = `${t.id}:${kind}:${today}`;
      if (d.notified[key]) continue;
      d.notified[key] = 1;
      fresh.push({ t, kind });
    }
    if (!fresh.length) return;
    save();

    const count = (k) => fresh.filter(f => f.kind === k).length;
    const parts = [];
    if (count('overdue')) parts.push(`${count('overdue')} overdue`);
    if (count('today')) parts.push(`${count('today')} due today`);
    if (count('soon')) parts.push(`${count('soon')} urgent due tomorrow`);

    const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
    const body = fresh
      .sort((a, b) => rank[a.t.priority] - rank[b.t.priority])
      .slice(0, 4)
      .map(f => '• ' + f.t.title)
      .join('\n');
    notify('Tasks: ' + parts.join(', '), body);
  }

  async function maybeBriefing() {
    const d = load();
    if (!d.settings.aiBriefing) return;
    if (d.briefing && d.briefing.date === todayISO()) return;
    const prompt = buildPlanPrompt(d.tasks);
    if (!prompt) return;
    try {
      const text = (await ollamaStream(prompt)).trim();
      if (!text) return;
      d.briefing = { date: todayISO(), text };
      save();
      const w = ctx.getWindow();
      if (w && !w.isDestroyed()) w.webContents.send('tasks-briefing', { kind: 'daily', date: d.briefing.date, text });
      notify("Today's focus (AI)", text.replace(/\s+/g, ' ').slice(0, 220));
    } catch (e) {
      // Ollama is not running: stay quiet
    }
  }

  async function maybeWeekly() {
    const d = load();
    if (!d.settings.aiWeekly) return;
    const wk = weekStart(todayISO());
    if (d.weekly && d.weekly.week === wk) return;      // already written this week
    const prompt = buildReviewPrompt(d.tasks);
    if (!prompt) return;
    try {
      const text = (await ollamaStream(prompt)).trim();
      if (!text) return;
      d.weekly = { week: wk, date: todayISO(), text };
      save();
      const w = ctx.getWindow();
      if (w && !w.isDestroyed()) w.webContents.send('tasks-briefing', { kind: 'weekly', date: d.weekly.date, text });
      notify('Your weekly review (AI)', text.replace(/\s+/g, ' ').slice(0, 220));
    } catch (e) {
      // Ollama is not running: stay quiet
    }
  }

  function start() {
    try { app.setAppUserModelId('com.workhelper.app'); } catch (e) {}
    setTimeout(async () => {
      checkReminders();
      await maybeBriefing();
      await maybeWeekly();
    }, 8000);
    setInterval(checkReminders, 30 * 60 * 1000);
  }

  return { start };
}

module.exports = { registerTasks };