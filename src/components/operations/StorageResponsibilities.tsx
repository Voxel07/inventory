import { useState } from 'react';
import { Chip, Checkbox, FormControlLabel, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { Button } from '../shared/ActionButtons';
import { OperationForm } from './OperationForm';
import { keeperOptions } from '../../services/assignmentOptions';
import { memberApi } from '../../services/memberService';
import type { StorageLocation } from '../../types';
import type { MemberAssignment } from '../../types/member';
import { optionalText } from '../../utils/inputValues';
import { locationPath } from '../../utils/locationHierarchy';
import { useAppLanguage, useT } from '../../utils/naming';

export function StorageResponsibilities({ locations, loading, onEditLocation }: {
    locations: StorageLocation[];
    loading: boolean;
    onEditLocation: (location: StorageLocation) => void;
}) {
    const t = useT();
    const language = useAppLanguage();
    const isMobile = useMediaQuery('(max-width:599.95px)');
    const [editing, setEditing] = useState<MemberAssignment | null>(null);
    const [missingOnly, setMissingOnly] = useState(false);
    const pending = loading;
    const rows = locations.filter((location) => location.active).map((location) => {
        const assignment = { id: location.id, name: location.name, userId: location.keeperUserId };
        const keeper = location.keeperUserId ? { name: location.keeperUserName } : undefined;
        const missing = [
            ...(!assignment?.userId ? [t('operations.storageResponsibilities.responsiblePersonMissing')] : []),
        ];
        return { id: location.id, name: locationPath(location, locations), location, assignment, keeper, missing };
    }).filter((row) => !missingOnly || row.missing.length > 0);
    const columns: GridColDef<(typeof rows)[number]>[] = [
        { field: 'name', headerName: t('common.storageLocation'), flex: 1.2, minWidth: 200 },
        { field: 'keeper', headerName: t('common.responsiblePerson'), flex: 1, minWidth: 180,
            valueGetter: (_, row) => row.keeper?.name ?? (row.assignment?.userId ? t('operations.storageResponsibilities.unknown') : t('common.unassigned')),
            renderCell: ({ value }) => <Typography variant="body2" noWrap>{value}</Typography> },
        { field: 'missing', headerName: t('operations.storageResponsibilities.missingInformation'), flex: 1.5, minWidth: 220,
            valueGetter: (_, row) => row.missing.join(', '),
            renderCell: ({ row }) => row.missing.length > 0
                ? <Tooltip title={row.missing.join(' · ')}><Typography variant="body2" color="warning.main" noWrap>{row.missing.join(' · ')}</Typography></Tooltip>
                : <Chip label={t('operations.storageResponsibilities.informationComplete')} color="success" size="small" /> },
        { field: 'actions', headerName: t('common.actions'), width: 250, sortable: false, filterable: false,
            renderCell: ({ row }) => <Stack direction="row" spacing={0.5}>
                <Button size="small" disabled={!row.assignment} onClick={() => row.assignment && setEditing(row.assignment)}>{t('operations.storageResponsibilities.assign')}</Button>
                <Button size="small" onClick={() => onEditLocation(row.location)}>{t('operations.storageResponsibilities.editLocation')}</Button>
            </Stack> },
    ];

    return <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}>
            <Typography variant="h6">{t('operations.storageResponsibilities.assignStorageResponsibility')}</Typography>
            <FormControlLabel label={t('operations.storageResponsibilities.showOnlyMissingInformation')}
                control={<Checkbox size="small" checked={missingOnly} onChange={(_, checked) => setMissingOnly(checked)} />} />
        </Stack>
        <DataGrid rows={rows} columns={columns} loading={pending} density="compact" rowHeight={isMobile ? 60 : 52} autoHeight
            disableRowSelectionOnClick initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }} pageSizeOptions={[20, 50, 100]}
            localeText={{ ...(language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText),
                noRowsLabel: missingOnly ? t('operations.storageResponsibilities.noMissingInformation') : t('operations.storageResponsibilities.noActiveStorageLocations') }}
            sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
        {editing && <OperationForm title={editing.name} onClose={() => setEditing(null)} initial={{ userId: editing.userId ?? '' }}
            fields={[{ key: 'userId', label: t('operations.storageResponsibilities.responsiblePersonEmptyRemove'), pagedOptions: { queryKey: ['users', 'assignable', 'keepers'], getPage: keeperOptions, selectedLabel: locations.find(location => location.id === editing.id)?.keeperUserName } }]}
            onSave={(values) => memberApi.assign(editing.id, optionalText(values.userId))} />}
    </Stack>;
}
