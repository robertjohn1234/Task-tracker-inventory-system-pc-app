// Builds the Tasks tab. Runs last, after renderer.js and the other UI files.
(function () {
  'use strict';

  // ---------- styles ----------
  const st = document.createElement('style');
  st.textContent = `
    #tasksView { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: #f6f7f9; }
    #tkTop { background: #fff; border-bottom: 1px solid #ddd; padding: 10px 16px 4px; }
    .tkRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    #tkTop h2 { margin: 0; font-size: 18px; }
    .spacer { flex: 1; }
    #tkSummary { color: #666; font-size: 12px; }
    #aiDot { width: 9px; height: 9px; border-radius: 50%; background: #bbb; display: inline-block; }
    #aiState { font-size: 12px; color: #666; }
    button.primary { background: #1f6feb; color: #fff; border: 1px solid #1f6feb; font-weight: 600; }
    button.danger { color: #b00; }
    #tkQuick { flex: 1 1 260px; padding: 8px 10px; font-size: 13px; }
    #tkSearch { padding: 6px 8px; flex: 1 1 140px; max-width: 260px; font-size: 13px; }
    #tkTag { padding: 5px; }
    .seg { display: inline-flex; border: 1px solid #bbb; border-radius: 6px; overflow: hidden; background: #fff; }
    .seg button { border: 0; border-right: 1px solid #ccc; border-radius: 0; background: #fff; }
    .seg button:last-child { border-right: 0; }
    .seg button.on { background: #1f6feb; color: #fff; }

    #tkBrief { margin: 10px 16px 0; background: #fff; border: 1px solid #cfe0ff; border-left: 4px solid #1f6feb; border-radius: 6px; padding: 10px 14px; }
    #tkBriefHead { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; }
    #tkBriefStatus { color: #0a6; font-size: 12px; margin-top: 2px; }
    #tkBriefText { white-space: pre-wrap; margin-top: 6px; font-size: 13px; line-height: 1.45; }

    #tkBody { flex: 1; overflow: auto; padding: 12px 16px 24px; }
    .tkGroup { margin-bottom: 14px; }
    .tkGroupHead { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; margin: 4px 0 6px; }
    .tkGroupHead.over { color: #d1242f; }
    .tkRowItem, .tkCard { background: #fff; border: 1px solid #e1e4e8; border-left: 4px solid #8c959f; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; cursor: pointer; }
    .tkRowItem { display: flex; align-items: center; gap: 10px; }
    .tkRowItem:hover, .tkCard:hover { box-shadow: 0 1px 5px rgba(0,0,0,0.15); }
    .p-urgent { border-left-color: #d1242f !important; }
    .p-high { border-left-color: #e07b00 !important; }
    .p-normal { border-left-color: #2f81f7 !important; }
    .p-low { border-left-color: #8c959f !important; }
    .done .tkTitle { text-decoration: line-through; color: #888; }
    .tkCheck { width: 18px; height: 18px; cursor: pointer; flex: none; }
    .tkMain { flex: 1; min-width: 0; }
    .tkTitle { font-weight: 600; overflow-wrap: anywhere; }
    .tkMeta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; align-items: center; }
    .pill { padding: 1px 8px; border-radius: 10px; background: #eef0f3; font-size: 11px; white-space: nowrap; color: #444; }
    .pill.over, .pill.urgent { background: #ffe1e3; color: #b3202a; font-weight: 600; }
    .pill.today, .pill.high { background: #fff0d6; color: #9a5b00; font-weight: 600; }
    .pill.doing { background: #dff0ff; color: #0b5cad; }

    #tkBoard { display: grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap: 12px; align-items: start; }
    .tkCol { background: #eceef1; border-radius: 8px; padding: 8px; min-height: 180px; }
    .tkCol.dropok { outline: 2px dashed #1f6feb; }
    .tkColHead { font-weight: 600; margin: 2px 4px 8px; display: flex; justify-content: space-between; align-items: center; }
    .tkCard { cursor: grab; }

    .calHead { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .calTitle { font-size: 16px; margin-left: 6px; }
    .calGrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; background: #d8dce2; border: 1px solid #d8dce2; border-radius: 6px; overflow: hidden; }
    .calDow { background: #eef0f3; padding: 4px 6px; font-size: 11px; font-weight: 600; color: #555; text-align: center; }
    .calCell { background: #fff; min-height: 96px; padding: 3px 4px; cursor: pointer; overflow: hidden; }
    .calCell.other { background: #fafbfc; color: #aaa; }
    .calCell.today { background: #eef5ff; }
    .calCell.selc { outline: 2px solid #1f6feb; outline-offset: -2px; }
    .calCell.dropok { background: #d6f5d6; }
    .calNum { font-size: 11px; font-weight: 600; margin-bottom: 2px; }
    .calCell.today .calNum { color: #1f6feb; }
    .calChip { font-size: 11px; padding: 1px 5px; margin-bottom: 2px; border-radius: 3px; background: #f0f3f7; border-left: 3px solid #8c959f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: grab; color: #222; }
    .calChip.done { text-decoration: line-through; color: #888; }
    .calMore { font-size: 10px; color: #777; }
    .calPanel { margin-top: 14px; }

    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .kpi { background: #fff; border: 1px solid #e1e4e8; border-radius: 8px; padding: 10px 12px; }
    .kpi b { display: block; font-size: 26px; }
    .kpi span { color: #666; font-size: 12px; }
    .kpi.bad b { color: #d1242f; }
    .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
    .chartCard { background: #fff; border: 1px solid #e1e4e8; border-radius: 8px; padding: 10px 12px; }
    .chartCard.wide { grid-column: 1 / -1; }
    .chartCard h4 { margin: 0 0 8px; font-size: 13px; }
    .chartCard svg { width: 100%; height: auto; display: block; }
    .chartNote { color: #777; font-size: 11px; margin-top: 4px; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #555; margin-top: 6px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
    .donutWrap { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .donutWrap svg { width: 150px; height: 150px; flex: none; }
    .hbar { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 12px; }
    .hbar .lbl { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hbar .bar { flex: 1; background: #eef0f3; border-radius: 4px; height: 12px; }
    .hbar .bar i { display: block; height: 100%; background: #2f81f7; border-radius: 4px; }
    .hbar .n { width: 24px; text-align: right; color: #555; }

    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 15; padding: 8px; }
    .dialog { background: #fff; border-radius: 8px; padding: 16px 18px; width: min(640px, 100%); max-height: 100%; overflow: auto; }
    .dialog.small { width: min(480px, 100%); }
    .dialog h3 { margin: 0 0 10px; }
    .fld { margin-bottom: 10px; }
    .fld > label { display: block; font-weight: 600; font-size: 12px; margin-bottom: 4px; color: #444; }
    .fld input[type=text], .fld input[type=date], .fld select, .fld textarea { width: 100%; padding: 6px 8px; font-size: 13px; font-family: inherit; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .dateRow { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
    .dateRow input { width: auto; flex: 1 1 130px; }
    .dateRow button { padding: 4px 8px; font-size: 12px; }
    .ckRow { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; border-radius: 4px; }
    .ckRow input[type=text] { flex: 1; padding: 4px 6px; }
    .ckRow.ckOver { outline: 2px dashed #1f6feb; }
    .ckRow.ckDragging { opacity: 0.5; }
    .grip { cursor: grab; color: #999; padding: 0 2px; user-select: none; letter-spacing: -2px; }
    .addRow { display: flex; gap: 6px; margin-top: 4px; }
    .addRow input { flex: 1; padding: 5px 8px; }
    .fileLink { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 12px; }
    .fileLink .nm { flex: 1; overflow-wrap: anywhere; }
    .dlgFoot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
    .msg { font-size: 12px; color: #0a6; min-height: 16px; overflow-wrap: anywhere; }
    .hint { color: #666; font-size: 12px; margin: 6px 0; }
    .setRow { display: block; margin: 8px 0; }
    .setRow select { display: block; margin-top: 4px; padding: 5px; }
    .moveFile { font-size: 12px; margin: 2px 0; overflow-wrap: anywhere; }
    @media (max-width: 700px) { .calCell { min-height: 64px; } .calChip { font-size: 10px; } }
    @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } #tkBoard { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(st);

  // ---------- page structure ----------
  $('tasksView').innerHTML = `
    <div id="tkTop">
      <div class="tkRow">
        <h2>Tasks</h2>
        <span id="tkSummary"></span>
        <span class="spacer"></span>
        <span id="aiDot"></span><span id="aiState"></span>
        <button id="tkPlan" title="Ask the AI what to do first today">✨ Plan my day</button>
        <button id="tkReview" title="Ask the AI to review your last 7 days">✨ Weekly review</button>
        <button id="tkSettings">⚙ Reminders</button>
        <button id="tkNew" class="primary">+ New task</button>
      </div>
      <div class="tkRow">
        <input id="tkQuick" type="text" placeholder='Quick add, e.g. "Send RFI reply Friday urgent #piping" then press Enter'>
        <button id="tkQuickAi" title="Let the AI read your sentence and fill in the details">✨ AI add</button>
      </div>
      <div class="tkRow">
        <span class="seg" id="tkViews">
          <button data-v="list" class="on">List</button><button data-v="board">Board</button><button data-v="calendar">Calendar</button><button data-v="insights">Insights</button>
        </span>
        <input id="tkSearch" type="text" placeholder="Search tasks...">
        <span class="seg" id="tkChips">
          <button data-f="all" class="on">All</button><button data-f="today">Today</button><button data-f="overdue">Overdue</button><button data-f="urgent">Urgent</button><button data-f="doing">In progress</button>
        </span>
        <select id="tkTag"><option value="">All tags</option></select>
        <label><input type="checkbox" id="tkShowDone"> Show done</label>
      </div>
    </div>
    <div id="tkBrief" hidden>
      <div id="tkBriefHead"><span id="tkBriefTitle"></span><button id="tkBriefClose">Dismiss</button></div>
      <div id="tkBriefStatus"></div>
      <div id="tkBriefText"></div>
    </div>
    <div id="tkBody"></div>
  `;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="tkModal" class="overlay" hidden>
      <div class="dialog">
        <h3 id="tkDlgTitle">New task</h3>
        <div class="fld"><label>Title</label><input id="tkfTitle" type="text" maxlength="300"></div>
        <div class="grid2">
          <div class="fld"><label>Target date</label>
            <div class="dateRow">
              <input id="tkfDue" type="date">
              <button type="button" data-q="0">Today</button>
              <button type="button" data-q="1">Tomorrow</button>
              <button type="button" data-q="7">+1 week</button>
              <button type="button" data-q="clear">Clear</button>
            </div>
          </div>
          <div class="fld"><label>Status</label>
            <select id="tkfStatus"><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select>
          </div>
        </div>
        <div class="fld"><label>Priority</label>
          <span class="seg" id="tkfPrio">
            <button type="button" data-p="low">Low</button><button type="button" data-p="normal">Normal</button><button type="button" data-p="high">High</button><button type="button" data-p="urgent">🔥 Urgent</button>
          </span>
        </div>
        <div class="grid2">
          <div class="fld"><label>Tags (comma separated)</label><input id="tkfTags" type="text" list="tkTagList"><datalist id="tkTagList"></datalist></div>
          <div class="fld"><label>Repeat</label>
            <select id="tkfRepeat"><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select>
          </div>
        </div>
        <div class="fld"><label>Notes</label><textarea id="tkfNotes" rows="3"></textarea></div>
        <div class="fld"><label>Checklist (drag ⋮⋮ to reorder) <button type="button" id="tkfSuggest" title="Let the AI suggest steps">✨ Suggest steps</button></label>
          <div id="tkfChecklist"></div>
          <div class="addRow"><input id="tkfNewItem" type="text" placeholder="Add a step and press Enter"><button type="button" id="tkfAddItem">Add</button></div>
        </div>
        <div class="fld"><label>Linked files</label>
          <div id="tkfFiles"></div>
          <button type="button" id="tkfLinkSel">Link the file selected in Files</button>
          <button type="button" id="tkfLinkPick">Choose a file…</button>
        </div>
        <div class="msg" id="tkfMsg"></div>
        <div class="dlgFoot">
          <button type="button" id="tkfDelete" class="danger">Delete</button>
          <span class="spacer"></span>
          <button type="button" id="tkfCancel">Cancel</button>
          <button type="button" id="tkfSave" class="primary">Save</button>
        </div>
      </div>
    </div>

    <div id="tkSetModal" class="overlay" hidden>
      <div class="dialog small">
        <h3>Reminders and AI</h3>
        <label class="setRow"><input type="checkbox" id="setNotify"> Desktop reminders for overdue tasks, tasks due today, and urgent or high tasks due tomorrow</label>
        <label class="setRow"><input type="checkbox" id="setBrief"> AI briefing once a day when the app starts (needs Ollama running)</label>
        <label class="setRow"><input type="checkbox" id="setWeekly"> AI weekly review the first time the app opens each week (needs Ollama running)</label>
        <label class="setRow">When a task is marked done, offer to move its linked files:
          <select id="setMove">
            <option value="punch">For punch-list tasks only</option>
            <option value="any">For any task with linked files</option>
            <option value="never">Never</option>
          </select>
        </label>
        <div class="hint">Reminders are checked every 30 minutes while the app is open. Windows Focus Assist (Do Not Disturb) can hide them. A punch-list task is one with "punch" in the title or a tag that starts with "punch".</div>
        <div class="dlgFoot"><button type="button" id="setTest">Send a test reminder</button><span class="spacer"></span><button type="button" id="setClose">Close</button></div>
      </div>
    </div>

    <div id="tkMoveModal" class="overlay" hidden>
      <div class="dialog small">
        <h3>Move the linked files?</h3>
        <div class="hint" id="tkMoveText"></div>
        <div id="tkMoveList"></div>
        <div class="dlgFoot"><span class="spacer"></span><button type="button" id="tkMoveNo">Not now</button><button type="button" id="tkMoveYes" class="primary">Choose folder…</button></div>
      </div>
    </div>
  `);

  // ---------- state ----------
  const tk = { tasks: [], settings: { notify: true, aiBriefing: false, aiWeekly: false, moveOffer: 'punch' }, briefing: null, weekly: null };
  let viewName = 'list';
  let filter = 'all';
  let draft = null;
  let dragId = null;
  let ckDrag = -1;
  let planBusy = false;
  let briefDismissed = '';
  let moveTarget = [];
  let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let calSel = '';

  const RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
  const PRIO_LABEL = { urgent: '🔥 Urgent', high: 'High', normal: 'Normal', low: 'Low' };
  const PRIO_COLOR = { low: '#8c959f', normal: '#2f81f7', high: '#e07b00', urgent: '#d1242f' };

  // ---------- dates (local time) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => iso(new Date());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diff = (s) => {
    const t = new Date();
    return Math.round((parse(s) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
  };
  const validISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
  const baseName = (p) => p.split(/[\\/]/).pop();

  calSel = todayISO();

  function dueInfo(t) {
    if (!t.due) return null;
    const n = diff(t.due);
    const d = parse(t.due);
    const nice = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (t.status === 'done') return { cls: '', text: nice };
    if (n < 0) return { cls: 'over', text: `Overdue ${-n}d (${nice})` };
    if (n === 0) return { cls: 'today', text: 'Today' };
    if (n === 1) return { cls: '', text: 'Tomorrow' };
    if (n < 7) return { cls: '', text: d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + nice };
    return { cls: '', text: nice };
  }

  // ---------- quick-add parser (works offline, no AI) ----------
  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function parseQuick(input) {
    let s = ' ' + input + ' ';
    const tags = [];
    s = s.replace(/\s#([\w-]+)/g, (m, t) => { tags.push(t.toLowerCase()); return ' '; });

    let priority = 'normal';
    if (/(^|\s)!!(\s|$)|\b(urgent|asap)\b/i.test(s)) {
      priority = 'urgent';
      s = s.replace(/(^|\s)!!(?=\s|$)|\b(urgent|asap)\b/gi, ' ');
    } else if (/\bhigh priority\b/i.test(s)) {
      priority = 'high';
      s = s.replace(/\bhigh priority\b/gi, ' ');
    } else if (/\blow priority\b/i.test(s)) {
      priority = 'low';
      s = s.replace(/\blow priority\b/gi, ' ');
    }

    const today = todayISO();
    const now = new Date();
    let due = '';
    const lead = '(?:\\b(?:by|on|due|before|until)\\s+)?';
    const tryDate = (re, fn) => {
      if (due) return;
      const m = s.match(re);
      if (!m) return;
      const v = fn(m);
      if (v && validISO(v)) { due = v; s = s.replace(re, ' '); }
    };
    const withYear = (mon, day) => {
      const y = now.getFullYear();
      let d = new Date(y, mon, day);
      if (iso(d) < today) d = new Date(y + 1, mon, day);
      return iso(d);
    };

    tryDate(new RegExp(lead + '\\b(\\d{4}-\\d{2}-\\d{2})\\b', 'i'), m => m[1]);
    tryDate(new RegExp(lead + '\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'i'),
      m => withYear(MONTHS[m[1].toLowerCase()], Number(m[2])));
    tryDate(new RegExp(lead + '\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\b', 'i'),
      m => withYear(MONTHS[m[2].toLowerCase()], Number(m[1])));
    tryDate(new RegExp(lead + '\\b(today|tonight|eod)\\b', 'i'), () => today);
    tryDate(new RegExp(lead + '\\b(tomorrow|tmrw|tmr)\\b', 'i'), () => addDays(today, 1));
    tryDate(/\bin\s+(\d{1,3})\s+(day|days|week|weeks)\b/i, m => addDays(today, Number(m[1]) * (/^w/i.test(m[2]) ? 7 : 1)));
    tryDate(/\bnext\s+week\b/i, () => addDays(today, 7));
    tryDate(new RegExp(lead + '\\b(next\\s+|this\\s+)?(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\\b', 'i'),
      m => {
        const target = WEEKDAYS[m[2].slice(0, 3).toLowerCase()];
        let n = (target - now.getDay() + 7) % 7;
        if (m[1] && /^next/i.test(m[1])) n += 7;
        return addDays(today, n);
      });

    let title = s.replace(/\s+/g, ' ').trim().replace(/^[-–:,.\s]+|[-–:,.\s]+$/g, '');
    if (!title) title = input.trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { title, due, priority, tags };
  }

  // ---------- load / save ----------
  async function load() {
    const d = await window.api.tasksLoad();
    tk.tasks = d.tasks || [];
    tk.settings = Object.assign(tk.settings, d.settings || {});
    tk.briefing = d.briefing || null;
    tk.weekly = d.weekly || null;
    refresh();
    const today = todayISO();
    if (briefDismissed !== today) {
      if (tk.briefing && tk.briefing.date === today) {
        showBrief('Morning briefing (AI)', tk.briefing.text, 'Written today by your local AI.');
      } else if (tk.weekly && tk.weekly.date === today) {
        showBrief('Weekly review (AI)', tk.weekly.text, 'Written today by your local AI.');
      }
    }
  }

  async function persist(obj) {
    const old = obj.id ? tk.tasks.find(t => t.id === obj.id) : null;
    const r = await window.api.taskSave(obj);
    if (!r.ok) { toast(r.error); return r; }
    tk.tasks = r.tasks;
    refresh();
    if (r.spawned) toast(`Repeating task: the next one was created for ${r.spawned.due}.`);
    if (r.task.status === 'done' && (!old || old.status !== 'done')) offerMoveFiles(r.task);
    return r;
  }

  function setStatus(t, status) {
    return persist(Object.assign({}, t, { status }));
  }

  // ---------- completing a task: offer to move its linked files ----------
  function isPunchTask(t) {
    return t.tags.some(g => /^punch/.test(g)) || /punch/i.test(t.title);
  }

  function offerMoveFiles(t) {
    const mode = tk.settings.moveOffer || 'punch';
    if (mode === 'never' || !t.files.length) return;
    if (mode === 'punch' && !isPunchTask(t)) return;
    if (typeof moveWithDialog !== 'function') return;

    // only files inside your added folders can be moved from here
    const lower = new Map([...fileByPath.keys()].map(k => [k.toLowerCase(), k]));
    const known = t.files.map(p => lower.get(p.toLowerCase())).filter(Boolean);
    if (!known.length) return;

    moveTarget = known;
    $('tkMoveText').textContent =
      `"${t.title}" is done. Move its ${known.length} linked file${known.length === 1 ? '' : 's'} to another folder, for example a "Closed" or "Completed" folder?` +
      (known.length < t.files.length ? ' Files outside your added folders cannot be moved from here.' : '');
    const list = $('tkMoveList');
    list.innerHTML = '';
    known.slice(0, 8).forEach(p => list.appendChild(el('div', 'moveFile', '📎 ' + baseName(p))));
    if (known.length > 8) list.appendChild(el('div', 'moveFile', `...and ${known.length - 8} more`));
    $('tkMoveModal').hidden = false;
  }

  $('tkMoveNo').addEventListener('click', () => { $('tkMoveModal').hidden = true; });
  $('tkMoveYes').addEventListener('click', () => {
    $('tkMoveModal').hidden = true;
    if (moveTarget.length) moveWithDialog(moveTarget);
  });

  // keep linked files correct when files are moved in the Files tab (drag, Move to…, Undo move)
  function remapTaskFiles(moves) {
    if (!moves || !moves.length) return;
    window.api.tasksRemapFiles(moves).then((r) => {
      if (r && r.ok && r.changed) {
        tk.tasks = r.tasks;
        if (!$('tasksView').hidden) refresh();
      }
    });
  }
  if (typeof window.remapAfterMove === 'function') {
    const originalRemap = window.remapAfterMove;
    window.remapAfterMove = function (moves) {
      originalRemap(moves);
      remapTaskFiles(moves);
    };
  }

  // ---------- filtering and sorting ----------
  function filtered(forBoard) {
    const q = $('tkSearch').value.trim().toLowerCase();
    const tag = $('tkTag').value;
    const showDone = $('tkShowDone').checked;
    const today = todayISO();
    return tk.tasks.filter(t => {
      if (!forBoard && !showDone && t.status === 'done') return false;
      if (tag && !t.tags.includes(tag)) return false;
      if (filter === 'today' && !(t.status !== 'done' && t.due === today)) return false;
      if (filter === 'overdue' && !(t.status !== 'done' && t.due && t.due < today)) return false;
      if (filter === 'urgent' && !(t.status !== 'done' && t.priority === 'urgent')) return false;
      if (filter === 'doing' && t.status !== 'doing') return false;
      if (q) {
        const hay = (t.title + ' ' + t.notes + ' ' + t.tags.join(' ') + ' ' + t.checklist.map(c => c.text).join(' ')).toLowerCase();
        if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }

  const byTask = (a, b) =>
    RANK[a.priority] - RANK[b.priority] ||
    (a.due || '9999').localeCompare(b.due || '9999') ||
    a.title.localeCompare(b.title);
  const byDoneDesc = (a, b) => (b.completedAt || '').localeCompare(a.completedAt || '');

  // ---------- small builders ----------
  function pill(text, cls) {
    return el('span', 'pill' + (cls ? ' ' + cls : ''), text);
  }

  function metaRow(t) {
    const m = el('div', 'tkMeta');
    if (t.priority === 'urgent' || t.priority === 'high') m.appendChild(pill(PRIO_LABEL[t.priority], t.priority));
    if (t.status === 'doing') m.appendChild(pill('In progress', 'doing'));
    const di = dueInfo(t);
    if (di) m.appendChild(pill('📅 ' + di.text, di.cls));
    if (t.checklist.length) m.appendChild(pill(`☑ ${t.checklist.filter(c => c.done).length}/${t.checklist.length}`));
    if (t.repeat !== 'none') m.appendChild(pill('🔁 ' + t.repeat));
    if (t.files.length) m.appendChild(pill('📎 ' + t.files.length));
    for (const g of t.tags) m.appendChild(pill('#' + g));
    return m;
  }

  function taskRow(t) {
    const row = el('div', `tkRowItem p-${t.priority}${t.status === 'done' ? ' done' : ''}`);
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'tkCheck';
    cb.checked = t.status === 'done';
    cb.title = 'Mark as done';
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => setStatus(t, cb.checked ? 'done' : 'todo'));
    const main = el('div', 'tkMain');
    main.append(el('div', 'tkTitle', t.title), metaRow(t));
    row.append(cb, main);
    row.addEventListener('click', () => openEditor(t));
    return row;
  }

  function taskCard(t) {
    const c = el('div', `tkCard p-${t.priority}${t.status === 'done' ? ' done' : ''}`);
    c.draggable = true;
    c.addEventListener('dragstart', (e) => {
      dragId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.title);
    });
    c.addEventListener('dragend', () => { dragId = null; });
    c.append(el('div', 'tkTitle', t.title), metaRow(t));
    c.addEventListener('click', () => openEditor(t));
    return c;
  }

  function emptyState() {
    const msg = tk.tasks.length
      ? 'No tasks match these filters.'
      : 'No tasks yet. Type something in the quick add box above and press Enter, or click "+ New task".';
    return el('div', 'empty', msg);
  }

  // ---------- views ----------
  function renderList(body) {
    const groups = { over: [], today: [], week: [], later: [], none: [], done: [] };
    for (const t of filtered(false)) {
      if (t.status === 'done') { groups.done.push(t); continue; }
      if (!t.due) { groups.none.push(t); continue; }
      const n = diff(t.due);
      (n < 0 ? groups.over : n === 0 ? groups.today : n <= 7 ? groups.week : groups.later).push(t);
    }
    const defs = [['over', 'Overdue', 'over'], ['today', 'Today', ''], ['week', 'Next 7 days', ''],
      ['later', 'Later', ''], ['none', 'No date', ''], ['done', 'Done', '']];
    let any = false;
    for (const [key, title, cls] of defs) {
      const list = groups[key];
      if (!list.length) continue;
      any = true;
      list.sort(key === 'done' ? byDoneDesc : byTask);
      const g = el('div', 'tkGroup');
      g.appendChild(el('div', 'tkGroupHead' + (cls ? ' ' + cls : ''), `${title} (${list.length})`));
      list.forEach(t => g.appendChild(taskRow(t)));
      body.appendChild(g);
    }
    if (!any) body.appendChild(emptyState());
  }

  function renderBoard(body) {
    const items = filtered(true);
    const wrap = el('div');
    wrap.id = 'tkBoard';
    const cols = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];
    for (const [key, title] of cols) {
      const all = items.filter(t => t.status === key);
      const list = key === 'done' ? all.sort(byDoneDesc).slice(0, 15) : all.sort(byTask);
      const col = el('div', 'tkCol');
      const head = el('div', 'tkColHead');
      head.append(el('span', '', title), pill(String(all.length)));
      col.appendChild(head);
      list.forEach(t => col.appendChild(taskCard(t)));
      if (!list.length) col.appendChild(el('div', 'empty', key === 'done' ? 'Finished tasks appear here' : 'Drop tasks here'));
      col.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); col.classList.add('dropok'); } });
      col.addEventListener('dragleave', () => col.classList.remove('dropok'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('dropok');
        const t = tk.tasks.find(x => x.id === dragId);
        dragId = null;
        if (t && t.status !== key) setStatus(t, key);
      });
      wrap.appendChild(col);
    }
    body.appendChild(wrap);
  }

  function calChip(t) {
    const c = el('div', `calChip p-${t.priority}${t.status === 'done' ? ' done' : ''}`, t.title);
    c.title = t.title;
    c.draggable = true;
    c.addEventListener('dragstart', (e) => {
      dragId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.title);
    });
    c.addEventListener('dragend', () => { dragId = null; });
    c.addEventListener('click', (e) => { e.stopPropagation(); openEditor(t); });
    return c;
  }

  function renderCalendar(body) {
    const all = filtered(false);
    const items = all.filter(t => t.due);
    const noDate = all.length - items.length;
    const byDay = new Map();
    for (const t of items) {
      if (!byDay.has(t.due)) byDay.set(t.due, []);
      byDay.get(t.due).push(t);
    }

    // header: month and navigation
    const head = el('div', 'calHead');
    const prev = el('button', '', '◀');
    prev.title = 'Previous month';
    prev.addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); refresh(); });
    const next = el('button', '', '▶');
    next.title = 'Next month';
    next.addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); refresh(); });
    const todayBtn = el('button', '', 'Today');
    todayBtn.addEventListener('click', () => {
      const n = new Date();
      calMonth = new Date(n.getFullYear(), n.getMonth(), 1);
      calSel = todayISO();
      refresh();
    });
    head.append(prev, todayBtn, next, el('b', 'calTitle', calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })));
    body.appendChild(head);

    // month grid (weeks start on Sunday)
    const grid = el('div', 'calGrid');
    for (let i = 0; i < 7; i++) {
      grid.appendChild(el('div', 'calDow', new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })));
    }
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const today = todayISO();

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const day = iso(d);
      const cell = el('div', 'calCell' +
        (d.getMonth() !== calMonth.getMonth() ? ' other' : '') +
        (day === today ? ' today' : '') +
        (day === calSel ? ' selc' : ''));
      cell.appendChild(el('div', 'calNum', String(d.getDate())));

      const list = (byDay.get(day) || []).slice().sort(byTask);
      list.slice(0, 3).forEach(t => cell.appendChild(calChip(t)));
      if (list.length > 3) cell.appendChild(el('div', 'calMore', `+${list.length - 3} more`));

      cell.addEventListener('click', () => { calSel = day; refresh(); });
      cell.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); cell.classList.add('dropok'); } });
      cell.addEventListener('dragleave', () => cell.classList.remove('dropok'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('dropok');
        const t = tk.tasks.find(x => x.id === dragId);
        dragId = null;
        if (t && t.due !== day) persist(Object.assign({}, t, { due: day }));
      });
      grid.appendChild(cell);
    }
    body.appendChild(grid);

    // the selected day, with all its tasks
    if (calSel) {
      const panel = el('div', 'calPanel');
      const list = (byDay.get(calSel) || []).slice().sort(byTask);
      const bar = el('div', 'tkRow');
      const label = parse(calSel).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      bar.appendChild(el('div', 'tkGroupHead', `${label} · ${list.length} task${list.length === 1 ? '' : 's'}`));
      const add = el('button', '', '+ New task on this day');
      add.addEventListener('click', () => openEditor(null, { due: calSel }));
      bar.appendChild(add);
      panel.appendChild(bar);
      list.forEach(t => panel.appendChild(taskRow(t)));
      if (!list.length) panel.appendChild(el('div', 'empty', 'Nothing due on this day.'));
      body.appendChild(panel);
    }
    if (noDate) {
      body.appendChild(el('div', 'chartNote', `${noDate} task${noDate === 1 ? '' : 's'} without a target date ${noDate === 1 ? 'is' : 'are'} not shown on the calendar.`));
    }
  }

  // ---------- charts (drawn as SVG, no libraries, work offline) ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, text) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function stackedBars(data) {
    const W = 640, H = 230, L = 34, R = 8, T = 16, B = 44;
    const w = W - L - R, h = H - T - B;
    const max = Math.max(1, ...data.map(d => d.total));
    const top = max <= 2 ? 2 : (max % 2 ? max + 1 : max);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });

    [0, top / 2, top].forEach(v => {
      const y = T + h - (v / top) * h;
      s.appendChild(svg('line', { x1: L, x2: W - R, y1: y, y2: y, stroke: '#e5e7eb' }));
      s.appendChild(svg('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#777' }, String(v)));
    });

    const bw = w / data.length;
    data.forEach((d, i) => {
      const barW = bw * 0.64;
      const bx = L + i * bw + bw * 0.18;
      let y = T + h;
      for (const p of d.parts) {
        if (!p.v) continue;
        const ph = (p.v / top) * h;
        y -= ph;
        const r = svg('rect', { x: bx, y, width: barW, height: ph, fill: p.color, rx: 2 });
        r.appendChild(svg('title', {}, `${d.tip || d.label}: ${p.v}${p.label ? ' ' + p.label : ''}`));
        s.appendChild(r);
      }
      if (d.total) s.appendChild(svg('text', { x: bx + barW / 2, y: y - 3, 'text-anchor': 'middle', 'font-size': 10, fill: '#333' }, String(d.total)));
      const hl = d.hl ? { fill: '#1f6feb', 'font-weight': 700 } : { fill: '#666' };
      s.appendChild(svg('text', Object.assign({ x: bx + barW / 2, y: T + h + 14, 'text-anchor': 'middle', 'font-size': 10 }, hl), d.label));
      if (d.sub) s.appendChild(svg('text', Object.assign({ x: bx + barW / 2, y: T + h + 27, 'text-anchor': 'middle', 'font-size': 10 }, hl), d.sub));
    });
    return s;
  }

  function donut(parts, centerLabel) {
    const r = 52, sw = 22, c = 2 * Math.PI * r;
    const total = parts.reduce((a, p) => a + p.v, 0);
    const s = svg('svg', { viewBox: '0 0 150 150', role: 'img' });
    s.appendChild(svg('circle', { cx: 75, cy: 75, r, fill: 'none', stroke: '#eef0f3', 'stroke-width': sw }));
    let offset = 0;
    if (total) {
      for (const p of parts) {
        if (!p.v) continue;
        const len = (p.v / total) * c;
        const arc = svg('circle', {
          cx: 75, cy: 75, r, fill: 'none', stroke: p.color, 'stroke-width': sw,
          'stroke-dasharray': `${len} ${c - len}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 75 75)'
        });
        arc.appendChild(svg('title', {}, `${p.label}: ${p.v}`));
        s.appendChild(arc);
        offset += len;
      }
    }
    s.appendChild(svg('text', { x: 75, y: 80, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 700, fill: '#222' }, String(total)));
    s.appendChild(svg('text', { x: 75, y: 96, 'text-anchor': 'middle', 'font-size': 10, fill: '#777' }, centerLabel));
    return s;
  }

  function legend(items) {
    const d = el('div', 'legend');
    for (const it of items) {
      const sp = el('span');
      const i = el('i');
      i.style.background = it.color;
      sp.append(i, document.createTextNode(it.label + (it.v !== undefined ? ` (${it.v})` : '')));
      d.appendChild(sp);
    }
    return d;
  }

  function chartCard(title, wide) {
    const c = el('div', 'chartCard' + (wide ? ' wide' : ''));
    c.appendChild(el('h4', '', title));
    return c;
  }

  function renderInsights(body) {
    if (!tk.tasks.length) {
      body.appendChild(el('div', 'empty', 'Charts appear once you add some tasks.'));
      return;
    }
    const today = todayISO();
    const open = tk.tasks.filter(t => t.status !== 'done');
    const done = tk.tasks.filter(t => t.status === 'done');
    const doneISO = (t) => (t.completedAt ? iso(new Date(t.completedAt)) : '');

    // KPI cards
    const overdue = open.filter(t => t.due && t.due < today).length;
    const dueToday = open.filter(t => t.due === today).length;
    const weekAgo = addDays(today, -6);
    const doneWeek = done.filter(t => doneISO(t) >= weekAgo).length;
    const withDue = done.filter(t => t.due && t.completedAt);
    const onTime = withDue.filter(t => doneISO(t) <= t.due).length;
    const onTimeText = withDue.length ? Math.round((onTime / withDue.length) * 100) + '%' : '–';

    const kpis = el('div', 'kpis');
    const kpi = (n, label, bad) => {
      const k = el('div', 'kpi' + (bad ? ' bad' : ''));
      k.append(el('b', '', String(n)), el('span', '', label));
      kpis.appendChild(k);
    };
    kpi(open.length, 'Open tasks');
    kpi(overdue, 'Overdue', overdue > 0);
    kpi(dueToday, 'Due today');
    kpi(doneWeek, 'Done in the last 7 days');
    kpi(onTimeText, 'Finished on time');
    body.appendChild(kpis);

    const charts = el('div', 'charts');

    // workload next 14 days, stacked by priority
    const order = ['low', 'normal', 'high', 'urgent'];
    const partsOf = (list) => order.map(p => ({ v: list.filter(t => t.priority === p).length, color: PRIO_COLOR[p], label: p }));
    const work = [];
    const late = open.filter(t => t.due && t.due < today);
    work.push({ label: 'Late', sub: '', parts: partsOf(late), total: late.length, tip: 'Overdue' });
    for (let i = 0; i < 14; i++) {
      const day = addDays(today, i);
      const list = open.filter(t => t.due === day);
      const d = parse(day);
      work.push({
        label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
        sub: String(d.getDate()), parts: partsOf(list), total: list.length, hl: i === 0, tip: day
      });
    }
    const c1 = chartCard('Workload: open tasks by target date (next 14 days)', true);
    c1.appendChild(stackedBars(work));
    c1.appendChild(legend(order.slice().reverse().map(p => ({ color: PRIO_COLOR[p], label: PRIO_LABEL[p] }))));
    const beyond = open.filter(t => !t.due || t.due > addDays(today, 13)).length;
    if (beyond) c1.appendChild(el('div', 'chartNote', `${beyond} open task${beyond === 1 ? ' is' : 's are'} due later or ${beyond === 1 ? 'has' : 'have'} no date.`));
    charts.appendChild(c1);

    // priority donut
    const c2 = chartCard('Open tasks by priority');
    const pParts = ['urgent', 'high', 'normal', 'low'].map(p => ({ v: open.filter(t => t.priority === p).length, color: PRIO_COLOR[p], label: PRIO_LABEL[p] }));
    const w2 = el('div', 'donutWrap');
    w2.append(donut(pParts, 'open'), legend(pParts));
    c2.appendChild(w2);
    charts.appendChild(c2);

    // status donut
    const c3 = chartCard('Tasks by status');
    const sParts = [
      { v: tk.tasks.filter(t => t.status === 'todo').length, color: '#8c959f', label: 'To do' },
      { v: tk.tasks.filter(t => t.status === 'doing').length, color: '#2f81f7', label: 'In progress' },
      { v: done.length, color: '#2da44e', label: 'Done' }
    ];
    const w3 = el('div', 'donutWrap');
    w3.append(donut(sParts, 'tasks'), legend(sParts));
    c3.appendChild(w3);
    charts.appendChild(c3);

    // completed per day
    const dd = [];
    for (let i = 13; i >= 0; i--) {
      const day = addDays(today, -i);
      const n = done.filter(t => doneISO(t) === day).length;
      const d = parse(day);
      dd.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short' }), sub: String(d.getDate()),
        parts: [{ v: n, color: '#2da44e', label: 'done' }], total: n, hl: i === 0, tip: day
      });
    }
    const c4 = chartCard('Completed per day (last 14 days)', true);
    c4.appendChild(stackedBars(dd));
    charts.appendChild(c4);

    // open tasks by tag
    const counts = new Map();
    for (const t of open) {
      for (const g of (t.tags.length ? t.tags : ['(no tag)'])) counts.set(g, (counts.get(g) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const c5 = chartCard('Open tasks by tag');
    if (!top.length) c5.appendChild(el('div', 'empty', 'No open tasks.'));
    const maxN = Math.max(1, ...top.map(x => x[1]));
    for (const [name, n] of top) {
      const row = el('div', 'hbar');
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.width = (n / maxN) * 100 + '%';
      bar.appendChild(fill);
      row.append(el('span', 'lbl', name), bar, el('span', 'n', String(n)));
      c5.appendChild(row);
    }
    charts.appendChild(c5);

    body.appendChild(charts);
  }

  // ---------- refresh everything ----------
  function updateBadge() {
    const today = todayISO();
    const n = tk.tasks.filter(t => t.status !== 'done' && t.due && t.due <= today).length;
    const b = $('taskBadge');
    b.textContent = String(n);
    b.hidden = n === 0;
  }

  function refresh() {
    updateBadge();

    // summary line
    const today = todayISO();
    const open = tk.tasks.filter(t => t.status !== 'done');
    const over = open.filter(t => t.due && t.due < today).length;
    const dueToday = open.filter(t => t.due === today).length;
    const bits = [`${open.length} open`];
    if (over) bits.push(`${over} overdue`);
    if (dueToday) bits.push(`${dueToday} due today`);
    $('tkSummary').textContent = bits.join(' · ');

    // tag filter + editor suggestions
    const tags = [...new Set(tk.tasks.flatMap(t => t.tags))].sort();
    const sel = $('tkTag');
    const cur = sel.value;
    sel.innerHTML = '<option value="">All tags</option>';
    for (const g of tags) { const o = el('option', '', '#' + g); o.value = g; sel.appendChild(o); }
    sel.value = tags.includes(cur) ? cur : '';
    const dl = $('tkTagList');
    dl.innerHTML = '';
    for (const g of tags) { const o = document.createElement('option'); o.value = g; dl.appendChild(o); }

    // main area
    const body = $('tkBody');
    body.innerHTML = '';
    const insights = viewName === 'insights';
    $('tkChips').hidden = insights;
    $('tkSearch').hidden = insights;
    $('tkTag').hidden = insights;
    $('tkShowDone').parentElement.hidden = !(viewName === 'list' || viewName === 'calendar');
    if (viewName === 'list') renderList(body);
    else if (viewName === 'board') renderBoard(body);
    else if (viewName === 'calendar') renderCalendar(body);
    else renderInsights(body);
  }

  // ---------- AI brief card ----------
  function showBrief(title, text, status) {
    $('tkBrief').hidden = false;
    $('tkBriefTitle').textContent = title;
    $('tkBriefText').textContent = text || '';
    $('tkBriefStatus').textContent = status || '';
  }

  async function runAi(title, call, emptyText) {
    if (planBusy) return;
    planBusy = true;
    $('tkPlan').disabled = true;
    $('tkReview').disabled = true;
    showBrief(title, '', 'Starting...');
    const r = await call();
    planBusy = false;
    $('tkPlan').disabled = false;
    $('tkReview').disabled = false;
    if (!r.ok) { showBrief(title, r.error, ''); return; }
    if (r.empty) { showBrief(title, emptyText, ''); return; }
    $('tkBriefStatus').textContent = 'Done. This is advice from a small local model, so double-check important dates.';
  }

  async function refreshAiState() {
    const r = await window.api.taskAiStatus();
    $('aiDot').style.background = r.running && r.model ? '#2da44e' : r.running ? '#d29922' : '#bbb';
    $('aiState').textContent = r.running
      ? (r.model ? 'AI ready (runs on this PC)' : 'Ollama is running, but the model is missing')
      : 'AI offline: start Ollama to use the ✨ buttons';
  }

  // ---------- editor ----------
  function setPrio(p) {
    draft.priority = p;
    document.querySelectorAll('#tkfPrio button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  }

  function renderChecklist() {
    const box = $('tkfChecklist');
    box.innerHTML = '';
    draft.checklist.forEach((c, i) => {
      const row = el('div', 'ckRow');

      // drag to reorder (only the ⋮⋮ handle starts a drag, so typing and selecting text still work)
      const grip = el('span', 'grip', '⋮⋮');
      grip.title = 'Drag to reorder';
      grip.addEventListener('mousedown', () => { row.draggable = true; });
      grip.addEventListener('mouseup', () => { row.draggable = false; });
      row.addEventListener('dragstart', (e) => {
        ckDrag = i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', c.text);
        row.classList.add('ckDragging');
      });
      row.addEventListener('dragend', () => {
        ckDrag = -1;
        row.draggable = false;
        row.classList.remove('ckDragging');
        box.querySelectorAll('.ckOver').forEach(x => x.classList.remove('ckOver'));
      });
      row.addEventListener('dragover', (e) => {
        if (ckDrag >= 0) { e.preventDefault(); row.classList.add('ckOver'); }
      });
      row.addEventListener('dragleave', () => row.classList.remove('ckOver'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        if (ckDrag < 0 || ckDrag === i) return;
        const moved = draft.checklist.splice(ckDrag, 1)[0];
        draft.checklist.splice(i, 0, moved);
        ckDrag = -1;
        renderChecklist();
      });

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = c.done;
      cb.addEventListener('change', () => { c.done = cb.checked; });
      const tx = document.createElement('input');
      tx.type = 'text';
      tx.value = c.text;
      tx.addEventListener('input', () => { c.text = tx.value; });
      const rm = el('button', '', '✕');
      rm.type = 'button';
      rm.addEventListener('click', () => { draft.checklist.splice(i, 1); renderChecklist(); });
      row.append(grip, cb, tx, rm);
      box.appendChild(row);
    });
  }

  function renderLinks() {
    const box = $('tkfFiles');
    box.innerHTML = '';
    draft.files.forEach((p, i) => {
      const row = el('div', 'fileLink');
      const nm = el('span', 'nm', baseName(p));
      nm.title = p;
      const open = el('button', '', 'Open');
      open.type = 'button';
      open.addEventListener('click', async () => {
        const msg = await window.api.taskOpenPath(p);
        if (msg) $('tkfMsg').textContent = msg;
      });
      const rm = el('button', '', '✕');
      rm.type = 'button';
      rm.addEventListener('click', () => { draft.files.splice(i, 1); renderLinks(); });
      row.append(el('span', '', '📎'), nm, open, rm);
      box.appendChild(row);
    });
  }

  function openEditor(task, preset) {
    draft = task
      ? JSON.parse(JSON.stringify(task))
      : Object.assign({ id: null, title: '', notes: '', status: 'todo', priority: 'normal', due: '', tags: [], repeat: 'none', checklist: [], files: [] }, preset || {});
    $('tkDlgTitle').textContent = task ? 'Edit task' : 'New task';
    $('tkfTitle').value = draft.title;
    $('tkfDue').value = draft.due;
    $('tkfStatus').value = draft.status;
    $('tkfTags').value = draft.tags.join(', ');
    $('tkfRepeat').value = draft.repeat;
    $('tkfNotes').value = draft.notes;
    $('tkfDelete').hidden = !task;
    $('tkfMsg').textContent = '';
    setPrio(draft.priority);
    renderChecklist();
    renderLinks();
    $('tkModal').hidden = false;
    $('tkfTitle').focus();
  }

  function closeEditor() { $('tkModal').hidden = true; draft = null; }

  function readEditor() {
    return {
      id: draft.id,
      title: $('tkfTitle').value.trim(),
      notes: $('tkfNotes').value,
      status: $('tkfStatus').value,
      priority: draft.priority,
      due: $('tkfDue').value,
      tags: $('tkfTags').value.split(',').map(s => s.replace(/^#/, '').trim()).filter(Boolean),
      repeat: $('tkfRepeat').value,
      checklist: draft.checklist,
      files: draft.files
    };
  }

  async function saveEditor() {
    if (!draft) return;
    const obj = readEditor();
    if (!obj.title) { $('tkfMsg').textContent = 'Please type a title.'; $('tkfTitle').focus(); return; }
    $('tkfSave').disabled = true;
    const r = await persist(obj);
    $('tkfSave').disabled = false;
    if (r && r.ok) closeEditor();
    else if (r) $('tkfMsg').textContent = r.error;
  }

  function addChecklistItem() {
    const inp = $('tkfNewItem');
    const text = inp.value.trim();
    if (!text) return;
    draft.checklist.push({ text, done: false });
    inp.value = '';
    renderChecklist();
  }

  // ---------- quick add ----------
  async function quickAdd() {
    const text = $('tkQuick').value.trim();
    if (!text) return;
    const p = parseQuick(text);
    const r = await persist({ title: p.title, due: p.due, priority: p.priority, tags: p.tags, status: 'todo' });
    if (r && r.ok) {
      $('tkQuick').value = '';
      toast('Added: ' + p.title + (p.due ? ' (due ' + p.due + ')' : '') + (p.priority === 'urgent' ? ' 🔥' : ''));
    }
  }

  async function quickAddAi() {
    const text = $('tkQuick').value.trim();
    if (!text) { toast('Type a sentence first.'); return; }
    const btn = $('tkQuickAi');
    btn.disabled = true;
    btn.textContent = 'Thinking...';
    const r = await window.api.taskAiParse(text);
    btn.disabled = false;
    btn.textContent = '✨ AI add';
    if (!r.ok) { toast(r.error + ' You can still press Enter to add it without AI.'); return; }
    $('tkQuick').value = '';
    openEditor(null, r.draft);
    $('tkfMsg').textContent = 'The AI filled this in. Check it, then Save.';
  }

  // ---------- tabs ----------
  function switchTab(tab) {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('filesView').hidden = tab !== 'files';
    $('tasksView').hidden = tab !== 'tasks';
    if (tab === 'tasks') { refresh(); refreshAiState(); }
  }

  // ---------- wiring ----------
  document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  document.querySelectorAll('#tkViews button').forEach(b => b.addEventListener('click', () => {
    viewName = b.dataset.v;
    document.querySelectorAll('#tkViews button').forEach(x => x.classList.toggle('on', x === b));
    refresh();
  }));
  document.querySelectorAll('#tkChips button').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.f;
    document.querySelectorAll('#tkChips button').forEach(x => x.classList.toggle('on', x === b));
    refresh();
  }));
  $('tkSearch').addEventListener('input', refresh);
  $('tkTag').addEventListener('change', refresh);
  $('tkShowDone').addEventListener('change', refresh);

  $('tkNew').addEventListener('click', () => openEditor(null));
  $('tkQuick').addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAdd(); });
  $('tkQuickAi').addEventListener('click', quickAddAi);

  $('tkPlan').addEventListener('click', () =>
    runAi('AI plan for today', () => window.api.taskPlan(), 'You have no open tasks. Nice!'));
  $('tkReview').addEventListener('click', () =>
    runAi('Weekly review (AI)', () => window.api.taskReview(), 'There is no task activity to review yet.'));

  window.api.onPlanToken((t) => { $('tkBriefText').textContent += t; });
  window.api.onPlanStatus((m) => { $('tkBriefStatus').textContent = m; });
  window.api.onTasksBriefing((b) => {
    if (b.kind === 'weekly') tk.weekly = b; else tk.briefing = b;
    if (briefDismissed !== todayISO()) {
      showBrief(b.kind === 'weekly' ? 'Weekly review (AI)' : 'Morning briefing (AI)', b.text, 'Written today by your local AI.');
    }
  });
  $('tkBriefClose').addEventListener('click', () => {
    if (planBusy) return;
    $('tkBrief').hidden = true;
    briefDismissed = todayISO();
  });

  // editor
  document.querySelectorAll('#tkfPrio button').forEach(b => b.addEventListener('click', () => setPrio(b.dataset.p)));
  document.querySelectorAll('.dateRow button').forEach(b => b.addEventListener('click', () => {
    const q = b.dataset.q;
    $('tkfDue').value = q === 'clear' ? '' : addDays(todayISO(), Number(q));
  }));
  $('tkfAddItem').addEventListener('click', addChecklistItem);
  $('tkfNewItem').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } });
  $('tkfTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveEditor(); });
  $('tkfSave').addEventListener('click', saveEditor);
  $('tkfCancel').addEventListener('click', closeEditor);
  $('tkfDelete').addEventListener('click', async () => {
    if (!draft || !draft.id) return;
    if (!confirm('Delete this task?\n\n"' + draft.title + '"')) return;
    const r = await window.api.taskDelete(draft.id);
    if (r.ok) { tk.tasks = r.tasks; refresh(); closeEditor(); toast('Task deleted.'); }
  });

  $('tkfSuggest').addEventListener('click', async () => {
    const title = $('tkfTitle').value.trim();
    if (!title) { $('tkfMsg').textContent = 'Type a title first.'; return; }
    const btn = $('tkfSuggest');
    btn.disabled = true;
    $('tkfMsg').textContent = 'Asking the AI...';
    const r = await window.api.taskAiSteps(title, $('tkfNotes').value);
    btn.disabled = false;
    if (!r.ok) { $('tkfMsg').textContent = r.error; return; }
    const have = new Set(draft.checklist.map(c => c.text.toLowerCase()));
    let added = 0;
    for (const s of r.steps) {
      if (!have.has(s.toLowerCase())) { draft.checklist.push({ text: s, done: false }); added++; }
    }
    renderChecklist();
    $('tkfMsg').textContent = `${added} step${added === 1 ? '' : 's'} added. Edit, reorder or remove any you don't need.`;
  });

  $('tkfLinkSel').addEventListener('click', () => {
    if (!selectedPath) { $('tkfMsg').textContent = 'Select a file in the Files tab first.'; return; }
    if (!draft.files.includes(selectedPath)) draft.files.push(selectedPath);
    renderLinks();
  });
  $('tkfLinkPick').addEventListener('click', async () => {
    const p = await window.api.taskPickFile();
    if (p && !draft.files.includes(p)) draft.files.push(p);
    renderLinks();
  });

  // reminders and AI settings
  $('tkSettings').addEventListener('click', () => {
    $('setNotify').checked = !!tk.settings.notify;
    $('setBrief').checked = !!tk.settings.aiBriefing;
    $('setWeekly').checked = !!tk.settings.aiWeekly;
    $('setMove').value = tk.settings.moveOffer || 'punch';
    $('tkSetModal').hidden = false;
  });
  const saveSettings = async () => {
    tk.settings = await window.api.tasksSettingsSet({
      notify: $('setNotify').checked,
      aiBriefing: $('setBrief').checked,
      aiWeekly: $('setWeekly').checked,
      moveOffer: $('setMove').value
    });
  };
  ['setNotify', 'setBrief', 'setWeekly'].forEach(id => $(id).addEventListener('change', saveSettings));
  $('setMove').addEventListener('change', saveSettings);
  $('setTest').addEventListener('click', async () => {
    const ok = await window.api.taskTestNotify();
    toast(ok ? 'Test reminder sent. Check the bottom-right of your screen.' : 'Windows did not allow a notification. Check your notification settings.');
  });
  $('setClose').addEventListener('click', () => { $('tkSetModal').hidden = true; });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('tkModal').hidden) closeEditor();
    if (!$('tkSetModal').hidden) $('tkSetModal').hidden = true;
    if (!$('tkMoveModal').hidden) $('tkMoveModal').hidden = true;
  });

  // task for the file selected in the Files tab
  $('taskBtn').addEventListener('click', () => {
    const f = fileByPath.get(selectedPath);
    if (!f) return;
    openEditor(null, { title: 'Follow up: ' + f.name, files: [f.path] });
  });

  window.api.onGotoTab((tab) => switchTab(tab));

  // keep date-based labels and the badge fresh
  setInterval(() => {
    if (!$('tasksView').hidden) refresh();
    else updateBadge();
  }, 5 * 60 * 1000);
  setInterval(() => { if (!$('tasksView').hidden) refreshAiState(); }, 60 * 1000);

  window.addEventListener('load', load);
})();