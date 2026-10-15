import type { ReactNode } from 'react';
import { Badge, Box, ButtonBase, Checkbox, Stack, TextField, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Link as RouterLink } from 'react-router-dom';
import { Button, IconButton } from '../shared/ActionButtons';
import { useT } from '../../utils/naming';

export type RowAction = { label: string; icon: ReactNode; onClick: () => void; destructive?: boolean };

/**
 * A compact catalog record for phones and tablets: the name wraps freely,
 * availability stays on its own line, and explicit actions live behind "More".
 */
export function CatalogRow({ to, title, primary, secondary, selectable, selected, onToggleSelected, onOpenMenu, onClick }: {
  to: string;
  title: string;
  primary: ReactNode;
  secondary?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  /** Undefined hides the "More" menu. */
  onOpenMenu?: (anchor: HTMLElement) => void;
  onClick?: () => void;
}) {
  const t = useT();
  return <Box component="li" sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
    {selectable && <Checkbox checked={selected} onChange={onToggleSelected} sx={{ ml: 0.5, p: 1.25 }}
      slotProps={{ input: { 'aria-label': t('lists.catalogParts.selectTitle', { title: title }) } }} />}
    <ButtonBase component={RouterLink} to={to} onClick={onClick} sx={{
      flex: 1, minWidth: 0, display: 'block', textAlign: 'left', px: 2, py: 0.75, minHeight: 48,
      '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { bgcolor: 'action.focus', outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
    }}>
      <Typography component="span" sx={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.35 }}>{title}</Typography>
      <Typography component="span" variant="body2" className="tabular" sx={{ display: 'block', mt: 0.25 }}>
        {primary}
      </Typography>
      {secondary && <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{secondary}</Typography>}
    </ButtonBase>
    {onOpenMenu && <IconButton title={t('lists.catalogParts.moreActionsForTitle', { title: title })} aria-haspopup="menu"
      onClick={(event) => onOpenMenu(event.currentTarget)} sx={{ mr: 0.5, flexShrink: 0 }}>
      <MoreVertIcon />
    </IconButton>}
  </Box>;
}

/** Search stays visible; secondary filters move into a sheet with an active-filter count. */
export function CatalogSearchBar({ search, onSearch, label, activeFilters = 0, onOpenFilters, onClearFilters, selecting, onToggleSelecting }: {
  search: string;
  onSearch: (value: string) => void;
  label: string;
  activeFilters?: number;
  onOpenFilters?: () => void;
  onClearFilters?: () => void;
  /** Undefined hides bulk selection. */
  selecting?: boolean;
  onToggleSelecting?: () => void;
}) {
  const t = useT();
  return <Stack spacing={1} sx={{ mb: 1.5 }}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField type="search" label={label} value={search} onChange={(event) => onSearch(event.target.value)} fullWidth size="small"
        sx={{ '& .MuiInputBase-root': { minHeight: 44 } }} />
      {onOpenFilters && <Button variant="outlined" aria-haspopup="dialog" onClick={onOpenFilters} sx={{ flexShrink: 0 }}
        aria-label={activeFilters ? t('lists.catalogParts.filtersActiveFiltersActive', { activeFilters: activeFilters }) : t('common.filters')}
        startIcon={<Badge badgeContent={activeFilters} color="primary"><FilterListIcon /></Badge>}>
        {t('common.filters')}
      </Button>}
    </Stack>
    {(activeFilters > 0 || selecting !== undefined) && <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      {activeFilters > 0
        ? <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">{t('lists.catalogParts.activeFilters', { count: activeFilters })}</Typography>
          <Button size="small" onClick={onClearFilters}>{t('lists.catalogParts.clear')}</Button>
        </Stack>
        : <span />}
      {selecting !== undefined && <Button size="small" onClick={onToggleSelecting}>
        {selecting ? t('lists.catalogParts.doneSelecting') : t('lists.catalogParts.select')}
      </Button>}
    </Stack>}
  </Stack>;
}

export function FilterSheetActions({ resultCount, activeFilters, onClear, onDone }: { resultCount: number; activeFilters: number; onClear: () => void; onDone: () => void }) {
  const t = useT();
  return <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
    <Button fullWidth variant="outlined" onClick={onClear} disabled={!activeFilters}>{t('lists.catalogParts.clear')}</Button>
    <Button fullWidth variant="contained" onClick={onDone}>{t('lists.catalogParts.showResultCount', { resultCount: resultCount })}</Button>
  </Stack>;
}
