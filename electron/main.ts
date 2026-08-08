import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { getAppPaths } from './app-paths';
import { setRuntimePaths } from './runtime-context';
import { getResourceRoot } from './db-version';
import { bootstrapDatabase } from '../src/lib/db-bootstrap';
import { initPrisma, disconnectPrisma } from '../src/lib/db';
import { initLogger, logger } from '../src/lib/logger';
import { registerAllIpcHandlers } from './ipc';

app.setName('GhsoonZahran');

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Keep external links (if any ever appear) out of the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3100');
  } else {
    mainWindow.loadFile(path.join(getResourceRoot(), 'out', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const paths = getAppPaths();
  setRuntimePaths(paths);
  initLogger(paths.logs);

  try {
    bootstrapDatabase(paths.dbFile, getResourceRoot());
    initPrisma(paths.dbFile);
    registerAllIpcHandlers();
    logger.info('Application started', { version: app.getVersion() });
  } catch (err) {
    logger.error('Fatal startup error', err);
    throw err;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await disconnectPrisma();
});
