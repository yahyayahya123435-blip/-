/**
 * SERVER-ONLY. DOCX/XLSX generation (pure Node, no Electron dependency —
 * PDF generation uses Electron's webContents.printToPDF and lives in
 * electron/ipc/documents.ts instead, since it needs a BrowserWindow).
 *
 * Save is always independent from export: callers persist the business
 * record via a normal service call first; document generation happens
 * afterward and its failure must never roll back or block the save.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType } from 'docx';
import ExcelJS from 'exceljs';

export interface DocumentSpec {
  orgName: string;
  title: string;
  recordNumber?: string;
  date: string;
  columns: string[];
  rows: (string | number)[][];
  notes?: string;
}

function safeFileBaseName(spec: DocumentSpec): string {
  const raw = `${spec.title}-${spec.recordNumber ?? 'record'}-${spec.date}`;
  return raw.replace(/[^a-zA-Z0-9؀-ۿ_-]/g, '_').slice(0, 120);
}

export async function generateDocx(spec: DocumentSpec, documentsDir: string): Promise<string> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: spec.orgName, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
          new Paragraph({ text: spec.title, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun(`التاريخ: ${spec.date}${spec.recordNumber ? `  |  رقم السجل: ${spec.recordNumber}` : ''}`)],
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: spec.columns.map(
                  (c) => new TableCell({ children: [new Paragraph({ text: c, alignment: AlignmentType.CENTER })] }),
                ),
              }),
              ...spec.rows.map(
                (row) =>
                  new TableRow({
                    children: row.map((cell) => new TableCell({ children: [new Paragraph({ text: String(cell) })] })),
                  }),
              ),
            ],
          }),
          ...(spec.notes ? [new Paragraph({ text: '' }), new Paragraph({ text: `ملاحظات: ${spec.notes}` })] : []),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `${safeFileBaseName(spec)}.docx`;
  const filePath = path.join(documentsDir, fileName);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function generateXlsx(spec: DocumentSpec, documentsDir: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(spec.title.slice(0, 30) || 'Sheet1', { views: [{ rightToLeft: true }] });

  sheet.mergeCells(1, 1, 1, spec.columns.length);
  sheet.getCell(1, 1).value = spec.orgName;
  sheet.getCell(1, 1).alignment = { horizontal: 'center' };
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  sheet.mergeCells(2, 1, 2, spec.columns.length);
  sheet.getCell(2, 1).value = spec.title;
  sheet.getCell(2, 1).alignment = { horizontal: 'center' };
  sheet.getCell(2, 1).font = { bold: true, size: 12 };

  sheet.getCell(3, 1).value = `التاريخ: ${spec.date}`;
  if (spec.recordNumber) sheet.getCell(3, spec.columns.length).value = `رقم السجل: ${spec.recordNumber}`;

  const headerRow = sheet.getRow(5);
  spec.columns.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c;
    headerRow.getCell(i + 1).font = { bold: true };
  });

  spec.rows.forEach((row, rIdx) => {
    const excelRow = sheet.getRow(6 + rIdx);
    row.forEach((cell, cIdx) => {
      excelRow.getCell(cIdx + 1).value = cell;
    });
  });

  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  const fileName = `${safeFileBaseName(spec)}.xlsx`;
  const filePath = path.join(documentsDir, fileName);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

export function documentSpecToHtml(spec: DocumentSpec): string {
  const rowsHtml = spec.rows
    .map((row) => `<tr>${row.map((c) => `<td style="border:1px solid #333;padding:6px;">${escapeHtml(String(c))}</td>`).join('')}</tr>`)
    .join('');
  const headHtml = spec.columns.map((c) => `<th style="border:1px solid #333;padding:6px;background:#eee;">${escapeHtml(c)}</th>`).join('');
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><style>
  body { font-family: 'Tajawal', Arial, sans-serif; padding: 24px; }
  h1 { text-align:center; margin-bottom:4px; }
  h2 { text-align:center; margin-top:0; font-weight:normal; }
  table { width:100%; border-collapse: collapse; margin-top: 16px; }
  .meta { display:flex; justify-content:space-between; margin-top: 8px; }
  .footer { margin-top: 32px; font-size: 12px; color:#666; text-align:center; }
</style></head>
<body>
  <h1>${escapeHtml(spec.orgName)}</h1>
  <h2>${escapeHtml(spec.title)}</h2>
  <div class="meta">
    <span>التاريخ: ${escapeHtml(spec.date)}</span>
    ${spec.recordNumber ? `<span>رقم السجل: ${escapeHtml(spec.recordNumber)}</span>` : ''}
  </div>
  <table><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
  ${spec.notes ? `<p>ملاحظات: ${escapeHtml(spec.notes)}</p>` : ''}
  <div class="footer">جمعية غصون زهران الخيرية — مستند مولّد آلياً</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
