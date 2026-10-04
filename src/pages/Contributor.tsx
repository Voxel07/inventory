import { Button, IconButton, Tab } from '../components/shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Stack, Tabs, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { MemberCustody, MemberRequest, MemberStored } from '../types/member';
import type { ReturnSubmission } from '../types';
import { Link } from 'react-router-dom';
import { memberApi } from '../services/memberService';
import { useMember } from '../hooks/useMember';
import { useActionInboxDialog } from '../hooks/useActionInboxDialog';
import type { MemberStored as Stored, MemberRequest as Request } from '../types/member';
import { inputNumber, inputText, optionalText, inputBoolean } from '../utils/inputValues';
import { useAuth } from '../hooks/useAuth';
import { useReturnSubmissions } from '../hooks/useReturnSubmissions';
import { canOperateWarehouse } from '../utils/access';
import { translate, useAppLanguage, useLocalizedText } from '../utils/naming';
import { OperationForm } from '../components/operations/OperationForm';

type EquipmentSource =
  | { kind: 'custody'; data: MemberCustody }
  | { kind: 'stored'; data: MemberStored }
  | { kind: 'requests'; data: MemberRequest }
  | { kind: 'returns'; data: ReturnSubmission };
type EquipmentRow = { id: string; name: string; quantity: number; event?: string; location?: string; pending?: number; status?: string; kind?: string; requester?: string; created?: string; notes?: string; source: EquipmentSource };

