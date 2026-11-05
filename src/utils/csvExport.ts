/** Quote one CSV cell and prevent spreadsheet programs from interpreting user text as a formula. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
