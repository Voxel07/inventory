import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../../shared/ActionButtons';
import { apiPage, apiRequest, apiFileUrl, fetchMedia, uploadMedia } from '../../../services/apiClient';
import { assertAuthSession, captureAuthSession } from '../../../services/authManager';
import { useAuth } from '../../../hooks/useAuth';
import { atLeast } from '../../../utils/access';
import { useT } from '../../../utils/naming';
import { formatDateTime } from '../../../utils/dateFormat';
type Evidence = { id: string; recordedAt: string; conditionConfirmed: boolean; conditionNotes: string; acknowledgementObjectKey?: string };
type Handover = { id: string; code: string; type: string; occurredAt: string; collector: string; evidence: Evidence[] };
export function HandoverEvidencePanel({ orderId }: { orderId: string }) {
  const t = useT(); const { user } = useAuth(); const client = useQueryClient();
  const [selected, setSelected] = useState(''); const [notes, setNotes] = useState(''); const [confirmed, setConfirmed] = useState(false); const [file, setFile] = useState<File>();
  const query = useInfiniteQuery({ queryKey: ['handover-evidence', orderId], initialPageParam: 0,
    queryFn: ({ pageParam }) => apiPage<Handover>('/api/handovers', pageParam, 100, { query: { orderId } }),
    getNextPageParam: (last, pages) => last.more ? pages.length : undefined });
  const save = useMutation({ mutationFn: async () => {
    const context = captureAuthSession(); const key = file ? await uploadMedia(file, context) : undefined;
    await apiRequest(`/api/handovers/${selected}/evidence`, { method: 'POST', session: context, body: { commandId: crypto.randomUUID(), conditionConfirmed: confirmed, conditionNotes: notes, acknowledgementObjectKey: key } });
  }, onSuccess: async () => { setSelected(''); setNotes(''); setFile(undefined); await client.invalidateQueries({ queryKey: ['handover-evidence', orderId] }); } });
  const download = useMutation({ mutationFn: async (key: string) => {
    const context = captureAuthSession(); const blob = await fetchMedia(apiFileUrl(key)!, undefined, context); assertAuthSession(context);
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = key.split('/').at(-1) ?? 'acknowledgement'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <Stack spacing={1} sx={{ mt: 2 }}><Typography variant="h6">{t('review.evidence')}</Typography>
    {query.data?.pages.flatMap(p => p.rows).map(handover => <Paper variant="outlined" key={handover.id} sx={{ p: 1.5 }}><Stack spacing={1}>
      <Typography>{handover.code} · {formatDateTime(handover.occurredAt)} · {handover.collector}</Typography>
      {handover.evidence.map(e => <Stack key={e.id}><Typography>{formatDateTime(e.recordedAt)} · {e.conditionNotes} {e.conditionConfirmed ? '✓' : ''}</Typography>{e.acknowledgementObjectKey && <Button onClick={() => download.mutate(e.acknowledgementObjectKey!)}>{t('review.attachment')}</Button>}</Stack>)}
      {atLeast(user, 'warehouse_crew') && <Button onClick={() => setSelected(handover.id)}>{t('review.recordEvidence')}</Button>}
      {selected === handover.id && <><FormControlLabel label={t('review.condition')} control={<Checkbox checked={confirmed} onChange={(_, value) => setConfirmed(value)} />} />
        <TextField label={t('review.conditionNotes')} value={notes} onChange={e => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        <TextField type="file" label={t('review.attachment')} slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: 'application/pdf,image/*', onChange: (event: React.ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0]) } }} />
        <Button disabled={!notes.trim() || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button></>}
    </Stack></Paper>)}
    {query.hasNextPage && <Button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>{t('common.next')}</Button>}
    {(query.error || save.error || download.error) && <Alert severity="error">{(query.error || save.error || download.error)?.message}</Alert>}
  </Stack>;
}
