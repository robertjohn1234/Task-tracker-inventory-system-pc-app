#!/usr/bin/env node
'use strict';
/*
 * Work Helper: make an admin PIN file to hand over with the app.
 *
 *   node tools/make-pin.js 4321
 *
 * It writes admin-pin.json (the PIN is stored scrambled, not as digits) in the folder you run it from.
 * Copy that file next to the app (the folder with WorkHelper.exe, or the project folder when testing).
 * The first time the app starts on that PC with no PIN set, it picks the file up and deletes it. Nothing else to do.
 *
 * Optional:  node tools/make-pin.js 4321 --out "D:\handover\WorkHelper"   (write the file into another folder)
 * Use the same PIN for every PC or a different one per person: your choice.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const outDir = oi >= 0 ? args[oi + 1] : process.cwd();
const pin = args.find((a, i) => !a.startsWith('--') && (oi < 0 || i !== oi + 1));
if (!/^[0-9]{4,10}$/.test(String(pin || ''))) {
  console.error('Usage: node tools/make-pin.js <PIN of 4 to 10 digits> [--out <folder>]');
  process.exit(1);
}
if (!outDir || !fs.existsSync(outDir)) { console.error('That folder does not exist: ' + outDir); process.exit(1); }
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
const target = path.join(outDir, 'admin-pin.json');
fs.writeFileSync(target, JSON.stringify({ salt, hash, madeAt: new Date().toISOString() }));
console.log('Made ' + target);
console.log('Put this file next to the app. The app picks it up the first time it starts, then deletes it.');
console.log('Keep the PIN itself private (the terminal history may still show it).');