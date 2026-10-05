import type { ReactNode } from 'react';
import { Badge, Box, ButtonBase, Checkbox, Stack, TextField, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Link as RouterLink } from 'react-router-dom';
import { Button, IconButton } from '../shared/ActionButtons';
import { useLocalizedText } from '../../utils/naming';

export type RowAction = { label: string; icon: ReactNode; onClick: () => void; destructive?: boolean };

/** Desktop catalog tables: auto-height rows sized by text, not by the default 38 px checkbox/icon hit areas. */
export const catalogGridSx = {
  '& .MuiDataGrid-row': { cursor: 'pointer' },
  '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', py: 0.5 },
  '& .MuiDataGrid-cellCheckbox .MuiCheckbox-root, & .MuiDataGrid-columnHeaderCheckbox .MuiCheckbox-root, & .MuiDataGrid-cell .MuiIconButton-root': { p: 0.5 },
} as const;

/**
 * A compact catalog record for phones and tablets: the name wraps freely,
 * availability stays on its own line, and explicit actions live behind "More".
 */
export function CatalogRow({ to, title, primary, primarySuffix, secondary, selectable, selected, onToggleSelected, onOpenMenu }: {
  to: string;
  title: string;
  primary: ReactNode;
  primarySuffix?: string;
  secondary?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onOpenMenu: (anchor: HTMLElement) => void;
}) {
  const t = useLocalizedText();
  return <Box component="li" sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
    {selectable && <Checkbox checked={selected} onChange={onToggleSelected} sx={{ ml: 0.5, p: 1.25 }}
      slotProps={{ input: { 'aria-label': t(`${title} auswählen`, `Select ${title}`) } }} />}
    <ButtonBase component={RouterLink} to={to} sx={{
      flex: 1, minWidth: 0, display: 'block', textAlign: 'left', px: 2, py: 0.75, minHeight: 48,
      '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { bgcolor: 'action.focus', outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
    }}>
      <Typography component="span" sx={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.35 }}>{title}</Typography>
      <Typography component="span" variant="body2" className="tabular" sx={{ display: 'block', mt: 0.25 }}>
        {primary}
        {primarySuffix && <Box component="span" sx={{ color: 'text.secondary' }}> · {primarySuffix}</Box>}
      </Typography>
      {secondary && <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{secondary}</Typography>}
    </ButtonBase>
    <IconButton title={t(`Weitere Aktionen für ${title}`, `More actions for ${title}`)} aria-haspopup="menu"
      onClick={(event) => onOpenMenu(event.currentTarget)} sx={{ mr: 0.5, flexShrink: 0 }}>
      <MoreVertIcon />
    </IconButton>
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
  const t = useLocalizedText();
  return <Stack spacing={1} sx={{ mb: 1.5 }}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField type="search" label={label} value={search} onChange={(event) => onSearch(event.target.value)} fullWidth size="small"
        sx={{ '& .MuiInputBase-root': { minHeight: 44 } }} />
      {onOpenFilters && <Button variant="outlined" aria-haspopup="dialog" onClick={onOpenFilters} sx={{ flexShrink: 0 }}
        aria-label={activeFilters ? t(`Filter, ${activeFilters} aktiv`, `Filters, ${activeFilters} active`) : t('Filter', 'Filters')}
        startIcon={<Badge badgeContent={activeFilters} color="primary"><FilterListIcon /></Badge>}>
        {t('Filter', 'Filters')}
      </Button>}
    </Stack>
    {(activeFilters > 0 || selecting !== undefined) && <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      {activeFilters > 0
        ? <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">{t(`${activeFilters} Filter aktiv`, `${activeFilters} filter${activeFilters === 1 ? '' : 's'} active`)}</Typography>
          <Button size="small" onClick={onClearFilters}>{t('Zurücksetzen', 'Clear')}</Button>
        </Stack>
        : <span />}
      {selecting !== undefined && <Button size="small" onClick={onToggleSelecting}>
        {selecting ? t('Auswahl beenden', 'Done selecting') : t('Auswählen', 'Select')}
      </Button>}
    </Stack>}
  </Stack>;
}

export function FilterSheetActions({ resultCount, activeFilters, onClear, onDone }: { resultCount: number; activeFilters: number; onClear: () => void; onDone: () => void }) {
  const t = useLocalizedText();
  return <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
    <Button fullWidth variant="outlined" onClick={onClear} disabled={!activeFilters}>{t('Zurücksetzen', 'Clear')}</Button>
    <Button fullWidth variant="contained" onClick={onDone}>{t(`${resultCount} anzeigen`, `Show ${resultCount}`)}</Button>
  </Stack>;
}
