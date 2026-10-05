import { formatDate } from '../../utils/dateFormat';
import { ToggleButton } from '../shared/ActionButtons';
import type { ReactNode } from 'react';
import { FormControl, InputLabel, MenuItem, Select, Stack, ToggleButtonGroup } from '@mui/material';
import type { EventReport, EventType } from '../../types';
import { translate, useLocalizedText } from '../../utils/naming';

interface Props {
  eventTypes: EventType[];
  eventType: EventType;
  onEventTypeChange: (value: EventType) => void;
  /** Occurrences of the selected event type. */
  eventOptions: EventReport[];
  selectedEventId: string;
  onEventChange: (id: string) => void;
  /** Extra controls on the same row, e.g. a search field or status overview. */
  children?: ReactNode;
}

/** Event type toggle plus yearly occurrence, shared by faction and general orders. */
export function OrderEventFilter({ eventTypes, eventType, onEventTypeChange, eventOptions, selectedEventId, onEventChange, children }: Props) {
  const t = useLocalizedText();
  return <>
    {eventTypes.length > 1 && <ToggleButtonGroup
      exclusive
      value={eventType}
      onChange={(_event, value: EventType | null) => { if (value) onEventTypeChange(value); }}
      sx={{ mb: 2, flexWrap: 'wrap' }}
    >
      {eventTypes.map((type) => <ToggleButton title={translate('Bestellungen nach diesem Eventtyp filtern', 'Filter orders by this event type')} key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</ToggleButton>)}
    </ToggleButtonGroup>}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { xs: 'stretch', md: 'center' } }}>
      <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 280 }, maxWidth: { md: 360 } }}>
        <InputLabel>{t('Jährliches Event', 'Yearly event')}</InputLabel>
        <Select value={selectedEventId} label={t('Jährliches Event', 'Yearly event')} onChange={(event) => onEventChange(event.target.value)}>
          <MenuItem value="">{t('Alle Jahre', 'All years')}</MenuItem>
          {eventOptions.map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.name} · {formatDate(entry.startDate)}{entry.endDate !== entry.startDate ? ` – ${formatDate(entry.endDate)}` : ''}</MenuItem>)}
        </Select>
      </FormControl>
      {children}
    </Stack>
  </>;
}
