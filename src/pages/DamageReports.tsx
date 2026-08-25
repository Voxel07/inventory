import { useState } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DamageReportForm } from '../components/forms/DamageReportForm';
import { DamageReportsList } from '../components/lists/DamageReportsList';
import { useDamageReports, useCreateDamageReport, useUpdateDamageReportStatus } from '../hooks/useDamageReports';
import { useItems } from '../hooks/useItems';
import { useUIStore } from '../store/uiStore';
import { TooltipButton } from '../components/shared/TooltipButton';
import type { DamageReportFormData, DamageStatus } from '../types';
import { useTranslate } from '../utils/naming';

export function DamageReportsPage() {
    const t = useTranslate();
    const { data: reports, isLoading } = useDamageReports();
    const { data: items } = useItems();
    const createReport = useCreateDamageReport();
    const updateStatus = useUpdateDamageReportStatus();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [formOpen, setFormOpen] = useState(false);

    function handleSubmit(data: DamageReportFormData) {
        createReport.mutate(data, {
            onSuccess: () => {
                setFormOpen(false);
                showSnackbar(t('Schadensbericht übermittelt', 'Damage report submitted'), 'success');
            },
            onError: () => showSnackbar(t('Fehler beim Übermitteln des Schadensberichts', 'Could not submit damage report'), 'error'),
        });
    }

    function handleStatusUpdate(id: string, status: DamageStatus) {
        updateStatus.mutate(
            { id, status },
            {
                onSuccess: () => showSnackbar(t('Status aktualisiert', 'Status updated'), 'success'),
                onError: () => showSnackbar(t('Fehler beim Aktualisieren des Status', 'Could not update status'), 'error'),
            },
        );
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
                    onClick={() => setFormOpen(true)}
                />
            </Box>

            <DamageReportsList
                reports={reports}
                items={items}
                isLoading={isLoading}
                onUpdateStatus={handleStatusUpdate}
            />

            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('Schaden melden', 'Report damage')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <DamageReportForm items={items ?? []} onSubmit={handleSubmit} isLoading={createReport.isPending} />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
