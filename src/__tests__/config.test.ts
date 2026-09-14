import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configPath, keyPrefix, readConfig, resolveSettings, writeConfig } from '../config';

const env = (): NodeJS.ProcessEnv => ({ MENTIO_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'mentio-cli-')) });

describe('config file', () => {
  it('writes the key with owner-only permissions and reads it back; null removes', () => {
    const e = env();
    const path = writeConfig({ apiKey: 'mk_live_abcd1234', apiUrl: 'http://localhost:8787' }, e);
    expect(path).toBe(configPath(e));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readConfig(e)).toEqual({ apiKey: 'mk_live_abcd1234', apiUrl: 'http://localhost:8787' });
    writeConfig({ apiKey: null }, e);
    expect(readConfig(e)).toEqual({ apiUrl: 'http://localhost:8787' });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ apiUrl: 'http://localhost:8787' });
  });

  it('resolves flags over env over file, and strips a trailing slash from the host', () => {
    const e = env();
    expect(resolveSettings({}, e)).toEqual({ apiKey: undefined, apiUrl: 'https://api.mentio.dev', source: 'none' });
    writeConfig({ apiKey: 'mk_live_file', apiUrl: 'https://file.example/' }, e);
    expect(resolveSettings({}, e)).toEqual({ apiKey: 'mk_live_file', apiUrl: 'https://file.example', source: 'file' });
    expect(resolveSettings({}, { ...e, MENTIO_API_KEY: 'mk_live_env' })).toMatchObject({ apiKey: 'mk_live_env', source: 'env' });
    expect(resolveSettings({ apiKey: 'mk_live_flag', apiUrl: 'http://localhost:8787/' }, { ...e, MENTIO_API_KEY: 'mk_live_env' })).toEqual({
      apiKey: 'mk_live_flag',
      apiUrl: 'http://localhost:8787',
      source: 'flag',
    });
  });

  it('shows only a key prefix', () => {
    expect(keyPrefix('mk_live_abcd1234567890')).toBe('mk_live_abcd');
    expect(keyPrefix('weird')).toBe('weird');
  });
});
