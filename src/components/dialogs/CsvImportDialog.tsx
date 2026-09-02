import { useState, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  FormControlLabel,
  Checkbox,
  LinearProgress,
  Alert,
  Tooltip,
  TextField,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { useTranslate } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import {
  parseCsv,
  detectCsvType,
  parseItemsFromCsv,
  parseAssembliesFromCsv,
  generateSampleItemsCsv,
  generateSampleAssembliesCsv,
  generateSampleCombinedCsv,
  type CsvImportType,
  type ParsedItemRow,
  type ParsedAssemblyRow,
} from '../../utils/csvImport';
import type { Item, Assembly, StorageLocation } from '../../types';
import { createItem, updateItem } from '../../services/inventoryService';
import { createAssembly } from '../../services/assemblyService';
import { createStorageLocation } from '../../services/storageLocationService';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onClose: () => void;
  items: Item[];
  assemblies: Assembly[];
  storageLocations: StorageLocation[];
}

export function CsvImportDialog({
  open,
  onClose,
  items,
  assemblies,
  storageLocations,
}: Props) {
  const t = useTranslate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tabType, setTabType] = useState<CsvImportType>('items');
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Options
  const [updateExistingItems, setUpdateExistingItems] = useState(false);
  const [autoCreateLocations, setAutoCreateLocations] = useState(true);

  // Import execution state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [importResult, setImportResult] = useState<{
    successItems: number;
    updatedItems: number;
    successAssemblies: number;
    errors: string[];
  } | null>(null);

  // Parse CSV
  const { rows } = useMemo(() => {
    if (!csvContent.trim()) return { rows: [] };
    return parseCsv(csvContent);
  }, [csvContent]);

  // Parsed Items and Assemblies
  const parsedItems: ParsedItemRow[] = useMemo(() => {
    if (tabType === 'assemblies' || rows.length === 0) return [];
    return parseItemsFromCsv(rows, storageLocations, items);
  }, [rows, tabType, storageLocations, items]);

  const parsedAssemblies: ParsedAssemblyRow[] = useMemo(() => {
    if (tabType === 'items' || rows.length === 0) return [];
    return parseAssembliesFromCsv(rows, items, assemblies);
  }, [rows, tabType, items, assemblies]);

  // Statistics
  const validItemsCount = parsedItems.filter((i) => i.status === 'valid' || i.status === 'warning' || (i.status === 'duplicate' && updateExistingItems)).length;
  const validAssembliesCount = parsedAssemblies.filter((a) => a.status === 'valid').length;
  const totalErrorsCount = parsedItems.filter((i) => i.status === 'error').length + parsedAssemblies.filter((a) => a.status === 'error').length;
  const totalDuplicatesCount = parsedItems.filter((i) => i.status === 'duplicate').length + parsedAssemblies.filter((a) => a.status === 'duplicate').length;

  const totalToImport = (tabType === 'assemblies' ? 0 : validItemsCount) + (tabType === 'items' ? 0 : validAssembliesCount);

  function handleFileSelected(file: File) {
    setFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      setCsvContent(text);
      const parsed = parseCsv(text);
      if (parsed.headers.length > 0) {
        const detected = detectCsvType(parsed.headers);
        setTabType(detected);
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }

  function handleDownloadTemplate(type: CsvImportType) {
    let content = '';
    let name = '';
    if (type === 'items') {
      content = generateSampleItemsCsv();
      name = 'Artikel_Vorlage.csv';
    } else if (type === 'assemblies') {
      content = generateSampleAssembliesCsv();
      name = 'Baugruppen_Vorlage.csv';
    } else {
      content = generateSampleCombinedCsv();
      name = 'Inventar_Vorlage.csv';
    }

    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function resetState() {
    setCsvContent('');
    setFileName('');
    setImportResult(null);
    setImportProgress(0);
    setImportStatusText('');
  }

  async function executeImport() {
    if (totalToImport === 0) return;
    setIsImporting(true);
    setImportProgress(0);
    setImportResult(null);

    const errors: string[] = [];
    let successItems = 0;
    let updatedItems = 0;
    let successAssemblies = 0;

    const locCache = new Map<string, string>();
    for (const loc of storageLocations) {
      locCache.set(loc.name.toLowerCase().trim(), loc.id);
    }

    // Step 1: Auto-create missing storage locations if enabled
    if (autoCreateLocations && tabType !== 'assemblies') {
      const missingLocNames = new Set<string>();
      for (const row of parsedItems) {
        if (row.storageLocationName && !row.storageLocationId && !locCache.has(row.storageLocationName.toLowerCase().trim())) {
          missingLocNames.add(row.storageLocationName.trim());
        }
      }

      for (const locName of missingLocNames) {
        try {
          setImportStatusText(t(`Erstelle Lagerort "${locName}"...`, `Creating storage location "${locName}"...`));
          const newLoc = await createStorageLocation({ name: locName });
          locCache.set(locName.toLowerCase().trim(), newLoc.id);
        } catch (err: unknown) {
          errors.push(`Fehler beim Erstellen von Lagerort "${locName}": ${(err as Error).message || err}`);
        }
      }
    }

    // Step 2: Import Items
    const createdItemsMap = new Map<string, Item>();
    for (const item of items) {
      createdItemsMap.set(item.name.toLowerCase().trim(), item);
    }

    const itemsToProcess = parsedItems.filter((i) => i.status === 'valid' || i.status === 'warning' || (i.status === 'duplicate' && updateExistingItems));
    const totalSteps = itemsToProcess.length + (tabType === 'items' ? 0 : parsedAssemblies.filter((a) => a.status === 'valid').length);
    let currentStep = 0;

    if (tabType !== 'assemblies') {
      for (const row of itemsToProcess) {
        currentStep++;
        setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
        setImportStatusText(t(`Importiere Artikel ${currentStep}/${itemsToProcess.length}: ${row.data.name}`, `Importing item ${currentStep}/${itemsToProcess.length}: ${row.data.name}`));

        // Resolve location ID if created on the fly
        let locationId = row.data.storageLocation;
        if (!locationId && row.storageLocationName) {
          locationId = locCache.get(row.storageLocationName.toLowerCase().trim()) || '';
        }

        const payload = {
          ...row.data,
          storageLocation: locationId,
        };

        try {
          if (row.isExisting && updateExistingItems && row.existingId) {
            const updated = await updateItem(row.existingId, payload);
            updatedItems++;
            createdItemsMap.set(updated.name.toLowerCase().trim(), updated);
          } else if (!row.isExisting) {
            const created = await createItem(payload);
            successItems++;
            createdItemsMap.set(created.name.toLowerCase().trim(), created);
          }
        } catch (err: unknown) {
          errors.push(`Fehler bei Artikel "${row.data.name}": ${(err as Error).message || err}`);
        }
      }
    }

    // Step 3: Import Assemblies
    if (tabType !== 'items') {
      const assembliesToProcess = parsedAssemblies.filter((a) => a.status === 'valid');
      let assemIndex = 0;

      for (const row of assembliesToProcess) {
        assemIndex++;
        currentStep++;
        setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
        setImportStatusText(t(`Erstelle Baugruppe ${assemIndex}/${assembliesToProcess.length}: ${row.data.name}`, `Creating assembly ${assemIndex}/${assembliesToProcess.length}: ${row.data.name}`));

        // Re-resolve components in case some items were created in Step 2
        const finalItemIds: string[] = [];
        const finalQuantities: Record<string, number> = {};
        let allMatched = true;

        for (const comp of row.components) {
          const item = comp.itemId ? items.find((i) => i.id === comp.itemId) : createdItemsMap.get(comp.itemName.toLowerCase().trim());
          if (item) {
            finalItemIds.push(item.id);
            finalQuantities[item.id] = (finalQuantities[item.id] ?? 0) + comp.quantity;
          } else {
            allMatched = false;
            errors.push(`Baugruppe "${row.data.name}": Artikel "${comp.itemName}" konnte nicht gefunden werden`);
            break;
          }
        }

        if (allMatched && finalItemIds.length > 0) {
          try {
            await createAssembly({
              ...row.data,
              itemIds: [...new Set(finalItemIds)],
              itemQuantities: finalQuantities,
            });
            successAssemblies++;
          } catch (err: unknown) {
            errors.push(`Fehler bei Baugruppe "${row.data.name}": ${(err as Error).message || err}`);
          }
        }
      }
    }

    // Invalidate caches
    queryClient.invalidateQueries({ queryKey: ['items'] });
    queryClient.invalidateQueries({ queryKey: ['assemblies'] });
    queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });

    setIsImporting(false);
    setImportProgress(100);
    setImportStatusText('');
    setImportResult({
      successItems,
      updatedItems,
      successAssemblies,
      errors,
    });

    const totalSuccess = successItems + updatedItems + successAssemblies;
    if (totalSuccess > 0) {
      showSnackbar(
        t(
          `Import abgeschlossen: ${totalSuccess} Einträge erfolgreich verarbeitet`,
          `Import finished: ${totalSuccess} entries successfully processed`,
        ),
        'success',
      );
    }
  }

  return (
    <Dialog open={open} onClose={isImporting ? undefined : onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
          {t('CSV-Import (Artikel & Baugruppen)', 'CSV Import (Items & Assemblies)')}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => handleDownloadTemplate(tabType)}
          >
            {t('Vorlage herunterladen', 'Download template')}
          </Button>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Tabs
          value={tabType}
          onChange={(_e, v) => setTabType(v)}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="items" label={t('Artikel', 'Items')} />
          <Tab value="assemblies" label={t('Baugruppen', 'Assemblies')} />
          <Tab value="combined" label={t('Kombiniert / Alle', 'Combined / All')} />
        </Tabs>

        {/* Upload Zone */}
        {!csvContent ? (
          <Box>
            <Paper
              variant="outlined"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              sx={{
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                borderStyle: 'dashed',
                borderWidth: 2,
                borderColor: dragOver ? 'primary.main' : 'divider',
                backgroundColor: dragOver ? 'action.hover' : 'background.paper',
                transition: 'all 0.2s',
                mb: 2,
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
              />
              <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                {t('CSV-Datei hierher ziehen oder klicken zum Auswählen', 'Drag & drop CSV file here or click to select')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(
                  'Unterstützt Komma (,), Semikolon (;) und Tabulatoren. UTF-8 kodiert.',
                  'Supports comma (,), semicolon (;), and tabs. UTF-8 encoded.',
                )}
              </Typography>
            </Paper>

            <Box sx={{ textAlign: 'center' }}>
              <Button
                variant="text"
                size="small"
                startIcon={<ContentPasteIcon />}
                endIcon={pasteOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setPasteOpen(!pasteOpen)}
              >
                {t('Oder CSV-Inhalt manuell als Text einfügen', 'Or paste CSV text directly')}
              </Button>
              <Collapse in={pasteOpen}>
                <Box sx={{ mt: 2, textAlign: 'left' }}>
                  <TextField
                    multiline
                    rows={6}
                    fullWidth
                    placeholder={t(
                      'Kopfzeile und Daten hier einfügen, z.B.:\nArtikel;Kategorie;Bestand;Mindestbestand;Einzelwert\nSchrauben M4;Eisenwaren;100;20;0,05',
                      'Paste header and rows here, e.g.:\nName;Category;Amount;MinStock;Value\nScrews M4;Hardware;100;20;0.05',
                    )}
                    value={csvContent}
                    onChange={(e) => {
                      setCsvContent(e.target.value);
                      setFileName('Eingefügter Text');
                      const parsed = parseCsv(e.target.value);
                      if (parsed.headers.length > 0) {
                        setTabType(detectCsvType(parsed.headers));
                      }
                    }}
                  />
                </Box>
              </Collapse>
            </Box>
          </Box>
        ) : (
          <Box>
            {/* File Info Bar */}
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {fileName || t('Geladene CSV-Daten', 'Loaded CSV data')} ({rows.length} {t('Zeilen', 'rows')})
              </Typography>
              <Button size="small" color="secondary" onClick={resetState} disabled={isImporting}>
                {t('Andere Datei wählen', 'Choose another file')}
              </Button>
            </Stack>

            {/* Options */}
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, backgroundColor: 'background.default' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={updateExistingItems}
                      onChange={(e) => setUpdateExistingItems(e.target.checked)}
                      disabled={isImporting}
                    />
                  }
                  label={t('Existierende Artikel aktualisieren', 'Update existing items on duplicate name')}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={autoCreateLocations}
                      onChange={(e) => setAutoCreateLocations(e.target.checked)}
                      disabled={isImporting}
                    />
                  }
                  label={t('Fehlende Lagerorte automatisch anlegen', 'Auto-create missing storage locations')}
                />
              </Stack>
            </Paper>

            {/* Statistics Banner */}
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
              <Chip
                icon={<CheckCircleIcon />}
                color="success"
                variant="outlined"
                label={t(`${totalToImport} Bereit zum Import`, `${totalToImport} ready to import`)}
              />
              {totalDuplicatesCount > 0 && (
                <Chip
                  color={updateExistingItems ? 'info' : 'warning'}
                  variant="outlined"
                  label={t(
                    `${totalDuplicatesCount} Duplikate (${updateExistingItems ? 'werden aktualisiert' : 'werden übersprungen'})`,
                    `${totalDuplicatesCount} duplicates (${updateExistingItems ? 'will update' : 'will skip'})`,
                  )}
                />
              )}
              {totalErrorsCount > 0 && (
                <Chip
                  icon={<ErrorIcon />}
                  color="error"
                  variant="outlined"
                  label={t(`${totalErrorsCount} Fehlerhafte Zeilen`, `${totalErrorsCount} error rows`)}
                />
              )}
            </Stack>

            {/* Results Alert */}
            {importResult && (
              <Alert
                severity={importResult.errors.length > 0 ? 'warning' : 'success'}
                sx={{ mb: 2 }}
                onClose={() => setImportResult(null)}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {t('Import abgeschlossen!', 'Import completed!')}
                </Typography>
                <Typography variant="body2">
                  {importResult.successItems > 0 && `${importResult.successItems} ${t('Artikel neu angelegt', 'items created')}. `}
                  {importResult.updatedItems > 0 && `${importResult.updatedItems} ${t('Artikel aktualisiert', 'items updated')}. `}
                  {importResult.successAssemblies > 0 && `${importResult.successAssemblies} ${t('Baugruppen erstellt', 'assemblies created')}. `}
                </Typography>
                {importResult.errors.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="error" sx={{ display: 'block', fontWeight: 600 }}>
                      {t('Hinweise / Fehler:', 'Warnings / Errors:')}
                    </Typography>
                    {importResult.errors.slice(0, 5).map((err, idx) => (
                      <Typography key={idx} variant="caption" color="error" sx={{ display: 'block' }}>
                        • {err}
                      </Typography>
                    ))}
                    {importResult.errors.length > 5 && (
                      <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                        ... {t(`und ${importResult.errors.length - 5} weitere`, `and ${importResult.errors.length - 5} more`)}
                      </Typography>
                    )}
                  </Box>
                )}
              </Alert>
            )}

            {/* Progress Bar */}
            {isImporting && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
                  {importStatusText}
                </Typography>
                <LinearProgress variant="determinate" value={importProgress} sx={{ height: 8, borderRadius: 4 }} />
              </Box>
            )}

            {/* Preview Tables */}
            {tabType !== 'assemblies' && parsedItems.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Artikel-Vorschau', 'Items Preview')} ({parsedItems.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('Status', 'Status')}</TableCell>
                        <TableCell>{t('Artikelname', 'Item Name')}</TableCell>
                        <TableCell>{t('Kategorie', 'Category')}</TableCell>
                        <TableCell align="right">{t('Anfangsbestand', 'Initial Stock')}</TableCell>
                        <TableCell align="right">{t('Min. Bestand', 'Min Stock')}</TableCell>
                        <TableCell align="right">{t('Einzelwert (€)', 'Value (€)')}</TableCell>
                        <TableCell>{t('Lagerort', 'Storage Location')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedItems.slice(0, 50).map((row) => (
                        <TableRow key={row.index} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' && <Chip size="small" color="success" label={t('Gültig', 'Valid')} />}
                            {row.status === 'warning' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={t('Neu', 'New loc')} />
                              </Tooltip>
                            )}
                            {row.status === 'duplicate' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip
                                  size="small"
                                  color={updateExistingItems ? 'info' : 'default'}
                                  label={updateExistingItems ? t('Aktualisieren', 'Update') : t('Überspringen', 'Skip')}
                                />
                              </Tooltip>
                            )}
                            {row.status === 'error' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('Fehler', 'Error')} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{row.data.name || '—'}</TableCell>
                          <TableCell>{row.data.category || '—'}</TableCell>
                          <TableCell align="right">{row.data.amount ?? 0}</TableCell>
                          <TableCell align="right">{row.data.minStock ?? 5}</TableCell>
                          <TableCell align="right">{(row.data.value ?? 0).toFixed(2)} €</TableCell>
                          <TableCell>{row.storageLocationName || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {parsedItems.length > 50 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {t(`Zeige erste 50 von ${parsedItems.length} Artikeln`, `Showing first 50 of ${parsedItems.length} items`)}
                  </Typography>
                )}
              </Box>
            )}

            {tabType !== 'items' && parsedAssemblies.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Baugruppen-Vorschau', 'Assemblies Preview')} ({parsedAssemblies.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('Status', 'Status')}</TableCell>
                        <TableCell>{t('Baugruppe', 'Assembly')}</TableCell>
                        <TableCell>{t('Komponenten (Artikel & Anzahl)', 'Components')}</TableCell>
                        <TableCell>{t('Beschreibung', 'Description')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedAssemblies.slice(0, 50).map((row) => (
                        <TableRow key={row.index} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' && <Chip size="small" color="success" label={t('Gültig', 'Valid')} />}
                            {row.status === 'duplicate' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="default" label={t('Überspringen', 'Skip')} />
                              </Tooltip>
                            )}
                            {row.status === 'error' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('Fehler', 'Error')} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{row.data.name || '—'}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
                              {row.components.map((comp, cIdx) => (
                                <Chip
                                  key={cIdx}
                                  size="small"
                                  color={comp.matched ? 'primary' : 'error'}
                                  variant={comp.matched ? 'outlined' : 'filled'}
                                  label={`${comp.itemName} (${comp.quantity}x)`}
                                />
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell>{row.data.description || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={isImporting}>
          {t('Schließen', 'Close')}
        </Button>
        {csvContent && (
          <Button
            variant="contained"
            onClick={executeImport}
            disabled={isImporting || totalToImport === 0}
            startIcon={<CloudUploadIcon />}
          >
            {isImporting
              ? t('Importiere...', 'Importing...')
              : t(`Jetzt importieren (${totalToImport})`, `Import now (${totalToImport})`)}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
