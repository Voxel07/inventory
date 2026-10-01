import { useState } from 'react';
import { Alert, Card, CardContent, Chip, Checkbox, FormControlLabel, LinearProgress, Stack, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { OperationForm } from './OperationForm';
import { useMemberAssignments } from '../../hooks/useMember';
import { useAssignableUsers } from '../../hooks/useUsers';
import { memberApi } from '../../services/memberService';
import type { StorageLocation } from '../../types';
import type { MemberAssignment } from '../../types/member';
import { optionalText } from '../../utils/inputValues';
import { locationPath } from '../../utils/locationHierarchy';
import { useLocalizedText } from '../../utils/naming';
import { useClientPagination } from '../../hooks/useClientPagination';
import { ListPagination } from '../shared/ListPagination';

export function StorageResponsibilities({ locations, loading, onEditLocation }: {
    locations: StorageLocation[];
    loading: boolean;
    onEditLocation: (location: StorageLocation) => void;
}) {
    const t = useLocalizedText();
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
        return { location, assignment, keeper, missing };
    }).filter((row) => !missingOnly || row.missing.length > 0);
    const { pageItems, page, setPage, pageSize, onPageSizeChange } = useClientPagination(rows);

    return <Stack spacing={2}>
        <Typography variant="h6">{t('Lager-Verantwortung zuweisen', 'Assign storage responsibility')}</Typography>
        <FormControlLabel label={t('Nur fehlende Angaben anzeigen', 'Show only missing information')}
            control={<Checkbox checked={missingOnly} onChange={(_, checked) => { setMissingOnly(checked); setPage(1); }} />} />
        {pending && <LinearProgress />}
        {error && <Alert severity="error" action={<Button onClick={() => { void assignments.refetch(); void users.refetch(); }}>{t('Erneut laden', 'Retry')}</Button>}>{error.message}</Alert>}
        {!pending && !error && pageItems.map(({ location, assignment, keeper, missing }) => <Card key={location.id}>
            <CardContent><Stack spacing={1.5}>
                <Typography variant="h6">{locationPath(location, locations)}</Typography>
                <Typography>{t('Verantwortliche Person', 'Responsible person')}: {keeper?.name ?? (assignment?.userId ? t('Unbekannt', 'Unknown') : t('Nicht zugewiesen', 'Unassigned'))}</Typography>
                {keeper?.email && <Typography color="text.secondary">{keeper.email}</Typography>}
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {missing.map((label) => <Chip key={label} label={label} color="warning" size="small" />)}
                    {!missing.length && <Chip label={t('Angaben vollständig', 'Information complete')} color="success" size="small" />}
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="outlined" disabled={!assignment} onClick={() => assignment && setEditing(assignment)}>{t('Verantwortung zuweisen', 'Assign responsibility')}</Button>
                    <Button onClick={() => onEditLocation(location)}>{t('Fehlende Angaben ergänzen / Lagerort bearbeiten', 'Complete information / edit location')}</Button>
                </Stack>
            </Stack></CardContent>
        </Card>)}
        {!pending && !error && rows.length === 0 && <Alert severity="info">{missingOnly ? t('Keine fehlenden Angaben.', 'No missing information.') : t('Keine aktiven Lagerorte.', 'No active storage locations.')}</Alert>}
        {!pending && !error && <ListPagination count={rows.length} page={page} onChange={setPage} pageSize={pageSize} onPageSizeChange={onPageSizeChange} />}
        {editing && <OperationForm title={editing.name} onClose={() => setEditing(null)} initial={{ userId: editing.userId ?? '' }}
            fields={[{ key: 'userId', label: t('Verantwortliche Person (leer = entfernen)', 'Responsible person (empty = remove)'), options: (users.data ?? []).filter((person) => person.role !== 'read_only').map((person) => ({ value: person.id, label: person.name })) }]}
            onSave={(values) => memberApi.assign(editing.id, optionalText(values.userId))} />}
    </Stack>;
}
