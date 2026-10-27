// Themes, custom background picture and welcome-screen settings.
// Loaded in the <head>, so the theme is applied before anything is drawn.
(function () {
  'use strict';

  const KEY = 'wh-ui';
  const DEFAULTS = {
    theme: 'light',
    bgImage: '',
    imgOpacity: 55,
    panelOpacity: 78,
    customBase: 'dark',
    accent: '#4c9aff',
    showIntro: true,
    welcomeName: 'Master',
    welcomeMsg: 'Work Helper at your Service!',
    goodbyeMsg: 'Sige, see you next time, Master.',
    goodbyeSecs: 4
  };

  // ---------- ready-made themes ----------
  // Each one is made from a few colours; panels, borders and hover colours are worked out from them.
  const HEX = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); const n = parseInt(m ? m[1] : '000000', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixC = (a, b, t) => { const x = HEX(a), y = HEX(b); return '#' + [0, 1, 2].map(i => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')).join(''); };
  const P = (id, group, name, desc, scheme, base, accent, o) => Object.assign({ id, group, name, desc, scheme, base, accent }, o || {});
  const PRESETS = [
    // normal, light
    P('paper', 'Normal', 'Paper', 'Warm and calm', 'light', '#f4eee2', '#b5651d'),
    P('ocean', 'Normal', 'Ocean', 'Fresh blue', 'light', '#e8f2fa', '#0b6fb3'),
    P('mint', 'Normal', 'Mint', 'Soft green', 'light', '#e8f5ee', '#1f8a5b'),
    P('rose', 'Normal', 'Rose', 'Light pink', 'light', '#fbeef2', '#c2416b'),
    P('slate', 'Normal', 'Slate', 'Quiet grey-blue', 'light', '#e7eaf0', '#4b5d7a'),
    // normal, dark
    P('midnight', 'Normal', 'Midnight', 'Deep blue', 'dark', '#0b1020', '#6ea8ff'),
    P('forest', 'Normal', 'Forest', 'Dark green', 'dark', '#0e1913', '#4ecb8d'),
    P('graphite', 'Normal', 'Graphite', 'Neutral dark grey', 'dark', '#17181b', '#b8bec9'),
    P('coffee', 'Normal', 'Coffee', 'Dark and warm', 'dark', '#1b1511', '#e0a060'),
    P('nord', 'Normal', 'Nord', 'Cool and muted', 'dark', '#2b303b', '#88c0d0'),
    // gamer (the first one, "Gamer", is the original cyan theme above)
    P('g-pink', 'Gamer', 'Neon Pink', 'Hot pink glow', 'dark', '#12060f', '#ff2bd6', { glow: 1 }),
    P('g-toxic', 'Gamer', 'Toxic Green', 'Acid green glow', 'dark', '#06120a', '#7cff4d', { glow: 1 }),
    P('g-yellow', 'Gamer', 'Cyber Yellow', 'Electric yellow', 'dark', '#121006', '#ffe600', { glow: 1 }),
    P('g-red', 'Gamer', 'Blood Red', 'Red alert', 'dark', '#140506', '#ff2d3d', { glow: 1 }),
    P('g-ice', 'Gamer', 'Ice Blue', 'Cold blue glow', 'dark', '#06101a', '#4dc3ff', { glow: 1 }),
    P('g-purple', 'Gamer', 'Purple Haze', 'Violet glow', 'dark', '#0e0720', '#b565ff', { glow: 1 }),
    P('g-orange', 'Gamer', 'Orange Heat', 'Orange glow', 'dark', '#150a04', '#ff8a1f', { glow: 1 }),
    P('g-matrix', 'Gamer', 'Matrix', 'Green on black', 'dark', '#020a04', '#00ff66', { glow: 1 }),
    P('g-synth', 'Gamer', 'Synthwave', 'Retro purple and pink', 'dark', '#170a2e', '#ff4fd8', { glow: 1 }),
    P('g-stealth', 'Gamer', 'Stealth', 'Black and silver', 'dark', '#0a0a0b', '#aab0b8', { glow: 1 }),
    P('g-lava', 'Gamer', 'Lava', 'Molten red-orange', 'dark', '#1a0602', '#ff5a1f', { glow: 1 }),
    P('g-aqua', 'Gamer', 'Aqua Glitch', 'Teal glow', 'dark', '#031416', '#2bf5d0', { glow: 1 }),
    // anime-style pictures (original artwork, kept in the "themes" folder next to the app)
    P('a-sakura', 'Anime', 'Sakura Night', 'Moon and cherry blossoms', 'dark', '#1a1038', '#ff8fbf', { art: 'themes/sakura.jpg' }),
    P('a-tokyo', 'Anime', 'Neon Tokyo Rain', 'Rainy city lights', 'dark', '#070a24', '#6ee7ff', { art: 'themes/tokyo.jpg' }),
    P('a-festival', 'Anime', 'Summer Festival', 'Fireworks and lanterns', 'dark', '#0a1030', '#ffd166', { art: 'themes/festival.jpg' }),
    P('a-shrine', 'Anime', 'Moonlit Shrine', 'Torii gate in the mist', 'dark', '#08202f', '#7fe0e8', { art: 'themes/shrine.jpg' }),
    P('a-sunset', 'Anime', 'Rooftop Sunset', 'Orange and purple sky', 'dark', '#2b1b4a', '#ffb25a', { art: 'themes/sunset.jpg' }),
    P('a-alley', 'Anime', 'Cyber Alley', 'Neon alley at night', 'dark', '#120a24', '#ff3da8', { art: 'themes/alley.jpg' })
  ];
  const PRESET_BY_ID = {};
  PRESETS.forEach(p => { PRESET_BY_ID[p.id] = p; });
  const THEME_IDS = ['light', 'dark', 'gamer', 'custom'].concat(PRESETS.map(p => p.id));

  const clamp = (n, lo, hi, d) => { n = Number(n); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    const o = Object.assign({}, DEFAULTS, s);
    if (!THEME_IDS.includes(o.theme)) o.theme = 'light';
    o.imgOpacity = clamp(o.imgOpacity, 5, 100, 55);
    o.panelOpacity = clamp(o.panelOpacity, 30, 100, 78);
    o.goodbyeSecs = clamp(o.goodbyeSecs, 1, 15, 4);
    o.customBase = o.customBase === 'light' ? 'light' : 'dark';
    o.showIntro = o.showIntro !== false;
    if (!/^#[0-9a-f]{6}$/i.test(o.accent)) o.accent = DEFAULTS.accent;
    for (const k of ['welcomeName', 'welcomeMsg', 'goodbyeMsg', 'bgImage']) {
      if (typeof o[k] !== 'string') o[k] = DEFAULTS[k];
    }
    return o;
  }

  let cur = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {} }

  function toUrl(p) {
    return 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  }
  function hexToRgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    if (!m) return [76, 154, 255];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const lumaOf = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

  // ---------- colors for each theme ----------
  const DARK = {
    '--bg-fill': '#12151c', '--panel': '#1b1f29', '--panel2': '#232836', '--panel3': '#2e3547', '--dialog': '#1b1f29',
    '--text': '#e6e9f0', '--muted': '#9aa3b5', '--border': '#343b4d', '--hover': '#29314a', '--sel': '#2f4b7c',
    '--accent': '#4c9aff', '--accent-text': '#ffffff', '--nav': '#0d1016', '--nav-hover': '#1a2030'
  };

  const GAMER = {
    '--bg-fill': 'radial-gradient(circle at 12% 0%, #231048 0%, #0a0714 48%, #05040a 100%)',
    '--panel': '#0f0b1d', '--panel2': '#171029', '--panel3': '#241a42', '--dialog': '#120d24',
    '--text': '#eaf6ff', '--muted': '#a99ede', '--border': '#3a2670', '--hover': '#22164a', '--sel': '#3a1f7d',
    '--accent': '#00f0ff', '--accent-text': '#00161a', '--nav': '#05040a', '--nav-hover': '#150f2b',
    '--intro-bg': 'radial-gradient(circle at 20% 15%, #3b0f6b 0%, #120626 45%, #04030a 100%)',
    '--intro-accent': '#00f0ff', '--intro-yes': '#00a6b2'
  };

  function customVars(c) {
    const dark = c.customBase !== 'light';
    const a = c.panelOpacity / 100;
    const a2 = Math.min(1, a + 0.1);
    const rgb = hexToRgb(c.accent);
    const acc = rgb.join(',');
    const v = dark ? {
      '--bg-fill': '#0e1118',
      '--panel': `rgba(18,22,32,${a})`, '--panel2': `rgba(28,34,48,${a})`, '--panel3': `rgba(44,52,72,${a2})`,
      '--dialog': '#1b1f29',
      '--text': '#eef1f7', '--muted': '#b3bbcc', '--border': 'rgba(255,255,255,0.16)',
      '--hover': `rgba(${acc},0.25)`, '--sel': `rgba(${acc},0.42)`,
      '--nav': `rgba(8,10,16,${a2})`, '--nav-hover': 'rgba(255,255,255,0.12)'
    } : {
      '--bg-fill': '#f4f6fa',
      '--panel': `rgba(255,255,255,${a})`, '--panel2': `rgba(243,245,249,${a})`, '--panel3': `rgba(228,232,241,${a2})`,
      '--dialog': '#ffffff',
      '--text': '#1b1f27', '--muted': '#4b5563', '--border': 'rgba(0,0,0,0.16)',
      '--hover': `rgba(${acc},0.16)`, '--sel': `rgba(${acc},0.30)`,
      '--nav': '#1e2430', '--nav-hover': '#2a3140'
    };
    const accText = lumaOf(rgb) > 0.6 ? '#111111' : '#ffffff';
    v['--accent'] = c.accent;
    v['--accent-text'] = accText;
    v['--intro-accent'] = c.accent;
    v['--intro-yes'] = c.accent;
    v['--intro-yes-text'] = accText;
    v['--img-opacity'] = String(c.imgOpacity / 100);
    if (c.bgImage) {
      const url = `url("${toUrl(c.bgImage)}")`;
      const ov = Math.max(0.15, 1 - c.imgOpacity / 100);
      v['--bg-image'] = url;
      v['--intro-bg'] = `linear-gradient(rgba(6,6,14,${ov}), rgba(6,6,14,${ov})), ${url} center / cover no-repeat`;
    } else {
      v['--bg-image'] = 'none';
    }
    return { vars: v, scheme: dark ? 'dark' : 'light' };
  }


  function presetVars(p, c) {
    const dark = p.scheme === 'dark', B = p.base, A = p.accent, acc = hexToRgb(A);
    const accRgb = acc.join(',');
    const accText = lumaOf(acc) > 0.6 ? '#111111' : '#ffffff';
    const v = {};
    const text = dark ? mixC('#ffffff', A, 0.06) : mixC('#14171d', B, 0.1);
    v['--text'] = text; v['--muted'] = mixC(text, B, dark ? 0.42 : 0.38);
    v['--accent'] = A; v['--accent-text'] = accText;
    v['--intro-accent'] = A; v['--intro-yes'] = A; v['--intro-yes-text'] = accText;
    v['--hover'] = mixC(B, A, dark ? 0.24 : 0.16); v['--sel'] = mixC(B, A, dark ? 0.40 : 0.30);
    v['--nav'] = dark ? mixC(B, '#000000', 0.5) : '#1e2430'; v['--nav-hover'] = dark ? mixC(B, '#ffffff', 0.12) : '#2a3140';
    v['--dialog'] = dark ? mixC(B, '#ffffff', 0.07) : mixC(B, '#ffffff', 0.7);
    const p1 = dark ? mixC(B, '#ffffff', 0.05) : mixC(B, '#ffffff', 0.65), p2 = dark ? mixC(B, '#ffffff', 0.09) : mixC(B, '#ffffff', 0.35), p3 = dark ? mixC(B, '#ffffff', 0.16) : mixC(B, '#000000', 0.06);
    v['--border'] = dark ? mixC(B, p.glow ? A : '#ffffff', p.glow ? 0.3 : 0.22) : mixC(B, '#000000', 0.16);
    if (p.art) {
      const a = c.panelOpacity / 100, a2 = Math.min(1, a + 0.1), rgba = (h, al) => 'rgba(' + HEX(h).join(',') + ',' + al + ')';
      v['--panel'] = rgba(p1, a); v['--panel2'] = rgba(p2, a); v['--panel3'] = rgba(p3, a2); v['--nav'] = rgba(mixC(B, '#000000', 0.55), a2);
      v['--bg-fill'] = B; v['--img-opacity'] = String(c.imgOpacity / 100);
      const url = 'url("' + p.art + '")', ov = Math.max(0.15, 1 - c.imgOpacity / 100);
      v['--bg-image'] = url;
      v['--intro-bg'] = 'linear-gradient(rgba(6,6,14,' + ov + '), rgba(6,6,14,' + ov + ')), ' + url + ' center / cover no-repeat';
    } else {
      v['--panel'] = p1; v['--panel2'] = p2; v['--panel3'] = p3;
      v['--bg-fill'] = dark ? 'radial-gradient(circle at 12% 0%, ' + mixC(B, A, p.glow ? 0.22 : 0.12) + ' 0%, ' + B + ' 48%, ' + mixC(B, '#000000', 0.55) + ' 100%)' : B;
      v['--intro-bg'] = 'radial-gradient(circle at 20% 15%, ' + mixC(B, A, 0.3) + ' 0%, ' + B + ' 55%, ' + mixC(B, '#000000', 0.6) + ' 100%)';
    }
    if (p.glow) v['--glow'] = accRgb;
    return { vars: v, scheme: p.scheme, art: !!p.art, glow: !!p.glow };
  }

  const applied = [];
  function apply() {
    const root = document.documentElement;
    while (applied.length) root.style.removeProperty(applied.pop());
    ['data-themed', 'data-theme', 'data-scheme', 'data-art', 'data-glow'].forEach(a => root.removeAttribute(a));
    if (cur.theme === 'light') return;
    const pr = PRESET_BY_ID[cur.theme];
    const t = cur.theme === 'dark' ? { vars: DARK, scheme: 'dark' }
      : cur.theme === 'gamer' ? { vars: GAMER, scheme: 'dark', glow: true, glowRgb: '0,240,255' }
      : pr ? presetVars(pr, cur)
      : customVars(cur);
    for (const k in t.vars) { root.style.setProperty(k, t.vars[k]); applied.push(k); }
    if (t.glowRgb) { root.style.setProperty('--glow', t.glowRgb); applied.push('--glow'); }
    root.setAttribute('data-themed', '1');
    root.setAttribute('data-theme', cur.theme);
    root.setAttribute('data-scheme', t.scheme);
    if (t.art || (cur.theme === 'custom' && cur.bgImage)) root.setAttribute('data-art', '1');
    if (t.glow) root.setAttribute('data-glow', '1');
  }

  // ---------- the style rules that re-color the whole app (only active for Dark, Gamer and Custom) ----------
  let css = 'html[data-themed]{color-scheme:dark}html[data-themed][data-scheme="light"]{color-scheme:light}\n';
  const T = (sel, decl) => { css += sel.split(',').map(s => 'html[data-themed] ' + s.trim()).join(',') + '{' + decl + '}\n'; };
  const G = (sel, decl) => { css += sel.split(',').map(s => 'html[data-glow] ' + s.trim()).join(',') + '{' + decl + '}\n'; };
  const PILL = '.pill:not(.over):not(.urgent):not(.today):not(.high):not(.doing)';

  T('body', 'background:var(--bg-fill) !important;color:var(--text) !important');
  css += 'html[data-art] body::before{content:"";position:fixed;inset:0;z-index:-1;background:var(--bg-image) center/cover no-repeat;opacity:var(--img-opacity);pointer-events:none}\n';

  // sidebar
  T('#nav', 'background:var(--nav) !important');
  T('.navbtn:hover,.navact:hover,.navbtn.on', 'background:var(--nav-hover) !important');
  T('.navbtn.on', 'border-left-color:var(--accent) !important');
  css += '@media (max-width:820px){html[data-themed] .navbtn.on{border-left-color:transparent !important;border-bottom-color:var(--accent) !important}}\n';

  // surfaces
  T('#left,#tkTop,.kpi,.chartCard,.calCell,.seg,.seg button,.pvGrid,#preview pre,#sumBox', 'background:var(--panel) !important');
  T('#topbar,#preview,#preview .note,.tkCol,.calDow,.calCell.other,.pvTabs,.pvInfo,#orgPreview th,table.pvXl th', 'background:var(--panel2) !important');
  T(PILL + ',.calChip,.hbar .bar,.pvTab', 'background:var(--panel3) !important');
  T('.pvTab.on', 'background:var(--panel) !important;color:var(--text) !important');
  T('#tasksView', 'background:transparent !important');
  T('.calGrid', 'background:var(--border) !important;border-color:var(--border) !important');
  T('.tkRowItem,.tkCard,#tkBrief', 'background:var(--panel) !important;border-top-color:var(--border) !important;border-right-color:var(--border) !important;border-bottom-color:var(--border) !important');
  T('#modalBox,#askBox,.dialog,#ctxMenu', 'background:var(--dialog) !important;color:var(--text) !important');

  // borders
  T('#left,#topbar,#fileActions,#tkTop,#sumBox,#orgPreview,#orgPreview th,#orgPreview td,#orgFoot,.pvTabs,.pvInfo,#preview .note,#ctxMenu,.seg,.seg button,.kpi,.chartCard,table.pvXl td,table.pvXl th,.hit,.dialog,#modalBox,#askBox', 'border-color:var(--border) !important');

  // hover and selection
  T('.row:hover,.hit:hover,#ctxMenu .item:not(.off):hover', 'background:var(--hover) !important');
  T('.sel', 'background:var(--sel) !important');
  T('.row.dropok', 'background:rgba(60,180,90,0.35) !important');
  T('.calCell.today', 'background:var(--hover) !important');
  T('.calCell.dropok', 'background:rgba(60,180,90,0.35) !important');

  // text
  T('.count,.empty,.arrow,.hit .p,.hit .s,#emptyMsg,#filePath,#preview .note,#preview .nopreview,#tkSummary,#aiState,.hint,.legend,.chartNote,.kpi span,.tkGroupHead,.fld > label,.calDow,.calMore,.pvInfo,.pvTab,table.pvXl th,.grip,.hbar .n,.calCell.other,' + PILL, 'color:var(--muted) !important');
  T('.tkGroupHead.over', 'color:#ff6b6b !important');
  T('.done .tkTitle', 'color:var(--muted) !important');
  T('table.pvXl td,#preview pre,.calChip', 'color:var(--text) !important');

  // accent buttons
  T('.seg button.on,#viewToggle button.on,button.primary,#orgGo', 'background:var(--accent) !important;border-color:var(--accent) !important;color:var(--accent-text) !important');
  T('#orgGo:disabled', 'opacity:0.5');

  // charts
  T('.chartCard svg text', 'fill:var(--muted) !important');
  T('.chartCard svg text[font-weight="700"]', 'fill:var(--accent) !important');
  T('.chartCard .donutWrap svg text', 'fill:var(--text) !important');
  T('.chartCard svg line', 'stroke:var(--border) !important');
  T('.donutWrap svg circle:first-of-type', 'stroke:var(--panel3) !important');

  // Glow extras for every Gamer theme: glow, neon headings and an animated RGB line on the sidebar
  G('body', 'font-family:Bahnschrift,"Segoe UI",Arial,sans-serif !important');
  G('.navbtn.on', 'box-shadow:inset 3px 0 0 var(--accent),0 0 16px rgba(var(--glow),0.28)');
  G('button:not(:disabled):hover', 'box-shadow:0 0 10px rgba(var(--glow),0.55);border-color:var(--accent)');
  G('button.primary,#orgGo,.seg button.on,#viewToggle button.on', 'box-shadow:0 0 12px rgba(var(--glow),0.55)');
  G('#tkTop h2,.whTop h2', 'color:var(--accent);text-shadow:0 0 10px rgba(var(--glow),0.6);text-transform:uppercase;letter-spacing:0.08em');
  G('.tkRowItem:hover,.tkCard:hover,.kpi:hover,.chartCard:hover', 'box-shadow:0 0 12px rgba(var(--glow),0.35) !important');
  G('.kpi b', 'color:var(--accent);text-shadow:0 0 8px rgba(var(--glow),0.45)');
  G('.kpi.bad b', 'color:#ff4d6d;text-shadow:0 0 8px rgba(255,77,109,0.5)');
  G('#left,#topbar,#tkTop', 'border-color:var(--border) !important');
  css += '@media (min-width:821px){html[data-glow] #nav::after{content:"";position:absolute;top:0;right:0;bottom:0;width:2px;background:linear-gradient(180deg,var(--accent),#ff2bd6,#7cff4d,#ffe600,var(--accent));background-size:100% 300%;animation:whRgb 5s linear infinite}}\n';
  css += '@keyframes whRgb{0%{background-position:0 0}100%{background-position:0 300%}}\n';

  const styleEl = document.createElement('style');
  styleEl.id = 'whThemeCss';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  apply();
  window.WHUI = { get: () => cur, apply, open: () => {} };

  // ---------- the Style dialog ----------
  const TILES = [
    { id: 'light', name: 'Light', desc: 'Clean and bright', bg: 'linear-gradient(135deg,#ffffff,#e3e9f3)', fg: '#222' },
    { id: 'dark', name: 'Dark', desc: 'Easy on the eyes', bg: 'linear-gradient(135deg,#232836,#0d1016)', fg: '#e6e9f0' },
    { id: 'gamer', name: 'Gamer', desc: 'Neon, glow and RGB', bg: 'linear-gradient(135deg,#3b0f6b,#07060d 60%,#003a44)', fg: '#00f0ff' },
    { id: 'custom', name: 'Custom', desc: 'Your own picture', bg: 'linear-gradient(135deg,#555,#999)', fg: '#ffffff' }
  ];
  TILES.forEach(t => { t.group = t.id === 'gamer' ? 'Gamer' : t.id === 'custom' ? 'Your own' : 'Normal'; });
  PRESETS.forEach(p => {
    TILES.push({
      id: p.id, group: p.group, name: p.name, desc: p.desc, fg: p.scheme === 'light' ? '#222222' : p.accent,
      bg: p.art ? 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)), url("' + p.art + '") center / cover no-repeat'
        : p.scheme === 'light' ? 'linear-gradient(135deg,' + mixC(p.base, '#ffffff', 0.6) + ',' + p.base + ')'
        : 'linear-gradient(135deg,' + mixC(p.base, p.accent, 0.25) + ',' + mixC(p.base, '#000000', 0.5) + ' 70%)'
    });
  });
  const GROUP_ORDER = ['Normal', 'Gamer', 'Anime', 'Your own'];

  function buildUi() {
    const q = (id) => document.getElementById(id);

    const st = document.createElement('style');
    st.textContent = `
      .uiOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 45; display: flex; align-items: center; justify-content: center; padding: 8px; }
      .uiDlg { background: var(--dialog, #fff); color: var(--text, #222); border: 1px solid var(--border, #ddd); border-radius: 10px; width: min(700px, 100%); max-height: 100%; overflow: auto; padding: 16px 20px; }
      .uiDlg h3 { margin: 0 0 4px; }
      .uiDlg h4 { margin: 16px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted, #666); }
      .uiGrp { margin: 14px 0 6px; font-size: 12px; font-weight: 700; color: var(--muted, #666); }
      .uiTiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
      .uiTile { padding: 0; border: 2px solid var(--border, #ddd); border-radius: 10px; cursor: pointer; overflow: hidden; background: transparent; text-align: left; color: inherit; }
      .uiTile .sw { height: 56px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
      .uiTile .nm { padding: 6px 8px; font-size: 12px; }
      .uiTile.on { border-color: var(--accent, #1f6feb); box-shadow: 0 0 0 2px var(--accent, #1f6feb) inset; }
      .uiRow { display: flex; align-items: center; gap: 10px; margin: 8px 0; flex-wrap: wrap; }
      .uiRow label.t { width: 175px; flex: none; font-size: 12px; color: var(--muted, #666); }
      .uiRow input[type=text], .uiRow input[type=number] { flex: 1 1 220px; padding: 6px 8px; font-size: 13px; }
      .uiRow input[type=range] { flex: 1 1 200px; }
      .uiVal { width: 44px; text-align: right; font-size: 12px; }
      .uiFoot { display: flex; gap: 8px; align-items: center; margin-top: 16px; }
      .uiFoot .sp { flex: 1; }
      .uiMsg { font-size: 12px; color: #0a8a50; min-height: 16px; }
      .uiTip { font-size: 12px; color: var(--muted, #666); }
    `;
    document.head.appendChild(st);

    const ov = document.createElement('div');
    ov.id = 'uiOverlay';
    ov.className = 'uiOverlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="uiDlg" role="dialog">
        <h3>🎨 Style &amp; welcome screen</h3>
        <div class="uiMsg" id="uiMsg"></div>

        <h4>Theme</h4>
        <div id="uiTiles"></div>

        <div id="uiCustom">
          <h4>Background</h4>
          <div class="uiRow uiOnlyCustom"><label class="t">Picture</label><button type="button" id="uiPick">Choose image…</button><button type="button" id="uiClearImg">Remove image</button></div>
          <div class="uiRow uiOnlyCustom"><label class="t"></label><span id="uiImgName" class="uiTip"></span></div>
          <div class="uiRow"><label class="t">Image opacity</label><input type="range" id="uiImgOp" min="5" max="100"><span class="uiVal" id="uiImgOpV"></span></div>
          <div class="uiRow"><label class="t">Panel opacity</label><input type="range" id="uiPanelOp" min="30" max="100"><span class="uiVal" id="uiPanelOpV"></span></div>
          <div class="uiRow uiOnlyCustom"><label class="t">Panel style</label>
            <select id="uiBase"><option value="dark">Dark panels, light text</option><option value="light">Light panels, dark text</option></select></div>
          <div class="uiRow uiOnlyCustom"><label class="t">Accent color</label><input type="color" id="uiAccent"></div>
          <div class="uiTip">Tip: lower the panel opacity to let more of your picture show through, and raise it if the text is hard to read.</div>
        </div>

        <h4>Welcome screen</h4>
        <div class="uiRow"><label class="t">Show at startup</label><input type="checkbox" id="uiShow"></div>
        <div class="uiRow"><label class="t">Your name</label><input type="text" id="uiName" maxlength="40"></div>
        <div class="uiRow"><label class="t">Message under your name</label><input type="text" id="uiWelcome" maxlength="140"></div>
        <div class="uiRow"><label class="t">Goodbye message</label><input type="text" id="uiBye" maxlength="140"></div>
        <div class="uiRow"><label class="t">Goodbye stays (seconds)</label><input type="number" id="uiByeSecs" min="1" max="15" style="flex:0 0 90px"></div>
        <div class="uiRow"><button type="button" id="uiPreview">▶ Preview the welcome screens</button></div>

        <div class="uiFoot"><button type="button" id="uiReset">Reset all</button><span class="sp"></span><button type="button" id="uiClose">Close</button></div>
      </div>
    `;
    document.body.appendChild(ov);

    let msgTimer = null;
    function msg(t) {
      q('uiMsg').textContent = t || '';
      clearTimeout(msgTimer);
      if (t) msgTimer = setTimeout(() => { q('uiMsg').textContent = ''; }, 5000);
    }

    function sync() {
      const box = q('uiTiles');
      box.innerHTML = '';
      for (const grp of GROUP_ORDER) {
        const list = TILES.filter(t => t.group === grp);
        if (!list.length) continue;
        const h = document.createElement('div');
        h.className = 'uiGrp'; h.textContent = grp === 'Anime' ? 'Anime style (pictures)' : grp;
        box.appendChild(h);
        const wrap = document.createElement('div');
        wrap.className = 'uiTiles';
        for (const t of list) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'uiTile' + (cur.theme === t.id ? ' on' : '');
          const sw = document.createElement('div');
          sw.className = 'sw';
          sw.textContent = t.name;
          sw.style.background = t.bg;
          sw.style.color = t.fg;
          if (t.id === 'custom' && cur.bgImage) {
            sw.style.background = `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url("${toUrl(cur.bgImage)}") center / cover no-repeat`;
          }
          if (t.group === 'Anime') sw.style.textShadow = '0 1px 4px #000';
          const nm = document.createElement('div');
          nm.className = 'nm';
          nm.textContent = t.desc;
          b.append(sw, nm);
          b.addEventListener('click', () => { cur.theme = t.id; commit(); });
          wrap.appendChild(b);
        }
        box.appendChild(wrap);
      }
      const isArt = !!(PRESET_BY_ID[cur.theme] && PRESET_BY_ID[cur.theme].art);
      q('uiCustom').hidden = cur.theme !== 'custom' && !isArt;
      document.querySelectorAll('.uiOnlyCustom').forEach(e => { e.hidden = cur.theme !== 'custom'; });
      q('uiImgName').textContent = cur.bgImage ? 'Using: ' + cur.bgImage.split(/[\\/]/).pop() : 'No picture chosen yet.';
      q('uiImgOp').value = cur.imgOpacity;
      q('uiImgOpV').textContent = cur.imgOpacity + '%';
      q('uiPanelOp').value = cur.panelOpacity;
      q('uiPanelOpV').textContent = cur.panelOpacity + '%';
      q('uiBase').value = cur.customBase;
      q('uiAccent').value = cur.accent;
      q('uiShow').checked = cur.showIntro;
      q('uiName').value = cur.welcomeName;
      q('uiWelcome').value = cur.welcomeMsg;
      q('uiBye').value = cur.goodbyeMsg;
      q('uiByeSecs').value = cur.goodbyeSecs;
    }
    const quick = () => { save(); apply(); };
    const commit = () => { save(); apply(); sync(); };

    q('uiPick').addEventListener('click', async () => {
      const r = await window.api.uiPickBackground();
      if (r.canceled) return;
      if (!r.ok) { msg(r.error); return; }
      cur.bgImage = r.path;
      cur.theme = 'custom';
      commit();
      msg('Background set. Use the sliders to adjust it.');
    });
    q('uiClearImg').addEventListener('click', async () => {
      await window.api.uiClearBackground();
      cur.bgImage = '';
      commit();
      msg('Picture removed.');
    });
    q('uiImgOp').addEventListener('input', (e) => {
      cur.imgOpacity = clamp(e.target.value, 5, 100, 55);
      q('uiImgOpV').textContent = cur.imgOpacity + '%';
      quick();
    });
    q('uiPanelOp').addEventListener('input', (e) => {
      cur.panelOpacity = clamp(e.target.value, 30, 100, 78);
      q('uiPanelOpV').textContent = cur.panelOpacity + '%';
      quick();
    });
    q('uiBase').addEventListener('change', (e) => { cur.customBase = e.target.value === 'light' ? 'light' : 'dark'; quick(); });
    q('uiAccent').addEventListener('input', (e) => { cur.accent = e.target.value; quick(); });

    q('uiShow').addEventListener('change', (e) => { cur.showIntro = e.target.checked; save(); });
    q('uiName').addEventListener('input', (e) => { cur.welcomeName = e.target.value; save(); });
    q('uiWelcome').addEventListener('input', (e) => { cur.welcomeMsg = e.target.value; save(); });
    q('uiBye').addEventListener('input', (e) => { cur.goodbyeMsg = e.target.value; save(); });
    q('uiByeSecs').addEventListener('change', (e) => {
      cur.goodbyeSecs = clamp(e.target.value, 1, 15, 4);
      e.target.value = cur.goodbyeSecs;
      save();
    });

    q('uiPreview').addEventListener('click', () => { if (window.whStartIntro) window.whStartIntro(true); });
    q('uiReset').addEventListener('click', async () => {
      if (!confirm('Reset the theme and the welcome settings to the defaults?')) return;
      try { await window.api.uiClearBackground(); } catch (e) {}
      cur = Object.assign({}, DEFAULTS);
      commit();
      msg('Back to the defaults.');
    });

    const open = () => { sync(); ov.hidden = false; };
    const close = () => { ov.hidden = true; };
    q('uiClose').addEventListener('click', close);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.hidden) close(); });
    q('styleBtn').addEventListener('click', open);
    window.WHUI.open = open;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi);
  else buildUi();
})();
