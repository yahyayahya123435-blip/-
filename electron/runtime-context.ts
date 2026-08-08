/** Holds process-wide resolved paths, set once in main.ts at startup, read by ipc/* handlers. */
import type { AppPaths } from './app-paths';

let paths: AppPaths | null = null;

export function setRuntimePaths(p: AppPaths): void {
  paths = p;
}

export function getRuntimePaths(): AppPaths {
  if (!paths) throw new Error('Runtime paths not initialized');
  return paths;
}
