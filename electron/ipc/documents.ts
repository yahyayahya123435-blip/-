import { BrowserWindow, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { handlePermitted } from './handler';
import { generateDocx, generateXlsx, documentSpecToHtml, type DocumentSpec } from '../../src/services/documents';
import { getRuntimePaths } from '../runtime-context';

const documentSpecSchema = z.object({
  orgName: z.string(),
  title: z.string(),
  recordNumber: z.string().optional(),
  date: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
  notes: z.string().optional(),
});

async function generatePdfFile(spec: DocumentSpec, documentsDir: string): Promise<string> {
  const html = documentSpecToHtml(spec);
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const buffer = await win.webContents.printToPDF({ printBackground: true, landscape: false });
    const safeName = `${spec.title}-${spec.recordNumber ?? 'record'}-${spec.date}`.replace(/[^a-zA-Z0-9؀-ۿ_-]/g, '_').slice(0, 120);
    const filePath = path.join(documentsDir, `${safeName}.pdf`);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  } finally {
    win.destroy();
  }
}

export function registerDocumentHandlers(): void {
  handlePermitted<z.infer<typeof documentSpecSchema>>('documents:generatePdf', 'documents', 'export', async ({ payload }) => {
    const spec = documentSpecSchema.parse(payload);
    const filePath = await generatePdfFile(spec, getRuntimePaths().documents);
    return { filePath };
  });

  handlePermitted<z.infer<typeof documentSpecSchema>>('documents:generateDocx', 'documents', 'export', async ({ payload }) => {
    const spec = documentSpecSchema.parse(payload);
    const filePath = await generateDocx(spec, getRuntimePaths().documents);
    return { filePath };
  });

  handlePermitted<z.infer<typeof documentSpecSchema>>('documents:generateXlsx', 'documents', 'export', async ({ payload }) => {
    const spec = documentSpecSchema.parse(payload);
    const filePath = await generateXlsx(spec, getRuntimePaths().documents);
    return { filePath };
  });

  handlePermitted<{ filePath: string }>('documents:openInFolder', 'documents', 'view', async ({ payload }) => {
    const documentsDir = path.resolve(getRuntimePaths().documents);
    const target = path.resolve(payload.filePath);
    if (target !== documentsDir && !target.startsWith(documentsDir + path.sep)) {
      throw new Error('PATH_TRAVERSAL');
    }
    shell.showItemInFolder(target);
    return { success: true };
  });
}
