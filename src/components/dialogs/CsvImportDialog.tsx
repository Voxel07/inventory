import { invalidateForApiChange } from '../../utils/realtimeInvalidation';
import { buildCsvImportPlan } from '../../utils/csv/importPlan';
import { DialogActions } from '@mui/material';
import { CsvImportPreview } from './CsvImportPreview';
import { runCsvImport, type CsvImportResult } from '../../services/csvImportService';
import { Dialog } from '../shared/ClosableDialog';
import { useState, useRef } from 'react';
import { DialogTitle, DialogContent, Button, Box, Typography, Tabs, Tab, Stack, Paper, Chip, FormControlLabel, Checkbox, LinearProgress, Alert, TextField, Collapse, useMediaQuery, useTheme } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import ErrorIcon from '@mui/icons-material/Error';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { useLocalizedText } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import { parseCsv, detectCsvType } from '../../utils/csv/core';

import { generateSampleItemsCsv, generateSampleAssembliesCsv, generateSampleCombinedCsv } from '../../utils/csv/templates';
import { type CsvImportType } from '../../types/csvImport';

import type { Item, Assembly, StorageLocation } from '../../types';

import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onClose: () => void;
  items: Item[];
  assemblies: Assembly[];
  storageLocations: StorageLocation[];
  catalogComplete: boolean;
}

