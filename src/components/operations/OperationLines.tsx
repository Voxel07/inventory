import { useId, useState, type ReactNode } from 'react';
import { Box, Collapse, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Button } from '../shared/ActionButtons';
import { useLocalizedText } from '../../utils/naming';

/**
 * Line items of an operation. Phones get stacked label/value rows instead of a
 * nested table, so the record does not introduce its own horizontal scrolling.
 */
export function OperationLines({ label, headers, rows }: { label: string; headers: string[]; rows: { id: string; cells: ReactNode[] }[] }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  if (phone) {
    return <Box component="ul" aria-label={label} sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {rows.map((row) => <Box component="li" key={row.id} sx={{ py: 1, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
        <Typography component="div" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{row.cells[0]}</Typography>
        <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 2, rowGap: 0.25 }}>
          {row.cells.slice(1).map((cell, index) => <Box key={index} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">{headers[index + 1]}</Typography>
            <Typography component="dd" variant="body2" className="tabular" sx={{ m: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{cell}</Typography>
          </Box>)}
        </Box>
      </Box>)}
    </Box>;
  }
  return <TableContainer><Table size="small" aria-label={label} sx={{ '& td, & th': { px: 0.75, py: 0.5, fontSize: '0.8125rem' }, '& th': { whiteSpace: 'nowrap' }, '& tr:last-child td': { borderBottom: 0 } }}>
    <TableHead><TableRow>{headers.map((header, index) => <TableCell key={index} align={index ? 'right' : 'left'}>{header}</TableCell>)}</TableRow></TableHead>
    <TableBody>{rows.map(row => <TableRow key={row.id}>{row.cells.map((cell, index) => <TableCell key={index} align={index ? 'right' : 'left'}>{cell}</TableCell>)}</TableRow>)}</TableBody>
  </Table></TableContainer>;
}

/** Line items behind a toggle, for records whose lines would otherwise make the page very long. */
export function CollapsibleOperationLines({ summary, ...props }: Parameters<typeof OperationLines>[0] & { summary?: ReactNode }) {
  const t = useLocalizedText();
  const [open, setOpen] = useState(false);
  const id = useId();
  return <Box>
    <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Button size="small" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={id}
        startIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />} sx={{ px: 0.5 }}>
        {open ? t('Positionen ausblenden', 'Hide lines') : t(`${props.rows.length} Positionen anzeigen`, `Show ${props.rows.length} lines`)}
      </Button>
      {summary && <Typography variant="body2" color="text.secondary">{summary}</Typography>}
    </Stack>
    <Collapse in={open} unmountOnExit><Box id={id}><OperationLines {...props} /></Box></Collapse>
  </Box>;
}
