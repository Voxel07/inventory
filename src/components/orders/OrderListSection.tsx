import { Button } from '../shared/ActionButtons';
import { ActionBar, ActionMenu, type Action } from '../shared/ActionBar';
import type { ReactNode } from 'react';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';
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
  /** Buttons below the entry; a "more" menu beside it on phones and tablets. */
  actions?: Action[];
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
  const compact = useCompactCatalog();
  const content = <>
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
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {entry.onOpen ? <Button title={translate('orders.orderListSection.openTheDetailsOfThisOrderList')} color="inherit" onClick={entry.onOpen}
              aria-label={`${t('ordering.reviewOrder')}: ${entry.title}`}
              sx={{ flex: 1, minWidth: 0, p: { xs: 1.5, md: 2 }, borderRadius: 0, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}>
              <OrderRow entry={entry} arrow={!compact} />
            </Button> : <Box sx={{ flex: 1, minWidth: 0, p: { xs: 1.5, md: 2 } }}><OrderRow entry={entry} arrow={false} /></Box>}
            {compact && entry.actions?.length ? <Box sx={{ pr: 0.5, flexShrink: 0 }}><ActionMenu actions={entry.actions} size="medium" /></Box> : null}
          </Box>
          {!compact && entry.actions?.length ? <Box sx={{ px: 2, pb: 1.5 }}><ActionBar actions={entry.actions} align="start" /></Box> : null}
        </Box>)}
      </Box>)}
    </Paper>
    {loadError && <Alert severity="error" sx={{ mt: 1 }} action={onRetry && <Button title={translate('orders.orderListSection.loadAgain')} onClick={onRetry}>{t('common.tryAgain')}</Button>}>
      {t('orders.orderListSection.ordersCouldNotBeLoaded')}</Alert>}
    <LoadMore list={list} />
  </>;
  if (collapsible) return <Accordion disableGutters sx={{ mb: 3 }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{title}</Typography></AccordionSummary>
    <AccordionDetails>{content}</AccordionDetails>
  </Accordion>;
  return <Box sx={{ mb: 3 }}>
    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    {content}
  </Box>;
}

function OrderRow({ entry, arrow }: { entry: OrderListEntry; arrow: boolean }) {
  return <Stack direction="row" sx={{ gap: 1.5, width: '100%', alignItems: 'center' }}>
    <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 700, minWidth: 0 }}>{entry.title}</Typography>
        <Chip size="small" color={entry.statusColor ?? 'default'} label={entry.status} sx={{ flexShrink: 0, maxWidth: '50%' }} />
      </Stack>
      <Typography variant="body2" color="text.secondary">{entry.subtitle}</Typography>
      {entry.details}
    </Box>
    {arrow && <ArrowForwardIcon fontSize="small" />}
  </Stack>;
}
