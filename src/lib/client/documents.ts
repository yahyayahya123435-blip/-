'use client';

import { apiInvoke, ApiError } from './api';

export interface DocumentSpec {
  orgName: string;
  title: string;
  recordNumber?: string;
  date: string;
  columns: string[];
  rows: (string | number)[][];
  notes?: string;
}

const CHANNEL_BY_FORMAT = {
  pdf: 'documents:generatePdf',
  docx: 'documents:generateDocx',
  xlsx: 'documents:generateXlsx',
} as const;

export type DocumentFormat = keyof typeof CHANNEL_BY_FORMAT;

/**
 * Generates a document and reveals it in the OS file manager. Export is
 * always a follow-up action on an already-saved record, never a prerequisite
 * for saving — callers invoke this only after the underlying record was
 * successfully created/updated.
 */
export async function exportDocument(format: DocumentFormat, spec: DocumentSpec): Promise<string> {
  const { filePath } = await apiInvoke<{ filePath: string }>(CHANNEL_BY_FORMAT[format], spec);
  await apiInvoke('documents:openInFolder', { filePath }).catch(() => undefined);
  return filePath;
}

export { ApiError };
