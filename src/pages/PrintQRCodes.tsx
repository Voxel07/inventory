import { useEffect, useState } from 'react';
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
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { generateQRCodeDataURL } from '../utils/qrCode';
import { useLocalizedText } from '../utils/naming';
import { ListPagination } from '../components/shared/ListPagination';
import { useClientPagination } from '../hooks/useClientPagination';

type FilterMode = 'all' | 'items' | 'assemblies' | 'single' | 'selected';

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
}

const qrCache = new Map<string, string>();

async function getOrGenerateQR(id: string, type: 'item' | 'assembly'): Promise<string> {
    const key = `${type}:${id}`;
    const cached = qrCache.get(key);
    if (cached) return cached;
    const url = await generateQRCodeDataURL(id, type);
    qrCache.set(key, url);
    return url;
}

function QRCodeThumbnail({ id, type, name }: { id: string; type: 'item' | 'assembly'; name: string }) {
    const [qrUrl, setQrUrl] = useState<string | null>(() => qrCache.get(`${type}:${id}`) ?? null);

    useEffect(() => {
        let active = true;
        if (!qrUrl) {
            getOrGenerateQR(id, type).then((url) => {
                if (active) setQrUrl(url);
            });
        }
        return () => { active = false; };
    }, [id, type, qrUrl]);

    return (
        <Box sx={{ width: '100%', maxWidth: 150, height: 150, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {qrUrl ? (
                <Box
                    component="img"
                    src={qrUrl}
                    alt={`QR: ${name}`}
                    sx={{ width: '100%', height: 'auto', maxHeight: 150 }}
                />
            ) : (
                <CircularProgress size={24} />
            )}
        </Box>
    );
}

export function PrintQRCodesPage() {
    const t = useLocalizedText();
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: assemblies, isLoading: assembliesLoading } = useAssemblies();
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [filterMode, setFilterMode] = useState<FilterMode>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [labelFormatId, setLabelFormatId] = useState<LabelFormatId>('40x30');

    const allEntries: QREntry[] = [
        ...(items ?? []).map((item) => ({ id: item.id, name: item.name, type: 'item' as const })),
        ...(assemblies ?? []).map((a) => ({ id: a.id, name: a.name, type: 'assembly' as const })),
    ];

    const filteredEntries = (() => {
        switch (filterMode) {
            case 'items':
                return allEntries.filter((e) => e.type === 'item');
            case 'assemblies':
                return allEntries.filter((e) => e.type === 'assembly');
            case 'single':
                return selectedId ? allEntries.filter((e) => `${e.type}:${e.id}` === selectedId) : [];
            case 'selected':
                return allEntries.filter((e) => selectedIds.includes(`${e.type}:${e.id}`));
            default:
                return allEntries;
        }
    })();
    const { pageItems: visibleEntries, page, setPage, pageSize, onPageSizeChange } = useClientPagination(filteredEntries);

    async function handleGeneratePDF() {
        if (filteredEntries.length === 0) return;

        setPdfGenerating(true);
        try {
            const labelFormat = M221_LABEL_FORMATS.find((format) => format.id === labelFormatId) ?? M221_LABEL_FORMATS[0];
            const orientation = labelFormat.width >= labelFormat.height ? 'landscape' : 'portrait';
            // Loaded on demand so jspdf (~630 kB incl. html2canvas/dompurify) stays out of the route bundle.
            const { jsPDF } = await import('jspdf');
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

                const qrDataUrl = await getOrGenerateQR(entry.id, entry.type);
                doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

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

    if (itemsLoading || assembliesLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>{t('Lade Daten...', 'Loading data...')}</Typography>
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
                            if (value) {
                                setFilterMode(value);
                                setPage(1);
                            }
                        }}
                        size="small"
                    >
                        <ToggleButton value="all">{t('Alle', 'All')}</ToggleButton>
                        <ToggleButton value="items">{t('Nur Artikel', 'Items only')}</ToggleButton>
                        <ToggleButton value="assemblies">{t('Nur Baugruppen', 'Assemblies only')}</ToggleButton>
                        <ToggleButton value="single">{t('Einzeln', 'Single')}</ToggleButton>
                        <ToggleButton value="selected">{t('Auswahl', 'Selection')}</ToggleButton>
                    </ToggleButtonGroup>

                    {filterMode === 'single' && (
                        <Autocomplete
                            options={allEntries}
                            getOptionLabel={(option) => `${option.name} (${option.type === 'item' ? t('Artikel', 'Item') : t('Baugruppe', 'Assembly')})`}
                            value={allEntries.find((o) => `${o.type}:${o.id}` === selectedId) ?? null}
                            onChange={(_e, newValue) => {
                                setSelectedId(newValue ? `${newValue.type}:${newValue.id}` : null);
                                setPage(1);
                            }}
                            renderInput={(params) => (
                                <TextField {...params} label={t('Artikel oder Baugruppe auswählen', 'Select item or assembly')} size="small" />
                            )}
                            sx={{ minWidth: 280 }}
                        />
                    )}
                    {filterMode === 'selected' && <Autocomplete multiple options={allEntries}
                        getOptionLabel={(option) => `${option.name} (${option.type === 'item' ? t('Artikel', 'Item') : t('Baugruppe', 'Assembly')})`}
                        isOptionEqualToValue={(option, value) => option.id === value.id && option.type === value.type}
                        value={allEntries.filter((entry) => selectedIds.includes(`${entry.type}:${entry.id}`))}
                        onChange={(_event, values) => {
                            setSelectedIds(values.map((entry) => `${entry.type}:${entry.id}`));
                            setPage(1);
                        }}
                        renderInput={(params) => <TextField {...params} label={t('QR-Codes auswählen', 'Select QR codes')} size="small" />}
                        sx={{ minWidth: 300, flex: 1 }} />}

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
                    {visibleEntries.map((entry) => (
                        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={`${entry.type}:${entry.id}`}>
                            <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                                <QRCodeThumbnail id={entry.id} type={entry.type} name={entry.name} />
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
            <ListPagination count={filteredEntries.length} page={page} onChange={setPage} pageSize={pageSize}
                onPageSizeChange={onPageSizeChange} />
        </Box>
    );
}
