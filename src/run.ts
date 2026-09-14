/**
 * One generic request runner for every generated command: the operation
 * table says method, path and response kind; flags.ts already turned the
 * command line into path, query and body. No per-endpoint code.
 */
import { createMentio, type Client } from '@mentio-dev/sdk';
import type { BuiltRequest } from './flags';
import type { CliOperation } from './operations-types';
import type { Settings } from './config';

export interface RunOutcome {
  ok: boolean;
  status: number;
  /** The parsed body: JSON, CSV text, or undefined for 204. */
  value: unknown;
}

export function clientFor(settings: Settings, fetchImpl?: typeof fetch): Client {
  return createMentio({ apiKey: settings.apiKey ?? '', baseUrl: settings.apiUrl, ...(fetchImpl ? { fetch: fetchImpl } : {}) }).client;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

/** The generated SDK functions carry this per call; raw client.request calls must too, or the key is never sent. */
export const BEARER = [{ scheme: 'bearer', type: 'http' }] as const;

export async function runOperation(client: Client, op: CliOperation, request: BuiltRequest): Promise<RunOutcome> {
  const result = await client.request({
    method: op.method as Method,
    url: op.path,
    path: request.path,
    query: request.query,
    ...(request.body !== undefined ? { body: request.body } : {}),
    parseAs: op.response === 'csv' ? 'text' : 'auto',
    security: BEARER,
    throwOnError: false,
  });
  const status = result.response?.status ?? 0;
  if (result.error !== undefined) return { ok: false, status, value: result.error };
  if (!result.response) return { ok: false, status, value: undefined };
  // A 204 parses to null; the CLI prints its own { ok, status } for those.
  return { ok: result.response.ok, status, value: result.data ?? undefined };
}

/** The API's error envelope when there is one, else something shaped like it. */
export function errorEnvelope(outcome: RunOutcome): { error: { code: string; message: string } } {
  const value = outcome.value;
  if (value !== null && typeof value === 'object' && 'error' in value) {
    const inner = (value as { error: unknown }).error;
    if (inner !== null && typeof inner === 'object' && 'code' in inner && 'message' in inner) {
      return value as { error: { code: string; message: string } };
    }
  }
  const message = typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 300) : `Request failed with status ${outcome.status}`;
  return { error: { code: `http_${outcome.status}`, message } };
}
