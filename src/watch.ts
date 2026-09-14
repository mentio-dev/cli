/**
 * mentions:watch: `tail -f` for the feed. Polls the newest page on an
 * interval and prints every mention it has not printed before as one JSON
 * line, oldest first, so a shell pipeline is an alert channel. Dedup is by
 * mention id over a bounded window; the API's `since` filters by publish
 * date, which lags ingest, so it is not used for this.
 */
import type { Client } from '@mentio-dev/sdk';
import { BEARER } from './run';

const SEEN_LIMIT = 5000;
const PAGE = 100;

export interface Seen {
  ids: Set<string>;
  order: string[];
}

export const newSeen = (): Seen => ({ ids: new Set(), order: [] });

/** Items not seen yet, oldest first; marks them seen. */
export function takeNew<T extends { id: string }>(seen: Seen, newestFirst: ReadonlyArray<T>): T[] {
  const fresh: T[] = [];
  for (const item of newestFirst) {
    if (seen.ids.has(item.id)) continue;
    fresh.push(item);
  }
  for (const item of fresh) {
    seen.ids.add(item.id);
    seen.order.push(item.id);
  }
  while (seen.order.length > SEEN_LIMIT) {
    const oldest = seen.order.shift();
    if (oldest !== undefined) seen.ids.delete(oldest);
  }
  return fresh.reverse();
}

export interface WatchOptions {
  client: Client;
  /** Search filters, already coerced (platform, keywordId, relevant, ...). */
  query: Record<string, string | number | boolean>;
  intervalMs: number;
  /** Print the current first page before following; off by default, like tail -f. */
  fromStart: boolean;
  write: (line: string) => void;
  warn: (line: string) => void;
  signal: AbortSignal;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

export async function watchMentions(options: WatchOptions): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  const seen = newSeen();
  let first = true;
  while (!options.signal.aborted) {
    const result = await options.client.request({
      method: 'GET',
      url: '/v1/mentions',
      query: { ...options.query, sort: 'newest', limit: PAGE },
      security: BEARER,
      throwOnError: false,
    });
    if (result.error !== undefined || !result.response?.ok) {
      options.warn(JSON.stringify({ error: result.error ?? { code: `http_${result.response?.status ?? 0}`, message: 'poll failed' } }));
    } else {
      const page = (result.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
      const fresh = takeNew(seen, page);
      if (!first || options.fromStart) for (const item of fresh) options.write(JSON.stringify(item));
    }
    first = false;
    await sleep(options.intervalMs, options.signal);
  }
}
