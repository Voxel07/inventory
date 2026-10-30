import { useState } from 'react';
import { Alert, Box, Chip, Link, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Button, IconButton } from '../shared/ActionButtons';
import { QuantityControl } from './QuantityControl';
import { translate, useT } from '../../utils/naming';
import type { ItemRequestStatus, OrderItemRequest } from '../../types';
import { isHttpLink, itemRequestStatusLabel, type ItemRequestDraft } from '../../utils/itemRequests';

const EMPTY = { name: '', quantity: '1', link: '', note: '' };

const statusColor: Record<ItemRequestStatus, 'warning' | 'info' | 'success' | 'error'> = {
  open: 'warning', item_created: 'info', ordered: 'success', received: 'success', declined: 'error',
};

export function ItemRequestStatusChip({ status }: { status: ItemRequestStatus }) {
  return <Chip size="small" color={statusColor[status]} variant={status === 'open' ? 'filled' : 'outlined'} label={itemRequestStatusLabel(status)} />;
}

/** Shop links open in a new tab; anything that is not http(s) is shown as plain text, never as a link. */
export function ItemRequestLink({ link, noWrap = false }: { link?: string; noWrap?: boolean }) {
  const t = useT();
  if (!link) return null;
  const text = noWrap ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const
    : { overflowWrap: 'anywhere', wordBreak: 'break-all' } as const;
  if (!isHttpLink(link)) return <Typography variant="caption" color="text.secondary" title={noWrap ? link : undefined}
    sx={{ display: noWrap ? 'block' : undefined, ...text }}>{link}</Typography>;
  return <Link href={link} target="_blank" rel="noopener noreferrer" variant="caption" title={noWrap ? link : t('itemRequests.openLink')}
    sx={{ display: noWrap ? 'flex' : 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
    <Box component="span" sx={{ minWidth: 0, ...text }}>{link.replace(/^https?:\/\//i, '')}</Box><OpenInNewIcon sx={{ fontSize: 14, flexShrink: 0 }} />
  </Link>;
}

/** The request's note behind an info icon, so rows stay on one line. */
export function ItemRequestNoteInfo({ note }: { note?: string }) {
  const t = useT();
  if (!note?.trim()) return null;
  return <Tooltip arrow title={<Box component="span" sx={{ whiteSpace: 'pre-line' }}>{note}</Box>}>
    <Box component="span" tabIndex={0} aria-label={`${t('itemRequests.note')}: ${note}`}
      sx={{ display: 'inline-flex', color: 'text.secondary', flexShrink: 0, p: 0.5 }}>
      <InfoOutlinedIcon fontSize="small" />
    </Box>
  </Tooltip>;
}

/** What procurement did with a request: linked item, purchase order or the reason it was declined. */
export function ItemRequestOutcome({ request }: { request: OrderItemRequest }) {
  const t = useT();
  if (request.status === 'declined') return <Typography variant="caption" color="error.main" sx={{ display: 'block', fontWeight: 600 }}>
    {t('itemRequests.declinedBecause', { reason: request.declineReason ?? '' })}
  </Typography>;
  const parts = [request.itemName && t('itemRequests.linkedItem', { name: request.itemName }),
    request.purchaseOrderNumber && (request.status === 'ordered' || request.status === 'received')
      && t('itemRequests.purchaseOrder', { number: request.purchaseOrderNumber })].filter(Boolean);
  return parts.length ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{parts.join(' · ')}</Typography> : null;
}

/** Read-only list of an order's requests for things outside the inventory. */
export function ItemRequestList({ requests }: { requests: readonly OrderItemRequest[] }) {
  if (!requests.length) return null;
  return <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderLeft: 4, borderLeftColor: 'warning.main' }}>
    {requests.map((request) => <Box key={request.id} component="li"
      sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{request.quantity} × {request.name}</Typography>
          <ItemRequestLink link={request.link} />
          {request.note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-line' }}>{request.note}</Typography>}
          <ItemRequestOutcome request={request} />
        </Box>
        <ItemRequestStatusChip status={request.status} />
      </Stack>
    </Box>)}
  </Paper>;
}

/** Compact marker for order list rows: total, open and declined requests. */
export function ItemRequestBadge({ requests }: { requests?: readonly OrderItemRequest[] }) {
  const t = useT();
  if (!requests?.length) return null;
  const open = requests.filter((request) => request.status === 'open').length;
  const declined = requests.filter((request) => request.status === 'declined').length;
  const label = [t('itemRequests.badge', { count: requests.length }), open && t('itemRequests.openCount', { count: open }),
    declined && t('itemRequests.declinedCount', { count: declined })].filter(Boolean).join(' · ');
  return <Chip size="small" variant="outlined" color={declined ? 'error' : open ? 'warning' : 'success'} label={label} sx={{ mt: 0.5 }} />;
}

/** Order form section for things the inventory does not hold; it never submits the surrounding order form itself. */
export function ItemRequestEditor({ value, onChange }: { value: ItemRequestDraft[]; onChange: (next: ItemRequestDraft[]) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(EMPTY);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const linkInvalid = Boolean(draft.link.trim()) && !isHttpLink(draft.link);
  const canApply = Boolean(draft.name.trim()) && Number(draft.quantity) >= 1 && !linkInvalid;

  function apply() {
    if (!canApply) return;
    if (editingKey) onChange(value.map((entry) => entry.key === editingKey ? { ...entry, ...draft } : entry));
    else onChange([...value, { key: crypto.randomUUID(), ...draft }]);
    setDraft(EMPTY);
    setEditingKey(null);
  }
  function edit(entry: ItemRequestDraft) {
    setEditingKey(entry.key);
    setDraft({ name: entry.name, quantity: entry.quantity, link: entry.link, note: entry.note });
  }
  // Enter in a single-line field would otherwise submit the whole order.
  const applyOnEnter = (event: React.KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); apply(); } };

  function remove(key: string) {
    onChange(value.filter((candidate) => candidate.key !== key));
    if (editingKey === key) { setEditingKey(null); setDraft(EMPTY); }
  }

  return <Box>
    <Paper variant="outlined" sx={{ p: 1.5, mb: value.length ? 1 : 0 }}>
      {/* One row on wide screens; the note and actions move to a second row from sm to lg. */}
      <Box sx={{ display: 'grid', gap: 1.5, alignItems: 'center', gridTemplateColumns: {
        xs: '1fr', sm: 'minmax(0, 2fr) auto minmax(0, 2fr)', lg: 'minmax(0, 2fr) auto minmax(0, 1.5fr) minmax(0, 2fr) auto' } }}>
        {/* Asterisk only: a native required attribute would block reviewing the order while this draft is empty. */}
        <TextField size="small" label={t('itemRequests.name')} value={draft.name} onKeyDown={applyOnEnter}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })} slotProps={{ inputLabel: { required: true }, htmlInput: { maxLength: 160 } }} />
        <QuantityControl label={t('itemRequests.quantity')} value={draft.quantity} onChange={(quantity) => setDraft({ ...draft, quantity })} />
        <TextField size="small" type="url" label={t('itemRequests.link')} value={draft.link} onKeyDown={applyOnEnter} placeholder="https://"
          error={linkInvalid} helperText={linkInvalid ? t('itemRequests.invalidLink') : undefined}
          onChange={(event) => setDraft({ ...draft, link: event.target.value })} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        <TextField size="small" label={t('itemRequests.note')} value={draft.note} onKeyDown={applyOnEnter} sx={{ gridColumn: { sm: '1 / 3', lg: 'auto' } }}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', gridColumn: { sm: '3', lg: 'auto' } }}>
          {editingKey && <Button title={translate('itemRequests.cancelEdit')} onClick={() => { setEditingKey(null); setDraft(EMPTY); }}>{t('common.cancel')}</Button>}
          <Button title={editingKey ? translate('itemRequests.applyTitle') : translate('itemRequests.addTitle')} variant="outlined"
            startIcon={editingKey ? <EditIcon /> : <AddIcon />} disabled={!canApply} onClick={apply} sx={{ whiteSpace: 'nowrap' }}>
            {editingKey ? t('itemRequests.apply') : t('itemRequests.add')}
          </Button>
        </Stack>
      </Box>
    </Paper>
    {value.length > 0 && <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {value.map((entry) => {
        const status = entry.request?.status ?? 'open';
        const editable = status === 'open';
        // Same row layout as selected catalog lines: the name gets the width, the link sits below it.
        return <Paper key={entry.key} component="li" variant="outlined"
          sx={{ px: 0.75, py: 0.4, borderColor: 'primary.main',
            bgcolor: entry.key === editingKey ? 'action.focus' : 'action.selected' }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{entry.name}</Typography>
              <ItemRequestLink link={entry.link} noWrap />
              {entry.request && <ItemRequestOutcome request={entry.request} />}
            </Box>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0, ml: 'auto' }}>
              <ItemRequestNoteInfo note={entry.note} />
              <ItemRequestStatusChip status={status} />
              {editable
                ? <>
                  <QuantityControl label={`${entry.name} ${t('itemRequests.quantity')}`} value={entry.quantity}
                    onChange={(quantity) => { if (Number(quantity) >= 1) onChange(value.map((candidate) => candidate.key === entry.key ? { ...candidate, quantity } : candidate)); }} />
                  <IconButton title={translate('itemRequests.edit')} size="small" onClick={() => edit(entry)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton title={translate('itemRequests.remove')} size="small" color="error" onClick={() => remove(entry.key)}><DeleteIcon fontSize="small" /></IconButton>
                </>
                : <Typography variant="body2" sx={{ px: 1 }}>{entry.quantity} ×</Typography>}
            </Stack>
          </Stack>
        </Paper>;
      })}
    </Stack>}
    {value.some((entry) => entry.request && entry.request.status !== 'open') && <Alert severity="info" sx={{ mt: 1 }}>{t('itemRequests.readOnly')}</Alert>}
  </Box>;
}
