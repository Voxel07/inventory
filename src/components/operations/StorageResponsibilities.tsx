import { useState } from 'react';
import { Alert, Chip, Checkbox, FormControlLabel, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Button } from '../shared/ActionButtons';
import { OperationForm } from './OperationForm';
import { useMemberAssignments } from '../../hooks/useMember';
import { useAssignableUsers } from '../../hooks/useUsers';
import { memberApi } from '../../services/memberService';
import type { StorageLocation } from '../../types';
import type { MemberAssignment } from '../../types/member';
import { optionalText } from '../../utils/inputValues';
import { locationPath } from '../../utils/locationHierarchy';
import { useAppLanguage, useLocalizedText } from '../../utils/naming';

export function StorageResponsibilities({ locations, loading, onEditLocation }: {
    locations: StorageLocation[];
    loading: boolean;
    onEditLocation: (location: StorageLocation) => void;
}) {
    const t = useLocalizedText();
    const language = useAppLanguage();
    const isMobile = useMediaQuery('(max-width:599.95px)');
    const assignments = useMemberAssignments();
    const users = useAssignableUsers();
    const [editing, setEditing] = useState<MemberAssignment | null>(null);
    const [missingOnly, setMissingOnly] = useState(false);
    const pending = loading || assignments.isLoading || users.isLoading || (!users.isError && !users.isComplete);
    const error = assignments.error || users.error;
    const rows = locations.filter((location) => location.active).map((location) => {
        const assignment = assignments.data?.find((row) => row.id === location.id);
        const keeper = users.data?.find((person) => person.id === assignment?.userId);
        const missing = [
            ...(!assignment?.userId ? [t('Verantwortliche Person fehlt', 'Responsible person missing')] : []),
            ...(!location.warehouseId ? [t('Standort fehlt', 'Warehouse missing')] : []),
            ...(!location.location?.trim() ? [t('Ort / Gebäude fehlt', 'Location / building missing')] : []),
        ];
        return { id: location.id, name: locationPath(location, locations), location, assignment, keeper, missing };
    }).filter((row) => !missingOnly || row.missing.length > 0);
    const columns: GridColDef<(typeof rows)[number]>[] = [
        { field: 'name', headerName: t('Lagerort', 'Storage location'), flex: 1.2, minWidth: 200 },
        { field: 'keeper', headerName: t('Verantwortliche Person', 'Responsible person'), flex: 1, minWidth: 180,
            valueGetter: (_, row) => row.keeper?.name ?? (row.assignment?.userId ? t('Unbekannt', 'Unknown') : t('Nicht zugewiesen', 'Unassigned')),
            renderCell: ({ row, value }) => <Tooltip title={row.keeper?.email ?? ''}>
                <Typography variant="body2" noWrap>{value}</Typography></Tooltip> },
        { field: 'missing', headerName: t('Fehlende Angaben', 'Missing information'), flex: 1.5, minWidth: 220,
            valueGetter: (_, row) => row.missing.join(', '),
            renderCell: ({ row }) => row.missing.length > 0
                ? <Tooltip title={row.missing.join(' · ')}><Typography variant="body2" color="warning.main" noWrap>{row.missing.join(' · ')}</Typography></Tooltip>
                : <Chip label={t('Angaben vollständig', 'Information complete')} color="success" size="small" /> },
        { field: 'actions', headerName: t('Aktionen', 'Actions'), width: 250, sortable: false, filterable: false,
            renderCell: ({ row }) => <Stack direction="row" spacing={0.5}>
                <Button size="small" disabled={!row.assignment} onClick={() => row.assignment && setEditing(row.assignment)}>{t('Zuweisen', 'Assign')}</Button>
                <Button size="small" onClick={() => onEditLocation(row.location)}>{t('Lagerort bearbeiten', 'Edit location')}</Button>
            </Stack> },
    ];

    return <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}>
            <Typography variant="h6">{t('Lager-Verantwortung zuweisen', 'Assign storage responsibility')}</Typography>
            <FormControlLabel label={t('Nur fehlende Angaben anzeigen', 'Show only missing information')}
                control={<Checkbox size="small" checked={missingOnly} onChange={(_, checked) => setMissingOnly(checked)} />} />
        </Stack>
        {error && <Alert severity="error" action={<Button onClick={() => { void assignments.refetch(); void users.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>{error.message}</Alert>}
        <DataGrid rows={error ? [] : rows} columns={columns} loading={pending} density="compact" rowHeight={isMobile ? 60 : 52} autoHeight
            disableRowSelectionOnClick initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }} pageSizeOptions={[20, 50, 100]}
            localeText={{ ...(language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText),
                noRowsLabel: missingOnly ? t('Keine fehlenden Angaben.', 'No missing information.') : t('Keine aktiven Lagerorte.', 'No active storage locations.') }}
            sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
        {editing && <OperationForm title={editing.name} onClose={() => setEditing(null)} initial={{ userId: editing.userId ?? '' }}
            fields={[{ key: 'userId', label: t('Verantwortliche Person (leer = entfernen)', 'Responsible person (empty = remove)'), options: (users.data ?? []).filter((person) => person.role !== 'read_only').map((person) => ({ value: person.id, label: person.name })) }]}
            onSave={(values) => memberApi.assign(editing.id, optionalText(values.userId))} />}
    </Stack>;
}
