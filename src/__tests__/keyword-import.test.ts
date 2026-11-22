import { describe, expect, it } from 'vitest';
import { ImportError, chunks, keywordRows, lineOfError, parseCsv, resolveGroups } from '../keyword-import';

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, commas inside quotes, CRLF and a BOM, and skips blank lines', () => {
    expect(parseCsv('﻿term,context\r\n"acme, inc","the ""cloud"" one"\r\n\r\nglobex,\n')).toEqual([
      ['term', 'context'],
      ['acme, inc', 'the "cloud" one'],
      ['globex', ''],
    ]);
  });
});

describe('keywordRows', () => {
  it('maps each column to the create body, line numbers counting the header', () => {
    const rows = keywordRows(
      'Term,Kind,Platforms,Group,Context,Required,Excluded,Query\n' +
        'acme,competitor,reddit;X,Customer B,Our rival,pricing;price*,jobs,\n' +
        ',,,grp_123,,,,"""acme cloud"" -jobs"\n',
    );
    expect(rows).toEqual([
      {
        line: 2,
        groupName: 'Customer B',
        body: { term: 'acme', kind: 'competitor', platforms: ['reddit', 'x'], context: 'Our rival', matching: { requiredTerms: ['pricing', 'price*'], excludedTerms: ['jobs'] } },
      },
      { line: 3, body: { query: '"acme cloud" -jobs', groupId: 'grp_123' } },
    ]);
  });

  it('needs a term or query column', () => {
    expect(() => keywordRows('name\nacme\n')).toThrow(ImportError);
  });
});

describe('resolveGroups', () => {
  it('turns names into ids, case-insensitively, and names the line of an unknown one', () => {
    const rows = keywordRows('term,group\nacme,customer b\nglobex,\n');
    expect(resolveGroups(rows, [{ id: 'grp_b', name: 'Customer B' }])).toEqual([
      { line: 2, body: { term: 'acme', groupId: 'grp_b' } },
      { line: 3, body: { term: 'globex' } },
    ]);
    expect(() => resolveGroups(rows, [])).toThrow(/Line 2: no group named "customer b"/);
  });
});

describe('chunks', () => {
  it('splits at 100', () => {
    expect(chunks(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 50]);
  });
});

describe('row checks', () => {
  it('names the line of a row with no term, or with an unknown kind', () => {
    expect(() => keywordRows('term,kind\nacme,brand\n,brand\n')).toThrow(/Line 3: no term or query/);
    expect(() => keywordRows('term,kind\nacme,rival\n')).toThrow(/Line 2: kind "rival"/);
  });

  it('maps a validation message back to the CSV line', () => {
    const rows = keywordRows('term\nacme\nglobex\n');
    expect(lineOfError('keywords.1.platforms.0: Invalid enum value', rows)).toBe(3);
    expect(lineOfError('something else', rows)).toBeNull();
  });
});
