const fs = require('fs');

const SUPPORTED = ['.pdf', '.docx', '.xlsx'];
const MAX_CHARS = 300000;            // text kept per file
const MAX_BYTES = 50 * 1024 * 1024;  // skip files over 50 MB

async function extractPdf(file) {
  const pdf = require('pdf-parse/lib/pdf-parse.js');
  const data = await pdf(fs.readFileSync(file));
  return data.text;
}

async function extractDocx(file) {
  const mammoth = require('mammoth');
  const r = await mammoth.extractRawText({ path: file });
  return r.value;
}

async function extractXlsx(file) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const parts = [];
  wb.eachSheet(ws => {
    parts.push('[Sheet: ' + ws.name + ']');
    ws.eachRow(row => {
      const vals = [];
      row.eachCell(cell => {
        let v = cell.value;
        if (v && typeof v === 'object') {
          if (v.richText) v = v.richText.map(t => t.text).join('');
          else if (v.result !== undefined) v = v.result;
          else if (v.text) v = v.text;
          else v = '';
        }
        if (v !== null && v !== undefined && v !== '') vals.push(String(v));
      });
      if (vals.length) parts.push(vals.join(' | '));
    });
  });
  return parts.join('\n');
}

async function extractText(file, ext, size, keepLines) {
  if (size > MAX_BYTES) return '';
  try {
    let text = '';
    if (ext === '.pdf') text = await extractPdf(file);
    else if (ext === '.docx') text = await extractDocx(file);
    else if (ext === '.xlsx') text = await extractXlsx(file);
    text = text || '';
    if (keepLines) {
      text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    } else {
      text = text.replace(/\s+/g, ' ');
    }
    return text.slice(0, MAX_CHARS);
  } catch (e) {
    return '';
  }
}

module.exports = { extractText, SUPPORTED };