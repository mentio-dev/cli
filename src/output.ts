/**
 * What the CLI prints. JSON always, compact when piped and indented on a
 * terminal or with --pretty, so `mentio ... | jq` and a human both get what
 * they expect. --table renders a list's `data` as columns for a quick look.
 */
export interface OutputOptions {
  pretty: boolean;
  table: boolean;
}

type Scalar = string | number | boolean | null;

const isScalar = (v: unknown): v is Scalar => v === null || ['string', 'number', 'boolean'].includes(typeof v);

const cell = (v: Scalar): string => {
  if (v === null) return '';
  if (typeof v === 'string') return v.length > 48 ? `${v.slice(0, 47)}…` : v.replace(/\s+/g, ' ');
  return String(v);
};

/** Rows to a fixed-width table over the scalar columns of the first row. */
export function renderTable(rows: ReadonlyArray<Record<string, unknown>>): string {
  const first = rows[0];
  if (!first) return '(no rows)';
  const columns = Object.keys(first).filter((k) => isScalar(first[k])).slice(0, 8);
  if (columns.length === 0) return JSON.stringify(rows, null, 2);
  const lines = rows.map((row) => columns.map((c) => cell(isScalar(row[c]) ? (row[c] as Scalar) : JSON.stringify(row[c]))));
  const widths = columns.map((c, i) => Math.max(c.length, ...lines.map((l) => l[i]?.length ?? 0)));
  const pad = (s: string, w: number): string => s.padEnd(w);
  const header = columns.map((c, i) => pad(c, widths[i] ?? c.length)).join('  ');
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = lines.map((l) => l.map((s, i) => pad(s, widths[i] ?? s.length)).join('  '));
  return [header, rule, ...body].join('\n');
}

export function formatOutput(value: unknown, options: OutputOptions): string {
  if (options.table) {
    const rows = Array.isArray(value)
      ? value
      : value !== null && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)
        ? (value as { data: unknown[] }).data
        : null;
    if (rows && rows.every((r) => r !== null && typeof r === 'object')) {
      return renderTable(rows as Record<string, unknown>[]);
    }
  }
  return options.pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}
