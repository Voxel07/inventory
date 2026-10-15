import { Button } from './ActionButtons';
import { Stack, TablePagination, Typography } from '@mui/material';
import { translate, useT } from '../../utils/naming';

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
  const t = useT();
  const pages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(count / pageSize));
  return (
    <Stack spacing={1} sx={{ width: '100%', minWidth: 0 }}>
      <TablePagination component="div" count={count} page={Math.max(0, Math.min(page, pages) - 1)}
        rowsPerPage={pageSize} rowsPerPageOptions={[20, 50, 100]}
        onPageChange={(_, value) => onChange(value + 1)}
        onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
        labelRowsPerPage={t('shared.listPagination.rowsPerPage')}
        labelDisplayedRows={({ from, to, count: total }) => `${from}–${to} ${t('shared.listPagination.of')} ${total}`}
        getItemAriaLabel={(type) => ({
          first: t('shared.listPagination.firstPage'), last: t('shared.listPagination.lastPage'),
          next: t('shared.listPagination.nextPage'), previous: t('shared.listPagination.previousPage'),
        })[type]}
        sx={{ '& .MuiTablePagination-toolbar': { px: 1, minHeight: 52, flexWrap: 'wrap', justifyContent: 'flex-end' },
          '& .MuiTablePagination-spacer': { display: 'none' },
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { my: 1 } }} />
      {loadingMore && <Typography variant="caption" color="text.secondary">{t('shared.listPagination.loadingMoreEntries')}</Typography>}
      {loadError && <Button title={translate('common.retryLoadingTheData')} size="small" onClick={onRetry}>{t('shared.listPagination.couldNotLoadMoreEntriesRetry')}</Button>}
    </Stack>
  );
}
