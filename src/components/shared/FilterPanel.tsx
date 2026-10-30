import { useState, type ReactNode } from 'react';
import { Stack, TextField, type SxProps, type Theme } from '@mui/material';
import { FilterButton, FilterSheet } from '../lists/CatalogParts';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';

/**
 * Search plus secondary filters. Desktops show everything in one wrapping row; phones and tablets keep `leading`
 * and the search in view and move `children` into a bottom sheet behind a filter button with the active count.
 * Without a search the button fills the row and shows `filterLabel`, e.g. a summary of the current choice.
 */
export function FilterPanel({ search, onSearch, searchLabel, leading, filterLabel, activeFilters = 0, onClear, resultCount, children, sx }: {
  search?: string;
  onSearch?: (value: string) => void;
  searchLabel?: string;
  leading?: ReactNode;
  filterLabel?: string;
  activeFilters?: number;
  onClear?: () => void;
  resultCount?: number;
  children?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const compact = useCompactCatalog();
  const [open, setOpen] = useState(false);
  const searchField = onSearch && <TextField type="search" size="small" label={searchLabel} value={search ?? ''}
    onChange={(event) => onSearch(event.target.value)} sx={compact ? { flex: '1 1 0', minWidth: 0 } : { flex: '1 1 240px', maxWidth: 520 }} />;
  const root = [{ mb: 2 }, ...(Array.isArray(sx) ? sx : [sx])];
  if (!compact) return <Stack direction="row" useFlexGap sx={[{ gap: 2, flexWrap: 'wrap', alignItems: 'center' }, ...root]}>
    {leading}{searchField}{children}
  </Stack>;
  return <>
    <Stack direction="row" spacing={1} sx={[{ alignItems: 'center' }, ...root]}>
      {leading}
      {searchField}
      {children && <FilterButton activeFilters={activeFilters} onClick={() => setOpen(true)} label={onSearch ? undefined : filterLabel} fill={!onSearch} />}
    </Stack>
    {children && <FilterSheet open={open} onClose={() => setOpen(false)} resultCount={resultCount} activeFilters={activeFilters} onClear={onClear}>
      {children}
    </FilterSheet>}
  </>;
}
