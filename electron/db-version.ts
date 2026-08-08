import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Resolves the project/resource root: dev = repo root, packaged = process.resourcesPath (extraResources). */
export function getResourceRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
}

export function getLatestMigrationName(): string {
  const migrationsDir = path.join(getResourceRoot(), 'prisma', 'migrations');
  const folders = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return folders[folders.length - 1] ?? 'unknown';
}
