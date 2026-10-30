const fs = require('fs');
const path = require('path');

const DEFAULT_RULES = [
  {
    name: 'Drawings',
    exts: ['.dwg', '.dxf', '.dgn', '.dwf'],
    keywords: ['drawing', 'drawings', 'dwg', 'p&id', 'p&ids', 'pid', 'pids', 'sld', 'schematic', 'schematics', 'isometric', 'isometrics', 'layout', 'layouts', 'elevation', 'single line', 'general arrangement', 'as-built', 'asbuilt']
  },
  {
    name: 'Specifications',
    exts: [],
    keywords: ['spec', 'specs', 'specification', 'specifications', 'scope of work', 'design basis', 'basis of design', 'standard', 'standards']
  },
  {
    name: 'Manuals & Datasheets',
    exts: [],
    keywords: ['manual', 'manuals', 'datasheet', 'datasheets', 'data sheet', 'data sheets', 'catalog', 'catalogue', 'brochure', 'o&m', 'vendor', 'vendors']
  },
  {
    name: 'Punch Lists & Trackers',
    exts: [],
    keywords: ['punch', 'punchlist', 'snag', 'snags', 'snagging', 'deficiency', 'deficiencies', 'ncr', 'ncrs', 'tracker', 'trackers', 'open items', 'action list']
  },
  {
    name: 'Schedules & Lists',
    exts: [],
    keywords: ['schedule', 'schedules', 'list', 'lists', 'register', 'registers', 'index', 'bom', 'bill', 'bills', 'takeoff', 'io']
  },
  {
    name: 'Reports & Calculations',
    exts: [],
    keywords: ['report', 'reports', 'calculation', 'calculations', 'calc', 'calcs', 'study', 'inspection', 'itp', 'test', 'tests', 'testing', 'commissioning', 'certificate', 'certificates', 'audit']
  },
  {
    name: 'Correspondence & Minutes',
    exts: [],
    keywords: ['rfi', 'rfis', 'transmittal', 'transmittals', 'letter', 'letters', 'memo', 'email', 'emails', 'minutes', 'mom', 'meeting', 'meetings', 'correspondence']
  },
  {
    name: 'Procedures & Plans',
    exts: [],
    keywords: ['procedure', 'procedures', 'sop', 'sops', 'method statement', 'method statements', 'hse', 'safety', 'qa', 'qc', 'quality plan', 'work instruction', 'plan', 'plans']
  },
  {
    name: 'Contracts & Commercial',
    exts: [],
    keywords: ['contract', 'contracts', 'po', 'purchase order', 'quotation', 'quote', 'invoice', 'invoices', 'variation', 'boq', 'tender', 'proposal', 'bid']
  },
  {
    name: 'Photos & Media',
    exts: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.webp', '.mp4', '.mov'],
    keywords: ['photo', 'photos', 'picture', 'pictures', 'image', 'images']
  }
];

function rulesFilePath(dir) {
  return path.join(dir, 'categories.json');
}

// Loads your rules. Creates the editable file on first run.
// If the file has a typo (invalid JSON), the built-in defaults are used.
function loadRules(dir) {
  const file = rulesFilePath(dir);
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(r) && r.length) return r;
  } catch (e) {
    if (!fs.existsSync(file)) {
      try { fs.writeFileSync(file, JSON.stringify(DEFAULT_RULES, null, 2)); } catch (e2) {}
    }
  }
  return DEFAULT_RULES;
}

function tokenize(text) {
  return new Set(text.split(/[^a-z0-9&]+/).filter(Boolean));
}

function hit(text, tokens, keywords) {
  return (keywords || []).some(k =>
    /[^a-z0-9&]/.test(k) ? text.includes(k) : tokens.has(k)
  );
}

// Order: file name keywords, then file extension, then folder names
// (nearest folder first), otherwise "Other".
function classify(rel, ext, rules) {
  const norm = rel.replace(/\\/g, '/').toLowerCase();
  const slash = norm.lastIndexOf('/');
  const name = norm.slice(slash + 1);
  const folders = slash >= 0 ? norm.slice(0, slash).split('/').reverse() : [];

  const nameTokens = tokenize(name);
  for (const r of rules) if (hit(name, nameTokens, r.keywords)) return r.name;

  for (const r of rules) if ((r.exts || []).includes(ext)) return r.name;

  for (const seg of folders) {
    const tokens = tokenize(seg);
    for (const r of rules) if (hit(seg, tokens, r.keywords)) return r.name;
  }
  return 'Other';
}

module.exports = { loadRules, classify, rulesFilePath };