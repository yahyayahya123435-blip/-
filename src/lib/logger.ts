/**
 * SERVER-ONLY. Minimal file logger writing to the Logs/ folder under the
 * app's userData directory. Internal error detail (stack traces, Prisma
 * error codes) is written here — never surfaced to the renderer directly.
 */
import fs from 'node:fs';
import path from 'node:path';

let logsDir: string | null = null;

export function initLogger(dir: string): void {
  logsDir = dir;
  fs.mkdirSync(dir, { recursive: true });
}

function currentLogFile(): string {
  if (!logsDir) throw new Error('Logger not initialized — call initLogger() at app startup first');
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logsDir, `app-${date}.log`);
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    meta: meta instanceof Error ? { name: meta.name, message: meta.message, stack: meta.stack } : meta,
  });
  try {
    if (logsDir) {
      fs.appendFileSync(currentLogFile(), line + '\n', 'utf-8');
    }
  } catch {
    // Logging must never crash the app.
  }
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[${level}] ${message}`, meta ?? '');
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => write('INFO', message, meta),
  warn: (message: string, meta?: unknown) => write('WARN', message, meta),
  error: (message: string, meta?: unknown) => write('ERROR', message, meta),
};
