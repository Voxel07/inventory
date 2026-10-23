import { IconButton } from '../shared/ActionButtons';
import { Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { QuantityInput } from './QuantityInput';
import { translate, useT } from '../../utils/naming';
import { formatQuantity, usesPercentage } from '../../utils/stock';
import type { Item } from '../../types';

interface Props {
  label: string;
  /** Whole units or integer percentages of a full canister/bag; "" when empty. */
  value: string;
  max?: number;
  onChange: (value: string) => void;
  /** Percentage consumables show and accept 1% increments; 100% is one full unit. */
  item?: Pick<Item, 'unit' | 'quantityDecimals' | 'unitCapacity'> | null;
}

/** Requested quantities may exceed stock; preparation supplies an explicit ceiling. */
export function QuantityControl({ label, value, max, onChange, item }: Props) {
  const t = useT();
  const percentage = usesPercentage(item);
  const quantity = Number(value) || 0;
  const step = (delta: number) => onChange(String(Math.max(0, Math.min(max ?? Infinity, quantity + delta))));
  return <Stack direction="row" title={percentage ? t('forms.itemForm.percentageCapacity', { quantity: formatQuantity(item, 100) }) : undefined}
    sx={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', '& input': { width: percentage ? 72 : 56 }, '& button': { p: 0.5 } }}>
    <IconButton title={translate('orders.quantityControl.decreaseTheQuantityByOne')} size="small" disabled={quantity <= 0} onClick={() => step(-1)} aria-label={`${label}: ${t('orders.quantityControl.decrease')}`}><RemoveIcon fontSize="small" /></IconButton>
    <QuantityInput label={percentage ? `${label} (%)` : item?.unit ? `${label} (${item.unit})` : label} value={value} max={max}
      onChange={(next) => { if (next === '' || Number.isSafeInteger(Number(next)) && Number(next) >= 0) onChange(next); }} />
    {percentage && <span aria-hidden="true">%</span>}
    <IconButton title={translate('orders.quantityControl.increaseTheQuantityByOne')} size="small" color="primary" disabled={max !== undefined && quantity >= max} onClick={() => step(1)} aria-label={`${label}: ${t('orders.quantityControl.increase')}`}><AddIcon fontSize="small" /></IconButton>
    {percentage && <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{formatQuantity(item, quantity)}</Typography>}
  </Stack>;
}
