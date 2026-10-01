import type { ReactNode } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/** A compact, keyboard-accessible list row with details and commands on demand. */
export function OperationListEntry({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <Accordion disableGutters elevation={0} slotProps={{ transition: { unmountOnExit: true } }}
    sx={{ borderBottom: 1, borderColor: 'divider', borderRadius: '0 !important', my: '0 !important', '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 44, px: 1, '& .MuiAccordionSummary-content': { my: 0.75, minWidth: 0 } }}>
      <Typography variant="body2" component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{title}</Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 1, pt: 0, pb: 1, '& .MuiTypography-root': { fontSize: '0.875rem' }, '& .MuiButton-root': { fontSize: '0.8125rem', minHeight: 30, py: 0.25 } }}>
      <Stack spacing={0.5}>{children}</Stack>
    </AccordionDetails>
  </Accordion>;
}
