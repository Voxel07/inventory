import type { ReactNode } from 'react';
import { Badge, Box, ButtonBase, Checkbox, Stack, TextField, ToggleButtonGroup, Typography } from '@mui/material';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Button, IconButton, ToggleButton } from '../shared/ActionButtons';
import { useT } from '../../utils/naming';

export type RowAction = { label: string; icon: ReactNode; onClick: () => void; destructive?: boolean };

/**
 * A compact catalog record for phones and tablets: the name truncates to leave
 * room for availability on the same line, and explicit actions live behind "More".
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
      <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
        <Typography component="span" noWrap title={title} sx={{ flex: 1, minWidth: 0, fontWeight: 600, lineHeight: 1.35 }}>{title}</Typography>
        <Typography component="span" variant="body2" className="tabular" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
          {primary}
        </Typography>
      </Box>
      {secondary && <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{secondary}</Typography>}
    </ButtonBase>
    {onOpenMenu && <IconButton title={t('lists.catalogParts.moreActionsForTitle', { title: title })} aria-haspopup="menu"
      onClick={(event) => onOpenMenu(event.currentTarget)} sx={{ mr: 0.5, flexShrink: 0 }}>
      <MoreVertIcon />
    </IconButton>}
  </Box>;
}

/** The page's all/mine scope, kept in `?scope=mine`. */
export function CatalogScopeToggle({ allLabel, mineLabel }: { allLabel: string; mineLabel: string }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const mine = params.get('scope') === 'mine';
  return <ToggleButtonGroup exclusive size="small" value={mine ? 'mine' : 'all'} aria-label={t('common.scope')}
    sx={{ minWidth: 0, overflowX: 'auto', '& .MuiToggleButton-root': { whiteSpace: 'nowrap' } }}
    onChange={(_, value: string | null) => { if (value) setParams((current) => { if (value === 'mine') current.set('scope', 'mine'); else current.delete('scope'); return current; }, { replace: true }); }}>
    <ToggleButton value="all">{allLabel}</ToggleButton>
    <ToggleButton value="mine">{mineLabel}</ToggleButton>
  </ToggleButtonGroup>;
}

/**
 * Scope and bulk selection share the top row; search stays visible below it, and secondary filters move into a
 * sheet with an active-filter count.
 */
export function CatalogSearchBar({ scope, search, onSearch, label, activeFilters = 0, onOpenFilters, onClearFilters, selecting, onToggleSelecting }: {
  scope?: ReactNode;
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
    {(scope || selecting !== undefined) && <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex' }}>{scope}</Box>
      {selecting !== undefined && <IconButton title={selecting ? t('lists.catalogParts.doneSelecting') : t('lists.catalogParts.select')}
        aria-pressed={selecting} color={selecting ? 'primary' : 'default'} onClick={onToggleSelecting}
        sx={{ flexShrink: 0, border: 1, borderColor: selecting ? 'primary.main' : 'divider' }}>
        <ChecklistIcon />
      </IconButton>}
    </Stack>}
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField type="search" label={label} value={search} onChange={(event) => onSearch(event.target.value)} fullWidth size="small"
        sx={{ '& .MuiInputBase-root': { minHeight: 44 } }} />
      {onOpenFilters && <Button variant="outlined" aria-haspopup="dialog" onClick={onOpenFilters} sx={{ flexShrink: 0 }}
        aria-label={activeFilters ? t('lists.catalogParts.filtersActiveFiltersActive', { activeFilters: activeFilters }) : t('common.filters')}
        startIcon={<Badge badgeContent={activeFilters} color="primary"><FilterListIcon /></Badge>}>
        {t('common.filters')}
      </Button>}
    </Stack>
    {activeFilters > 0 && <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, minHeight: 44 }}>
      <Typography variant="body2" color="text.secondary">{t('lists.catalogParts.activeFilters', { count: activeFilters })}</Typography>
      <Button size="small" onClick={onClearFilters}>{t('lists.catalogParts.clear')}</Button>
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
