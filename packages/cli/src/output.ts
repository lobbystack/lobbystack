/** Where a command writes, and whether scripts asked for JSON. */
export type Output = { json: boolean; out(text: string): void; err(text: string): void };

function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.map(cell).join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Rows as aligned columns, for people. Scripts use --json instead. */
export function formatTable(rows: ReadonlyArray<Record<string, unknown>>, columns: ReadonlyArray<{ key: string; label: string }>): string {
  if (rows.length === 0) return "Nothing to show.";
  const values = rows.map((row) => columns.map((column) => cell(row[column.key])));
  const widths = columns.map((column, index) => Math.max(column.label.length, ...values.map((row) => row[index]!.length)));
  const line = (row: string[]) => row.map((value, index) => (index === row.length - 1 ? value : value.padEnd(widths[index]!))).join("  ").trimEnd();
  return [line(columns.map((column) => column.label.toUpperCase())), ...values.map(line)].join("\n");
}

/** One record as "Label: value" lines. */
export function formatFields(fields: ReadonlyArray<readonly [string, unknown]>): string {
  const width = Math.max(...fields.map(([label]) => label.length)) + 1;
  return fields.map(([label, value]) => `${`${label}:`.padEnd(width)} ${cell(value)}`).join("\n");
}

/** Prints JSON for scripts, or the human form otherwise. */
export function print(output: Output, value: unknown, human: () => string): void {
  output.out(output.json ? JSON.stringify(value, null, 2) : human());
}
