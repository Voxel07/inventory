import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

export function OperationLines({ label, headers, rows }: { label: string; headers: string[]; rows: { id: string; cells: ReactNode[] }[] }) {
  return <TableContainer><Table size="small" aria-label={label} sx={{ '& td, & th': { px: 0.75, py: 0.5, fontSize: '0.8125rem' }, '& th': { color: 'text.secondary', whiteSpace: 'nowrap' }, '& tr:last-child td': { borderBottom: 0 } }}>
    <TableHead><TableRow>{headers.map((header, index) => <TableCell key={index} align={index ? 'right' : 'left'}>{header}</TableCell>)}</TableRow></TableHead>
    <TableBody>{rows.map(row => <TableRow key={row.id}>{row.cells.map((cell, index) => <TableCell key={index} align={index ? 'right' : 'left'}>{cell}</TableCell>)}</TableRow>)}</TableBody>
  </Table></TableContainer>;
}
