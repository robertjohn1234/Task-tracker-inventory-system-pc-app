const MAX_DOCX_BYTES = 40 * 1024 * 1024;
const MAX_XLSX_BYTES = 30 * 1024 * 1024;
const MAX_HTML_CHARS = 20 * 1024 * 1024;
const MAX_ROWS = 300;
const MAX_COLS = 40;
const MAX_SHEETS = 30;
const MAX_CELL_CHARS = 500;

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.slice(11, 16) === '00:00' ? iso.slice(0, 10) : iso.slice(0, 10) + ' ' + iso.slice(11, 16);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('result' in v) return cellText(v.result);   // formula cells: show the result
    if ('text' in v) return cellText(v.text);       // hyperlink cells
    if ('error' in v) return String(v.error);
    return '';
  }
  return String(v);
}

function registerPreviews(ipcMain, ctx) {
  const find = (p) => ctx.getFiles().find(f => f.path === p);

  ipcMain.handle('preview-docx', async (e, filePath) => {
    const f = find(filePath);
    if (!f) return { ok: false, error: 'File not found in the list.' };
    if (f.size > MAX_DOCX_BYTES) return { ok: false, error: 'This Word file is too large to preview. Use Open.' };
    try {
      const mammoth = require('mammoth');
      const r = await mammoth.convertToHtml({ path: f.path });
      const html = r.value || '';
      if (!html.trim()) {
        return { ok: false, error: 'There is no text to show (the document may contain only pictures or shapes). Use Open.' };
      }
      if (html.length > MAX_HTML_CHARS) return { ok: false, error: 'This document is too large to preview. Use Open.' };
      return { ok: true, html };
    } catch (err) {
      return { ok: false, error: 'Could not read this Word file (it may be damaged or password-protected). Use Open.' };
    }
  });

  ipcMain.handle('preview-xlsx', async (e, filePath) => {
    const f = find(filePath);
    if (!f) return { ok: false, error: 'File not found in the list.' };
    if (f.size > MAX_XLSX_BYTES) return { ok: false, error: 'This Excel file is too large to preview. Use Open.' };
    try {
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(f.path);

      const sheets = [];
      wb.eachSheet((ws) => {
        if (sheets.length >= MAX_SHEETS) return;
        if (ws.state === 'hidden' || ws.state === 'veryHidden') return;

        const totalRows = ws.rowCount || 0;
        const totalCols = ws.columnCount || 0;
        const nRows = Math.min(totalRows, MAX_ROWS);
        const nCols = Math.min(totalCols, MAX_COLS);

        const rows = [];
        for (let r = 1; r <= nRows; r++) {
          const row = ws.getRow(r);
          const cells = [];
          for (let c = 1; c <= nCols; c++) {
            const cell = row.getCell(c);
            // merged ranges: show the text once, in the top-left cell
            if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
              cells.push('');
            } else {
              cells.push(cellText(cell.value).slice(0, MAX_CELL_CHARS));
            }
          }
          rows.push(cells);
        }
        sheets.push({
          name: ws.name, rows, cols: nCols, totalRows, totalCols,
          truncated: totalRows > nRows || totalCols > nCols
        });
      });
      return { ok: true, sheets };
    } catch (err) {
      return { ok: false, error: 'Could not read this Excel file (it may be damaged, password-protected, or an old .xls file). Use Open.' };
    }
  });
}

module.exports = { registerPreviews };