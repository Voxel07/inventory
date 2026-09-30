import { Button } from './ActionButtons';
import { Stack, TablePagination, Typography } from '@mui/material';
import { translate, useLocalizedText } from '../../utils/naming';

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
  const pages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(count / pageSize));
  return (
    <Stack spacing={1} sx={{ width: '100%', minWidth: 0 }}>
      <TablePagination component="div" count={count} page={Math.max(0, Math.min(page, pages) - 1)}
        rowsPerPage={pageSize} rowsPerPageOptions={[20, 50, 100]}
        onPageChange={(_, value) => onChange(value + 1)}
        onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
        labelRowsPerPage={t('Zeilen pro Seite:', 'Rows per page:')}
        labelDisplayedRows={({ from, to, count: total }) => `${from}–${to} ${t('von', 'of')} ${total}`}
        getItemAriaLabel={(type) => ({
          first: t('Erste Seite', 'First page'), last: t('Letzte Seite', 'Last page'),
          next: t('Nächste Seite', 'Next page'), previous: t('Vorherige Seite', 'Previous page'),
        })[type]}
        sx={{ '& .MuiTablePagination-toolbar': { px: 1, minHeight: 52, flexWrap: 'wrap', justifyContent: 'flex-end' },
          '& .MuiTablePagination-spacer': { display: 'none' },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { my: 1 } }} />
      {loadingMore && <Typography variant="caption" color="text.secondary">{t('Weitere Einträge werden geladen…', 'Loading more entries…')}</Typography>}
      {loadError && <Button title={translate('Die Daten erneut laden', 'Retry loading the data')} size="small" onClick={onRetry}>{t('Weitere Einträge konnten nicht geladen werden. Erneut versuchen', 'Could not load more entries. Retry')}</Button>}
    </Stack>
  );
}
