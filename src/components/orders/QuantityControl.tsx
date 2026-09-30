import { IconButton } from '../shared/ActionButtons';
import { Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { QuantityInput } from './QuantityInput';
import { translate, useLocalizedText } from '../../utils/naming';

interface Props {
  label: string;
  value: string;
  max?: number;
  onChange: (value: string) => void;
}

/** Requested quantities may exceed stock; preparation supplies an explicit ceiling. */
export function QuantityControl({ label, value, max, onChange }: Props) {
  const t = useLocalizedText();
  const quantity = Number(value) || 0;
  const step = (delta: number) => onChange(String(Math.max(0, Math.min(max ?? Infinity, quantity + delta))));
  return <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, '& input': { width: 56 }, '& button': { p: 0.5 } }}>
    <IconButton title={translate('Die Menge um eins verringern', 'Decrease the quantity by one')} size="small" disabled={quantity <= 0} onClick={() => step(-1)} aria-label={`${label}: ${t('verringern', 'decrease')}`}><RemoveIcon fontSize="small" /></IconButton>
    <QuantityInput label={label} value={value} max={max} onChange={onChange} />
    <IconButton title={translate('Die Menge um eins erhöhen', 'Increase the quantity by one')} size="small" color="primary" disabled={max !== undefined && quantity >= max} onClick={() => step(1)} aria-label={`${label}: ${t('erhöhen', 'increase')}`}><AddIcon fontSize="small" /></IconButton>
  </Stack>;
}
