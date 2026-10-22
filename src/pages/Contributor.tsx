import { formatDateTime } from '../utils/dateFormat';
import { Button, IconButton, Tab } from '../components/shared/ActionButtons';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Stack, Tabs, TextField, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { DataGrid, type GridColDef, type GridColumnVisibilityModel } from '@mui/x-data-grid';
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
import type { MemberStored as Stored, MemberRequest as Request } from '../types/member';
import { inputNumber, inputText, optionalText, inputBoolean } from '../utils/inputValues';
import { useAuth } from '../hooks/useAuth';
import { useReturnSubmissions } from '../hooks/useReturnSubmissions';
import { canOperateWarehouse, canOrder } from '../utils/access';
import { nameFor, translate, useAppLanguage, useT } from '../utils/naming';
import { SEVERITY_LEVELS } from '../utils/constants';
import type { DamageSeverity } from '../types';
import { OperationForm } from '../components/operations/OperationForm';
import { ActionMenu, type Action } from '../components/shared/ActionBar';
import { factionOrderOf } from '../utils/custody';

type EquipmentSource =
  | { kind: 'custody'; data: MemberCustody }
  | { kind: 'stored'; data: MemberStored }
  | { kind: 'requests'; data: MemberRequest }
  | { kind: 'returns'; data: ReturnSubmission };
type EquipmentRow = { id: string; name: string; quantity: number; event?: string; location?: string; pending?: number; status?: string; kind?: string; requester?: string; created?: string; notes?: string; source: EquipmentSource };

const SECTIONS = ['custody', 'stored', 'requests', 'returns'];

