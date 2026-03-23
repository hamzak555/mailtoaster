import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getContentType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export class RendererServer {
  private server: Server | null = null;
  private origin: string | null = null;

  async start(): Promise<string> {
    if (this.origin) {
      return this.origin;
    }

    const rootDir = path.join(app.getAppPath(), 'out');

    this.server = createServer(async (request, response) => {
      try {
        const requestPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
        const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
        const resolvedPath = path.resolve(rootDir, relativePath);

        if (!resolvedPath.startsWith(rootDir)) {
          response.writeHead(403).end('Forbidden');
          return;
        }

        let filePath = resolvedPath;

        try {
          const stat = await readFile(filePath);
          response.writeHead(200, {
            'Content-Type': getContentType(filePath),
            'Cache-Control': 'no-store',
          });
          response.end(stat);
          return;
        } catch {
          if (!filePath.endsWith('.html')) {
            filePath = path.join(rootDir, 'index.html');
          }
        }

        const file = await readFile(filePath);
        response.writeHead(200, {
          'Content-Type': getContentType(filePath),
          'Cache-Control': 'no-store',
        });
        response.end(file);
      } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();

        if (!address || typeof address === 'string') {
          reject(new Error('Renderer server failed to bind.'));
          return;
        }

        this.origin = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    return this.origin ?? 'http://127.0.0.1';
  }

  async stop(): Promise<void> {
    this.origin = null;

    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
