/**
 * Electron main-process only. Resolves every on-disk location the app
 * writes to, all rooted under app.getPath('userData') so data survives
 * installer upgrades/reinstalls (never store data inside the install dir).
 *
 *   <userData>/
 *   ├── data/database.db
 *   ├── Attachments/
 *   ├── Documents/
 *   ├── Backups/
 *   ├── Logs/
 *   └── metadata/
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface AppPaths {
  root: string;
  dataDir: string;
  dbFile: string;
  attachments: string;
  documents: string;
  backups: string;
  logs: string;
  metadata: string;
}

let cached: AppPaths | null = null;

export function getAppPaths(): AppPaths {
  if (cached) return cached;

  const root = app.getPath('userData');
  const dataDir = path.join(root, 'data');
  const paths: AppPaths = {
    root,
    dataDir,
    dbFile: path.join(dataDir, 'database.db'),
    attachments: path.join(root, 'Attachments'),
    documents: path.join(root, 'Documents'),
    backups: path.join(root, 'Backups'),
    logs: path.join(root, 'Logs'),
    metadata: path.join(root, 'metadata'),
  };

  for (const dir of [dataDir, paths.attachments, paths.documents, paths.backups, paths.logs, paths.metadata]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  cached = paths;
  return paths;
}
