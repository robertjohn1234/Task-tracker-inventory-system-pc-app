// Welcome screens shown every time the app starts.
// The name, messages and goodbye time are set in the 🎨 Style dialog (sidebar, bottom).
(function () {
  'use strict';

  const START_TAB = 'tasks';        // tab that opens after the intro: 'tasks' or 'files'

  const QUOTES = [
    "Today's boss fight: the inbox. Recommended weapon: coffee.",
    "A 'quick meeting' is the rarest monster in the office. Nobody has ever seen one.",
    "The punch list is a hydra: close one item and two more grow back.",
    "Revision C looks suspiciously like Revision A. Nobody knows who did it.",
    "If it works on the first try, check again. Something is lying to you.",
    "This meeting could have been an email. This email could have been silence.",
    "Plans are just guesses wearing hard hats.",
    "There are two kinds of files: the ones you can find, and 'final_final_v2_REAL'.",
    "Urgent is the word that shows up right before every other urgent thing.",
    "Friday afternoon is not the time to start 'one small change'.",
    "Overtime is just time with a guilt trip attached.",
    "'As-built' is just 'as-guessed' with better paperwork.",
    "Save early, save often. The Halimaw of lost work shows no mercy.",
    "The drawing is final until the next markup arrives.",
    "Be the engineer who reads the whole email. Be a legend.",
    "Your to-do list is not shrinking. It is evolving.",
    "Reminder: the printer always knows when you are in a hurry.",
    "Estimating tip: take your best guess, double it, then add a meeting.",
    "Tandaan: ang 'quick question' ay hindi kailanman quick.",
    "Kaya mo 'yan! Isang task lang muna, tapos isa pa, tapos kape.",
    "Ang deadline, parang halimaw sa gabi: tahimik hanggang sa biglang nasa harap mo na.",
    "Hindi ka nag-iisa sa Mundo ng mga Halimaw. May kasama ka: ang task list mo."
  ];

  const DEF = {
    showIntro: true,
    welcomeName: 'RawBirth',
    welcomeMsg: 'Are you ready to enter sa Mundo ng mga Halimaw?',
    goodbyeMsg: 'Sige, see you next time, Master.',
    goodbyeSecs: 4
  };
  const ui = () => Object.assign({}, DEF, window.WHUI ? window.WHUI.get() : {});

  // ---------- styles ----------
  const st = document.createElement('style');
  st.textContent = `
    #intro { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; color: #fff;
      font-family: Segoe UI, Arial, sans-serif; transition: opacity 0.45s ease;
      background: var(--intro-bg, radial-gradient(circle at 25% 20%, #4a1f6e 0%, #1a1233 45%, #0b0f1c 100%)); }
    #intro.out { opacity: 0; pointer-events: none; }
    #intro .introCard { width: min(580px, 100%); text-align: center; background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.18);
      border-radius: 16px; padding: 34px 30px 26px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); animation: introIn 0.5s ease both; }
    @keyframes introIn { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: none; } }
    #intro .introIcon { font-size: 54px; margin-bottom: 6px; animation: introBob 2.4s ease-in-out infinite; }
    @keyframes introBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    #intro h1 { margin: 6px 0 12px; font-size: 28px; letter-spacing: 0.02em; color: #fff; }
    #intro p { margin: 0 0 22px; font-size: 17px; line-height: 1.5; color: #ece8f8; }
    #intro .quote { margin: 6px 0 16px; padding: 16px 14px; text-align: center; font-size: 16px; font-style: italic; line-height: 1.55; color: #fff3d6;
      border-top: 1px solid var(--intro-accent, #ffb703); border-bottom: 1px solid var(--intro-accent, #ffb703); }
    #intro .btns { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
    #intro button { padding: 10px 22px; font-size: 15px; border-radius: 8px; cursor: pointer; border: 1px solid rgba(255,255,255,0.4); background: transparent; color: #fff; }
    #intro button.yes { background: var(--intro-yes, #2da44e); border-color: var(--intro-yes, #2da44e); color: var(--intro-yes-text, #fff); font-weight: 700; }
    #intro button.yes:hover { filter: brightness(1.15); }
    #intro button.no:hover { background: rgba(209,36,47,0.3); border-color: #ff6b6b; }
    #intro button.again { padding: 4px 12px; font-size: 12px; margin: 0 0 18px; border-color: rgba(255,255,255,0.3); color: #d8d2ee; }
    #intro .hint { margin-top: 16px; font-size: 12px; color: #b9b2d3; }
    #intro .byeBar { height: 4px; background: rgba(255,255,255,0.18); border-radius: 2px; overflow: hidden; margin: 14px auto 4px; width: 70%; }
    #intro .byeBar i { display: block; height: 100%; width: 100%; background: var(--intro-accent, #ffb703); animation-name: byeShrink; animation-timing-function: linear; animation-fill-mode: forwards; }
    @keyframes byeShrink { to { width: 0; } }
  `;
  document.head.appendChild(st);

  // ---------- flow ----------
  let intro = null;
  let step = 1;
  let quote = '';
  let closing = false;
  let preview = false;

  function make(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function openStartTab() {
    const btn = document.querySelector('.navbtn[data-tab="' + START_TAB + '"]');
    if (btn) btn.click();
  }

  function pickQuote(avoid) {
    let last = '';
    try { last = localStorage.getItem('wh-last-quote') || ''; } catch (e) {}
    let q;
    do {
      q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    } while ((q === last || q === avoid) && QUOTES.length > 2);
    try { localStorage.setItem('wh-last-quote', q); } catch (e) {}
    return q;
  }

  function buttons(yesText, noText) {
    const row = make('div', 'btns');
    const yes = make('button', 'yes', yesText);
    const no = make('button', 'no', noText);
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    row.append(yes, no);
    return row;
  }

  function render() {
    const u = ui();
    intro.innerHTML = '';
    const card = make('div', 'introCard');

    if (step === 1) {
      const name = (u.welcomeName || '').trim();
      card.append(
        make('div', 'introIcon', '👹'),
        make('h1', '', name ? 'Welcome Master ' + name : 'Welcome')
      );
      if ((u.welcomeMsg || '').trim()) card.appendChild(make('p', '', u.welcomeMsg));
      card.appendChild(buttons('Yes (Y)', 'No (N)'));
    } else {
      const again = make('button', 'again', '🎲 Another one');
      again.addEventListener('click', () => {
        quote = pickQuote(quote);
        render();
      });
      card.append(
        make('div', 'introIcon', '⚠️'),
        make('h1', '', 'Friendly Warning'),
        make('div', 'quote', '“' + quote + '”'),
        again,
        make('p', '', 'Proceed?'),
        buttons('Yes (Y)', 'No (N)')
      );
    }
    card.appendChild(make('div', 'hint', 'Press Y or N on your keyboard'));
    intro.appendChild(card);

    const yes = card.querySelector('.yes');
    if (yes) yes.focus();
  }

  function onYes() {
    if (closing) return;
    if (step === 1) {
      step = 2;
      quote = pickQuote('');
      render();
    } else {
      finish();
    }
  }

  function onNo() {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    const u = ui();
    const secs = Math.max(1, Number(u.goodbyeSecs) || 4);

    intro.innerHTML = '';
    const card = make('div', 'introCard');
    const bar = make('div', 'byeBar');
    const fill = make('i');
    fill.style.animationDuration = secs + 's';
    bar.appendChild(fill);
    card.append(
      make('div', 'introIcon', '👋'),
      make('h1', '', u.goodbyeMsg || DEF.goodbyeMsg),
      make('p', '', preview ? 'This is only a preview. The app stays open.' : 'Closing the app...'),
      bar
    );
    intro.appendChild(card);

    setTimeout(() => {
      if (preview) {
        intro.classList.add('out');
        setTimeout(() => { if (intro) intro.remove(); }, 500);
      } else {
        window.close();
      }
    }, secs * 1000);
  }

  function finish() {
    closing = true;
    document.removeEventListener('keydown', onKey);
    intro.classList.add('out');
    const el = intro;
    setTimeout(() => el.remove(), 500);
    if (!preview) openStartTab();
  }

  function onKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'y') { e.preventDefault(); onYes(); }
    else if (k === 'n') { e.preventDefault(); onNo(); }
  }

  function start(isPreview) {
    preview = !!isPreview;
    step = 1;
    quote = '';
    closing = false;

    intro = document.getElementById('intro');
    if (!intro) {
      intro = document.createElement('div');
      intro.id = 'intro';
      document.body.prepend(intro);
    }
    intro.classList.remove('out');
    intro.style.animation = 'none';   // intro loaded fine, so cancel the safety timer

    document.removeEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
    render();
  }

  window.whStartIntro = start;

  if (ui().showIntro === false) {
    const cover = document.getElementById('intro');
    if (cover) cover.remove();
    openStartTab();
  } else {
    start(false);
  }
})();