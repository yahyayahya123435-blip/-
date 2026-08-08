/**
 * contextIsolation is on and nodeIntegration is off (see main.ts), so this
 * is the ONLY bridge between the renderer and Node/Electron. It exposes a
 * single `window.api.invoke(channel, payload)` restricted to an explicit
 * channel allowlist — no direct ipcRenderer, no Node API surface, no eval.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { ALL_CHANNELS } from './ipc/channels';

const ALLOWED = new Set<string>(ALL_CHANNELS);

let sessionToken: string | null = null;

contextBridge.exposeInMainWorld('api', {
  invoke: async (channel: string, payload?: unknown) => {
    if (!ALLOWED.has(channel)) {
      throw new Error(`CHANNEL_NOT_ALLOWED: ${channel}`);
    }
    return ipcRenderer.invoke(channel, { token: sessionToken, payload });
  },
  setToken: (token: string | null) => {
    sessionToken = token;
  },
  getToken: () => sessionToken,
});
