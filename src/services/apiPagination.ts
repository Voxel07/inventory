import { assertAuthSession, captureAuthSession } from './authManager';

export const LIST_PAGE_SIZE = 100;

/**
 * One server page with its continuation. `more` is the server's answer (X-Has-More: the page query returned a full
 * page before privacy filtering), so rows removed by privacy filtering never end a listing early. The envelope is
 * what mappers transform and the offline cache stores, so the continuation survives both.
 */
export type Page<T> = { rows: T[]; page: number; size: number; more: boolean };

export function mapPage<T, U>(page: Page<T>, map: (row: T) => U): Page<U> {
  return { ...page, rows: page.rows.map(map) };
}

/** Explicit exhaustive reader for imports, exports, offline snapshots and hierarchy pickers; keeps server row order. */
export async function loadAllPages<T>(getPage: (page: number, size: number) => Promise<Page<T>>, size = LIST_PAGE_SIZE): Promise<T[]> {
  const context = captureAuthSession();
  const rows: T[] = [];
  for (let index = 0; ; index++) {
    const batch = await getPage(index, size);
    assertAuthSession(context);
    rows.push(...batch.rows);
    if (!batch.more) return rows;
  }
}
