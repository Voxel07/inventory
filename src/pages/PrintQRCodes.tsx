import { useEffect, useState, useMemo } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    CircularProgress,
    Grid,
    ToggleButtonGroup,
    ToggleButton,
    Autocomplete,
    TextField,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { jsPDF } from 'jspdf';
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { generateQRCodeDataURL } from '../services/qrCodeService';

type FilterMode = 'all' | 'items' | 'assemblies' | 'single';

interface QREntry {
    id: string;
    name: string;
    type: 'item' | 'assembly';
    qrDataUrl: string;
}

export function PrintQRCodesPage() {
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: assemblies, isLoading: assembliesLoading } = useAssemblies();
    const [entries, setEntries] = useState<QREntry[]>([]);
    const [generating, setGenerating] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [filterMode, setFilterMode] = useState<FilterMode>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (itemsLoading || assembliesLoading) return;

        const allEntries = [
            ...(items ?? []).map((item) => ({ id: item.id, name: item.name, type: 'item' as const })),
            ...(assemblies ?? []).map((a) => ({ id: a.id, name: a.name, type: 'assembly' as const })),
        ];

        if (allEntries.length === 0) return;

        setGenerating(true);
        Promise.all(
            allEntries.map(async (entry) => {
                const qrDataUrl = await generateQRCodeDataURL(entry.id);
                return { ...entry, qrDataUrl };
            }),
        ).then((results) => {
            setEntries(results);
            setGenerating(false);
        });
    }, [items, assemblies, itemsLoading, assembliesLoading]);

    const allOptions = useMemo(() => {
        return [
            ...(items ?? []).map((item) => ({ id: item.id, name: item.name, type: 'item' as const })),
            ...(assemblies ?? []).map((a) => ({ id: a.id, name: a.name, type: 'assembly' as const })),
        ];
    }, [items, assemblies]);

    const filteredEntries = useMemo(() => {
        switch (filterMode) {
            case 'items':
                return entries.filter((e) => e.type === 'item');
            case 'assemblies':
                return entries.filter((e) => e.type === 'assembly');
            case 'single':
                return selectedId ? entries.filter((e) => e.id === selectedId) : [];
            default:
                return entries;
        }
    }, [entries, filterMode, selectedId]);

    async function handleGeneratePDF() {
        if (filteredEntries.length === 0) return;

        setPdfGenerating(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 10;
            const qrSize = 40;
            const cellWidth = (pageWidth - margin * 2) / 4;
            const cellHeight = qrSize + 12;

            let x = margin;
            let y = margin;

            // Title
            const title =
                filterMode === 'all'
                    ? 'All QR Codes'
                    : filterMode === 'items'
                        ? 'Item QR Codes'
                        : filterMode === 'assemblies'
                            ? 'Assembly QR Codes'
                            : 'QR Code';
            doc.setFontSize(16);
            doc.text(title, pageWidth / 2, y + 5, { align: 'center' });
            y += 15;

            for (let i = 0; i < filteredEntries.length; i++) {
                const entry = filteredEntries[i];

                if (y + cellHeight > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                    x = margin;
                }

                const imgX = x + (cellWidth - qrSize) / 2;
                doc.addImage(entry.qrDataUrl, 'PNG', imgX, y, qrSize, qrSize);

                doc.setFontSize(8);
                const labelX = x + cellWidth / 2;
                const labelY = y + qrSize + 4;
                const truncatedName = entry.name.length > 20 ? entry.name.slice(0, 18) + '…' : entry.name;
                doc.text(truncatedName, labelX, labelY, { align: 'center' });

                x += cellWidth;
                if (x + cellWidth > pageWidth - margin + 1) {
                    x = margin;
                    y += cellHeight;
                }
            }

            doc.save(`qr-codes-${filterMode}.pdf`);
        } finally {
            setPdfGenerating(false);
        }
    }

    if (itemsLoading || assembliesLoading || generating) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Generating QR codes...</Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">QR Codes</Typography>
                <Button
                    variant="contained"
                    startIcon={<PictureAsPdfIcon />}
                    onClick={handleGeneratePDF}
                    disabled={filteredEntries.length === 0 || pdfGenerating}
                >
                    {pdfGenerating ? 'Generating…' : 'Download PDF'}
                </Button>
            </Box>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Filter
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <ToggleButtonGroup
                        value={filterMode}
                        exclusive
                        onChange={(_e, value) => {
                            if (value) setFilterMode(value);
                        }}
                        size="small"
                    >
                        <ToggleButton value="all">All</ToggleButton>
                        <ToggleButton value="items">Items Only</ToggleButton>
                        <ToggleButton value="assemblies">Assemblies Only</ToggleButton>
                        <ToggleButton value="single">Single</ToggleButton>
                    </ToggleButtonGroup>

                    {filterMode === 'single' && (
                        <Autocomplete
                            options={allOptions}
                            getOptionLabel={(option) => `${option.name} (${option.type})`}
                            value={allOptions.find((o) => o.id === selectedId) ?? null}
                            onChange={(_e, newValue) => setSelectedId(newValue?.id ?? null)}
                            renderInput={(params) => (
                                <TextField {...params} label="Select item or assembly" size="small" />
                            )}
                            sx={{ minWidth: 280 }}
                        />
                    )}
                </Box>
            </Paper>

            {filteredEntries.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        {filterMode === 'single' && !selectedId
                            ? 'Select an item or assembly above'
                            : 'No QR codes to display'}
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={2}>
                    {filteredEntries.map((entry) => (
                        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={entry.id}>
                            <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                                <Box
                                    component="img"
                                    src={entry.qrDataUrl}
                                    alt={`QR: ${entry.name}`}
                                    sx={{ width: '100%', maxWidth: 150, height: 'auto' }}
                                />
                                <Typography
                                    variant="caption"
                                    sx={{ display: 'block', mt: 0.5, wordBreak: 'break-word' }}
                                >
                                    {entry.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {entry.type}
                                </Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}
