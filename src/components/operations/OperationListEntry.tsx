import { useId, useState, type ReactNode } from 'react';
import { Box, Chip, Collapse, Stack, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Button } from '../shared/ActionButtons';
import { formatStatus } from '../../utils/formatters';

/** Visible record rows: reference, working details, and commands stay in view. */
export function OperationListEntry({ title, status, children, actions }: { title: ReactNode; status?: string; children: ReactNode; actions?: ReactNode }) {
  const color = status && ['cancelled', 'rejected', 'written_off', 'expired', 'failed'].includes(status) ? 'error'
    : status && ['received', 'posted', 'completed', 'verified', 'returned_to_service', 'accepted', 'available'].includes(status) ? 'success'
    : status && ['in_transit', 'awaiting_approval', 'awaiting_recount', 'partially_received', 'in_repair', 'ordered'].includes(status) ? 'warning' : 'default';
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: actions ? 'minmax(160px, 0.7fr) minmax(0, 2fr) minmax(120px, 0.6fr)' : 'minmax(160px, 0.7fr) minmax(0, 2.6fr)' }, gap: { xs: 1, md: 2 }, px: 1.5, py: 1.25,
    border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', alignItems: 'start',
    '& .MuiTypography-root': { fontSize: '0.875rem' } }}>
    <Stack direction={{ xs: 'row', md: 'column' }} useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'flex-start', minWidth: 0 }}>
      <Typography component="div" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{title}</Typography>
      {status && <Chip size="small" variant="outlined" color={color} label={formatStatus(status)} />}
    </Stack>
    <Stack spacing={0.5} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Stack>
    {/* Actions keep the shared touch target; on phones they get a full row below the details. */}
    {actions && <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', justifyContent: { md: 'flex-end' },
      pt: { xs: 1, md: 0 }, borderTop: { xs: 1, md: 0 }, borderColor: 'divider' }}>{actions}</Stack>}
  </Box>;
}

/** Finished records sit below the open work behind their own heading, collapsed until needed. */
export function OperationHistory({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!count) return null;
  return <Box component="section" aria-labelledby={`${id}-title`} sx={{ borderTop: 2, borderColor: 'divider', pt: 1.5 }}>
    <Button id={`${id}-title`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={`${id}-content`}
      endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />} sx={{ px: 0.5, fontSize: '1rem', fontWeight: 600, textTransform: 'none', color: 'text.primary' }}>
      {title} ({count})
    </Button>
    <Collapse in={open} unmountOnExit>
      <Stack id={`${id}-content`} spacing={1.5} sx={{ mt: 1.5, opacity: 0.85 }}>{children}</Stack>
    </Collapse>
  </Box>;
}

/** A labelled detail line, so free-text fields of a record are distinguishable at a glance. */
export function OperationDetail({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null;
  return <Typography sx={{ whiteSpace: 'pre-wrap' }}>
    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{label}: </Box>{children}
  </Typography>;
}
