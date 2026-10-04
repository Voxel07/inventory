import type { ReactNode } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material';

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
