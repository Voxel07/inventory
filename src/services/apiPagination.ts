import { assertAuthSession, captureAuthSession } from './authManager';
import { isFullPage } from './pageCompleteness';

export const LIST_PAGE_SIZE = 100;

/** Exhaustive readers (imports and reference resolution) keep server row ordering. */
export async function loadAllPages<T>(getPage: (page: number, size: number) => Promise<T[]>, size = LIST_PAGE_SIZE): Promise<T[]> {
  const context = captureAuthSession();
  const rows: T[] = [];
  for (let index = 0; ; index++) {
    const batch = await getPage(index, size);
    assertAuthSession(context);
    rows.push(...batch);
    if (!isFullPage(batch, size)) return rows;
  }
}
