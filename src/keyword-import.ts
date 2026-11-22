/**
 * keywords:import: a CSV of keywords (an agency's client list, an export
 * from another listening tool) turned into POST /v1/keywords/batch calls of
 * at most 100 keywords each. Pure parsing and mapping live here so they are
 * tested without a network; index.ts does the requests.
 *
 * Columns (a header row is required; names are case-insensitive, unknown
 * columns are ignored):
 *   term       the word or phrase (or query instead)
 *   query      a boolean query ("acme" AND (pricing OR price*) -jobs)
 *   kind       brand (default), competitor or topic
 *   platforms  platforms separated by ; or | (empty: every platform)
 *   group      a group id (grp_...) or a group's name
 *   context    one sentence for the classifier
 *   required   required terms separated by ;
 *   excluded   excluded terms separated by ;
 */

export const IMPORT_BATCH_SIZE = 100;
const KINDS = ['brand', 'competitor', 'topic'];

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export interface ImportRow {
  /** 1-based line in the file, the header being line 1. */
  line: number;
  body: Record<string, unknown>;
  /** A group name to resolve to an id before sending. */
  groupName?: string;
}

export class ImportError extends Error {}

const list = (value: string): string[] =>
  value
    .split(/[;|]/)
    .map((v) => v.trim())
    .filter((v) => v !== '');

/** The CSV as keyword bodies, one per data row. */
export function keywordRows(text: string): ImportRow[] {
  const [header, ...data] = parseCsv(text);
  if (!header) throw new ImportError('The file is empty.');
  const columns = header.map((h) => h.trim().toLowerCase());
  if (!columns.includes('term') && !columns.includes('query')) throw new ImportError('The header needs a term or a query column.');
  const at = (cells: string[], name: string): string => {
    const index = columns.indexOf(name);
    return index < 0 ? '' : (cells[index] ?? '').trim();
  };
  return data.map((cells, i) => {
    const body: Record<string, unknown> = {};
    const term = at(cells, 'term');
    const query = at(cells, 'query');
    if (query !== '') body.query = query;
    else if (term !== '') body.term = term;
    // Checked here, so one bad row names its line instead of failing the
    // request that carries its 99 neighbours.
    else throw new ImportError(`Line ${i + 2}: no term or query.`);
    const kind = at(cells, 'kind').toLowerCase();
    if (kind !== '' && !KINDS.includes(kind)) throw new ImportError(`Line ${i + 2}: kind "${kind}" is not one of ${KINDS.join(', ')}.`);
    if (kind !== '') body.kind = kind;
    const platforms = list(at(cells, 'platforms').toLowerCase());
    if (platforms.length > 0) body.platforms = platforms;
    const context = at(cells, 'context');
    if (context !== '') body.context = context;
    const matching: Record<string, unknown> = {};
    const required = list(at(cells, 'required'));
    if (required.length > 0) matching.requiredTerms = required;
    const excluded = list(at(cells, 'excluded'));
    if (excluded.length > 0) matching.excludedTerms = excluded;
    if (Object.keys(matching).length > 0) body.matching = matching;
    const group = at(cells, 'group');
    const row: ImportRow = { line: i + 2, body };
    if (group.startsWith('grp_')) body.groupId = group;
    else if (group !== '') row.groupName = group;
    return row;
  });
}

/** Group names to ids (exact first, then case-insensitive); an unknown
 *  name is an error naming the line, never a silent default group. */
export function resolveGroups(rows: ImportRow[], groups: ReadonlyArray<{ id: string; name: string }>): ImportRow[] {
  return rows.map((row) => {
    if (row.groupName === undefined) return row;
    const wanted = row.groupName;
    const found = groups.find((g) => g.name === wanted) ?? groups.find((g) => g.name.toLowerCase() === wanted.toLowerCase());
    if (!found) throw new ImportError(`Line ${row.line}: no group named "${wanted}". Create it first (mentio groups:create --name "${wanted}") or use its id.`);
    return { line: row.line, body: { ...row.body, groupId: found.id } };
  });
}

/** The CSV line a request error points at (`keywords.3.platforms...` in a
 *  validation message), or null. */
export function lineOfError(message: string, rows: ReadonlyArray<ImportRow>): number | null {
  const m = /keywords[.[](\d+)/.exec(message);
  if (!m) return null;
  return rows[Number(m[1])]?.line ?? null;
}

/** Rows in chunks the batch endpoint takes. */
export function chunks<T>(items: ReadonlyArray<T>, size = IMPORT_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
