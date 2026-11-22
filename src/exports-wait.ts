/**
 * `exports:create --wait [--out file]`: an export is produced in the
 * background (POST /v1/exports answers `queued`), so the command polls
 * GET /v1/exports/{id} until it succeeded or failed and, with --out,
 * streams GET /v1/exports/{id}/file to disk without holding it in memory
 * (a file can reach 2 GiB).
 */
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { Client } from '@mentio-dev/sdk';
import { BEARER } from './run';

export interface ExportState {
  id: string;
  status: string;
  stats?: { rows: number; bytes: number };
  error?: { code: string; message: string } | null;
  download?: { url: string; expiresAt: string } | null;
}

export class ExportWaitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until the export leaves queued/running; throws on failed, expired
 *  or a timeout. */
export async function waitForExport(options: {
  client: Client;
  id: string;
  intervalMs: number;
  timeoutMs: number;
  onProgress?: (state: ExportState) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<ExportState> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadline = now() + options.timeoutMs;
  for (;;) {
    const result = await options.client.request({
      method: 'GET',
      url: '/v1/exports/{id}',
      path: { id: options.id },
      security: BEARER,
      throwOnError: false,
    });
    if (result.error !== undefined || !result.response?.ok) {
      const error = (result.error as { error?: { code?: string; message?: string } } | undefined)?.error;
      throw new ExportWaitError(error?.code ?? `http_${result.response?.status ?? 0}`, error?.message ?? 'Could not read the export');
    }
    const state = result.data as ExportState;
    options.onProgress?.(state);
    if (state.status === 'succeeded') return state;
    if (state.status === 'failed') throw new ExportWaitError(state.error?.code ?? 'export_failed', state.error?.message ?? 'The export failed');
    if (state.status === 'expired') throw new ExportWaitError('export_expired', 'The export file was deleted');
    if (now() >= deadline) throw new ExportWaitError('timeout', `The export is still ${state.status}; read it later with exports:get ${state.id}`);
    await sleep(options.intervalMs);
  }
}

/** Streams the file to `path`; returns the bytes written. */
export async function downloadExport(options: { client: Client; id: string; path: string }): Promise<number> {
  const result = await options.client.request({
    method: 'GET',
    url: '/v1/exports/{id}/file',
    path: { id: options.id },
    parseAs: 'stream',
    security: BEARER,
    throwOnError: false,
  });
  const body = result.data as ReadableStream<Uint8Array> | null | undefined;
  if (!result.response?.ok || !body) throw new ExportWaitError(`http_${result.response?.status ?? 0}`, 'Could not download the export file');
  let bytes = 0;
  const source = Readable.fromWeb(body as unknown as WebReadableStream<Uint8Array>);
  source.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
  });
  await pipeline(source, createWriteStream(options.path));
  return bytes;
}
