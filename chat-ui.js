// Ask AI tab: a chat that answers from your inventory, punch lists and notes (local Ollama, works offline).
(function () {
  'use strict';
  const view = document.getElementById('chatView');
  if (!view) return;
  const { E, say } = WH;

  const css = document.createElement('style');
  css.textContent = `
    #chatView .cLog { flex: 1; overflow: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
    #chatView .cMsg { max-width: 820px; padding: 9px 13px; border-radius: 12px; white-space: pre-wrap; line-height: 1.45; font-size: 14px; }
    #chatView .cMsg.me { align-self: flex-end; background: var(--accent, #1f6feb); color: var(--accent-text, #fff); }
    #chatView .cMsg.ai { align-self: flex-start; background: var(--panel2, #f1f3f5); border: 1px solid var(--border, #ddd); }
    #chatView .cMsg.err { color: #c62828; }
    #chatView .cBar { border-top: 1px solid var(--border, #ddd); padding: 10px 16px; background: var(--panel, #fff); }
    #chatView .cBar textarea { flex: 1; resize: none; height: 44px; font: 14px system-ui, sans-serif; padding: 8px; }
    #chatView .cChips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    #chatView .cChip { border: 1px solid var(--border, #ccc); border-radius: 14px; padding: 3px 10px; font-size: 12px; cursor: pointer; background: var(--panel2, #f4f4f4); }
    #chatView .cSrc { display: flex; gap: 12px; align-items: center; font-size: 12px; }
  `;
  document.head.appendChild(css);

  view.className = 'whView';
  const top = E('div', 'whTop');
  top.append(E('h2', '', '💬 Ask AI'));
  const bar1 = E('div', 'whRow'); const src = E('div', 'cSrc');
  const srcs = {};
  [['inv', 'Inventory'], ['punch', 'Punch lists'], ['notes', 'Notes']].forEach(([k, label]) => {
    const l = E('label'); const c = WH.inp('checkbox', '1', { checked: true }); srcs[k] = c; l.append(c, ' ' + label); src.appendChild(l);
  });
  const clear = E('button', '', 'New chat');
  bar1.append(E('span', 'whMuted', 'The AI may use:'), src, E('span', 'whGrow'), clear);
  top.appendChild(bar1);
  const log = E('div', 'cLog');
  const bottom = E('div', 'cBar');
  const chips = E('div', 'cChips');
  const row = E('div', 'whRow');
  const box = E('textarea'); box.placeholder = 'Ask something about your inventory, punch lists or notes…  (Enter to send, Shift+Enter for a new line)';
  const sendBtn = E('button', 'primary', 'Send'), stopBtn = E('button', '', 'Stop'); stopBtn.hidden = true;
  row.append(box, sendBtn, stopBtn);
  bottom.append(chips, row, E('div', 'whMuted', 'A small offline model: good for looking things up and short summaries. Please double-check important numbers.'));
  view.append(top, log, bottom);

  let history = [], busy = false, reqId = 0, liveEl = null;
  const SUGGEST = ['What is low or out of stock?', 'Which tools are still borrowed, and by whom?', 'Which punch items are overdue?', 'How many open punch items does each person have?', 'What did I write in my notes about cables?'];
  SUGGEST.forEach(t => { const c = E('span', 'cChip', t); c.addEventListener('click', () => { box.value = t; ask(); }); chips.appendChild(c); });

  function add(role, text, cls) {
    const m = E('div', 'cMsg ' + role + (cls ? ' ' + cls : ''), text); log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
  }
  function welcome() {
    log.innerHTML = '';
    add('ai', 'Hi! Ask me about your stock, borrowed tools, punch list items or notes. I answer only from what is saved in this app.');
  }

  // ----- the data the AI may use (short lines, so the small model can follow) -----
  const q2words = (q) => [...new Set(String(q).toLowerCase().split(/[^a-z0-9\-]+/).filter(w => w.length > 2 && !['the', 'and', 'what', 'who', 'which', 'how', 'are', 'for', 'did', 'does', 'with', 'about', 'many', 'have', 'has', 'from', 'that', 'this', 'still', 'all'].includes(w)))];
  const hit = (text, words) => words.some(w => text.toLowerCase().includes(w));
  const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

  function inventoryContext(S, words) {
    const L = ['== INVENTORY (today ' + S.today + ') =='];
    const items = S.items.filter(i => !i.archived);
    const consum = items.filter(i => i.category !== 'Tools & Equipment');
    const out = consum.filter(i => i.stat.onHand <= 0), low = consum.filter(i => i.stat.onHand > 0 && i.minQty > 0 && i.stat.onHand <= i.minQty);
    L.push(`Items: ${items.length}. Out of stock: ${out.length}. Low (at or below minimum): ${low.length}.`);
    if (out.length) L.push('OUT OF STOCK: ' + out.slice(0, 40).map(i => `${i.code} ${i.name}`).join('; '));
    if (low.length) L.push('LOW STOCK (code name: on hand / minimum): ' + low.slice(0, 40).map(i => `${i.code} ${i.name}: ${num(i.stat.onHand)} ${i.uom} / min ${num(i.minQty)}`).join('; '));
    const open = S.loans.filter(l => l.open > 0);
    L.push(`Borrowed tools not yet returned: ${open.length}.`);
    open.slice(0, 40).forEach(l => L.push(`BORROWED: ${l.itemCode} ${l.itemName} x${num(l.open)} by ${l.borrower || '(no name)'} since ${l.dateOut}` + (l.dueDate ? `, due ${l.dueDate}` + (l.dueDate < S.today ? ' (OVERDUE)' : '') : '')));
    const rel = items.filter(i => words.length && hit(i.code + ' ' + i.name + ' ' + (i.group || '') + ' ' + (i.location || ''), words)).slice(0, 40);
    if (rel.length) { L.push('ITEMS MATCHING THE QUESTION (code name: on hand, minimum, location):'); rel.forEach(i => L.push(`${i.code} ${i.name}: ${num(i.stat.onHand)} ${i.uom}, min ${num(i.minQty)}` + (i.location ? ', at ' + i.location : ''))); }
    const mv = S.movements.slice().sort((a, b) => String(b.date).localeCompare(a.date)).slice(0, 25);
    if (mv.length) { L.push('LATEST MOVEMENTS:'); mv.forEach(m => L.push(`${m.date} ${m.dir === 'in' ? 'IN' : 'OUT'} ${num(m.qty)} ${m.uom} ${m.itemCode} ${m.itemName}` + (m.party ? ' / ' + m.party : '') + (m.reason ? ' / ' + m.reason : ''))); }
    return L.join('\n');
  }
  function punchContext(lists, today, words) {
    const L = ['== PUNCH LISTS (today ' + today + ') =='];
    lists.forEach(l => {
      const isOpen = (i) => i.status === 'Open' || i.status === 'In progress';
      const open = l.items.filter(isOpen), late = open.filter(i => i.due && i.due < today);
      L.push(`List "${l.name}"${l.project ? ' (' + l.project + ')' : ''}: ${l.items.length} items, ${open.length} open, ${late.length} overdue, ${l.items.length - open.length} closed.`);
      const by = {}; open.forEach(i => { const k = i.responsible || '(nobody assigned)'; by[k] = (by[k] || 0) + 1; });
      if (open.length) L.push('Open items per responsible person: ' + Object.entries(by).map(([k, v]) => k + ' ' + v).join('; '));
      const line = (i) => `${i.no} | ${i.title || i.description.slice(0, 70)} | ${i.location || '-'} | ${i.priority} | ${i.responsible || '-'} | due ${i.due || '-'} | ${i.status}` + (i.due && i.due < today && isOpen(i) ? ' | OVERDUE' : '');
      const pick = new Set(open.slice(0, 50)); l.items.filter(i => words.length && hit([i.no, i.title, i.description, i.location, i.responsible, i.category].join(' '), words)).slice(0, 25).forEach(i => pick.add(i));
      L.push('Items (no | what | location | priority | responsible | due | status):'); [...pick].forEach(i => L.push(line(i)));
    });
    return L.join('\n');
  }
  function notesContext(notes, words) {
    const L = ['== NOTES =='];
    L.push('Note titles: ' + (notes.slice(0, 60).map(n => n.title || '(untitled)').join('; ') || 'none'));
    const rel = notes.filter(n => words.length && hit(n.title + ' ' + n.body + ' ' + n.tags.join(' '), words)).slice(0, 5);
    rel.forEach(n => L.push(`NOTE "${n.title || 'untitled'}" (${n.updatedAt.slice(0, 10)}${n.tags.length ? ', tags: ' + n.tags.join(', ') : ''}):\n${n.body.slice(0, 900)}`));
    return L.join('\n');
  }
  async function buildContext(question) {
    const words = q2words(question), parts = [];
    try {
      if (srcs.inv.checked) { const r = await window.api.invLoad(); if (r && r.state) parts.push(inventoryContext(r.state, words)); }
      if (srcs.punch.checked) { const r = await window.api.punchLoad(); if (r && r.lists && r.lists.length) parts.push(punchContext(r.lists, WH.todayISO(), words)); }
      if (srcs.notes.checked) { const r = await window.api.notesLoad(); if (r && r.notes && r.notes.length) parts.push(notesContext(r.notes, words)); }
    } catch (e) {}
    return parts.join('\n\n') || 'No data selected.';
  }

  async function ask() {
    const text = box.value.trim();
    if (!text || busy) return;
    box.value = ''; busy = true; sendBtn.hidden = true; stopBtn.hidden = false; chips.hidden = true;
    add('me', text); history.push({ role: 'user', content: text });
    const id = 'c' + (++reqId); liveEl = add('ai', '…');
    let got = false;
    const off = window.api.onChatToken && window.api.onChatToken((d) => { if (d.id !== id || !liveEl) return; if (!got) { liveEl.textContent = ''; got = true; } liveEl.textContent += d.text; log.scrollTop = log.scrollHeight; });
    const context = await buildContext(text);
    stopBtn.onclick = () => window.api.chatStop(id);
    const r = await window.api.chatAsk(id, history, context);
    if (typeof off === 'function') off();
    if (!r || !r.ok) { liveEl.textContent = (r && r.error) || 'Something went wrong.'; liveEl.classList.add('err'); history.pop(); }
    else { const t = (got ? liveEl.textContent : r.text) || (r.stopped ? '(stopped)' : '(no answer)'); liveEl.textContent = t; history.push({ role: 'assistant', content: t }); }
    busy = false; sendBtn.hidden = false; stopBtn.hidden = true; liveEl = null; box.focus();
  }
  sendBtn.addEventListener('click', ask);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
  clear.addEventListener('click', () => { if (busy) return; history = []; chips.hidden = false; welcome(); });
  welcome();
  window.__chatBuild = { inventoryContext, punchContext, notesContext };
  WH.registerTab('chat', view, () => box.focus());
})();
