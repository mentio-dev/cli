import { describe, expect, it } from 'vitest';
import { formatOutput, renderTable } from '../output';

describe('formatOutput', () => {
  it('prints compact JSON by default and indented with pretty', () => {
    expect(formatOutput({ a: 1 }, { pretty: false, table: false })).toBe('{"a":1}');
    expect(formatOutput({ a: 1 }, { pretty: true, table: false })).toBe('{\n  "a": 1\n}');
  });

  it('renders a list as columns over the scalar fields of the first row', () => {
    const value = {
      data: [
        { id: 'kw_1', term: 'acme', muted: false, stats: { mentions: 3 }, createdAt: null },
        { id: 'kw_2', term: 'a very long keyword term that keeps going and going past the cell', muted: true, stats: { mentions: 0 }, createdAt: '2026-09-01T00:00:00.000Z' },
      ],
    };
    const table = formatOutput(value, { pretty: true, table: true });
    const lines = table.split('\n');
    expect(lines[0]?.trim()).toBe('id    term                                              muted  createdAt');
    expect(lines[1]).toMatch(/^-+\s+-+\s+-+\s+-+$/);
    expect(lines[2]).toContain('kw_1  acme');
    expect(lines[2]).toContain('false');
    expect(lines[3]).toContain('…');
    expect(lines[3]).toContain('2026-09-01T00:00:00.000Z');
  });

  it('falls back to JSON when there is nothing tabular', () => {
    expect(formatOutput({ ok: true }, { pretty: false, table: true })).toBe('{"ok":true}');
    expect(renderTable([])).toBe('(no rows)');
  });
});
