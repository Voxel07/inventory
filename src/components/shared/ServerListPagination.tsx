import { TablePagination } from '@mui/material';
import { useT } from '../../utils/naming';

interface Props {
  page: number;
  size: number;
  rowCount: number;
  more: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

/** Zero-based pagination for APIs that return a continuation rather than a total count. */
export function ServerListPagination({ page, size, rowCount, more, loading, onPageChange, onSizeChange, pageSizeOptions = [20, 50, 100] }: Props) {
  const t = useT();
  const from = rowCount ? page * size + 1 : 0;
  const to = rowCount ? page * size + rowCount : 0;
  return <TablePagination component="div" count={-1}
    page={page} rowsPerPage={size} rowsPerPageOptions={pageSizeOptions}
    onPageChange={(_, value) => onPageChange(value)}
    onRowsPerPageChange={event => onSizeChange(Number(event.target.value))}
    labelRowsPerPage={t('shared.listPagination.rowsPerPage')}
    labelDisplayedRows={() => more || loading ? `${from}–${to}` : `${from}–${to} ${t('shared.listPagination.of')} ${page * size + rowCount}`}
    getItemAriaLabel={type => ({ first: t('shared.listPagination.firstPage'), last: t('shared.listPagination.lastPage'),
      next: t('shared.listPagination.nextPage'), previous: t('shared.listPagination.previousPage') })[type]}
    slotProps={{ actions: { nextButton: { disabled: loading || !more }, previousButton: { disabled: loading || page === 0 } },
      select: { disabled: loading } }}
    sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', justifyContent: 'flex-end', px: 1 } }} />;
}
