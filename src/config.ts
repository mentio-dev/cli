/**
 * Where the CLI finds its key and its API host. Precedence: flags, then
 * MENTIO_API_KEY / MENTIO_API_URL, then ~/.mentio/config.json written by
 * `mentio auth:set`. MENTIO_CONFIG_DIR relocates the file (CI, tests).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_API_URL = 'https://api.mentio.dev';

export interface StoredConfig {
  apiKey?: string;
  apiUrl?: string;
}

export interface Settings {
  apiKey: string | undefined;
  apiUrl: string;
  /** Where the key came from, for `auth:check`. */
  source: 'flag' | 'env' | 'file' | 'none';
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.MENTIO_CONFIG_DIR ?? join(homedir(), '.mentio');
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), 'config.json');
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): StoredConfig {
  const path = configPath(env);
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return {};
    const record = parsed as Record<string, unknown>;
    return {
      apiKey: typeof record.apiKey === 'string' ? record.apiKey : undefined,
      apiUrl: typeof record.apiUrl === 'string' ? record.apiUrl : undefined,
    };
  } catch {
    return {};
  }
}

/** Merges into the file; `undefined` leaves a field alone, `null` removes it. */
export function writeConfig(patch: { apiKey?: string | null; apiUrl?: string | null }, env: NodeJS.ProcessEnv = process.env): string {
  const current = readConfig(env);
  const next: StoredConfig = { ...current };
  if (patch.apiKey === null) delete next.apiKey;
  else if (patch.apiKey !== undefined) next.apiKey = patch.apiKey;
  if (patch.apiUrl === null) delete next.apiUrl;
  else if (patch.apiUrl !== undefined) next.apiUrl = patch.apiUrl;
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = configPath(env);
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  // writeFileSync only applies the mode on creation; an existing file keeps its bits.
  chmodSync(path, 0o600);
  return path;
}

export function resolveSettings(
  flags: { apiKey?: string; apiUrl?: string },
  env: NodeJS.ProcessEnv = process.env,
): Settings {
  const file = readConfig(env);
  const apiUrl = (flags.apiUrl ?? env.MENTIO_API_URL ?? file.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, '');
  if (flags.apiKey) return { apiKey: flags.apiKey, apiUrl, source: 'flag' };
  if (env.MENTIO_API_KEY) return { apiKey: env.MENTIO_API_KEY, apiUrl, source: 'env' };
  if (file.apiKey) return { apiKey: file.apiKey, apiUrl, source: 'file' };
  return { apiKey: undefined, apiUrl, source: 'none' };
}

/** mk_live_abcd... -> mk_live_abcd, enough to tell keys apart in output. */
export function keyPrefix(key: string): string {
  const match = /^([a-z]+_[a-z]+_[a-z0-9]{4})/i.exec(key);
  return match?.[1] ?? key.slice(0, 12);
}
