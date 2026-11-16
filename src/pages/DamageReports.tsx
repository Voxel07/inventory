import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RepairsPanel } from '../components/operations/RepairsPanel';
import { Box, Stack, Tabs } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Tab } from '../components/shared/ActionButtons';
import { PageHeader } from '../components/shared/PageHeader';
import { TaskToolbar } from '../components/operations/TaskToolbar';
import { ServerListPagination } from '../components/shared/ServerListPagination';
import { TooltipButton } from '../components/shared/TooltipButton';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { DamageReportsList } from '../components/lists/DamageReportsList';
import { useAuth } from '../hooks/useAuth';
import { useAssemblies } from '../hooks/useAssemblies';
import { useDamageReportsPage, useUpdateDamageReport, useUpdateDamageReportStatus } from '../hooks/useDamageReports';
import { useTaskFilters } from '../hooks/useWarehouseTasks';
import { CLOSED_DAMAGE_STATUSES, OPEN_DAMAGE_STATUSES } from '../types/damageReport';
import { useUIStore } from '../store/uiStore';
import { canPerformCustody } from '../utils/access';
import type { DamageReportUpdateData, DamageStatus } from '../types';
import { useT } from '../utils/naming';

/** Remount on tab/search changes so every result set starts on its first page. */
function DamageReportResults({ view, search }: { view: 'open' | 'history'; search: string }) {
    const t = useT();
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(20);
    const reports = useDamageReportsPage({
        status: view === 'open' ? OPEN_DAMAGE_STATUSES : CLOSED_DAMAGE_STATUSES,
        search: search || undefined,
    }, page, size);
    const updateStatus = useUpdateDamageReportStatus();
    const updateReport = useUpdateDamageReport();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    async function handleStatusUpdate(id: string, status: DamageStatus, amount: number, notes: string) {
        try {
            const report = await updateStatus.mutateAsync({ id, status, amount, notes });
            // Resolving the final row on a later page returns to the preceding page.
            if (view === 'open' && CLOSED_DAMAGE_STATUSES.includes(report.status) && reports.data?.rows.length === 1 && page > 0) {
                setPage(page - 1);
            }
            showSnackbar(status === 'repaired'
                ? t('pages.damageReports.recordedAmountRepairedUnitS', { amount })
                : t('pages.damageReports.wroteOffAmountUnitS', { amount }), 'success');
        } catch (error) {
            showSnackbar(t('pages.damageReports.couldNotUpdateStatus'), 'error');
            throw error;
        }
    }

    async function handleEdit(id: string, data: DamageReportUpdateData) {
        try {
            await updateReport.mutateAsync({ id, data });
            showSnackbar(t('pages.damageReports.damageReportUpdated'), 'success');
        } catch (error) {
            showSnackbar(t('pages.damageReports.couldNotUpdateDamageReport'), 'error');
            throw error;
        }
    }

    return <>
        <DamageReportsList
            reports={reports.data?.rows}
            isLoading={reports.isLoading}
            loadError={reports.isError}
            onRetry={() => { void reports.refetch(); }}
            searching={Boolean(search)}
            view={view}
            isUpdating={updateStatus.isPending || updateReport.isPending}
            onUpdateStatus={handleStatusUpdate}
            onEdit={handleEdit}
        />
        <ServerListPagination page={page} size={size} rowCount={reports.data?.rows.length ?? 0}
            more={reports.data?.more ?? false} loading={reports.isFetching}
            onPageChange={setPage} onSizeChange={(value) => { setSize(value); setPage(0); }} />
    </>;
}

export function DamageReportsPage() {
    const t = useT();
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const activeTab = params.get('tab') === 'repairs' ? 'repairs' : 'reports';
    const filters = useTaskFilters('damage', { status: 'open' });
    const view = filters.values.status === 'history' ? 'history' : 'open';
    const search = filters.query.search ?? '';
    const { data: assemblies } = useAssemblies();
    const [formOpen, setFormOpen] = useState(false);

    return (
        <Box>
            <PageHeader title={t('nav.damageReports')} actions={
                <TooltipButton
                    tooltipText={t('pages.damageReports.reportADamagedOrDefectiveItem')}
                    icon={<AddIcon />} label={t('common.reportDamage')} variant="contained" color="error"
                    disabled={!canPerformCustody(user)} onClick={() => setFormOpen(true)}
                />
            } />
            <Tabs value={activeTab} onChange={(_, value: string) => setParams(current => { current.set('tab', value); return current; })}
                sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Tab value="reports" label={t('pages.damageReports.reports')} />
                <Tab value="repairs" label={t('pages.operations.repairs')} />
            </Tabs>
            <Stack spacing={2}>
                {activeTab === 'repairs' ? <RepairsPanel /> : <>
                    <TaskToolbar state={filters} searchLabel={t('lists.damageReportsList.searchDamageReports')} filters={[{ key: 'status', label: t('common.status'), options: [
                        { value: 'open', label: t('operations.tasks.open') }, { value: 'history', label: t('operations.tasks.history') },
                    ] }]} />
                    <Box><DamageReportResults key={`${view}:${search}`} view={view} search={search} /></Box>
                </>}
            </Stack>
            <DamageReportDialog open={formOpen} onClose={() => setFormOpen(false)} title={t('common.reportDamage')}
                assemblies={assemblies ?? []} />
        </Box>
    );
}
