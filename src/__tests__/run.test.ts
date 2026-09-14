import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../generated/operations';
import { clientFor, errorEnvelope, runOperation } from '../run';

const op = (id: string) => {
  const found = OPERATIONS.find((o) => o.operationId === id);
  if (!found) throw new Error(`no operation ${id}`);
  return found;
};

interface Captured {
  url: string;
  method: string;
  authorization: string | null;
  body: string | null;
}

/** A fetch that records the request and answers with a scripted response. */
function fakeFetch(respond: (captured: Captured) => Response): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const captured: Captured = {
      url: request.url,
      method: request.method,
      authorization: request.headers.get('authorization'),
      body: request.method === 'GET' ? null : await request.text(),
    };
    calls.push(captured);
    return respond(captured);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

const settings = { apiKey: 'mk_live_test', apiUrl: 'https://api.test', source: 'flag' as const };

describe('runOperation', () => {
  it('sends the bearer key, path, query and body, and returns parsed JSON', async () => {
    const { fetch, calls } = fakeFetch(() => Response.json({ id: 'mm_1', status: 'done' }, { status: 200 }));
    const outcome = await runOperation(clientFor(settings, fetch), op('updateMention'), { path: { id: 'mm_1' }, query: {}, body: { status: 'done' } });
    expect(outcome).toEqual({ ok: true, status: 200, value: { id: 'mm_1', status: 'done' } });
    expect(calls[0]).toEqual({ url: 'https://api.test/v1/mentions/mm_1', method: 'PATCH', authorization: 'Bearer mk_live_test', body: '{"status":"done"}' });

    const search = fakeFetch(() => Response.json({ data: [], nextCursor: null }));
    await runOperation(clientFor(settings, search.fetch), op('searchMentions'), { path: {}, query: { platform: 'reddit', relevant: true, limit: 5 }, body: undefined });
    expect(search.calls[0]?.url).toBe('https://api.test/v1/mentions?platform=reddit&relevant=true&limit=5');
  });

  it('treats a 204 as success with no value', async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    const outcome = await runOperation(clientFor(settings, fetch), op('deleteKeyword'), { path: { id: 'kw_1' }, query: {}, body: undefined });
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe(204);
    expect(outcome.value).toBeUndefined();
  });

  it('returns the API error envelope on a non-2xx', async () => {
    const { fetch } = fakeFetch(() => Response.json({ error: { code: 'unauthorized', message: 'Invalid API key' } }, { status: 401 }));
    const outcome = await runOperation(clientFor(settings, fetch), op('listKeywords'), { path: {}, query: {}, body: undefined });
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(401);
    expect(errorEnvelope(outcome)).toEqual({ error: { code: 'unauthorized', message: 'Invalid API key' } });
    expect(errorEnvelope({ ok: false, status: 502, value: '<html>bad gateway</html>' })).toEqual({ error: { code: 'http_502', message: '<html>bad gateway</html>' } });
  });

  it('returns CSV as text', async () => {
    const { fetch } = fakeFetch(() => new Response('id,platform\r\nmm_1,x\r\n', { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' } }));
    const outcome = await runOperation(clientFor(settings, fetch), op('exportMentionsCsv'), { path: {}, query: { platform: 'x' }, body: undefined });
    expect(outcome.ok).toBe(true);
    expect(outcome.value).toBe('id,platform\r\nmm_1,x\r\n');
  });
});
