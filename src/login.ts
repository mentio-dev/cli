/**
 * auth:login: the browser flow. The CLI listens on a random loopback port,
 * opens the dashboard's /cli/authorize page with that port and a one-time
 * state, the signed-in user approves, the dashboard mints an API key through
 * POST /v1/api-keys and redirects the browser to
 * http://127.0.0.1:<port>/callback?state=...&key=... The key travels from the
 * browser to this process only; nothing else ever sees it.
 */
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

export const DEFAULT_APP_URL = 'https://app.mentio.dev';

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

export const newState = (): string => randomBytes(24).toString('base64url');

export function loginUrl(appUrl: string, params: { port: number; state: string; name: string; scope: 'read' | 'write' }): string {
  const url = new URL('/cli/authorize', `${appUrl.replace(/\/+$/, '')}/`);
  url.searchParams.set('port', String(params.port));
  url.searchParams.set('state', params.state);
  url.searchParams.set('name', params.name);
  url.searchParams.set('scope', params.scope);
  return url.toString();
}

export interface CallbackServer {
  port: number;
  /** Resolves with the key once the dashboard calls back; rejects on denial or timeout. */
  key: Promise<string>;
  close: () => void;
}

const page = (title: string, body: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;padding:3rem;max-width:36rem;margin:auto"><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body>`;

/** Listens on 127.0.0.1 (never 0.0.0.0) on a free port for one callback. */
export function startCallbackServer(state: string, timeoutMs: number): Promise<CallbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let settle: { resolve: (key: string) => void; reject: (err: Error) => void } | null = null;
    const key = new Promise<string>((resolve, reject) => {
      settle = { resolve, reject };
    });
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(page('Not found', 'Nothing here.'));
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Cancelled', 'The CLI was not authorized. You can close this tab.'));
        finish(() => settle?.reject(new LoginError(error === 'denied' ? 'Authorization was declined in the browser.' : `Authorization failed: ${error}`)));
        return;
      }
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(page('State mismatch', 'This callback does not belong to the running login. Run mentio auth:login again.'));
        return;
      }
      const issued = url.searchParams.get('key');
      if (!issued) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(page('Missing key', 'The callback carried no key. Run mentio auth:login again.'));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Mentio CLI connected', 'The key is stored on this computer. You can close this tab and go back to the terminal.'));
      finish(() => settle?.resolve(issued));
    });
    const timer = setTimeout(() => finish(() => settle?.reject(new LoginError(`No authorization arrived within ${Math.round(timeoutMs / 1000)} seconds.`))), timeoutMs);
    const close = (): void => {
      clearTimeout(timer);
      server.close();
    };
    const finish = (outcome: () => void): void => {
      // Let the response flush before the listener goes away.
      setTimeout(() => {
        outcome();
        close();
      }, 50);
    };
    server.on('error', (err) => rejectServer(err));
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectServer(new LoginError('Could not open a loopback port.'));
        return;
      }
      // A rejected key promise nobody awaits yet must not crash the process.
      key.catch(() => {});
      resolveServer({ port: address.port, key, close });
    });
  });
}

/** Best effort: the URL is always printed too. */
export function openBrowser(url: string): boolean {
  try {
    const [command, args] =
      process.platform === 'darwin'
        ? ['open', [url]]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', url]]
          : ['xdg-open', [url]];
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
