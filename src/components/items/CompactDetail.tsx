import { useId, type ReactNode } from 'react';
import { Box, Paper, Typography, type SxProps, type Theme } from '@mui/material';

/** A flat panel with a slim title bar, for dense record pages. */
export function DetailPanel({ title, actions, children, sx }: { title: string; actions?: ReactNode; children: ReactNode; sx?: SxProps<Theme> }) {
  const id = useId();
  return <Paper component="section" aria-labelledby={id} sx={[{ minWidth: 0, overflow: 'hidden' }, ...(Array.isArray(sx) ? sx : [sx])]}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.5, py: 0.5, minHeight: 32, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
      <Typography id={id} variant="subtitle2" component="h2" sx={{ fontSize: '0.8125rem' }}>{title}</Typography>
      {actions}
    </Box>
    <Box sx={{ p: 1.5 }}>{children}</Box>
  </Paper>;
}

/** Label-above-value pairs in as many columns as fit. */
export function FieldGrid({ children, minWidth = 150 }: { children: ReactNode; minWidth?: number }) {
  return <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))`, columnGap: 2, rowGap: 1 }}>
    {children}
  </Box>;
}

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <Box sx={{ minWidth: 0, ...(wide && { gridColumn: '1 / -1' }) }}>
    <Typography component="dt" sx={{ fontSize: '0.75rem', lineHeight: 1.3, color: 'text.secondary' }}>{label}</Typography>
    <Typography component="dd" className="tabular" sx={{ m: 0, fontSize: '0.8125rem', lineHeight: 1.4, fontWeight: 500, overflowWrap: 'anywhere' }}>{children}</Typography>
  </Box>;
}

/** Label left, value right, with a hairline between rows: for quantities that are scanned and compared. */
export function MetricList({ children, minWidth = 200 }: { children: ReactNode; minWidth?: number }) {
  return <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))`, columnGap: 3 }}>
    {children}
  </Box>;
}

export function Metric({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, py: 0.375, borderBottom: 1, borderColor: 'divider' }}>
    <Typography component="dt" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{label}</Typography>
    <Typography component="dd" className="tabular" sx={{ m: 0, fontSize: '0.8125rem', fontWeight: 600, textAlign: 'right', color }}>{children}</Typography>
  </Box>;
}
