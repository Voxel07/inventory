import { ToggleButtonGroup } from '@mui/material';
import { ToggleButton } from '../shared/ActionButtons';
import { useT } from '../../utils/naming';

export type OrderContentView = 'assemblies' | 'items' | 'all';

/** A view filter only: switching never changes ordered or prepared quantities. */
export function OrderContentSelector({ value, onChange }: { value: OrderContentView; onChange: (view: OrderContentView) => void }) {
  const t = useT();
  return <ToggleButtonGroup exclusive value={value}
    onChange={(_, next: OrderContentView | null) => { if (next) onChange(next); }}
    aria-label={t('ordering.showContents')}
    sx={{ width: { xs: '100%', sm: 'auto' }, '& button': { flex: { xs: 1, sm: 'initial' }, minHeight: 44, px: 1.5 } }}>
    <ToggleButton value="assemblies">{t('nav.assemblies')}</ToggleButton>
    <ToggleButton value="items">{t('nav.items')}</ToggleButton>
    <ToggleButton value="all">{t('ordering.both')}</ToggleButton>
  </ToggleButtonGroup>;
}