export function Contributor({ embedded = false }: { embedded?: boolean }) {
  const t = useT(); const { user } = useAuth(); const warehouse = canOperateWarehouse(user); const writable = canOrder(user);
  const { custody, stored, requests } = useMember(); const returns = useReturnSubmissions();
  const [request, setRequest] = useState<{ item: Stored; kind: string; commandId: string } | null>(null);
  const [returning, setReturning] = useState<NonNullable<typeof custody.data>[number] | null>(null);
  const [returnCommand, setReturnCommand] = useState('');
  const [reply, setReply] = useState<Request | null>(null);
  const error = custody.error || stored.error || requests.error || returns.error;
  const report = (item: Stored, kind: string) => setRequest({ item, kind, commandId: crypto.randomUUID() });
  const assetDamage = request?.kind === 'damage' && Boolean(request.item.assetId);
  const language = useAppLanguage();
  const isMobile = useMediaQuery('(max-width:599.95px)');
  const narrow = useMediaQuery('(max-width:899.95px)');
  // Inbox deep links (/?equipment=<section>&focus=<row id>) select the section and highlight the task row.
  const [params] = useSearchParams();
  const linkedSection = params.get('equipment');
  const focus = params.get('focus');
  const [section, setSection] = useState(linkedSection && SECTIONS.includes(linkedSection) ? linkedSection : 'custody');
  const [linked, setLinked] = useState(linkedSection);
  if (linked !== linkedSection) {
    setLinked(linkedSection);
    if (linkedSection && SECTIONS.includes(linkedSection)) setSection(linkedSection);
  }
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [focus, linkedSection]);
  const myReturns = returns.data?.filter(row => row.returnedForUserId === user?.id) ?? [];
  const sections = [
    { key: 'custody', label: t('pages.contributor.inMyCustody'), count: custody.data?.length, loading: custody.isLoading },
    { key: 'stored', label: t('pages.contributor.storedWithMe'), count: stored.data?.length, loading: stored.isLoading },
    { key: 'requests', label: t('pages.contributor.reportsCoordination'), count: requests.data?.length, loading: requests.isLoading },
    { key: 'returns', label: t('pages.contributor.returnStatus'), count: myReturns.length, loading: returns.isLoading },
  ];
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const sectionRows: EquipmentRow[] = section === 'custody' ? (custody.data ?? []).map(row => ({
    id: row.key, name: row.name, quantity: row.checkedOut, event: row.event, location: row.storageLocation,
    pending: row.pendingQuantity ?? 0, source: { kind: 'custody', data: row },
  })) : section === 'stored' ? (stored.data ?? []).map((row, index) => ({
    id: `${row.itemId}:${row.locationId}:${row.assetId}:${index}`, name: row.name, quantity: row.quantity,
    location: [row.location, row.assetCode].filter(Boolean).join(' · '), source: { kind: 'stored', data: row },
  })) : section === 'requests' ? (requests.data ?? []).map(row => ({
    id: row.id, name: row.item, quantity: row.quantity, status: row.status,
    kind: row.kind === 'damage' ? t('common.damage') : t('common.pickup'), requester: row.requester,
    created: formatDateTime(row.createdAt), notes: [row.notes, row.response].filter(Boolean).join(' — '),
    source: { kind: 'requests', data: row },
  })) : myReturns.map(row => ({
    id: row.id, name: row.itemName, quantity: row.quantity, status: row.status, notes: row.acknowledgementNotes,
    source: { kind: 'returns', data: row },
  }));
  const filteredRows = query ? sectionRows.filter(row => [row.name, row.event, row.location, row.requester, row.notes]
    .some(value => value?.toLocaleLowerCase().includes(query))) : sectionRows;
  // The linked task leads the first page.
  const rows = focus ? [...filteredRows.filter(row => row.id === focus), ...filteredRows.filter(row => row.id !== focus)] : filteredRows;
  // Narrow screens keep item, quantity and actions; the other columns move under the item name.
  const secondary = (row: EquipmentRow) => [
    row.pending ? `${t('pages.contributor.awaitingAcknowledgement')}: ${row.pending}` : '',
    row.event, row.location, row.kind, row.requester, row.created, row.status, row.notes,
  ].filter(Boolean).join(' · ');
  const columnVisibilityModel: GridColumnVisibilityModel = Object.fromEntries(
    ['pending', 'event', 'location', 'kind', 'requester', 'created', 'status', 'notes'].map((field) => [field, !narrow]));
  function rowActions(row: EquipmentRow): Action[] {
    const source = row.source;
    const damage = (item: Stored): Action => ({ key: 'damage', label: t('common.reportDamage'), icon: <ReportProblemOutlinedIcon fontSize="small" />, onClick: () => report(item, 'damage') });
    const pickup = (item: Stored): Action => ({ key: 'pickup', label: t('pages.contributor.coordinatePickup'), icon: <LocalShippingOutlinedIcon fontSize="small" />, onClick: () => report(item, 'pickup') });
    if (source.kind === 'custody' && writable) {
      const data = source.data;
      const item: Stored = { itemId: data.itemId, name: data.name, assetId: data.assetInstanceId, quantity: data.checkedOut };
      return [
        { key: 'return', label: t('pages.contributor.submitReturn'), icon: <AssignmentReturnIcon fontSize="small" />, disabled: data.checkedOut <= (data.pendingQuantity ?? 0),
          onClick: () => { setReturnCommand(crypto.randomUUID()); setReturning(data); } },
        damage(item), pickup(item),
      ];
    }
    if (source.kind === 'stored' && writable) return [damage(source.data), pickup(source.data)];
    if (source.kind === 'requests' && warehouse && source.data.status !== 'resolved') return [
      { key: 'reply', label: t('pages.contributor.respondResolve'), icon: <ReplyIcon fontSize="small" />, onClick: () => setReply(source.data) },
      { key: 'inspect', label: t('pages.contributor.inspectItem'), icon: <OpenInNewIcon fontSize="small" />,
        to: source.data.assetId ? `/items/${source.data.itemId}/assets/${source.data.assetId}` : `/items/${source.data.itemId}` },
    ];
    return [];
  }
  const columns: GridColDef<EquipmentRow>[] = [
    { field: 'name', headerName: t('common.item'), flex: 1.3, minWidth: narrow ? 140 : 180,
      renderCell: ({ value, row }) => <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap={narrow} sx={{ fontWeight: 600 }}>{value}</Typography>
        {narrow && secondary(row) && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{secondary(row)}</Typography>}
      </Box> },
    { field: 'quantity', headerName: t('common.quantity'), type: 'number', width: 85 },
    ...(section === 'custody' ? [
      { field: 'pending', headerName: t('pages.contributor.awaitingAcknowledgement'), type: 'number', width: 180 },
      { field: 'event', headerName: t('nav.event'), width: 140 },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(['custody', 'stored'].includes(section) ? [
      { field: 'location', headerName: section === 'custody' ? t('common.returnLocation') : t('pages.contributor.locationAsset'), flex: 1, minWidth: 180 },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(section === 'requests' ? [
      { field: 'kind', headerName: t('common.type'), width: 100 },
      { field: 'requester', headerName: t('pages.contributor.requester'), width: 150 },
      { field: 'created', headerName: t('common.date'), width: 165 },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(['requests', 'returns'].includes(section) ? [
      { field: 'status', headerName: t('common.status'), width: 120 },
      { field: 'notes', headerName: t('pages.contributor.notesResponse'), flex: 1.5, minWidth: 240,
        renderCell: ({ value }) => <Tooltip title={value ?? ''}><Typography variant="body2" noWrap>{value || '—'}</Typography></Tooltip> },
    ] satisfies GridColDef<EquipmentRow>[] : []),
    ...(section !== 'returns' && (writable || warehouse) ? [{
      field: 'actions', headerName: isMobile ? '' : t('common.actions'), width: isMobile ? 56 : 125, sortable: false, filterable: false,
      renderCell: ({ row }) => {
        const actions = rowActions(row);
        if (!actions.length) return null;
        // Phones get one menu instead of a row of icons, so the item name keeps the width.
        if (isMobile) return <ActionMenu actions={actions} />;
        return <Stack direction="row" spacing={0.25}>
          {actions.map((action) => <IconButton key={action.key} size="small" title={action.label} disabled={action.disabled} onClick={action.onClick}
            {...(action.to ? { component: Link, to: action.to } : {})}>{action.icon}</IconButton>)}
        </Stack>;
      },
    } satisfies GridColDef<EquipmentRow>] : []),
  ];

  return <Stack spacing={1}>
    {!embedded && <Typography variant="h6">{t('pages.contributor.myEquipmentPickups')}</Typography>}
    {error && <Alert severity="error" action={<Button size="small" title={translate('common.retryLoadingTheData')} onClick={() => { void custody.refetch(); void stored.refetch(); void requests.refetch(); void returns.refetch(); }}>{t('common.retry')}</Button>}>{t('pages.contributor.couldNotLoadAllOfYourEquipment')}</Alert>}
    <Tabs value={section} onChange={(_, value: string) => setSection(value)} variant="scrollable" scrollButtons="auto"
      sx={{ minWidth: 0 }} aria-label={t('pages.contributor.equipmentSections')}>
      {sections.map(entry => <Tab key={entry.key} value={entry.key} label={`${entry.label} (${entry.loading ? '…' : entry.count ?? 0})`}
        id={`equipment-tab-${entry.key}`} aria-controls={`equipment-panel-${entry.key}`} />)}
    </Tabs>
    <TextField type="search" label={t('pages.contributor.searchEquipment')} value={search}
      onChange={(event) => setSearch(event.target.value)} size="small" fullWidth />
    {section === 'requests' && <Alert severity="info" sx={{ py: 0 }}>
      {t('pages.contributor.damageToASerializedUnitIsFiledAsADamage')}
    </Alert>}
    <Box ref={panel} role="tabpanel" id={`equipment-panel-${section}`} aria-labelledby={`equipment-tab-${section}`} sx={{ scrollMarginTop: 80 }}>
      <DataGrid key={section} rows={rows} columns={columns} columnVisibilityModel={columnVisibilityModel} density="compact" rowHeight={isMobile ? 60 : 52} autoHeight disableRowSelectionOnClick
        loading={sections.find(entry => entry.key === section)?.loading}
        initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }} pageSizeOptions={[20, 50, 100]}
        localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
        getRowClassName={({ id }) => id === focus ? 'linked-task' : ''}
        sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' }, '& .linked-task': { bgcolor: 'action.selected' } }} />
    </Box>
    {section === "requests" && requests.hasNextPage && <Button title={t('pages.contributor.loadMoreRequests')} disabled={requests.isFetchingNextPage} onClick={() => { void requests.fetchNextPage(); }}>{t('pages.contributor.loadMore')}</Button>}
    {request && <OperationForm title={request.kind === 'damage' ? t('common.reportDamage') : t('pages.contributor.coordinatePickup')} onClose={() => setRequest(null)} initial={{ quantity: 1 }} fields={[{ key: 'quantity', label: t('common.quantity'), type: 'number', required: true, min: 1, max: request.item.quantity }, ...(assetDamage ? [{ key: 'severity', label: t('common.severity'), required: true, options: SEVERITY_LEVELS.map(value => ({ value, label: nameFor('severity', value) })) }] : []), { key: 'notes', label: t('pages.contributor.descriptionProposedTimeContact'), required: true, multiline: true }]} onSave={v => memberApi.request({ itemId: request.item.itemId, assetId: request.item.assetId, locationId: request.item.locationId, kind: request.kind, commandId: request.commandId, quantity: inputNumber(v.quantity), notes: inputText(v.notes), severity: assetDamage ? inputText(v.severity) as DamageSeverity : undefined })} />}
    {returning && <OperationForm title={t('pages.contributor.submitReturnForInspection')} onClose={() => setReturning(null)} initial={{ quantity: 1 }} fields={[{ key: 'quantity', label: t('common.quantity'), type: 'number', required: true, min: 1, max: returning.checkedOut - (returning.pendingQuantity ?? 0) }, ...(factionOrderOf(returning) && !returning.assetInstanceId ? [{ key: 'assetId', label: t('pages.contributor.assetIDSerializedEquipmentOnly') }] : []), { key: 'notes', label: t('pages.contributor.placementNotes'), required: true }]} onSave={v => memberApi.submitReturn({ quantity: inputNumber(v.quantity), notes: optionalText(v.notes), assetId: optionalText(v.assetId), custodyKey: returning.key, commandId: returnCommand })} />}
    {reply && <OperationForm title={t('pages.contributor.warehouseResponse')} onClose={() => setReply(null)} initial={{ response: reply.response ?? '' }} fields={[{ key: 'response', label: t('pages.contributor.timeInspectionResultInventoryEvidence'), required: true, multiline: true }, { key: 'resolved', label: t('pages.contributor.resolved'), type: 'checkbox' }]} onSave={v => memberApi.decide(reply.id, { response: inputText(v.response), resolved: inputBoolean(v.resolved), revision: reply.revision })} />}
  </Stack>;
}
