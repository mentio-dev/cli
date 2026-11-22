import type { Client } from '@mentio-dev/sdk';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { downloadExport, waitForExport } from '../exports-wait';

/** GET /v1/exports/{id} answers from a script of states; the file route a text. */
function scriptedClient(states: Array<Record<string, unknown>>, file = ''): { client: Client; calls: string[] } {
  const calls: string[] = [];
  let call = 0;
  const request = async (options: { url: string; parseAs?: string }) => {
    calls.push(options.url);
    if (options.url.endsWith('/file')) {
      return { data: new Response(file).body, error: undefined, response: new Response(null, { status: 200 }) };
    }
    const state = states[Math.min(call, states.length - 1)];
    call++;
    return { data: state, error: undefined, response: new Response(null, { status: 200 }) };
  };
  return { client: { request } as unknown as Client, calls };
}

describe('waitForExport', () => {
  it('polls until succeeded', async () => {
    const { client } = scriptedClient([
      { id: 'exp_1', status: 'queued' },
      { id: 'exp_1', status: 'running', stats: { rows: 10, bytes: 100 } },
      { id: 'exp_1', status: 'succeeded', stats: { rows: 20, bytes: 200 }, download: { url: 'https://x', expiresAt: 'z' } },
    ]);
    const seen: string[] = [];
    const ready = await waitForExport({ client, id: 'exp_1', intervalMs: 1, timeoutMs: 60_000, sleep: async () => {}, onProgress: (s) => seen.push(s.status) });
    expect(ready.status).toBe('succeeded');
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
  });

  it('throws the export\'s error when it failed, and on timeout', async () => {
    const failed = scriptedClient([{ id: 'exp_1', status: 'failed', error: { code: 'timed_out', message: 'too slow' } }]);
    await expect(waitForExport({ client: failed.client, id: 'exp_1', intervalMs: 1, timeoutMs: 1000, sleep: async () => {} })).rejects.toMatchObject({ code: 'timed_out' });
    let clock = 0;
    const stuck = scriptedClient([{ id: 'exp_1', status: 'running' }]);
    await expect(
      waitForExport({ client: stuck.client, id: 'exp_1', intervalMs: 1, timeoutMs: 10, sleep: async () => void (clock += 20), now: () => clock }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('downloadExport', () => {
  it('streams the file to disk', async () => {
    const { client, calls } = scriptedClient([], 'id,text\r\nmm_1,hello\r\n');
    const path = join(mkdtempSync(join(tmpdir(), 'mentio-export-')), 'out.csv');
    const bytes = await downloadExport({ client, id: 'exp_1', path });
    expect(bytes).toBe(21);
    expect(readFileSync(path, 'utf8')).toBe('id,text\r\nmm_1,hello\r\n');
    expect(calls).toEqual(['/v1/exports/{id}/file']);
  });
});
