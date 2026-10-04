import { getGridSingleSelectOperators, type GridFilterOperator, type GridValidRowModel } from '@mui/x-data-grid';

/**
 * Column filter that suggests the values present in the list instead of free text.
 * A row may carry several values (e.g. events or component categories); it matches if any value does.
 */
export function selectFilterColumn<R extends GridValidRowModel>(rows: R[], values: (row: R) => (string | undefined)[]) {
  const rowValues = (row: R) => values(row).filter((value): value is string => Boolean(value));
  const valueOptions = [...new Set(rows.flatMap(rowValues))].sort((a, b) => a.localeCompare(b));
  const filterOperators = getGridSingleSelectOperators().map((operator): GridFilterOperator<R> => ({
    ...operator,
    getApplyFilterFn: (item) => {
      const selected: string[] = Array.isArray(item.value) ? item.value.map(String) : item.value == null || item.value === '' ? [] : [String(item.value)];
      if (!selected.length) return null;
      const matches = (row: R) => rowValues(row).some((value) => selected.includes(value));
      return (_value, row) => operator.value === 'not' ? !matches(row) : matches(row);
    },
  }));
  return { type: 'singleSelect' as const, valueOptions, filterOperators };
}
