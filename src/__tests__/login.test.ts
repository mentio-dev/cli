import { describe, expect, it } from 'vitest';
import { LoginError, loginUrl, newState, startCallbackServer } from '../login';

describe('loginUrl', () => {
  it('points the browser at the dashboard with the port, state, name and scope', () => {
    const url = new URL(loginUrl('https://app.mentio.dev/', { port: 51234, state: 'abc', name: 'CLI on laptop', scope: 'read' }));
    expect(url.origin + url.pathname).toBe('https://app.mentio.dev/cli/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({ port: '51234', state: 'abc', name: 'CLI on laptop', scope: 'read' });
    expect(newState()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe('startCallbackServer', () => {
  it('hands over the key once the right state calls back, and ignores the wrong one', async () => {
    const server = await startCallbackServer('good-state-good-state', 5000);
    const wrong = await fetch(`http://127.0.0.1:${server.port}/callback?state=nope&key=mk_live_x`);
    expect(wrong.status).toBe(400);
    const missing = await fetch(`http://127.0.0.1:${server.port}/callback?state=good-state-good-state`);
    expect(missing.status).toBe(400);
    const elsewhere = await fetch(`http://127.0.0.1:${server.port}/anything`);
    expect(elsewhere.status).toBe(404);
    const ok = await fetch(`http://127.0.0.1:${server.port}/callback?state=good-state-good-state&key=mk_live_abc`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('connected');
    await expect(server.key).resolves.toBe('mk_live_abc');
  });

  it('rejects when the browser cancels, and on timeout', async () => {
    const denied = await startCallbackServer('state-state-state-1', 5000);
    await fetch(`http://127.0.0.1:${denied.port}/callback?error=denied`);
    await expect(denied.key).rejects.toBeInstanceOf(LoginError);

    const slow = await startCallbackServer('state-state-state-2', 100);
    await expect(slow.key).rejects.toThrow(/No authorization arrived/);
  });
});
