import { useState } from 'react';
import { Box, Tabs, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Tab } from '../components/shared/ActionButtons';
import { PageHeader } from '../components/shared/PageHeader';
import { ServerListPagination } from '../components/shared/ServerListPagination';
import { TooltipButton } from '../components/shared/TooltipButton';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { DamageReportsList } from '../components/lists/DamageReportsList';
import { useAuth } from '../hooks/useAuth';
import { useAssemblies } from '../hooks/useAssemblies';
import { useDamageReportsPage, useUpdateDamageReport, useUpdateDamageReportStatus } from '../hooks/useDamageReports';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { CLOSED_DAMAGE_STATUSES, OPEN_DAMAGE_STATUSES } from '../types/damageReport';
import { useUIStore } from '../store/uiStore';
import { canPerformCustody } from '../utils/access';
import type { DamageReportUpdateData, DamageStatus } from '../types';
import { translate, useT } from '../utils/naming';

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
    const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search.trim());
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
            <Tabs value={activeTab} onChange={(_, value: 'open' | 'history') => setActiveTab(value)} sx={{ mb: 2 }}>
                <Tab title={translate('pages.damageReports.displayOpenDamageReports')} value="open" label={t('pages.damageReports.open')} />
                <Tab title={translate('pages.damageReports.displayResolvedDamageReports')} value="history" label={t('common.history')} />
            </Tabs>
            <TextField type="search" label={t('lists.damageReportsList.searchDamageReports')} value={search}
                onChange={(event) => setSearch(event.target.value)} size="small" fullWidth sx={{ mb: 1.5 }} />
            <DamageReportResults key={`${activeTab}:${debouncedSearch}`} view={activeTab} search={debouncedSearch} />
            <DamageReportDialog open={formOpen} onClose={() => setFormOpen(false)} title={t('common.reportDamage')}
                assemblies={assemblies ?? []} />
        </Box>
    );
}
