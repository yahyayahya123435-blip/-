/**
 * Serves the Next.js static export (`out/`) over http://127.0.0.1 instead of
 * loading it via file://. Electron's BrowserWindow.loadFile() + file:// URLs
 * breaks Next's client-side router (relative RSC/data fetches don't resolve
 * correctly against file:// paths), so a minimal local-only HTTP server is
 * the standard fix — bound to loopback only, never reachable from the
 * network, serving nothing but the app's own pre-built static files.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function startStaticServer(rootDir: string): Promise<{ url: string; close: () => void }> {
  const resolvedRoot = path.resolve(rootDir);

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.join(resolvedRoot, urlPath);

    // Defense against path traversal via a crafted request URL.
    if (!filePath.startsWith(resolvedRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (filePath.endsWith('/') || !path.extname(filePath)) {
      const asIndex = path.join(filePath, 'index.html');
      const withHtml = `${filePath}.html`;
      if (fs.existsSync(asIndex)) filePath = asIndex;
      else if (fs.existsSync(withHtml)) filePath = withHtml;
      else filePath = path.join(resolvedRoot, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // Client-side routes (unknown static paths) fall back to index.html.
        fs.readFile(path.join(resolvedRoot, 'index.html'), (fallbackErr, fallbackData) => {
          if (fallbackErr) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fallbackData);
        });
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}
