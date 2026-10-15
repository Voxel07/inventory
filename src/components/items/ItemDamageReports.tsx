import { LoadMore } from '../shared/LoadMore';
import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Chip, Link, Skeleton, Stack, Typography } from '@mui/material';
import type { Item } from '../../types';
import { useDamageReports } from '../../hooks/useDamageReports';
import { formatStatus } from '../../utils/formatters';
import { formatDateTime } from '../../utils/dateFormat';
import { translate, useLocalizedText } from '../../utils/naming';
import { DetailPanel } from './CompactDetail';
import { isOpenDamage } from '../../utils/damage';

/** Damage reported for an item; serialized items name and link the affected unit. */
export function ItemDamageReports({ item }: { item: Item }) {
    const t = useLocalizedText();
    const [showClosed, setShowClosed] = useState(false);
    const damage = useDamageReports(item.id, undefined, 200);
    const { data: reports = [], isLoading } = damage;
    const sorted = [...reports].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const open = sorted.filter(isOpenDamage);
    const closed = sorted.filter((report) => !isOpenDamage(report));
    const visible = showClosed ? [...open, ...closed] : open;

    return (
        <DetailPanel title={`${t('Gemeldete Schäden', 'Reported damage')} (${open.length} ${t('offen', 'open')})`}
            actions={closed.length > 0 && <Button title={translate('Erledigte Schadensberichte ein- oder ausblenden', 'Show or hide closed damage reports')} size="small" onClick={() => setShowClosed((value) => !value)}
                sx={{ minHeight: { xs: 44, sm: 26 }, py: 0, fontSize: '0.75rem' }}>
                {showClosed ? t('Erledigte ausblenden', 'Hide closed') : t(`Erledigte anzeigen (${closed.length})`, `Show closed (${closed.length})`)}
            </Button>}>
            {isLoading ? <Skeleton height={60} /> : visible.length === 0 ? (
                <Typography variant="body2" color="text.secondary">{t('Keine offenen Schadensberichte.', 'No open damage reports.')}</Typography>
            ) : (
                <Stack spacing={0.75}>
                    {visible.map((report) => {
                        const reportOpen = isOpenDamage(report);
                        return <Box key={report.id} sx={{ borderLeft: 3, borderColor: reportOpen ? 'error.main' : 'divider', pl: 1.25, py: 0.25 }}>
                            <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                                {report.assetCode && report.assetInstanceId && <Link component={RouterLink} to={`/items/${item.id}/assets/${report.assetInstanceId}`}
                                    underline="hover" className="mono" sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>{report.assetCode}</Link>}
                                {!report.assetCode && <Typography variant="body2" sx={{ fontWeight: 600 }}>{report.amount}×</Typography>}
                                <Chip size="small" color={reportOpen ? 'error' : 'default'} label={formatStatus(report.status)} sx={{ height: 20, fontSize: '0.75rem' }} />
                                <Chip size="small" variant="outlined" label={formatStatus(report.severity)} sx={{ height: 20, fontSize: '0.75rem' }} />
                                <Typography variant="caption" color="text.secondary">
                                    {[formatDateTime(report.timestamp), report.expand?.reportedBy?.name].filter(Boolean).join(' · ')}
                                </Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{report.description}</Typography>
                        </Box>;
                    })}
                </Stack>
            )}
            <LoadMore list={damage} />
        </DetailPanel>
    );
}
