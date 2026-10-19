import { formatDateTime } from '../../utils/dateFormat';
import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Checkbox, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { useStockLookups } from '../../hooks/useStockLookups';
import { translate, useT } from '../../utils/naming';
import { apiRequest } from '../../services/apiClient';
import { correctSyncFailure, type SyncFailure } from '../../services/offlineQueue';
import { formatStatus } from '../../utils/formatters';

/** Values are edited against the failed command; the target and command type stay fixed. */
function CommandFields({ value, onChange, path = '', names = {}, assetOptions = [] }: { value: unknown; onChange: (value: unknown) => void; path?: string; names?: Record<string, string>; assetOptions?: [string, string][] }) {
  const t = useT();
  if (value == null) return path.endsWith('operatingHours') ? <TextField label={t('enum.value.operating_hours')} type="number" value="" onChange={(e) => onChange(Number(e.target.value))} /> : null;
  if (Array.isArray(value)) return <Stack spacing={1}>{value.map((entry, index) => <Stack key={index} spacing={1}><CommandFields names={names} assetOptions={assetOptions} value={entry} path={`${path}[${index}]`} onChange={(next) => onChange(value.map((v, i) => i === index ? next : v))} /><Button title={translate('dialogs.syncIssuesDialog.removeThisAssetAssignment')} onClick={() => onChange(value.filter((_, i) => i !== index))}>{t('dialogs.syncIssuesDialog.removeAssignment')}</Button></Stack>)}<Button title={translate('dialogs.syncIssuesDialog.addAnAssetAssignment')} onClick={() => onChange([...value, ''])}>{t('dialogs.syncIssuesDialog.addAssignment')}</Button></Stack>;
  if (typeof value === 'object') return <Stack spacing={1}>{Object.entries(value).map(([key, entry]) => <Stack key={key} spacing={1}>
    {path === 'input.assets' && <TextField select={assetOptions.length > 0} label={t('dialogs.syncIssuesDialog.returnedAsset')} value={key} onChange={(e) => { if (!e.target.value || (e.target.value !== key && e.target.value in value)) return; const next = { ...value } as Record<string, unknown>; delete next[key]; next[e.target.value] = entry; onChange(next); }}>{assetOptions.length > 0 ? [...assetOptions.filter(([id]) => id !== key), [key, names[key] ?? key]].map(([id, label]) => <MenuItem key={id} value={id}>{label}</MenuItem>) : undefined}</TextField>}
    <CommandFields names={names} assetOptions={assetOptions} path={path ? `${path}.${key}` : key} value={entry} onChange={(next) => onChange({ ...value, [key]: next })} />
  </Stack>)}</Stack>;
  const label = path.split('.').map((part) => names[part] ?? part.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' · ');
  if (typeof value === 'boolean') return <FormControlLabel label={label} control={<Checkbox checked={value} onChange={(e) => onChange(e.target.checked)} />} />;
  const fixed = /(^|\.)(itemId|orderId|assemblyId|userId|idempotencyKey|transactionType)$/.test(path);
  if ((path.includes('assetAssignments.') || path.endsWith('assetInstanceId')) && assetOptions.length) return <TextField select label={label} value={value} onChange={(e) => onChange(e.target.value)}><MenuItem value="">{t('dialogs.syncIssuesDialog.selectAsset')}</MenuItem>{[...assetOptions.filter(([id]) => id !== value), ...(value ? [[String(value), names[String(value)] ?? String(value)]] : [])].map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}</TextField>;
  if (path.endsWith('.outcome')) return <TextField select label={label} value={value} onChange={(e) => onChange(e.target.value)}>{['returned_good', 'consumed', 'returned_damaged', 'missing', 'returned_late', 'written_off'].map((outcome) => <MenuItem key={outcome} value={outcome}>{formatStatus(outcome)}</MenuItem>)}</TextField>;
  if (path === 'status') return <TextField select label={label} value={value} onChange={(e) => onChange(e.target.value)}>{['draft', 'submitted', 'preparing', 'ready', 'picked_up', 'closed', 'cancelled'].map((status) => <MenuItem key={status} value={status}>{formatStatus(status)}</MenuItem>)}</TextField>;
  return <TextField fullWidth label={label} type={typeof value === 'number' ? 'number' : 'text'} value={value} disabled={fixed} onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)} />;
}

