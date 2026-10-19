import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Autocomplete, Stack, TextField } from '@mui/material';
import { Button } from '../../shared/ActionButtons';
import { apiRequest } from '../../../services/apiClient';
import { getEventReports } from '../../../services/eventService';
import { useT } from '../../../utils/naming';
import { useNavigate } from 'react-router-dom';
import type { FactionOrder } from '../../../types';
export function CopyOrderDraft({ orderId, eventType }: { orderId: string; eventType: string }) {
  const t = useT(); const navigate = useNavigate(); const [open, setOpen] = useState(false); const [eventId, setEventId] = useState('');
  const events = useQuery({ queryKey: ['events', eventType], queryFn: () => getEventReports(eventType), enabled: open });
  const copy = useMutation({ mutationFn: () => apiRequest<FactionOrder>('/api/order-copies', { method: 'POST', body: { sourceOrderId: orderId, eventId, commandId: crypto.randomUUID() } }), onSuccess: order => navigate(`/orders/faction/${order.id}`) });
  return <Stack spacing={1}>
    <Button onClick={() => setOpen(!open)}>{t('review.copyDraft')}</Button>
    {open && <><Autocomplete options={(events.data ?? []).filter(e => e.status !== 'completed')} getOptionLabel={e => `${e.name} · ${e.startDate}`} value={events.data?.find(e => e.id === eventId) ?? null} onChange={(_, e) => setEventId(e?.id ?? '')} renderInput={params => <TextField {...params} label={t('review.targetEvent')} />} />
      <Button disabled={!eventId || copy.isPending} onClick={() => copy.mutate()}>{t('common.save')}</Button></>}
    {(copy.error || events.error) && <Alert severity="error">{(copy.error || events.error)?.message}</Alert>}
  </Stack>;
}
