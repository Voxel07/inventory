import { useState } from 'react';
import { Alert, Box, Button, Chip, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { ListPagination } from '../shared/ListPagination';
import { useClientPagination } from '../../hooks/useClientPagination';
import { useLocalizedText } from '../../utils/naming';

export interface CatalogEntry {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  available: number;
  total: number;
  details?: string[];
}

interface Props {
  title: string;
  entries: CatalogEntry[];
  isLoading: boolean;
  isError: boolean;
  loadingMore?: boolean;
  onRetry?: () => void;
}

export function ReadOnlyCatalogList({ title, entries, isLoading, isError, loadingMore, onRetry }: Props) {
  const t = useLocalizedText();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogEntry | null>(null);

  const term = search.trim().toLocaleLowerCase();
  const filtered = term
    ? entries.filter((entry) => `${entry.name} ${entry.subtitle ?? ''} ${entry.description ?? ''}`.toLocaleLowerCase().includes(term))
    : entries;

  const { pageItems: pageEntries, page: currentPage, setPage, pageSize, onPageSizeChange } = useClientPagination(filtered);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>{title}</Typography>
      <TextField
        fullWidth
        size="small"
        label={t('Suchen', 'Search')}
        value={search}
        onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        sx={{ maxWidth: 520, mb: 2 }}
      />
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={onRetry}>{t('Erneut versuchen', 'Retry')}</Button>}>
          {t('Katalog konnte nicht geladen werden.', 'Could not load catalog.')}
        </Alert>
      )}
      <Paper sx={{ overflow: 'hidden' }}>
        {!pageEntries.length && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            {isLoading ? t('Wird geladen …', 'Loading …') : t('Keine passenden Einträge.', 'No matching entries.')}
          </Typography>
        )}
        {pageEntries.map((entry) => (
          <Button
            key={entry.id}
            color="inherit"
            onClick={() => setSelected(entry)}
            sx={{ display: 'block', width: '100%', p: 2, borderRadius: 0, textAlign: 'left', borderTop: 1, borderColor: 'divider' }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>{entry.name}</Typography>
                <Typography variant="body2" color="text.secondary">{entry.subtitle}</Typography>
              </Box>
              <Chip
                size="small"
                color={entry.available > 0 ? 'success' : 'error'}
                label={`${t('Verfügbar', 'Available')}: ${entry.available}/${entry.total}`}
              />
            </Stack>
          </Button>
        ))}
      </Paper>
      <ListPagination
        count={filtered.length}
        page={currentPage}
        onChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        loadingMore={loadingMore}
        loadError={isError}
        onRetry={onRetry}
      />
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>{selected?.name}</DialogTitle>
        <DialogContent dividers>
          {selected?.description && <Typography sx={{ mb: 2 }}>{selected.description}</Typography>}
          <Typography color="text.secondary">{selected?.subtitle}</Typography>
          <Typography sx={{ mt: 1, fontWeight: 700 }}>
            {t('Verfügbar', 'Available')}: {selected?.available}/{selected?.total}
          </Typography>
          {selected?.details && (
            <Stack spacing={0.5} sx={{ mt: 2 }}>
              {selected.details.map((detail, idx) => (
                <Typography key={idx}>{detail}</Typography>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
