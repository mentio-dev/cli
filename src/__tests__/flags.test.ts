import { describe, expect, it } from 'vitest';
import { buildRequest, coerce, flagHelp, UsageError } from '../flags';
import { OPERATIONS } from '../generated/operations';
import type { CliField } from '../operations-types';

const op = (id: string) => {
  const found = OPERATIONS.find((o) => o.operationId === id);
  if (!found) throw new Error(`no operation ${id}`);
  return found;
};

const field = (partial: Partial<CliField> & Pick<CliField, 'name' | 'type'>): CliField => ({ required: false, nullable: false, ...partial });

describe('coerce', () => {
  it('turns flag text into numbers, booleans, lists and objects, and rejects junk', () => {
    expect(coerce(field({ name: 'limit', type: 'integer' }), '25')).toBe(25);
    expect(() => coerce(field({ name: 'limit', type: 'integer' }), '2.5')).toThrow(UsageError);
    expect(() => coerce(field({ name: 'limit', type: 'integer' }), 'many')).toThrow(UsageError);
    // Instants are integers in the spec; an ISO date passes through as the API accepts it.
    expect(coerce(field({ name: 'since', type: 'integer' }), '2026-09-01')).toBe('2026-09-01');
    expect(coerce(field({ name: 'since', type: 'integer' }), '2026-09-01T10:00:00Z')).toBe('2026-09-01T10:00:00Z');
    expect(coerce(field({ name: 'since', type: 'integer' }), '1756720800000')).toBe(1756720800000);
    expect(coerce(field({ name: 'relevant', type: 'boolean' }), 'false')).toBe(false);
    expect(() => coerce(field({ name: 'relevant', type: 'boolean' }), 'yes')).toThrow(UsageError);
    // Query lists travel as the comma-separated string the API accepts; body lists become arrays.
    expect(coerce(field({ name: 'tags', type: 'array', in: 'query' }), 'vip, customer')).toBe('vip, customer');
    expect(coerce(field({ name: 'emails', type: 'array', items: 'string' }), 'a@x.io, b@x.io')).toEqual(['a@x.io', 'b@x.io']);
    expect(coerce(field({ name: 'ids', type: 'array', items: 'integer' }), '1,2')).toEqual([1, 2]);
    expect(coerce(field({ name: 'emails', type: 'array' }), '["a@x.io"]')).toEqual(['a@x.io']);
    expect(coerce(field({ name: 'schedule', type: 'object' }), '{"hour":9}')).toEqual({ hour: 9 });
    expect(() => coerce(field({ name: 'schedule', type: 'object' }), '[1]')).toThrow(UsageError);
  });

  it('lets the literal null clear a nullable body field, and only those', () => {
    expect(coerce(field({ name: 'note', type: 'string', nullable: true }), 'null')).toBeNull();
    expect(coerce(field({ name: 'term', type: 'string' }), 'null')).toBe('null');
  });

  it('describes a flag from its schema', () => {
    expect(flagHelp(field({ name: 'platform', type: 'string', enum: ['x', 'reddit'], description: 'Only this platform.' }))).toBe('Only this platform.');
    expect(flagHelp(field({ name: 'platforms', type: 'array', enum: ['x', 'reddit'] }))).toBe('(comma-separated: x|reddit)');
    expect(flagHelp(field({ name: 'note', type: 'string', nullable: true }))).toBe('(null clears)');
    expect(flagHelp(field({ name: 'emails', type: 'array' }))).toBe('(comma-separated)');
  });
});

describe('buildRequest', () => {
  it('maps a search to query parameters, coerced per schema', () => {
    const request = buildRequest(op('searchMentions'), [], { platform: 'reddit', relevant: 'true', limit: '50', q: 'pricing' }, undefined);
    expect(request.path).toEqual({});
    expect(request.query).toEqual({ platform: 'reddit', relevant: true, limit: 50, q: 'pricing' });
    expect(request.body).toBeUndefined();
  });

  it('maps an update to a path id and a body, with --json as the base and flags on top', () => {
    const request = buildRequest(op('updateMention'), ['mm_1'], { status: 'done', note: 'null' }, '{"note":"old","assigneeId":"usr_1"}');
    expect(request.path).toEqual({ id: 'mm_1' });
    expect(request.body).toEqual({ assigneeId: 'usr_1', status: 'done', note: null });
  });

  it('refuses a missing id, a bad --json, and a missing required field', () => {
    expect(() => buildRequest(op('updateMention'), [], {}, undefined)).toThrow('missing <id>');
    expect(() => buildRequest(op('updateMention'), ['mm_1'], {}, '{oops')).toThrow('--json is not valid JSON');
    expect(() => buildRequest(op('createKeyword'), [], {}, undefined)).toThrow('--term is required');
    expect(buildRequest(op('createKeyword'), [], { term: 'acme' }, undefined).body).toEqual({ term: 'acme' });
  });

  it('flattens a discriminated body into one field set with the union of kinds', () => {
    const channel = op('createChannel');
    const kind = channel.body?.fields.find((f) => f.name === 'kind');
    expect(kind?.enum).toEqual(['slack', 'email', 'webhook']);
    expect(kind?.required).toBe(false);
    const request = buildRequest(channel, [], { kind: 'email', emails: 'ops@example.com' }, undefined);
    expect(request.body).toEqual({ kind: 'email', emails: ['ops@example.com'] });
  });
});
