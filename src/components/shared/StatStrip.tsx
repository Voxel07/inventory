import type { ReactNode } from 'react';
import { Box, Paper, Typography, useMediaQuery, useTheme, type SxProps, type Theme } from '@mui/material';

export type Stat = {
  label: string;
  value: ReactNode;
  /** Colour of the value, e.g. `error.main` for a non-zero problem count. */
  color?: string;
  /** Secondary line on tiles; a tooltip on phones. */
  detail?: string;
  icon?: ReactNode;
  /** Coloured left edge of the tile. */
  accent?: string;
};

/** Key figures: tiles from `sm` up, one horizontally scrolling line on phones so the page content stays in view. */
export function StatStrip({ stats, minTileWidth = 150, sx }: { stats: Stat[]; minTileWidth?: number; sx?: SxProps<Theme> }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const rootSx = Array.isArray(sx) ? sx : [sx];
  if (phone) return <Paper variant="outlined" component="dl" sx={[{ m: 0, display: 'flex', overflowX: 'auto', '& > * + *': { borderLeft: 1, borderColor: 'divider' } }, ...rootSx]}>
    {stats.map((stat) => <Box key={stat.label} title={stat.detail} sx={{ flex: '1 0 auto', minWidth: 72, px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column-reverse' }}>
      <Typography component="dt" variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', lineHeight: 1.3 }}>{stat.label}</Typography>
      <Typography component="dd" className="tabular" sx={{ m: 0, fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.3, color: stat.color }}>{stat.value}</Typography>
    </Box>)}
  </Paper>;
  return <Box component="dl" sx={[{ m: 0, display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${minTileWidth}px, 100%), 1fr))`, gap: 1.5 }, ...rootSx]}>
    {stats.map((stat) => <Paper key={stat.label} sx={{ p: 2, minWidth: 0, display: 'flex', flexDirection: 'column', ...(stat.accent && { borderLeft: 4, borderLeftColor: stat.accent }) }}>
      <Typography component="dt" variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflowWrap: 'anywhere', '& .MuiSvgIcon-root': { fontSize: 20, color: stat.accent ?? stat.color ?? 'text.secondary' } }}>
        {stat.icon}{stat.label}
      </Typography>
      <Box component="dd" sx={{ m: 0 }}>
        <Typography component="span" className="tabular" sx={{ display: 'block', fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.25, color: stat.color }}>{stat.value}</Typography>
        {stat.detail && <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>{stat.detail}</Typography>}
      </Box>
    </Paper>)}
  </Box>;
}
