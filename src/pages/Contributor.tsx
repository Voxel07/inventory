import { Button } from '../components/shared/ActionButtons';
import { useState } from 'react';
import { Alert, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { memberApi } from '../services/memberService';
import { useMember, useMemberAssignments } from '../hooks/useMember';
import type { MemberStored as Stored, MemberRequest as Request } from '../types/member';
import { inputNumber, inputText, optionalText, inputBoolean } from '../utils/inputValues';
import { useAuth } from '../hooks/useAuth';
import { useReturnSubmissions } from '../hooks/useReturnSubmissions';
import { useAssignableUsers } from '../hooks/useUsers';
import { canOperateWarehouse } from '../utils/access';
import { translate, useLocalizedText } from '../utils/naming';
import { OperationForm } from '../components/operations/OperationForm';

export function Contributor() {
  const t = useLocalizedText(); const { user } = useAuth(); const warehouse = canOperateWarehouse(user); const writable = user?.role !== 'read_only';
  const { custody, stored, requests } = useMember(); const returns = useReturnSubmissions();
  const [request, setRequest] = useState<{ item: Stored; kind: string; commandId: string } | null>(null);
  const [returning, setReturning] = useState<NonNullable<typeof custody.data>[number] | null>(null);
  const [returnCommand, setReturnCommand] = useState('');
  const [reply, setReply] = useState<Request | null>(null);
  const error = custody.error || stored.error || requests.error || returns.error;
  const report = (item: Stored, kind: string) => setRequest({ item, kind, commandId: crypto.randomUUID() });
  return <Stack spacing={2}>
    <Typography variant="h4">{t('Meine Ausrüstung & Abholungen', 'My equipment & pickups')}</Typography>
    <Button title={translate('Aufgaben und Erinnerungen öffnen', 'Open actions and reminders')} component={Link} to="/actions">{t('Aufgaben & Erinnerungen', 'Actions & reminders')}</Button>
    {(custody.isLoading || stored.isLoading || requests.isLoading) && <LinearProgress />}
    {error && <Alert severity="error" action={<Button title={translate('Die Daten erneut laden', 'Retry loading the data')} onClick={() => { void custody.refetch(); void stored.refetch(); void requests.refetch(); void returns.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>{error.message}</Alert>}
    <Typography variant="h6">{t('In meiner Obhut', 'In my custody')}</Typography>
    {custody.data?.map(row => <Card key={row.key}><CardContent><Stack spacing={1}>
      <Typography>{row.name} · {row.checkedOut} · {row.event}</Typography><Typography>{t('Bestätigung ausstehend', 'Awaiting acknowledgement')}: {row.pendingQuantity}</Typography>
      <Typography>{t('Rückgabeort', 'Return location')}: {row.storageLocation}</Typography>
      {writable && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button title={translate('Die Rückgabe zur Bestätigung melden', 'Submit this return for acknowledgement')} disabled={row.checkedOut <= (row.pendingQuantity ?? 0)} onClick={() => { setReturnCommand(crypto.randomUUID()); setReturning(row); }}>{t('Rückgabe melden', 'Submit return')}</Button><Button title={translate('Einen Schaden an dieser Ausrüstung melden', 'Report damage to this equipment')} onClick={() => report({ itemId: row.itemId, name: row.name, assetId: row.assetInstanceId, quantity: row.checkedOut }, 'damage')}>{t('Schaden melden', 'Report damage')}</Button><Button title={translate('Eine Anfrage zur Abholung dieser Ausrüstung erstellen', 'Create a pickup request for this equipment')} onClick={() => report({ itemId: row.itemId, name: row.name, assetId: row.assetInstanceId, quantity: row.checkedOut }, 'pickup')}>{t('Abholung koordinieren', 'Coordinate pickup')}</Button></Stack>}
    </Stack></CardContent></Card>)}
    {!custody.isLoading && !custody.data?.length && <Typography>{t('Keine offenen Ausleihen.', 'No outstanding custody.')}</Typography>}
    <Typography variant="h6">{t('Bei mir gelagert', 'Stored with me')}</Typography>
    {stored.data?.map((s, index) => <Card key={`${s.itemId}:${s.locationId}:${s.assetId}:${index}`}><CardContent><Stack spacing={1}><Typography>{s.name} · {s.quantity} · {s.assetCode} · {s.location}</Typography>{writable && <Stack direction="row" spacing={1}><Button title={translate('Einen Schaden an dieser Ausrüstung melden', 'Report damage to this equipment')} onClick={() => report(s, 'damage')}>{t('Schaden melden', 'Report damage')}</Button><Button title={translate('Eine Anfrage zur Abholung dieser Ausrüstung erstellen', 'Create a pickup request for this equipment')} onClick={() => report(s, 'pickup')}>{t('Abholung koordinieren', 'Coordinate pickup')}</Button></Stack>}</Stack></CardContent></Card>)}
    {!stored.isLoading && !stored.data?.length && <Typography>{t('Keine zugewiesenen Lagerbestände.', 'No assigned stored equipment.')}</Typography>}
    <Typography variant="h6">{t('Meldungen & Absprachen', 'Reports & coordination')}</Typography>
    <Alert severity="info">{t('Schadensmeldungen sperren den Artikel bis zur Klärung. Das Lager prüft den Schaden und dokumentiert die Bestandsaktion vor dem Abschluss. Abholanfragen bewegen keinen Bestand.', 'Damage reports block the item until reviewed. Warehouse staff inspect the damage and document the stock action before closing the report. Pickup requests do not move stock.')}</Alert>
    {requests.data?.map(r => <Card key={r.id}><CardContent><Stack spacing={1}><Typography variant="h6">{r.item} · {r.quantity} · {r.kind === 'damage' ? t('Schaden', 'Damage') : t('Abholung', 'Pickup')}</Typography><Typography>{r.requester} · {r.status} · {new Date(r.createdAt).toLocaleString()}</Typography><Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.notes}</Typography>{r.response && <Alert severity="info">{r.response}</Alert>}{warehouse && r.status !== 'resolved' && <Stack direction="row"><Button title={translate('Auf diese Anfrage antworten oder sie abschließen', 'Respond to this request or resolve it')} onClick={() => setReply(r)}>{t('Antworten / abschließen', 'Respond / resolve')}</Button><Button title={translate('Die zugehörigen Artikeldetails öffnen', 'Open the related item details')} component={Link} to={`/items/${r.itemId}`}>{t('Artikel prüfen', 'Inspect item')}</Button></Stack>}</Stack></CardContent></Card>)}
    <Typography variant="h6">{t('Rückgabestatus', 'Return status')}</Typography>
    {returns.data?.filter(r => r.returnedForUserId === user?.id).map(r => <Card key={r.id}><CardContent><Typography>{r.itemName} · {r.quantity} · {r.status}</Typography><Typography>{r.acknowledgementNotes}</Typography></CardContent></Card>)}
    {warehouse && <StorageAssignments />}
    {request && <OperationForm title={request.kind === 'damage' ? t('Schaden melden', 'Report damage') : t('Abholung koordinieren', 'Coordinate pickup')} onClose={() => setRequest(null)} initial={{ quantity: 1 }} fields={[{ key: 'quantity', label: t('Menge', 'Quantity'), type: 'number', required: true, min: 1, max: request.item.quantity }, { key: 'notes', label: t('Beschreibung / Termin / Kontakt', 'Description / proposed time / contact'), required: true, multiline: true }]} onSave={v => memberApi.request({ itemId: request.item.itemId, assetId: request.item.assetId, locationId: request.item.locationId, kind: request.kind, commandId: request.commandId, quantity: inputNumber(v.quantity), notes: inputText(v.notes) })} />}
    {returning && <OperationForm title={t('Rückgabe zur Prüfung melden', 'Submit return for inspection')} onClose={() => setReturning(null)} initial={{ quantity: 1 }} fields={[{ key: 'quantity', label: t('Menge', 'Quantity'), type: 'number', required: true, min: 1, max: returning.checkedOut - (returning.pendingQuantity ?? 0) }, ...(returning.factionOrderId && !returning.assetInstanceId ? [{ key: 'assetId', label: t('Geräte-ID (nur bei serialisierter Ausrüstung)', 'Asset ID (serialized equipment only)') }] : []), { key: 'notes', label: t('Ablageort / Notiz', 'Placement / notes'), required: true }]} onSave={v => memberApi.submitReturn({ quantity: inputNumber(v.quantity), notes: optionalText(v.notes), assetId: optionalText(v.assetId), custodyKey: returning.key, commandId: returnCommand })} />}
    {reply && <OperationForm title={t('Lagerantwort', 'Warehouse response')} onClose={() => setReply(null)} initial={{ response: reply.response ?? '' }} fields={[{ key: 'response', label: t('Termin / Prüfergebnis / Bestandsnachweis', 'Time / inspection result / inventory evidence'), required: true, multiline: true }, { key: 'resolved', label: t('Vorgang abgeschlossen', 'Resolved'), type: 'checkbox' }]} onSave={v => memberApi.decide(reply.id, { response: inputText(v.response), resolved: inputBoolean(v.resolved), revision: reply.revision })} />}
  </Stack>;
}
function StorageAssignments() {
  const t = useLocalizedText(); const users = useAssignableUsers();
  const assignments = useMemberAssignments();
  const [editing, setEditing] = useState<import('../types/member').MemberAssignment | null>(null);
  return <Stack spacing={1}><Typography variant="h6">{t('Lager-Verantwortung zuweisen', 'Assign storage responsibility')}</Typography>{assignments.error && <Alert severity="error">{assignments.error.message}</Alert>}{assignments.data?.map(a => <Button title={translate('Die Zuordnung dieses Lagerorts bearbeiten', 'Edit this storage location\'s assignment')} key={a.id} onClick={() => setEditing(a)}>{a.name} · {users.data?.find(u => u.id === a.userId)?.name ?? t('Nicht zugewiesen', 'Unassigned')}</Button>)}
    {editing && <OperationForm title={editing.name} onClose={() => setEditing(null)} initial={{ userId: editing.userId ?? '' }} fields={[{ key: 'userId', label: t('Verantwortliche Person (leer = entfernen)', 'Responsible person (empty = remove)'), options: (users.data ?? []).filter(u => u.role !== 'read_only').map(u => ({ value: u.id, label: u.name })) }]} onSave={v => memberApi.assign(editing.id, optionalText(v.userId))} />}
  </Stack>;
}