export function Contributor({ embedded = false }: { embedded?: boolean }) {
  const { openActionInbox } = useActionInboxDialog();
  const t = useLocalizedText(); const { user } = useAuth(); const warehouse = canOperateWarehouse(user); const writable = user?.role !== 'read_only';
  const { custody, stored, requests } = useMember(); const returns = useReturnSubmissions();
  const [request, setRequest] = useState<{ item: Stored; kind: string; commandId: string } | null>(null);
  const [returning, setReturning] = useState<NonNullable<typeof custody.data>[number] | null>(null);
  const [returnCommand, setReturnCommand] = useState('');
  const [reply, setReply] = useState<Request | null>(null);
  const error = custody.error || stored.error || requests.error || returns.error;
  const report = (item: Stored, kind: string) => setRequest({ item, kind, commandId: crypto.randomUUID() });
  const language = useAppLanguage();
  const isMobile = useMediaQuery('(max-width:599.95px)');
  const [section, setSection] = useState('custody');
  const myReturns = returns.data?.filter(row => row.returnedForUserId === user?.id) ?? [];
  const sections = [
    { key: 'custody', label: t('In meiner Obhut', 'In my custody'), count: custody.data?.length, loading: custody.isLoading },
    { key: 'stored', label: t('Bei mir gelagert', 'Stored with me'), count: stored.data?.length, loading: stored.isLoading },
    { key: 'requests', label: t('Meldungen & Absprachen', 'Reports & coordination'), count: requests.data?.length, loading: requests.isLoading },
    { key: 'returns', label: t('Rückgabestatus', 'Return status'), count: myReturns.length, loading: returns.isLoading },
  ];
  const rows: EquipmentRow[] = section === 'custody' ? (custody.data ?? []).map(row => ({
    id: row.key, name: row.name, quantity: row.checkedOut, event: row.event, location: row.storageLocation,
    pending: row.pendingQuantity ?? 0, source: { kind: 'custody', data: row },
  })) : section === 'stored' ? (stored.data ?? []).map((row, index) => ({
    id: `${row.itemId}:${row.locationId}:${row.assetId}:${index}`, name: row.name, quantity: row.quantity,
    location: [row.location, row.assetCode].filter(Boolean).join(' · '), source: { kind: 'stored', data: row },
  })) : section === 'requests' ? (requests.data ?? []).map(row => ({
    id: row.id, name: row.item, quantity: row.quantity, status: row.status,
    kind: row.kind === 'damage' ? t('Schaden', 'Damage') : t('Abholung', 'Pickup'), requester: row.requester,
    created: new Date(row.createdAt).toLocaleString(), notes: [row.notes, row.response].filter(Boolean).join(' — '),
    source: { kind: 'requests', data: row },
  })) : myReturns.map(row => ({
    id: row.id, name: row.itemName, quantity: row.quantity, status: row.status, notes: row.acknowledgementNotes,
    source: { kind: 'returns', data: row },
  }));
  const columns: GridColDef<EquipmentRow>[] = [
    { field: 'name', headerName: t('Artikel', 'Item'), flex: 1.3, minWidth: 180,
      renderCell: ({ value }) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography> },
    { field: 'quantity', headerName: t('Menge', 'Quantity'), type: 'number', width: 85 },
    ...(section === 'custody' ? [
      { field: 'pending', headerName: t('Bestätigung ausstehend', 'Awaiting acknowledgement'), type: 'number', width: 180 },
      { field: 'event', headerName: t('Event', 'Event'), width: 140 },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(['custody', 'stored'].includes(section) ? [
      { field: 'location', headerName: section === 'custody' ? t('Rückgabeort', 'Return location') : t('Lagerort / Gerät', 'Location / asset'), flex: 1, minWidth: 180 },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(section === 'requests' ? [
      { field: 'kind', headerName: t('Typ', 'Type'), width: 100 },
      { field: 'requester', headerName: t('Anfragende Person', 'Requester'), width: 150 },
      { field: 'created', headerName: t('Datum', 'Date'), width: 165 },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(['requests', 'returns'].includes(section) ? [
      { field: 'status', headerName: t('Status', 'Status'), width: 120 },
      { field: 'notes', headerName: t('Notizen / Antwort', 'Notes / response'), flex: 1.5, minWidth: 240,
        renderCell: ({ value }) => <Tooltip title={value ?? ''}><Typography variant="body2" noWrap>{value || '—'}</Typography></Tooltip> },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(section !== 'returns' && (writable || warehouse) ? [{
      field: 'actions', headerName: t('Aktionen', 'Actions'), width: isMobile ? 160 : 125, sortable: false, filterable: false,
      renderCell: ({ row }) => {
        const source = row.source;
        if (source.kind === 'custody' && writable) {
          const data = source.data;
          const item: Stored = { itemId: data.itemId, name: data.name, assetId: data.assetInstanceId, quantity: data.checkedOut };
          return <Stack direction="row" spacing={0.25}>
            <IconButton size="small" title={t('Rückgabe melden', 'Submit return')} disabled={data.checkedOut <= (data.pendingQuantity ?? 0)}
              onClick={() => { setReturnCommand(crypto.randomUUID()); setReturning(data); }}><AssignmentReturnIcon fontSize="small" /></IconButton>
            <IconButton size="small" title={t('Schaden melden', 'Report damage')} onClick={() => report(item, 'damage')}><ReportProblemOutlinedIcon fontSize="small" /></IconButton>
            <IconButton size="small" title={t('Abholung koordinieren', 'Coordinate pickup')} onClick={() => report(item, 'pickup')}><LocalShippingOutlinedIcon fontSize="small" /></IconButton>
          </Stack>;
        }
        if (source.kind === 'stored' && writable) return <Stack direction="row" spacing={0.25}>
          <IconButton size="small" title={t('Schaden melden', 'Report damage')} onClick={() => report(source.data, 'damage')}><ReportProblemOutlinedIcon fontSize="small" /></IconButton>
          <IconButton size="small" title={t('Abholung koordinieren', 'Coordinate pickup')} onClick={() => report(source.data, 'pickup')}><LocalShippingOutlinedIcon fontSize="small" /></IconButton>
        </Stack>;
        if (source.kind === 'requests' && warehouse && source.data.status !== 'resolved') return <Stack direction="row" spacing={0.25}>
          <IconButton size="small" title={t('Antworten / abschließen', 'Respond / resolve')} onClick={() => setReply(source.data)}><ReplyIcon fontSize="small" /></IconButton>
          <IconButton size="small" title={t('Artikel prüfen', 'Inspect item')} component={Link} to={`/items/${source.data.itemId}`}><OpenInNewIcon fontSize="small" /></IconButton>
        </Stack>;
        return null;
      },
    } satisfies GridColDef<EquipmentRow>] : []),
  ];
  return <Stack spacing={1}>
    {!embedded && <Typography variant="h6">{t('Meine Ausrüstung & Abholungen', 'My equipment & pickups')}</Typography>}
    {error && <Alert severity="error" action={<Button size="small" title={translate('Die Daten erneut laden', 'Retry loading the data')} onClick={() => { void custody.refetch(); void stored.refetch(); void requests.refetch(); void returns.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>{t('Deine Ausrüstung konnte nicht vollständig geladen werden.', 'Could not load all of your equipment.')}</Alert>}
    <Stack direction={{ xs: 'column', md: 'row' }} sx={{ alignItems: { md: 'center' }, gap: 1 }}>
      <Tabs value={section} onChange={(_, value: string) => setSection(value)} variant="scrollable" scrollButtons="auto"
        sx={{ minWidth: 0, flex: 1 }} aria-label={t('Ausrüstungsbereiche', 'Equipment sections')}>
        {sections.map(entry => <Tab key={entry.key} value={entry.key} label={`${entry.label} (${entry.loading ? '…' : entry.count ?? 0})`}
          id={`equipment-tab-${entry.key}`} aria-controls={`equipment-panel-${entry.key}`} />)}
      </Tabs>
      <Button size="small" sx={{ alignSelf: { xs: 'flex-end', md: 'center' }, flexShrink: 0 }} aria-haspopup="dialog" onClick={openActionInbox}>{t('Posteingang', 'Inbox')}</Button>
    </Stack>
    {section === 'requests' && <Alert severity="info" sx={{ py: 0 }}>
      {t('Schadensmeldungen sperren den Artikel bis zur Klärung. Das Lager prüft den Schaden und dokumentiert die Bestandsaktion vor dem Abschluss. Abholanfragen bewegen keinen Bestand.', 'Damage reports block the item until reviewed. Warehouse staff inspect the damage and document the stock action before closing the report. Pickup requests do not move stock.')}
    </Alert>}
    <Box role="tabpanel" id={`equipment-panel-${section}`} aria-labelledby={`equipment-tab-${section}`}>
      <DataGrid key={section} rows={rows} columns={columns} density="compact" rowHeight={isMobile ? 60 : 52} autoHeight disableRowSelectionOnClick
        loading={sections.find(entry => entry.key === section)?.loading}
        initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }} pageSizeOptions={[20, 50, 100]}
        localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
        sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
    </Box>
    {section === "requests" && requests.hasNextPage && <Button title={t("Weitere Meldungen laden", "Load more requests")} disabled={requests.isFetchingNextPage} onClick={() => { void requests.fetchNextPage(); }}>{t("Mehr laden", "Load more")}</Button>}
    {request && <OperationForm title={request.kind === 'damage' ? t('Schaden melden', 'Report damage') : t('Abholung koordinieren', 'Coordinate pickup')} onClose={() => setRequest(null)} initial={{ quantity: 1 }} fields={[{ key: 'quantity', label: t('Menge', 'Quantity'), type: 'number', required: true, min: 1, max: request.item.quantity }, { key: 'notes', label: t('Beschreibung / Termin / Kontakt', 'Description / proposed time / contact'), required: true, multiline: true }]} onSave={v => memberApi.request({ itemId: request.item.itemId, assetId: request.item.assetId, locationId: request.item.locationId, kind: request.kind, commandId: request.commandId, quantity: inputNumber(v.quantity), notes: inputText(v.notes) })} />}
    {returning && <OperationForm title={t('Rückgabe zur Prüfung melden', 'Submit return for inspection')} onClose={() => setReturning(null)} initial={{ quantity: 1 }} fields={[{ key: 'quantity', label: t('Menge', 'Quantity'), type: 'number', required: true, min: 1, max: returning.checkedOut - (returning.pendingQuantity ?? 0) }, ...(returning.factionOrderId && !returning.assetInstanceId ? [{ key: 'assetId', label: t('Geräte-ID (nur bei serialisierter Ausrüstung)', 'Asset ID (serialized equipment only)') }] : []), { key: 'notes', label: t('Ablageort / Notiz', 'Placement / notes'), required: true }]} onSave={v => memberApi.submitReturn({ quantity: inputNumber(v.quantity), notes: optionalText(v.notes), assetId: optionalText(v.assetId), custodyKey: returning.key, commandId: returnCommand })} />}
    {reply && <OperationForm title={t('Lagerantwort', 'Warehouse response')} onClose={() => setReply(null)} initial={{ response: reply.response ?? '' }} fields={[{ key: 'response', label: t('Termin / Prüfergebnis / Bestandsnachweis', 'Time / inspection result / inventory evidence'), required: true, multiline: true }, { key: 'resolved', label: t('Vorgang abgeschlossen', 'Resolved'), type: 'checkbox' }]} onSave={v => memberApi.decide(reply.id, { response: inputText(v.response), resolved: inputBoolean(v.resolved), revision: reply.revision })} />}
  </Stack>;
}
