const fs = require('fs');
const path = require('path');

const SKIP_DIRS = ['node_modules', '$RECYCLE.BIN', 'System Volume Information'];
// Windows/Mac housekeeping files that are not real work files (compared in lower case)
const SKIP_FILES = ['desktop.ini', 'thumbs.db', '.ds_store'];

// Returns every file and every folder (including empty ones).
function scanTree(root) {
  const files = [];
  const dirs = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return; // skip folders we can't read
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.includes(entry.name) || entry.name.startsWith('.')) continue;
        dirs.push(full);
        walk(full);
      } else if (entry.isFile() && !entry.name.startsWith('~$') && !SKIP_FILES.includes(entry.name.toLowerCase())) {
        try {
          const st = fs.statSync(full);
          files.push({
            name: entry.name,
            path: full,
            ext: path.extname(entry.name).toLowerCase(),
            size: st.size,
            modified: st.mtimeMs
          });
        } catch (e) {}
      }
    }
  }

  walk(root);
  return { files, dirs };
}

function scanFolder(root) {
  return scanTree(root).files;
}

module.exports = { scanFolder, scanTree };
