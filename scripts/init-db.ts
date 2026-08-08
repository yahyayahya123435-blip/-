/**
 * Dev-only helper: bootstrap the local dev SQLite database (data/dev.db)
 * using the same logic the packaged Electron app uses at first run.
 * Run: npm run init:db
 */
import path from 'node:path';
import { bootstrapDatabase } from './db-bootstrap';

const projectRoot = path.join(__dirname, '..');
const dbFilePath = path.join(projectRoot, 'prisma', 'data', 'dev.db');

bootstrapDatabase(dbFilePath, projectRoot);
