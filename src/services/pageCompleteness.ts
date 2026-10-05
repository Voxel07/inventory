// Rows the server's privacy filter removed from a page after pagination (X-Filtered-Rows).
const filteredRows = new WeakMap<object, number>();

export function recordFilteredRows(page: unknown, count: number): void {
  if (Array.isArray(page) && count > 0) filteredRows.set(page, count);
}

/** A page is the last one only if it was short before privacy filtering, not merely after it. */
export function isFullPage(page: readonly unknown[], size: number): boolean {
  return page.length + (filteredRows.get(page) ?? 0) >= size;
}
