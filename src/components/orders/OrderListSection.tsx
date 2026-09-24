import type { ReactNode } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import GroupsIcon from '@mui/icons-material/Groups';
import { ListPagination } from '../shared/ListPagination';
import { useLocalizedText } from '../../utils/naming';

export interface OrderListEntry {
  id: string;
  title: string;
  subtitle: ReactNode;
  details?: ReactNode;
  status: string;
  statusColor?: 'default' | 'info' | 'warning' | 'success' | 'secondary' | 'error';
  actions?: ReactNode;
  onOpen?: () => void;
}

interface Props {
  title: string;
  emptyMessage: string;
  groups: { label?: string; entries: OrderListEntry[] }[];
  count: number;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loadingMore?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
}

export function OrderListSection({ title, emptyMessage, groups, count, isLoading, page, pageSize,
  onPageChange, onPageSizeChange, loadingMore, loadError, onRetry }: Props) {
  const t = useLocalizedText();
  return <Box sx={{ mb: 3 }}>
    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    <Paper sx={{ overflow: 'hidden' }}>
      {!count && <Typography color="text.secondary" sx={{ p: 2 }}>
        {isLoading ? t('Wird geladen …', 'Loading …') : emptyMessage}
      </Typography>}
      {groups.map((group, groupIndex) => <Box key={group.label ?? groupIndex} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
        {group.label && <Stack direction="row" spacing={1} sx={{ px: 2, py: 1, alignItems: 'center', bgcolor: 'action.hover' }}>
          <GroupsIcon color="primary" fontSize="small" />
          <Typography sx={{ flex: 1, fontWeight: 800 }}>{group.label}</Typography>
          <Chip size="small" variant="outlined" label={group.entries.length} />
        </Stack>}
        {group.entries.map((entry) => <Box key={entry.id} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
          {entry.onOpen ? <Button color="inherit" onClick={entry.onOpen}
            sx={{ width: '100%', p: 2, borderRadius: 0, justifyContent: 'flex-start', textAlign: 'left' }}>
            <OrderRow entry={entry} />
          </Button> : <Box sx={{ p: 2 }}><OrderRow entry={entry} /></Box>}
          {entry.actions && <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, pb: 1.5, flexWrap: 'wrap' }}>{entry.actions}</Stack>}
        </Box>)}
      </Box>)}
    </Paper>
    <ListPagination count={count} page={page} onChange={onPageChange} pageSize={pageSize}
      onPageSizeChange={onPageSizeChange} loadingMore={loadingMore} loadError={loadError} onRetry={onRetry} pageSizeAtEnd />
  </Box>;
}

function OrderRow({ entry }: { entry: OrderListEntry }) {
  return <Stack direction="row" spacing={2} sx={{ width: '100%', alignItems: 'center' }}>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700 }}>{entry.title}</Typography>
      <Typography variant="body2" color="text.secondary">{entry.subtitle}</Typography>
      {entry.details}
    </Box>
    <Chip size="small" color={entry.statusColor ?? 'default'} label={entry.status} />
    {entry.onOpen && <ArrowForwardIcon fontSize="small" />}
  </Stack>;
}
