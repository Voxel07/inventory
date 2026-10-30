import { ToggleButton } from '../shared/ActionButtons';
import { useId, type ReactNode } from 'react';
import { FormControl, InputLabel, MenuItem, Select, TextField, ToggleButtonGroup } from '@mui/material';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';
import { FilterPanel } from '../shared/FilterPanel';
import type { EventReport, EventType } from '../../types';
import { translate, useT } from '../../utils/naming';

interface Props {
  eventTypes: EventType[];
  eventType: EventType;
  onEventTypeChange: (value: EventType) => void;
  /** Occurrences of the selected event type. */
  eventOptions: EventReport[];
  selectedEventId: string;
  onEventChange: (id: string) => void;
  /** An order search that stays in view on phones. */
  search?: { value: string; onChange: (value: string) => void; label: string };
  /** First control of the row, e.g. the order kind switch. */
  leading?: ReactNode;
}

/**
 * Event type toggle plus yearly occurrence, shared by faction and general orders. Phones show one button
 * summarising the choice, which opens both controls in a sheet; beside `leading` the search gets its own row.
 */
export function OrderEventFilter({ eventTypes, eventType, onEventTypeChange, eventOptions, selectedEventId, onEventChange, search, leading }: Props) {
  const t = useT();
  const compact = useCompactCatalog();
  const searchRow = compact && leading && search;
  const labelId = useId();
  const event = eventOptions.find((entry) => entry.id === selectedEventId);
  const summary = [eventTypes.length > 1 && eventType, event?.name ?? t('orders.orderEventFilter.allYears')].filter(Boolean).join(' · ');
  return <><FilterPanel leading={leading} filterLabel={summary} activeFilters={selectedEventId ? 1 : 0} onClear={() => onEventChange('')}
    search={searchRow ? undefined : search?.value} onSearch={searchRow ? undefined : search?.onChange} searchLabel={search?.label}>
    {eventTypes.length > 1 && <ToggleButtonGroup
      exclusive
      size="small"
      value={eventType}
      aria-label={t('nav.event')}
      onChange={(_event, value: EventType | null) => { if (value) onEventTypeChange(value); }}
      sx={{ flexWrap: 'wrap' }}
    >
      {eventTypes.map((type) => <ToggleButton title={translate('orders.orderEventFilter.filterOrdersByThisEventType')} key={type} value={type}>{type}</ToggleButton>)}
    </ToggleButtonGroup>}
    <FormControl size="small" sx={{ minWidth: { md: 280 }, maxWidth: { md: 360 } }}>
      <InputLabel id={labelId}>{t('orders.orderEventFilter.yearlyEvent')}</InputLabel>
      <Select labelId={labelId} value={selectedEventId} label={t('orders.orderEventFilter.yearlyEvent')} onChange={(event) => onEventChange(event.target.value)}>
        <MenuItem value="">{t('orders.orderEventFilter.allYears')}</MenuItem>
        {eventOptions.map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name}</MenuItem>)}
      </Select>
    </FormControl>
  </FilterPanel>
  {searchRow && <TextField type="search" size="small" fullWidth label={search.label} value={search.value}
    onChange={(event) => search.onChange(event.target.value)} sx={{ mb: 2 }} />}
  </>;
}
