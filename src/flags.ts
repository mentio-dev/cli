/**
 * Command-line values to API values. Every flag takes a value (`--muted
 * false`, never a bare `--muted`), so a PATCH can set a boolean either way,
 * and a nullable body field accepts the literal `null` to clear it, as the
 * API does. Lists are comma-separated; objects are JSON.
 */
import type { CliField, CliOperation } from './operations-types';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export type ApiValue = string | number | boolean | null | ApiValue[] | { [key: string]: ApiValue };

function coerceScalar(field: CliField, raw: string, type: CliField['type']): ApiValue {
  switch (type) {
    case 'integer':
    case 'number': {
      const n = Number(raw);
      // Instants (since, until, snoozedUntil) are epoch milliseconds in the
      // spec but the API takes ISO 8601 too; let a date through as written.
      if (!Number.isFinite(n) && /^\d{4}-\d{2}-\d{2}/.test(raw) && Number.isFinite(Date.parse(raw))) return raw;
      if (raw.trim() === '' || !Number.isFinite(n)) throw new UsageError(`--${field.name} expects a number, got "${raw}"`);
      if (type === 'integer' && !Number.isInteger(n)) throw new UsageError(`--${field.name} expects a whole number, got "${raw}"`);
      return n;
    }
    case 'boolean':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new UsageError(`--${field.name} expects true or false, got "${raw}"`);
    case 'object': {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        return parsed as ApiValue;
      } catch {
        throw new UsageError(`--${field.name} expects a JSON object, got "${raw}"`);
      }
    }
    case 'array':
    case 'string':
    default:
      return raw;
  }
}

/** One flag value as the API wants it. Query lists stay comma-separated
 *  strings (the API splits them); body lists become arrays. */
export function coerce(field: CliField, raw: string): ApiValue {
  if (field.nullable && raw === 'null') return null;
  if (field.type === 'array') {
    if (field.in === 'query') return raw;
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed) as ApiValue;
      } catch {
        throw new UsageError(`--${field.name} expects a comma-separated list or a JSON array`);
      }
    }
    const items = trimmed === '' ? [] : trimmed.split(',').map((v) => v.trim());
    return items.map((item) => coerceScalar(field, item, field.items ?? 'string'));
  }
  return coerceScalar(field, raw, field.type);
}

/** The text after the flag in --help. */
export function flagHelp(field: CliField): string {
  const parts: string[] = [];
  if (field.description) parts.push(field.description.replace(/\s+/g, ' ').trim());
  // Scalar enums become commander choices, which --help prints on its own.
  const hints: string[] = [];
  if (field.type === 'array') hints.push(field.enum ? `comma-separated: ${field.enum.join('|')}` : 'comma-separated');
  else if (field.type === 'object') hints.push('JSON');
  else if (field.type !== 'string' && !field.enum) hints.push(field.type);
  if (field.nullable) hints.push('null clears');
  if (hints.length > 0) parts.push(`(${hints.join(', ')})`);
  return parts.join(' ');
}

export interface BuiltRequest {
  path: Record<string, string>;
  query: Record<string, string | number | boolean>;
  body: Record<string, ApiValue> | undefined;
}

/** Positional arguments, flags and an optional --json body into the three
 *  parts of a request. --json is the base; flags override its fields. */
export function buildRequest(op: CliOperation, positional: string[], flags: Record<string, unknown>, jsonBody: string | undefined): BuiltRequest {
  const path: Record<string, string> = {};
  const pathParams = op.params.filter((p) => p.in === 'path');
  pathParams.forEach((param, index) => {
    const value = positional[index];
    if (value === undefined || value === '') throw new UsageError(`missing <${param.name}>`);
    path[param.name] = value;
  });

  const query: Record<string, string | number | boolean> = {};
  for (const param of op.params.filter((p) => p.in === 'query')) {
    const raw = flags[param.name];
    if (raw === undefined) continue;
    const value = coerce(param, String(raw));
    if (value === null || typeof value === 'object') continue;
    query[param.name] = value;
  }

  let body: Record<string, ApiValue> | undefined;
  if (op.body) {
    body = {};
    if (jsonBody !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonBody);
      } catch {
        throw new UsageError('--json is not valid JSON');
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new UsageError('--json must be a JSON object');
      body = parsed as Record<string, ApiValue>;
    }
    for (const field of op.body.fields) {
      const raw = flags[field.name];
      if (raw === undefined) continue;
      body[field.name] = coerce(field, String(raw));
    }
    for (const field of op.body.fields) {
      if (field.required && body[field.name] === undefined) throw new UsageError(`--${field.name} is required`);
    }
  }
  return { path, query, body };
}
