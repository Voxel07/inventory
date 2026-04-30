import { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DamageReportForm } from '../components/forms/DamageReportForm';
import { DamageReportsList } from '../components/lists/DamageReportsList';
import { useDamageReports, useCreateDamageReport, useUpdateDamageReportStatus } from '../hooks/useDamageReports';
import { useItems } from '../hooks/useItems';
import { useUIStore } from '../store/uiStore';
import type { DamageReportFormData, DamageStatus } from '../types';

export function DamageReportsPage() {
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
                showSnackbar('Damage report submitted', 'success');
            },
            onError: () => showSnackbar('Failed to submit report', 'error'),
        });
    }

    function handleStatusUpdate(id: string, status: DamageStatus) {
        updateStatus.mutate(
            { id, status },
            {
                onSuccess: () => showSnackbar('Status updated', 'success'),
                onError: () => showSnackbar('Failed to update status', 'error'),
            },
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Damage Reports</Typography>
                <Button variant="contained" color="error" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
                    Report Damage
                </Button>
            </Box>

            <DamageReportsList
                reports={reports}
                items={items}
                isLoading={isLoading}
                onUpdateStatus={handleStatusUpdate}
            />

            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Report Damage</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <DamageReportForm items={items ?? []} onSubmit={handleSubmit} isLoading={createReport.isPending} />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
