import { Button, Pagination, Stack, Typography } from '@mui/material';
import { useLocalizedText } from '../../utils/naming';
import { LIST_PAGE_SIZE } from '../../hooks/useProgressiveList';

interface Props {
  count: number;
  page: number;
  onChange: (page: number) => void;
  loadingMore?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
}

export function ListPagination({ count, page, onChange, loadingMore, loadError, onRetry }: Props) {
  const t = useLocalizedText();
  const pages = Math.ceil(count / LIST_PAGE_SIZE);
  if (pages <= 1 && !loadingMore && !loadError) return null;
  return (
    <Stack spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
      {pages > 1 && <Pagination count={pages} page={Math.min(page, pages)} onChange={(_, value) => onChange(value)} />}
      {loadingMore && <Typography variant="caption" color="text.secondary">{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
      {loadError && <Button size="small" onClick={onRetry}>{t('Weitere Einträge konnten nicht geladen werden. Erneut versuchen', 'Could not load more entries. Retry')}</Button>}
    </Stack>
  );
}
