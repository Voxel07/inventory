import { useState } from 'react';
import { IconButton } from '../shared/ActionButtons';
import { Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { QuantityInput } from './QuantityInput';
import { translate, useT } from '../../utils/naming';
import { fromSteps, inputStep, quantityScale, toSteps } from '../../utils/stock';
import type { Item } from '../../types';

interface Props {
  label: string;
  /** Quantity in the item's steps (7.5 L with one decimal is "75"); "" when empty. */
  value: string;
  max?: number;
  onChange: (value: string) => void;
  /** Items measured in decimals ("7,5 L") show and accept their unit; the value stays in steps. */
  item?: Pick<Item, 'unit' | 'quantityDecimals'> | null;
}

/** Requested quantities may exceed stock; preparation supplies an explicit ceiling. */
export function QuantityControl({ label, value, max, onChange, item }: Props) {
  const t = useT();
  const scale = quantityScale(item);
  const quantity = Number(value) || 0;
  // Keeps partial typing ("7.") while the value only changes once the text is a valid amount.
  const [draft, setDraft] = useState<{ text: string; steps: string } | null>(null);
  const text = scale === 1 ? value : draft && draft.steps === value ? draft.text : value === '' ? '' : String(fromSteps(item, quantity));
  function change(next: string) {
    if (scale === 1) { onChange(next); return; }
    const steps = next.trim() === '' ? '' : toSteps(item, next);
    const emitted = steps === '' ? '' : Number.isNaN(steps) || steps < 0 ? value : String(steps);
    setDraft({ text: next, steps: emitted });
    if (emitted !== value) onChange(emitted);
  }
  const step = (delta: number) => onChange(String(Math.max(0, Math.min(max ?? Infinity, quantity + delta * scale))));
  return <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, '& input': { width: scale === 1 ? 56 : 72 }, '& button': { p: 0.5 } }}>
    <IconButton title={translate('orders.quantityControl.decreaseTheQuantityByOne')} size="small" disabled={quantity <= 0} onClick={() => step(-1)} aria-label={`${label}: ${t('orders.quantityControl.decrease')}`}><RemoveIcon fontSize="small" /></IconButton>
    <QuantityInput label={item?.unit ? `${label} (${item.unit})` : label} value={text} max={max === undefined ? undefined : fromSteps(item, max)}
      step={inputStep(item)} onChange={change} />
    <IconButton title={translate('orders.quantityControl.increaseTheQuantityByOne')} size="small" color="primary" disabled={max !== undefined && quantity >= max} onClick={() => step(1)} aria-label={`${label}: ${t('orders.quantityControl.increase')}`}><AddIcon fontSize="small" /></IconButton>
  </Stack>;
}
