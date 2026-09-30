export const LIST_PAGE_SIZE = 100;

/** Exhaustive readers (imports and reference resolution) keep server row ordering. */
export async function loadAllPages<T>(getPage: (page: number, size: number) => Promise<T[]>, size = LIST_PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; ; index++) {
    const batch = await getPage(index, size);
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
}