export function CsvImportDialog({
  open,
  onClose,
  items,
  assemblies,
  storageLocations,
  catalogComplete,
}: Props) {
  const t = useLocalizedText();
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
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  const { rows, parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, validEventsCount, validOrdersCount, validGeneralOrdersCount, validReturnsCount, validCheckoutsCount, validOperationsCount, totalErrorsCount, totalDuplicatesCount, totalToImport } = buildCsvImportPlan({ csvContent, tabType, items, assemblies, storageLocations, updateExistingItems });

  function firstErrorTarget(section: 'items' | 'assemblies' | 'events' | 'orders' | 'returns' | 'checkouts' | 'operations', rows: { index: number; status: string }[]) {
    const row = rows.find((candidate) => candidate.status === 'error');
    return row ? { section, index: row.index } : undefined;
  }

  function handleErrorSummaryClick() {
    const firstError = tabType === 'items'
      ? firstErrorTarget('items', parsedItems)
      : tabType === 'assemblies'
        ? firstErrorTarget('assemblies', parsedAssemblies)
        : firstErrorTarget('items', parsedItems)
          ?? firstErrorTarget('assemblies', parsedAssemblies)
          ?? firstErrorTarget('events', parsedEvents)
          ?? firstErrorTarget('orders', parsedOrders)
          ?? firstErrorTarget('orders', parsedGeneralOrders)
          ?? firstErrorTarget('returns', parsedReturns)
          ?? firstErrorTarget('checkouts', parsedCheckouts)
          ?? firstErrorTarget('operations', parsedOperations);

    if (!firstError) return;

    document.getElementById(`csv-import-${firstError.section}-row-${firstError.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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
    const [content, name] = type === 'items'
      ? [generateSampleItemsCsv(), 'Artikel_Vorlage.csv']
      : type === 'assemblies'
        ? [generateSampleAssembliesCsv(), 'Baugruppen_Vorlage.csv']
        : [generateSampleCombinedCsv(), 'Inventar_Vorlage.csv'];

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
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCsvContent('');
    setFileName('');
    setImportResult(null);
    setImportProgress(0);
    setImportStatusText('');
  }

  async function executeImport() {
    if (totalToImport === 0 || !catalogComplete) return;
    setIsImporting(true);
    setImportProgress(0);
    setImportResult(null);

    const { successItems, updatedItems, successAssemblies, successEvents, successOrders, successGeneralOrders, successReturns, successCheckouts, successOperations, errors } = await runCsvImport({ parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, storageLocations, autoCreateLocations, tabType, items, updateExistingItems, validEventsCount, validOrdersCount, validGeneralOrdersCount, validReturnsCount, validCheckoutsCount, validOperationsCount, t, setImportProgress, setImportStatusText });

    invalidateForApiChange(queryClient);

    setIsImporting(false);
    setImportProgress(100);
    setImportStatusText('');
    setImportResult({
      successItems,
      updatedItems,
      successAssemblies,
      successEvents,
      successOrders,
      successGeneralOrders,
      successReturns,
      successCheckouts,
      successOperations,
      errors,
    });
    if (errors.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setCsvContent('');
      setFileName('');
      setPasteOpen(false);
    }

    const totalSuccess = successItems + updatedItems + successAssemblies + successEvents + successOrders + successGeneralOrders + successReturns + successCheckouts + successOperations;
    if (totalSuccess > 0) {
      showSnackbar(
        t(
          `Import abgeschlossen: ${totalSuccess} Einträge erfolgreich verarbeitet`,
          `Import finished: ${totalSuccess} entries successfully processed`,
        ),
        errors.length ? 'warning' : 'success',
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
        {importResult && (
          <Alert
            severity={importResult.errors.length > 0 ? 'warning' : 'success'}
            sx={{ mb: 2 }}
            onClose={() => setImportResult(null)}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {importResult.errors.length > 0
                ? t('Import mit Fehlern abgeschlossen', 'Import completed with errors')
                : t('Import abgeschlossen!', 'Import completed!')}
            </Typography>
            <Typography variant="body2">
              {importResult.successItems > 0 && `${importResult.successItems} ${t('Artikel neu angelegt', 'items created')}. `}
              {importResult.updatedItems > 0 && `${importResult.updatedItems} ${t('Artikel aktualisiert', 'items updated')}. `}
              {importResult.successAssemblies > 0 && `${importResult.successAssemblies} ${t('Baugruppen erstellt', 'assemblies created')}. `}
              {importResult.successEvents > 0 && `${importResult.successEvents} ${t('Events erstellt', 'events created')}. `}
              {importResult.successOrders > 0 && `${importResult.successOrders} ${t('Bestellungen importiert', 'orders imported')}. `}
              {importResult.successGeneralOrders > 0 && `${importResult.successGeneralOrders} ${t('allgemeine Bestellungen importiert', 'general orders imported')}. `}
              {importResult.successReturns > 0 && `${importResult.successReturns} ${t('Rückgaben erfasst', 'returns recorded')}. `}
              {importResult.successCheckouts > 0 && `${importResult.successCheckouts} ${t('Ausleihen erfasst', 'checkouts recorded')}. `}
              {importResult.successOperations > 0 && `${importResult.successOperations} ${t('Aktionen importiert', 'actions imported')}. `}
            </Typography>
            {importResult.errors.length > 0 && (
              <Box sx={{ mt: 1, maxHeight: 300, overflowY: 'auto' }}>
                <Typography variant="caption" color="error" sx={{ display: 'block', fontWeight: 600 }}>
                  {t('Hinweise / Fehler:', 'Warnings / Errors:')}
                </Typography>
                {importResult.errors.map((err, idx) => (
                  <Typography key={idx} variant="caption" color="error" sx={{ display: 'block' }}>
                    • {err}
                  </Typography>
                ))}
              </Box>
            )}
          </Alert>
        )}
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
              <Button
                size="small"
                color="secondary"
                onClick={resetState}
                disabled={isImporting}
                sx={{ color: (theme) => theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.secondary.main }}
              >
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
            {!catalogComplete && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('Artikel und Baugruppen werden noch geladen. Der Import ist danach verfügbar.',
                  'Items and assemblies are still loading. Import will be available when they finish.')}
              </Alert>
            )}
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
                  clickable
                  onClick={handleErrorSummaryClick}
                  aria-label={t('Zur ersten fehlerhaften Zeile springen', 'Jump to the first error row')}
                  label={t(`${totalErrorsCount} Fehlerhafte Zeilen`, `${totalErrorsCount} error rows`)}
                />
              )}
            </Stack>

            {/* Progress Bar */}
            {isImporting && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
                  {importStatusText}
                </Typography>
                <LinearProgress variant="determinate" value={importProgress} sx={{ height: 8, borderRadius: 4 }} />
              </Box>
            )}

            <CsvImportPreview tabType={tabType} updateExistingItems={updateExistingItems} parsedItems={parsedItems} parsedAssemblies={parsedAssemblies} parsedEvents={parsedEvents} parsedOrders={parsedOrders} parsedGeneralOrders={parsedGeneralOrders} parsedReturns={parsedReturns} parsedCheckouts={parsedCheckouts} parsedOperations={parsedOperations} />
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
            disabled={isImporting || !catalogComplete || totalToImport === 0}
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
