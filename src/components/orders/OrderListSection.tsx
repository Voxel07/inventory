import { Button } from '../shared/ActionButtons';
import type { ReactNode } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import GroupsIcon from '@mui/icons-material/Groups';
import { LoadMore } from '../shared/LoadMore';
import { translate, useT } from '../../utils/naming';

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

/** `list`: the server pages behind the entries; further pages load on demand. */
interface Props {
  title: string;
  emptyMessage: string;
  groups: { label?: string; entries: OrderListEntry[] }[];
  count: number;
  isLoading: boolean;
  list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
  loadError?: boolean;
  onRetry?: () => void;
  collapsible?: boolean;
}

export function OrderListSection({ title, emptyMessage, groups, count, isLoading, list, loadError, onRetry, collapsible }: Props) {
  const t = useT();
  if (collapsible) return <Accordion disableGutters sx={{ mb: 3 }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{title}</Typography></AccordionSummary>
    <AccordionDetails><OrderListSection {...{ title, emptyMessage, groups, count, isLoading, list, loadError, onRetry }} /></AccordionDetails>
  </Accordion>;
  return <Box sx={{ mb: 3 }}>
    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    <Paper sx={{ overflow: 'hidden' }}>
      {!count && <Typography color="text.secondary" sx={{ p: 2 }}>
        {isLoading ? t('orders.orderListSection.loading') : loadError ? t('orders.orderListSection.ordersCouldNotBeLoaded') : emptyMessage}
      </Typography>}
      {groups.map((group, groupIndex) => <Box key={group.label ?? groupIndex} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
        {group.label && <Stack direction="row" spacing={1} sx={{ px: 2, py: 1, alignItems: 'center', bgcolor: 'action.hover' }}>
          <GroupsIcon color="primary" fontSize="small" />
          <Typography sx={{ flex: 1, fontWeight: 800 }}>{group.label}</Typography>
          <Chip size="small" variant="outlined" label={group.entries.length} />
        </Stack>}
        {group.entries.map((entry) => <Box key={entry.id} sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
          {entry.onOpen ? <Button title={translate('orders.orderListSection.openTheDetailsOfThisOrderList')} color="inherit" onClick={entry.onOpen}
            aria-label={`${t('ordering.reviewOrder')}: ${entry.title}`}
            sx={{ width: '100%', p: 2, borderRadius: 0, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}>
            <OrderRow entry={entry} />
          </Button> : <Box sx={{ p: 2 }}><OrderRow entry={entry} /></Box>}
          {entry.actions && <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, pb: 1.5, flexWrap: 'wrap' }}>{entry.actions}</Stack>}
        </Box>)}
      </Box>)}
    </Paper>
    {loadError && <Alert severity="error" sx={{ mt: 1 }} action={onRetry && <Button title={translate('orders.orderListSection.loadAgain')} onClick={onRetry}>{t('common.tryAgain')}</Button>}>
      {t('orders.orderListSection.ordersCouldNotBeLoaded')}</Alert>}
    <LoadMore list={list} />
  </Box>;
}

function OrderRow({ entry }: { entry: OrderListEntry }) {
  return <Stack direction="row" useFlexGap sx={{ gap: 1.5, width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
    <Box sx={{ flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography sx={{ fontWeight: 700 }}>{entry.title}</Typography>
      <Typography variant="body2" color="text.secondary">{entry.subtitle}</Typography>
      {entry.details}
    </Box>
    <Chip size="small" color={entry.statusColor ?? 'default'} label={entry.status} sx={{ maxWidth: '100%', height: 'auto', minHeight: 24, '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }} />
    {entry.onOpen && <ArrowForwardIcon fontSize="small" />}
  </Stack>;
}
