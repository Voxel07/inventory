import { Button, MenuItem, Pagination, Stack, TextField, Typography } from '@mui/material';
import { useLocalizedText } from '../../utils/naming';

interface Props {
  count: number;
  page: number;
  onChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  loadingMore?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
}

export function ListPagination({ count, page, onChange, pageSize, onPageSizeChange, loadingMore, loadError, onRetry }: Props) {
  const t = useLocalizedText();
  const pages = pageSize === -1 ? 1 : Math.ceil(count / pageSize);
  return (
    <Stack spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
      <TextField select size="small" label={t('Einträge pro Seite', 'Items per page')} value={pageSize}
        onChange={(event) => onPageSizeChange(Number(event.target.value))} sx={{ minWidth: 170 }}>
        <MenuItem value={20}>20</MenuItem>
        <MenuItem value={100}>100</MenuItem>
        <MenuItem value={-1}>{t('Alle', 'All')}</MenuItem>
      </TextField>
      {pages > 1 && <Pagination count={pages} page={Math.min(page, pages)} onChange={(_, value) => onChange(value)} />}
      {loadingMore && <Typography variant="caption" color="text.secondary">{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
      {loadError && <Button size="small" onClick={onRetry}>{t('Weitere Einträge konnten nicht geladen werden. Erneut versuchen', 'Could not load more entries. Retry')}</Button>}
    </Stack>
  );
}
