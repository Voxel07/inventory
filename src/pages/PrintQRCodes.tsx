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
    Tooltip,
    MenuItem,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { jsPDF } from 'jspdf';
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { generateQRCodeDataURL } from '../utils/qrCode';
import { useLocalizedText } from '../utils/naming';

type FilterMode = 'all' | 'items' | 'assemblies' | 'single';

const M221_LABEL_FORMATS = [
    { id: '40x30', width: 40, height: 30, label: '40 × 30 mm' },
    { id: '50x80', width: 50, height: 80, label: '50 × 80 mm' },
    { id: '70x80', width: 70, height: 80, label: '70 × 80 mm' },
] as const;

type LabelFormatId = (typeof M221_LABEL_FORMATS)[number]['id'];

interface QREntry {
    id: string;
    name: string;
    type: 'item' | 'assembly';
    qrDataUrl: string;
}

export function PrintQRCodesPage() {
    const t = useLocalizedText();
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: assemblies, isLoading: assembliesLoading } = useAssemblies();
    const [entries, setEntries] = useState<QREntry[]>([]);
    const [generating, setGenerating] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [filterMode, setFilterMode] = useState<FilterMode>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [labelFormatId, setLabelFormatId] = useState<LabelFormatId>('40x30');

    useEffect(() => {
        if (itemsLoading || assembliesLoading) return;

        const allEntries = [
            ...(items ?? []).map((item) => ({ id: item.id, name: item.name, type: 'item' as const })),
            ...(assemblies ?? []).map((a) => ({ id: a.id, name: a.name, type: 'assembly' as const })),
        ];

        if (allEntries.length === 0) return;

        Promise.all(
            allEntries.map(async (entry) => {
                const qrDataUrl = await generateQRCodeDataURL(entry.id, entry.type);
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
                return selectedId ? entries.filter((e) => `${e.type}:${e.id}` === selectedId) : [];
            default:
                return entries;
        }
    }, [entries, filterMode, selectedId]);

    async function handleGeneratePDF() {
        if (filteredEntries.length === 0) return;

        setPdfGenerating(true);
        try {
            const labelFormat = M221_LABEL_FORMATS.find((format) => format.id === labelFormatId) ?? M221_LABEL_FORMATS[0];
            const orientation = labelFormat.width >= labelFormat.height ? 'landscape' : 'portrait';
            const doc = new jsPDF({
                orientation,
                unit: 'mm',
                format: [labelFormat.width, labelFormat.height],
                compress: true,
            });

            for (let i = 0; i < filteredEntries.length; i++) {
                const entry = filteredEntries[i];
                if (i > 0) doc.addPage([labelFormat.width, labelFormat.height], orientation);

                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = Math.max(1.5, Math.min(pageWidth, pageHeight) * 0.05);
                const textAreaHeight = 5;
                const qrSize = Math.min(
                    pageWidth - margin * 2,
                    pageHeight - margin * 2 - textAreaHeight,
                );
                const contentHeight = qrSize + textAreaHeight;
                const qrX = (pageWidth - qrSize) / 2;
                const qrY = (pageHeight - contentHeight) / 2;

                doc.addImage(entry.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

                doc.setFontSize(pageWidth <= 40 ? 7 : 9);
                const maxTextWidth = pageWidth - margin * 2;
                let printableName = entry.name;
                while (printableName.length > 1 && doc.getTextWidth(printableName) > maxTextWidth) {
                    printableName = printableName.slice(0, -1);
                }
                if (printableName !== entry.name) {
                    while (printableName.length > 1 && doc.getTextWidth(`${printableName}...`) > maxTextWidth) {
                        printableName = printableName.slice(0, -1);
                    }
                    printableName = `${printableName.trimEnd()}...`;
                }
                doc.text(printableName, pageWidth / 2, qrY + qrSize + 3.5, { align: 'center' });
            }

            doc.save(`qr-labels-m221-${labelFormat.id}-${filterMode}.pdf`);
        } finally {
            setPdfGenerating(false);
        }
    }

    if (itemsLoading || assembliesLoading || generating) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>{t('QR-Codes werden generiert...', 'Generating QR codes...')}</Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">QR-Codes</Typography>
                <Tooltip title={t('PDF mit ausgewählten QR-Codes generieren und herunterladen', 'Generate and download a PDF with the selected QR codes')} arrow>
                    <span>
                        <Button
                            variant="contained"
                            startIcon={<PictureAsPdfIcon />}
                            onClick={handleGeneratePDF}
                            disabled={filteredEntries.length === 0 || pdfGenerating}
                        >
                            {pdfGenerating ? t('Wird generiert…', 'Generating…') : t('PDF herunterladen', 'Download PDF')}
                        </Button>
                    </span>
                </Tooltip>
            </Box>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {t('Filter', 'Filter')}
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
                        <ToggleButton value="all">{t('Alle', 'All')}</ToggleButton>
                        <ToggleButton value="items">{t('Nur Artikel', 'Items only')}</ToggleButton>
                        <ToggleButton value="assemblies">{t('Nur Baugruppen', 'Assemblies only')}</ToggleButton>
                        <ToggleButton value="single">{t('Einzeln', 'Single')}</ToggleButton>
                    </ToggleButtonGroup>

                    {filterMode === 'single' && (
                        <Autocomplete
                            options={allOptions}
                            getOptionLabel={(option) => `${option.name} (${option.type === 'item' ? t('Artikel', 'Item') : t('Baugruppe', 'Assembly')})`}
                            value={allOptions.find((o) => `${o.type}:${o.id}` === selectedId) ?? null}
                            onChange={(_e, newValue) => setSelectedId(newValue ? `${newValue.type}:${newValue.id}` : null)}
                            renderInput={(params) => (
                                <TextField {...params} label={t('Artikel oder Baugruppe auswählen', 'Select item or assembly')} size="small" />
                            )}
                            sx={{ minWidth: 280 }}
                        />
                    )}

                    <TextField
                        select
                        label={t('M221-Etikettenformat', 'M221 label size')}
                        value={labelFormatId}
                        onChange={(event) => setLabelFormatId(event.target.value as LabelFormatId)}
                        size="small"
                        sx={{ minWidth: 180 }}
                    >
                        {M221_LABEL_FORMATS.map((format) => (
                            <MenuItem key={format.id} value={format.id}>{format.label}</MenuItem>
                        ))}
                    </TextField>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {t(
                        'Eine PDF-Seite pro Etikett. Im Druckdialog „Tatsächliche Größe“ bzw. 100 % wählen.',
                        'One PDF page per label. Choose “Actual size” or 100% in the print dialog.',
                    )}
                </Typography>
            </Paper>

            {filteredEntries.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                        {filterMode === 'single' && !selectedId
                            ? t('Wählen Sie oben einen Artikel oder eine Baugruppe aus', 'Select an item or assembly above')
                            : t('Keine QR-Codes zum Anzeigen', 'No QR codes to display')}
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
                                    {entry.type === 'item' ? t('Artikel', 'Item') : t('Baugruppe', 'Assembly')}
                                </Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}
