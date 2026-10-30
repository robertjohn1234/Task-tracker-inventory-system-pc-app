// "Tabs" button (left bar): choose which tabs this PC shows. The choice is remembered on this PC only.
(function () {
  'use strict';
  const nav = document.getElementById('nav');
  if (!nav || !window.WH) return;
  const KEY = 'whHiddenTabs';
  const NAMES = { tasks: '✅ Tasks', files: '📁 Files', inventory: '📦 Inventory', notes: '📝 Notes', punch: '🚩 Punch list' };

  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const btnOf = (t) => nav.querySelector('.navbtn[data-tab="' + t + '"]');

  function apply(hidden) {
    Object.keys(NAMES).forEach(t => { const b = btnOf(t); if (b) b.hidden = hidden.includes(t); if (b && b.hidden) b.style.display = 'none'; else if (b) b.style.display = ''; });
    const on = nav.querySelector('.navbtn.on');
    if (on && on.hidden) { const first = [...nav.querySelectorAll('.navbtn')].find(b => !b.hidden); if (first) first.click(); }
  }

  const btn = document.createElement('button');
  btn.className = 'navact'; btn.id = 'tabsBtn'; btn.title = 'Choose which tabs to show';
  btn.innerHTML = '<span class="ico">☰</span><span>Tabs</span>';
  const style = nav.querySelector('#styleBtn');
  nav.insertBefore(btn, style || null);

  btn.addEventListener('click', () => {
    const hidden = read();
    const d = WH.dialog('Which tabs do you need?', { small: true });
    d.content.append(WH.E('div', 'whMuted', 'Untick the tabs you do not use. Your data is not deleted, and you can show them again here. This is saved on this PC only.'));
    const boxes = {};
    Object.keys(NAMES).filter(t => btnOf(t)).forEach(t => {
      const l = WH.E('label', 'whChk'); const c = WH.inp('checkbox', '1', { checked: !hidden.includes(t) }); boxes[t] = c;
      l.append(c, WH.E('span', '', NAMES[t])); d.content.appendChild(l);
    });
    d.button('Save', 'primary', () => {
      const next = Object.keys(boxes).filter(t => !boxes[t].checked);
      if (next.length === Object.keys(boxes).length) { d.say('Keep at least one tab.', true); return; }
      write(next); apply(next); d.close();
    });
    d.button('Cancel', '', d.close);
  });

  apply(read());
})();
