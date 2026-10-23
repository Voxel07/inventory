import { DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import type { DamageReport } from '../../types';
import { useT } from '../../utils/naming';
import { formatStatus } from '../../utils/formatters';
import { formatDateTime } from '../../utils/dateFormat';

interface Props {
    report: DamageReport;
    targetName: string;
    onClose: () => void;
}

export function DamageReportInfoDialog({ report, targetName, onClose }: Props) {
    const t = useT();
    const activity = report.statusHistory ?? [];
    const userName = (id?: string) => {
        const actor = id === report.reportedBy ? report.expand?.reportedBy
            : id === report.handledBy ? report.expand?.handledBy : undefined;
        return actor?.name?.trim() || actor?.username?.trim() || id || '—';
    };

    return <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('lists.damageReportsList.damageReportDetails')}</DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
            <Stack spacing={2} sx={{ overflowWrap: 'anywhere' }}>
                <Typography sx={{ fontWeight: 600 }}>{targetName}</Typography>
                <Stack spacing={0.5}>
                    <Typography variant="subtitle2">{t('common.description')}</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{report.description}</Typography>
                </Stack>
                {report.resolutionNotes && <Stack spacing={0.5}>
                    <Typography variant="subtitle2">{t('lists.damageReportsList.actionTaken')}</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{report.resolutionNotes}</Typography>
                </Stack>}
                <Stack spacing={0.5}>
                    <Typography variant="subtitle2">{t('lists.damageReportsList.activity')}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {formatStatus('reported')} · {userName(report.reportedBy)} · {formatDateTime(report.timestamp)}
                    </Typography>
                    {activity.filter((entry) => entry.status !== 'reported').map((entry, index) => <Typography key={index} variant="body2" color="text.secondary">
                        {formatStatus(entry.status)}{entry.amount ? ` (${entry.amount} ×)` : ''} · {userName(entry.userId)} · {formatDateTime(entry.timestamp)}
                    </Typography>)}
                    {!activity.length && report.status !== 'reported' && <Typography variant="body2" color="text.secondary">
                        {formatStatus(report.status)} · {userName(report.handledBy)}{report.handledAt ? ` · ${formatDateTime(report.handledAt)}` : ''}
                    </Typography>}
                </Stack>
            </Stack>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('common.close')}</Button></DialogActions>
    </Dialog>;
}
