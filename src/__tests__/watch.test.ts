import type { Client } from '@mentio-dev/sdk';
import { describe, expect, it } from 'vitest';
import { newSeen, takeNew, watchMentions } from '../watch';

describe('takeNew', () => {
  it('returns unseen items oldest first and remembers them', () => {
    const seen = newSeen();
    expect(takeNew(seen, [{ id: 'c' }, { id: 'b' }, { id: 'a' }]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(takeNew(seen, [{ id: 'd' }, { id: 'c' }, { id: 'b' }]).map((m) => m.id)).toEqual(['d']);
    expect(takeNew(seen, [{ id: 'd' }])).toEqual([]);
  });
});

/** A client whose GET /v1/mentions answers from a script of pages. */
function scriptedClient(pages: Array<Array<{ id: string }>>): Client {
  let call = 0;
  const request = async () => {
    const page = pages[Math.min(call, pages.length - 1)] ?? [];
    call++;
    return { data: { data: page, nextCursor: null }, error: undefined, request: new Request('http://x'), response: new Response(null, { status: 200 }) };
  };
  return { request } as unknown as Client;
}

describe('watchMentions', () => {
  it('prints only what arrives after the first poll, unless --from-start', async () => {
    const pages = [[{ id: 'mm_2' }, { id: 'mm_1' }], [{ id: 'mm_3' }, { id: 'mm_2' }, { id: 'mm_1' }], [{ id: 'mm_5' }, { id: 'mm_4' }, { id: 'mm_3' }]];
    const run = async (fromStart: boolean): Promise<string[]> => {
      const lines: string[] = [];
      const controller = new AbortController();
      let ticks = 0;
      await watchMentions({
        client: scriptedClient(pages),
        query: { platform: 'x' },
        intervalMs: 1,
        fromStart,
        write: (line) => lines.push(line),
        warn: () => {},
        signal: controller.signal,
        sleep: async () => {
          ticks++;
          if (ticks >= 3) controller.abort();
        },
      });
      return lines.map((l) => (JSON.parse(l) as { id: string }).id);
    };
    expect(await run(false)).toEqual(['mm_3', 'mm_4', 'mm_5']);
    expect(await run(true)).toEqual(['mm_1', 'mm_2', 'mm_3', 'mm_4', 'mm_5']);
  });

  it('reports a failed poll on stderr and keeps going', async () => {
    const warnings: string[] = [];
    const controller = new AbortController();
    let call = 0;
    const client = {
      request: async () => {
        call++;
        if (call === 1) return { data: undefined, error: { error: { code: 'unauthorized', message: 'nope' } }, request: new Request('http://x'), response: new Response(null, { status: 401 }) };
        return { data: { data: [{ id: 'mm_9' }] }, error: undefined, request: new Request('http://x'), response: new Response(null, { status: 200 }) };
      },
    } as unknown as Client;
    const lines: string[] = [];
    let ticks = 0;
    await watchMentions({
      client,
      query: {},
      intervalMs: 1,
      fromStart: true,
      write: (l) => lines.push(l),
      warn: (l) => warnings.push(l),
      signal: controller.signal,
      sleep: async () => {
        ticks++;
        if (ticks >= 2) controller.abort();
      },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('unauthorized');
    expect(lines).toEqual([JSON.stringify({ id: 'mm_9' })]);
  });
});
