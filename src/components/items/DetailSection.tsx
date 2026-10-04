import { useId, useState, type ReactNode } from 'react';
import { Accordion, AccordionDetails, Box, Paper, Typography, useMediaQuery, useTheme } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AccordionSummary } from '../shared/ActionButtons';

/** A titled page section: a plain panel on larger screens, a collapsible accordion on phones. */
export function DetailSection({ title, defaultExpanded = true, children }: { title: string; defaultExpanded?: boolean; children: ReactNode }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const id = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (phone) {
    return <Accordion expanded={expanded} onChange={(_, value) => setExpanded(value)} slotProps={{ heading: { component: 'h2' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} id={`${id}-header`} aria-controls={`${id}-content`}>
        <Typography variant="h6" component="span">{title}</Typography>
      </AccordionSummary>
      <AccordionDetails id={`${id}-content`}>{children}</AccordionDetails>
    </Accordion>;
  }
  return <Paper component="section" aria-labelledby={id} sx={{ p: 3 }}>
    <Typography id={id} variant="h6" component="h2" sx={{ mb: 2 }}>{title}</Typography>
    {children}
  </Paper>;
}

/** A definition list laid out as an even grid of label/value pairs. */
export function FactList({ children }: { children: ReactNode }) {
  return <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, columnGap: 3, rowGap: 1.5 }}>
    {children}
  </Box>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
    <Typography component="dd" className="tabular" sx={{ m: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>{children}</Typography>
  </Box>;
}
