#!/usr/bin/env node
'use strict';
/*
 * Work Helper: put the code into folders.
 *
 *   node tools/organize.js            -> DRY RUN: shows what would move, changes nothing
 *   node tools/organize.js --apply    -> makes a backup copy, moves the files, fixes every path, then checks the result
 *
 * Run it from the project folder (the one with package.json). Safe to run twice: files that are already in
 * their folder are left alone. To undo: delete the project folder and copy the backup folder back
 * (the backup is created next to the project folder, named  <project>-backup-<date>).
 *
 * Where a file goes is decided by the table below (MAP). A file that is not in the table stays where it is and is listed
 * at the end, so you can add it to the table and run again.
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();

// ------------------------------------------------------------------ where each file goes
const MAIN = 'src/main', REN = 'src/renderer';
const MAP = {
  // ---- main process (the "engines")
  'main.js': MAIN, 'preload.js': MAIN,
  'scanner.js': `${MAIN}/files`, 'extractor.js': `${MAIN}/files`, 'extractPool.js': `${MAIN}/files`, 'extractWorker.js': `${MAIN}/files`,
  'summarizer.js': `${MAIN}/files`, 'categories.js': `${MAIN}/files`, 'organizer.js': `${MAIN}/files`, 'fileops.js': `${MAIN}/files`, 'previews.js': `${MAIN}/files`,
  'tasks.js': `${MAIN}/tasks`,
  'inventory.js': `${MAIN}/inventory`, 'inventory-core.js': `${MAIN}/inventory`, 'inventory-import.js': `${MAIN}/inventory`, 'zip-lite.js': `${MAIN}/inventory`,
  'notepad.js': `${MAIN}/notes`,
  'punch.js': `${MAIN}/punch`,
  'aiswitch.js': `${MAIN}/ai`,
  'appearance.js': `${MAIN}/appearance`,
  // ---- renderer (what you see)
  'index.html': REN,
  'renderer.js': `${REN}/core`, 'ui-kit.js': `${REN}/core`, 'theme.js': `${REN}/core`, 'intro.js': `${REN}/core`, 'tabs-ui.js': `${REN}/core`,
  'organize-ui.js': `${REN}/files`, 'fileops-ui.js': `${REN}/files`, 'preview-ui.js': `${REN}/files`,
  'tasks-ui.js': `${REN}/tasks`,
  'inventory-mode.js': `${REN}/inventory`, 'inventory-ui.js': `${REN}/inventory`, 'tools-ui.js': `${REN}/inventory`,
  'notepad-ui.js': `${REN}/notes`,
  'punch-ui.js': `${REN}/punch`, 'reports-ui.js': `${REN}/reports`, 'damaged-report.js': `${REN}/reports`, 'damage-photos.js': `${REN}/inventory`,
  'ai-ui.js': `${REN}/ai`,
  // ---- not used by the app any more (kept so nothing is lost; delete when you are ready)
  'chat.js': '_unused', 'chat-ui.js': '_unused'
};
const ASSET_EXT = new Set(['.ico', '.icns', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp']);
const KEEP_IN_ROOT = new Set(['package.json', 'package-lock.json', 'README.md', 'LICENSE', '.gitignore', '.editorconfig', 'electron-builder.yml', 'electron-builder.json', 'forge.config.js']);
const CODE_EXT = new Set(['.js', '.html', '.css']);

// ------------------------------------------------------------------ helpers
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const log = (...a) => console.log(...a);
const exists = (p) => { try { fs.accessSync(p); return true; } catch (e) { return false; } };

function destFolderOf(name) {
  if (MAP[name]) return MAP[name];
  if (ASSET_EXT.has(path.extname(name).toLowerCase())) return 'assets';
  return null;
}

// ------------------------------------------------------------------ 1. plan
const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name)
  .filter(n => !KEEP_IN_ROOT.has(n) && !n.startsWith('.'));
const plan = new Map();      // absolute old path -> absolute new path
const stay = [];
for (const name of rootFiles) {
  const folder = destFolderOf(name);
  if (folder) plan.set(path.join(ROOT, name), path.join(ROOT, folder, name));
  else if (CODE_EXT.has(path.extname(name))) stay.push(name);
}

// Where does a file that sits at an old location live after the move?
const newLocation = (oldAbs) => plan.get(oldAbs) || oldAbs;

// ------------------------------------------------------------------ 2. rewrite references inside a file
// A reference is only changed when it points at something that really exists in the project.
function resolveExisting(fromOldDir, ref) {
  const abs = path.resolve(fromOldDir, ref);
  if (abs.includes(`${path.sep}node_modules${path.sep}`)) return null;
  const cands = [abs, abs + '.js', abs + '.json', path.join(abs, 'index.js')];
  for (const c of cands) if (exists(c) && fs.statSync(c).isFile()) return c;
  if (exists(abs) && fs.statSync(abs).isDirectory()) return abs;
  return null;
}

function rewriteRefs(text, oldFile, newFile, kind) {
  const oldDir = path.dirname(oldFile), newDir = path.dirname(newFile);
  let changes = 0;
  // returns the new text of the reference, or null when nothing needs to change
  const mapRef = (ref, withDotSlash, keepExt) => {
    if (/^[a-z]+:/i.test(ref) || ref.startsWith('#') || ref.startsWith('/')) return null;   // urls, anchors, absolute
    const target = resolveExisting(oldDir, ref);
    if (!target) return null;
    let toAbs = newLocation(target);
    let r = path.relative(newDir, toAbs).split(path.sep).join('/');
    if (!keepExt) {
      // keep the style of the original (require('./x') has no extension)
      const hadExt = /\.(js|json|node)$/.test(ref);
      if (!hadExt) r = r.replace(/\.js$/, '').replace(/\/index$/, '');
    }
    if (withDotSlash && !r.startsWith('.')) r = './' + r;
    if (r === ref) return null;
    changes++;
    return r;
  };

  if (kind === 'html') {
    text = text.replace(/(\b(?:src|href)\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, ref) => {
      const n = mapRef(ref, false, true); return n == null ? m : `${pre}${q}${n}${q}`;
    });
    return { text, changes };
  }
  // require('./x')
  text = text.replace(/(\brequire\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g, (m, pre, q, ref) => {
    const n = mapRef(ref, true, false); return n == null ? m : `${pre}${q}${n}${q}`;
  });
  // path.join(__dirname, 'icon.ico')  /  path.resolve(__dirname, 'x')
  text = text.replace(/(__dirname\s*,\s*)(["'])([^"']+)\2/g, (m, pre, q, ref) => {
    const n = mapRef(ref, false, true); return n == null ? m : `${pre}${q}${n}${q}`;
  });
  // win.loadFile('index.html')  -> relative to the app folder, so it becomes a __dirname path after the move
  text = text.replace(/(\.loadFile\(\s*)(["'])([^"']+)\2/g, (m, pre, q, ref) => {
    const target = resolveExisting(ROOT, ref);
    if (!target) return m;
    const to = path.relative(newDir, newLocation(target)).split(path.sep).join('/');
    changes++;
    return `${pre}path.join(__dirname, ${q}${to}${q})`;
  });
  // new Worker('./extractWorker.js')   (when written as a plain relative string)
  text = text.replace(/(\bnew\s+Worker\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g, (m, pre, q, ref) => {
    const n = mapRef(ref, true, true); return n == null ? m : `${pre}${q}${n}${q}`;
  });
  return { text, changes };
}

// ------------------------------------------------------------------ 3. show / do the plan
log(APPLY ? 'ORGANIZE (apply)' : 'ORGANIZE (dry run, nothing is changed)');
log('Project folder:', ROOT, '\n');

const moves = [...plan.entries()].filter(([o, n]) => o !== n);
if (!moves.length) log('Nothing to move: the files are already in their folders.');
const byFolder = {};
moves.forEach(([o, n]) => { const f = rel(path.dirname(n)); (byFolder[f] = byFolder[f] || []).push(path.basename(o)); });
Object.keys(byFolder).sort().forEach(f => log(`  ${f}/\n      ${byFolder[f].join('  ')}`));

const rewrites = [];
for (const [oldAbs, newAbs] of plan) {
  const ext = path.extname(oldAbs);
  if (!CODE_EXT.has(ext)) continue;
  const src = fs.readFileSync(oldAbs, 'utf8');
  const out = rewriteRefs(src, oldAbs, newAbs, ext === '.html' ? 'html' : ext === '.css' ? 'css' : 'js');
  rewrites.push({ oldAbs, newAbs, text: out.text, changes: out.changes });
}
// files that are not moving but point at files that are (for example a script in a sub folder)
const pkgPath = path.join(ROOT, 'package.json');

log('\nPath fixes inside files:');
rewrites.filter(r => r.changes).forEach(r => log(`  ${rel(r.newAbs)}: ${r.changes} path${r.changes === 1 ? '' : 's'} updated`));
if (stay.length) log('\nNot in the table, left where they are (add them to MAP in tools/organize.js if they belong in a folder):\n  ' + stay.join('  '));

if (!APPLY) {
  log('\nThis was a dry run. To do it for real:  node tools/organize.js --apply');
  process.exit(0);
}

// ---- backup
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backup = path.join(path.dirname(ROOT), `${path.basename(ROOT)}-backup-${stamp}`);
fs.cpSync(ROOT, backup, { recursive: true, filter: (p) => !/[\\/](node_modules|dist|\.git)([\\/]|$)/.test(p) });
log(`\nBackup saved: ${backup}`);

// ---- write the new files, then remove the old ones
for (const r of rewrites) {
  fs.mkdirSync(path.dirname(r.newAbs), { recursive: true });
  fs.writeFileSync(r.newAbs, r.text);
}
for (const [oldAbs, newAbs] of moves) {
  if (CODE_EXT.has(path.extname(oldAbs))) { fs.unlinkSync(oldAbs); continue; }   // already written above
  fs.mkdirSync(path.dirname(newAbs), { recursive: true });
  fs.renameSync(oldAbs, newAbs);
}

// ---- package.json
if (exists(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const mainNew = plan.get(path.join(ROOT, pkg.main || 'main.js'));
  if (mainNew) pkg.main = rel(mainNew);
  pkg.scripts = pkg.scripts || {};
  for (const k of Object.keys(pkg.scripts)) {
    pkg.scripts[k] = String(pkg.scripts[k]).replace(/--icon=([^\s"]+)/, (m, p) => {
      const t = path.join(ROOT, p);
      return plan.has(t) ? `--icon=${rel(plan.get(t))}` : m;
    });
  }
  if (!pkg.scripts.test) pkg.scripts.test = 'node --test';
  if (!pkg.scripts.check) pkg.scripts.check = 'node tools/check.js';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  log('package.json: "main" and the icon path were updated, "test" and "check" scripts added.');
}

// ------------------------------------------------------------------ 4. check the result
log('\nChecking the new layout...\n');
const checkFile = path.join(ROOT, 'tools', 'check.js');
let status = 0;
if (exists(checkFile)) {
  status = require('child_process').spawnSync(process.execPath, [checkFile, '--after-move'], { stdio: 'inherit' }).status;
} else {
  log('tools/check.js is missing, so the result could not be checked. Copy it from the kit and run:  npm run check');
}
log(status ? `\nSomething above needs fixing. Your old layout is safe in: ${backup}` : `\nDone. Backup of the old layout: ${backup}\nStart the app with:  npm start`);
process.exit(status ? 1 : 0);
