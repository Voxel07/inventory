import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useT } from '../../utils/naming';

export interface ReviewStock {
  /** Remaining after the whole order; negative when it exceeds stock. */
  projected: number;
  /** Stock before the order, shown next to a shortage. */
  available?: number;
  format: (quantity: number) => string;
}

interface Props {
  name: string;
  stock?: ReviewStock;
  /** Extra facts on the status line: kind labels, links, last year's quantity. */
  details?: ReactNode;
  /** Quantity stepper and status chips, kept on the name's line. */
  actions: ReactNode;
}

/** One cart-style review row: name and stock status on the left, the quantity stepper on the right. */
export function OrderReviewLine({ name, stock, details, actions }: Props) {
  const t = useT();
  const shortage = Boolean(stock && stock.projected < 0);
  return (
    <Stack component="li" direction="row" spacing={1.5}
      sx={{ alignItems: 'center', px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 },
        borderLeft: 3, borderLeftColor: shortage ? 'warning.main' : 'transparent' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{name}</Typography>
        {(stock || details) && <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25, mt: 0.25 }}>
          {stock && <Typography variant="caption" className="tabular" sx={{ fontWeight: 600,
            color: shortage ? 'warning.main' : stock.projected > 0 ? 'success.main' : 'text.secondary' }}>
            {shortage
              ? [t('ordering.short', { quantity: stock.format(-stock.projected) }),
                ...(stock.available === undefined ? [] : [t('ordering.inStock', { quantity: stock.format(stock.available) })])].join(' · ')
              : t('ordering.leftAfterOrder', { quantity: stock.format(stock.projected) })}
          </Typography>}
          {details}
        </Stack>}
      </Box>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexShrink: 0 }}>{actions}</Stack>
    </Stack>
  );
}

/** Small caption separating shortage lines from the rest of the review list. */
export function OrderReviewGroup({ label }: { label: string }) {
  return <Typography component="li" variant="caption" color="text.secondary"
    sx={{ display: 'block', px: 1.5, pt: 1, pb: 0.5, fontWeight: 600, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>{label}</Typography>;
}
