// The Inventory tab is two separate systems side by side:
//   - Consumables & others  (inventory-ui.js)
//   - Tools & Equipment     (tools-ui.js)
// This file only builds the frame and the switch between them. It must load BEFORE the two screens.
//
// Other files talk to it through:
//   window.InvMode.get()          -> 'consumables' | 'tools'
//   window.InvMode.set(mode)      -> switch (also remembered on this PC)
//   window events: 'inv:show' (the Inventory tab was opened), 'inv:mode' (the switch was used)
(function () {
  'use strict';

  const view = document.getElementById('inventoryView');
  if (!view) return;

  const KEY = 'wh-inv-mode';
  const MODES = [
    { id: 'consumables', label: '🧴 Consumables & others', hint: 'Stock in / out, reorder levels' },
    { id: 'tools', label: '🔧 Tools & Equipment', hint: 'Lend, return, repairs, pictures' }
  ];

  const st = document.createElement('style');
  st.textContent = `
    #inventoryView { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    #inventoryView[hidden] { display: none; }
    #invModeBar { display: flex; gap: 6px; padding: 8px 16px 0; background: var(--panel, #fff); border-bottom: 1px solid var(--border, #ddd); }
    #invModeBar button { border: 1px solid var(--border, #ccc); border-bottom: 0; border-radius: 8px 8px 0 0; padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer;
      background: var(--panel2, #f1f3f5); color: var(--muted, #555); margin-bottom: -1px; }
    #invModeBar button small { display: block; font-weight: 400; font-size: 11px; opacity: .8; }
    #invModeBar button.on { background: var(--accent, #1f6feb); border-color: var(--accent, #1f6feb); color: var(--accent-text, #fff); }
    #invConsumables, #invTools { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    #invConsumables[hidden], #invTools[hidden] { display: none; }
  `;
  document.head.appendChild(st);

  let mode = 'consumables';
  try { const v = localStorage.getItem(KEY); if (MODES.some(m => m.id === v)) mode = v; } catch (e) {}

  view.innerHTML = '';
  const bar = document.createElement('div'); bar.id = 'invModeBar';
  const cons = document.createElement('div'); cons.id = 'invConsumables';
  const tools = document.createElement('div'); tools.id = 'invTools';
  view.append(bar, cons, tools);

  const buttons = {};
  MODES.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '';
    b.append(document.createTextNode(m.label));
    const small = document.createElement('small'); small.textContent = m.hint; b.appendChild(small);
    b.addEventListener('click', () => set(m.id));
    bar.appendChild(b);
    buttons[m.id] = b;
  });

  function paint() {
    MODES.forEach(m => buttons[m.id].classList.toggle('on', m.id === mode));
    cons.hidden = mode !== 'consumables';
    tools.hidden = mode !== 'tools';
  }

  function set(next) {
    if (!MODES.some(m => m.id === next) || next === mode) return;
    mode = next;
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    paint();
    window.dispatchEvent(new CustomEvent('inv:mode', { detail: { mode } }));
  }

  window.InvMode = { get: () => mode, set };
  paint();

  // show / hide with the left bar
  function openTab() {
    view.hidden = false;
    window.dispatchEvent(new CustomEvent('inv:show', { detail: { mode } }));
  }
  document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'inventory') openTab(); else view.hidden = true;
  }));
  // other code (reminders, intro) can switch tabs without a click
  ['filesView', 'tasksView'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(() => { if (!el.hidden) view.hidden = true; }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  });
  window.addEventListener('focus', () => {
    if (!view.hidden && !document.querySelector('.overlay')) window.dispatchEvent(new CustomEvent('inv:show', { detail: { mode } }));
  });
})();
