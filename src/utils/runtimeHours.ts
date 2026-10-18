/** Hours run since the last booking; parsed from a comma or dot decimal. Empty means not entered yet. */
export function parseHoursRun(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Meter reading after the return: the current reading plus the hours run, as the order return API expects. */
export function readingAfter(current: number | undefined, hoursRun: number | undefined): number | undefined {
  return hoursRun == null ? undefined : Math.round((Number(current ?? 0) + hoursRun) * 100) / 100;
}