export function SyncIssuesDialog({ open, failures, onClose, onDiscard, discarding = false }: {
  open: boolean; failures: SyncFailure[]; onClose: () => void; onDiscard: (id: string) => void; discarding?: boolean;
}) {
  const lookups = useStockLookups();
  const t = useT(); const [selected, setSelected] = useState<SyncFailure | null>(null);
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const assets = new Map<string, string>();
  function collectAssets(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const entry = value as Record<string, unknown>;
    if (typeof entry.id === 'string' && typeof entry.assetCode === 'string') assets.set(entry.id, `${entry.assetCode} · ${entry.availabilityStatus ? formatStatus(String(entry.availabilityStatus)) : ''}`);
    Object.values(value).forEach(collectAssets);
  }
  collectAssets(context);
  const names = Object.fromEntries([...lookups.items.map((item) => [item.id, item.name]), ...lookups.locations.map((l) => [l.id, l.name]), ...assets.entries()]);
  const [payload, setPayload] = useState<Record<string, unknown>>({}); const [note, setNote] = useState('');
  const [reviewed, setReviewed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [resolved, setResolved] = useState<string[]>([]);
  async function inspect(failure: SyncFailure) {
    setSelected(failure); setContext(null); setPayload(structuredClone(failure.payload)); setNote(''); setReviewed(false); setError(''); setBusy(true);
    try { setContext(await apiRequest<Record<string, unknown>>(`/api/sync/${failure.idempotencyKey}/context`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function submit() {
    if (!selected || !context || !reviewed) return;
    setBusy(true); setError('');
    try { await correctSyncFailure(selected, payload, note); setResolved([...resolved, selected.idempotencyKey]); setSelected(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return <Dialog open={open} onClose={() => { setSelected(null); onClose(); }} maxWidth="md" fullWidth>
    <DialogTitle>{t('dialogs.syncIssuesDialog.reviewSynchronization')}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      <Alert severity="info">{t('dialogs.syncIssuesDialog.conflictsAreNeverOverwrittenAutomaticallyInspectCurrentStateCorrectQuantities')}</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {selected ? <>
        <Typography variant="h6">1. {t('dialogs.syncIssuesDialog.failureAndCurrentServerState')}</Typography>
        <Alert severity="warning">{selected.type} · {selected.error}</Alert>
        {busy && <Typography>{t('dialogs.syncIssuesDialog.loadingSaving')}</Typography>}
        {context && <Box sx={{ overflow: 'auto', maxHeight: 400 }}><ServerState value={Object.fromEntries(Object.entries(context).filter(([key]) => key !== 'command'))} names={names} /></Box>}
        <Button title={translate('dialogs.syncIssuesDialog.reloadTheCurrentServerState')} disabled={busy} onClick={() => { void inspect(selected); }}>{t('dialogs.syncIssuesDialog.reloadServerState')}</Button>
        <Typography variant="h6">2. {t('dialogs.syncIssuesDialog.correction')}</Typography>
        <CommandFields names={names} assetOptions={[...assets.entries()]} value={payload} onChange={(value) => { setPayload(value as Record<string, unknown>); setReviewed(false); }} />
        <TextField required multiline label={t('dialogs.syncIssuesDialog.resolutionNote')} value={note} slotProps={{ htmlInput: { maxLength: 2000 } }} onChange={(e) => setNote(e.target.value)} />
        <FormControlLabel label={t('dialogs.syncIssuesDialog.iReviewedCurrentStateAndTheCorrectionTheServerWill')} control={<Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />} />
        <Button title={translate('dialogs.syncIssuesDialog.submitTheReviewedCorrectionAsANewAction')} variant="contained" disabled={busy || !context || !reviewed || !note.trim()} onClick={() => { void submit(); }}>{t('dialogs.syncIssuesDialog.submitAsANewAction')}</Button>
        <Button title={translate('dialogs.syncIssuesDialog.returnToTheConflictList')} disabled={busy} onClick={() => setSelected(null)}>{t('dialogs.syncIssuesDialog.back')}</Button>
      </> : <>
        {failures.filter((f) => !resolved.includes(f.idempotencyKey)).map((failure) => <Stack key={failure.idempotencyKey} spacing={1}>
          <Typography>{failure.type} · {formatStatus(failure.status)} · {formatDateTime(failure.timestamp)}</Typography>
          <Alert severity="warning">{failure.error}</Alert>
          <Button title={translate('dialogs.syncIssuesDialog.openTheConflictToReviewACorrection')} onClick={() => { void inspect(failure); }}>{t('dialogs.syncIssuesDialog.inspectAndCorrect')}</Button>
          <Button title={translate('dialogs.syncIssuesDialog.archiveThisConflictWithoutResubmitting')} disabled={discarding} onClick={() => onDiscard(failure.idempotencyKey)}>{t('dialogs.syncIssuesDialog.archiveWithoutRetry')}</Button>
        </Stack>)}
        {!failures.filter((f) => !resolved.includes(f.idempotencyKey)).length && <Typography>{t('dialogs.syncIssuesDialog.noUnresolvedFailures')}</Typography>}
      </>}
    </Stack></DialogContent><DialogActions><Button title={translate('common.closeThisDialog')} onClick={() => { setSelected(null); onClose(); }}>{t('common.close')}</Button></DialogActions>
  </Dialog>;
}

function ServerState({ value, names }: { value: unknown; names: Record<string, string> }) {
  if (value == null) return <span>—</span>;
  if (typeof value !== 'object') return <span>{names[String(value)] ?? String(value)}</span>;
  return <Stack spacing={0.5}>{Object.entries(value).filter(([key]) => !['id', 'created', 'updated', 'image', 'images', 'collectionId', 'collectionName'].includes(key)).map(([key, entry]) => <Box key={key} sx={{ pl: 1, borderLeft: '1px solid', borderColor: 'divider', overflowWrap: 'anywhere' }}>{typeof entry === 'object' && entry !== null ? <details open={['item', 'order', 'stock', 'requestedItems', 'assets'].includes(key)}><summary>{names[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')}</summary><ServerState value={entry} names={names} /></details> : <Typography variant="body2"><strong>{names[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2')}: </strong><ServerState value={entry} names={names} /></Typography>}</Box>)}</Stack>;
}
