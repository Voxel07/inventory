import type { ReactNode } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { formatStatus } from '../../utils/formatters';

/** Visible record rows: reference, working details, and commands stay in view. */
export function OperationListEntry({ title, status, children, actions }: { title: ReactNode; status?: string; children: ReactNode; actions?: ReactNode }) {
  const color = status && ['cancelled', 'rejected', 'written_off', 'expired', 'failed'].includes(status) ? 'error'
    : status && ['received', 'posted', 'completed', 'verified', 'returned_to_service', 'accepted', 'available'].includes(status) ? 'success'
    : status && ['in_transit', 'awaiting_approval', 'awaiting_recount', 'partially_received', 'in_repair', 'ordered'].includes(status) ? 'warning' : 'default';
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: actions ? 'minmax(160px, 0.7fr) minmax(0, 2fr) minmax(120px, 0.6fr)' : 'minmax(160px, 0.7fr) minmax(0, 2.6fr)' }, gap: { xs: 1, md: 2 }, px: 1.5, py: 1.25,
    border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', alignItems: 'start',
    '& .MuiTypography-root': { fontSize: '0.875rem' }, '& .MuiButton-root': { fontSize: '0.8125rem', minHeight: 30, py: 0.25, textTransform: 'none' } }}>
    <Stack direction={{ xs: 'row', md: 'column' }} useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'flex-start', minWidth: 0 }}>
      <Typography component="div" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{title}</Typography>
      {status && <Chip size="small" variant="outlined" color={color} label={formatStatus(status)} />}
    </Stack>
    <Stack spacing={0.5} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Stack>
    {actions && <Stack direction="row" useFlexGap sx={{ gap: 0.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: { md: 'flex-end' } }}>{actions}</Stack>}
  </Box>;
}
