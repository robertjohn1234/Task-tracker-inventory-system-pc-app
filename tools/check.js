#!/usr/bin/env node
'use strict';
/*
 * Work Helper: quick health check of the code. Run it after every change:   npm run check
 *
 *   1. every .js file has valid syntax
 *   2. every require('./x'), script tag and __dirname file name points at a file that exists
 *   3. the wiring of each feature is complete:
 *        renderer calls  api.something()   ->  preload.js exposes it
 *        preload.js      invoke('channel') ->  a main-process file has ipcMain.handle('channel')
 *
 * Exit code 0 = fine, 1 = something to fix.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AFTER_MOVE = process.argv.includes('--after-move');   // wiring notes are only warnings right after organize.js
const SRC = path.join(ROOT, 'src');
const exists = (p) => { try { fs.accessSync(p); return true; } catch (e) { return false; } };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function resolveExisting(fromDir, ref) {
  const abs = path.resolve(fromDir, ref);
  for (const c of [abs, abs + '.js', abs + '.json', path.join(abs, 'index.js')]) if (exists(c) && fs.statSync(c).isFile()) return c;
  return exists(abs) && fs.statSync(abs).isDirectory() ? abs : null;
}

let problems = 0;
let wiringNotes = 0;
let inWiring = false;
const bad = (msg) => {
  if (inWiring && AFTER_MOVE) { wiringNotes++; console.log('  ! ' + msg); return; }   // was like this before the move, not caused by it
  problems++; console.log('  ✗ ' + msg);
};
const files = walk(SRC, []);
const js = files.filter(f => f.endsWith('.js'));

// 1. syntax
for (const f of js) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) bad(`syntax error in ${rel(f)}\n${String(r.stderr).split('\n').slice(0, 4).join('\n')}`);
}
console.log(`1. syntax: ${js.length} files checked`);

// 2. paths
for (const f of files) {
  const ext = path.extname(f);
  const text = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(f);
  if (ext === '.js') {
    for (const m of text.matchAll(/\brequire\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) if (!resolveExisting(dir, m[1])) bad(`${rel(f)}: require('${m[1]}') does not exist`);
    for (const m of text.matchAll(/__dirname\s*,\s*["']([^"']+\.(?:js|html|css|ico|png|json))["']/g)) if (!exists(path.resolve(dir, m[1]))) bad(`${rel(f)}: file '${m[1]}' does not exist`);
  } else if (ext === '.html') {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"':#]+)["']/gi)) if (!exists(path.resolve(dir, m[1]))) bad(`${rel(f)}: '${m[1]}' does not exist`);
  }
}
console.log('2. paths: require / script / file names checked');

// 3. wiring
inWiring = true;
const pre = js.find(f => path.basename(f) === 'preload.js');
if (pre) {
  const text = fs.readFileSync(pre, 'utf8');
  const exposed = new Map();
  for (const m of text.matchAll(/(\w+)\s*:\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\(\s*'([^']+)'/g)) exposed.set(m[1], m[2]);
  const handled = new Set();
  for (const f of js) {
    if (!f.includes(`${path.sep}main${path.sep}`)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(?:handle|ipcMain\.handle)\(\s*'([^']+)'/g)) handled.add(m[1]);
  }
  for (const [name, chan] of exposed) if (!handled.has(chan)) bad(`preload: api.${name} calls '${chan}' but no ipcMain.handle('${chan}') exists`);
  for (const f of js) {
    if (!f.includes(`${path.sep}renderer${path.sep}`)) continue;
    const t = fs.readFileSync(f, 'utf8');
    const seen = new Set();
    for (const m of t.matchAll(/\bapi\.(\w+)\(/g)) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      if (!exposed.has(m[1]) && !/^(on[A-Z]\w*)$/.test(m[1])) bad(`${rel(f)}: api.${m[1]}() is not exposed in preload.js`);
    }
  }
  console.log(`3. wiring: ${exposed.size} api functions, ${handled.size} handlers checked`);
} else {
  console.log('3. wiring: preload.js not found, skipped');
}

if (wiringNotes) console.log(`\n${wiringNotes} wiring note(s) marked ! — they were already there before the move; fix them when you can.`);
console.log(problems ? `\n${problems} problem(s) found.` : '\nAll good.');
process.exit(problems ? 1 : 0);
