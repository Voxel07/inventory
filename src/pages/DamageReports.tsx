import { Tab } from '../components/shared/ActionButtons';
import { useAuth } from '../hooks/useAuth';
import { canPerformCustody } from '../utils/access';
import { useState } from 'react';
import { Box, Typography, Tabs } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { DamageReportsList } from '../components/lists/DamageReportsList';
import { useDamageReports, useUpdateDamageReport, useUpdateDamageReportStatus } from '../hooks/useDamageReports';
import { useAssemblies } from '../hooks/useAssemblies';
import { useAllUsers } from '../hooks/useUsers';
import { OPEN_DAMAGE_STATUSES } from '../types/damageReport';
import { useUIStore } from '../store/uiStore';
import { TooltipButton } from '../components/shared/TooltipButton';
import type { DamageReportUpdateData, DamageStatus } from '../types';
import { translate, useLocalizedText } from '../utils/naming';

export function DamageReportsPage() {
    const t = useLocalizedText();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
    // The open/history split is a server filter; history lists every report.
    const reports = useDamageReports(undefined, activeTab === 'open' ? { status: OPEN_DAMAGE_STATUSES } : undefined);
    const { data: assemblies } = useAssemblies();
    const { data: users } = useAllUsers();
    const updateStatus = useUpdateDamageReportStatus();
    const updateReport = useUpdateDamageReport();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [formOpen, setFormOpen] = useState(false);

    function handleStatusUpdate(id: string, status: DamageStatus, amount?: number, notes?: string, itemHint?: string) {
        updateStatus.mutate(
            { id, status, amount, notes, itemHint },
            {
                onSuccess: () => showSnackbar(
                    status === 'repaired'
                        ? t(`${amount} Einheit(en) als repariert gebucht`, `Recorded ${amount} repaired unit(s)`)
                        : status === 'written_off'
                            ? t(`${amount} Einheit(en) abgeschrieben`, `Wrote off ${amount} unit(s)`)
                            : t('Status aktualisiert', 'Status updated'),
                    'success',
                ),
                onError: () => showSnackbar(t('Fehler beim Aktualisieren des Status', 'Could not update status'), 'error'),
            },
        );
    }

    function handleEdit(id: string, data: DamageReportUpdateData) {
        updateReport.mutate({ id, data }, {
            onSuccess: () => showSnackbar(t('Schadensbericht aktualisiert', 'Damage report updated'), 'success'),
            onError: () => showSnackbar(t('Fehler beim Aktualisieren des Schadensberichts', 'Could not update damage report'), 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">{t('Schadensberichte', 'Damage reports')}</Typography>
                <TooltipButton
                    tooltipText={t('Einen beschädigten oder defekten Artikel melden', 'Report a damaged or defective item')}
                    icon={<AddIcon />}
                    label={t('Schaden melden', 'Report damage')}
                    variant="contained"
                    color="error"
                    disabled={!canPerformCustody(user)} onClick={() => setFormOpen(true)}
                />
            </Box>

            <Tabs value={activeTab} onChange={(_, value: 'open' | 'history') => setActiveTab(value)} sx={{ mb: 2 }}>
                <Tab title={translate('Offene Schadensberichte anzeigen', 'Display open damage reports')} value="open" label={t('Offen', 'Open')} />
                <Tab title={translate('Abgeschlossene Schadensberichte anzeigen', 'Display resolved damage reports')} value="history" label={t('Verlauf', 'History')} />
            </Tabs>

            <DamageReportsList
                key={activeTab}
                reports={reports.data}
                list={reports}
                assemblies={assemblies}
                users={users}
                isLoading={reports.isLoading}
                loadError={reports.isError}
                onRetry={() => { void reports.refetch(); }}
                view={activeTab}
                isUpdating={updateStatus.isPending || updateReport.isPending}
                onUpdateStatus={handleStatusUpdate}
                onEdit={handleEdit}
            />

            <DamageReportDialog open={formOpen} onClose={() => setFormOpen(false)} title={t('Schaden melden', 'Report damage')}
                assemblies={assemblies ?? []} />
        </Box>
    );
}
