import type { TaskFilter, useTaskFilters } from '../../hooks/useWarehouseTasks';
import type { ReactNode } from 'react';
import { Box, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { Button } from '../shared/ActionButtons';
import { useT } from '../../utils/naming';

/** A consistent, touch-friendly entry point to every warehouse queue. */
export function TaskToolbar({ state, searchLabel, filters = [], action, count, more, loading }: {
  state: ReturnType<typeof useTaskFilters>; searchLabel?: string; filters?: TaskFilter[];
  action?: ReactNode; count?: number; more?: boolean; loading?: boolean;
}) {
  const t = useT();
  return <Box component="section" aria-label={t('operations.tasks.findTasks')} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
      <TextField type="search" size="small" fullWidth label={searchLabel ?? t('operations.tasks.search')}
        value={state.values.search} onChange={event => state.set('search', event.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      {action && <Box sx={{ flexShrink: 0, '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, whiteSpace: 'nowrap' } }}>{action}</Box>}
    </Stack>
    <Stack direction="row" useFlexGap sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {filters.map(filter => <TextField key={filter.key} select size="small" label={filter.label} value={state.values[filter.key] ?? ''}
        onChange={event => state.set(filter.key, event.target.value)} sx={{ flex: { xs: '1 1 140px', sm: '0 1 210px' }, minWidth: 140 }}>
        {filter.options.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
      </TextField>)}
      {state.changed && <Button size="small" onClick={state.reset}>{t('operations.tasks.reset')}</Button>}
      {count != null && <Typography role="status" variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
        {loading ? t('operations.tasks.updating') : t(more ? 'operations.tasks.loadedCount' : 'operations.tasks.resultCount', { count })}
      </Typography>}
    </Stack>
  </Box>;
}
