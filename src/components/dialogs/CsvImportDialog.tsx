import { Chip, Button, Tab } from '../shared/ActionButtons';
import { buildCsvImportPlan } from '../../utils/csv/importPlan';
import { useAuth } from '../../hooks/useAuth';
import { canEditEvents, canViewOrganization } from '../../utils/access';
import { getEventTypes, getFactions } from '../../services/referenceDataService';
import { DialogActions } from '@mui/material';
import { CsvImportPreview } from './CsvImportPreview';
import { uploadCsvImport, getCsvImports, csvImportRunning, csvImportCounts, type CsvImportJob } from '../../services/csvImportService';
import { Dialog } from '../shared/ClosableDialog';
import { useState, useRef, useMemo, useEffect } from 'react';
import { DialogTitle, DialogContent, Box, Typography, Tabs, Stack, Paper, FormControlLabel, Checkbox, LinearProgress, Alert, TextField, Collapse, useMediaQuery, useTheme } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import ErrorIcon from '@mui/icons-material/Error';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { translate, useT } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';

import { generateSampleItemsCsv, generateSampleAssembliesCsv, generateSampleCombinedCsv } from '../../utils/csv/templates';
import { EMPTY_CSV_IMPORT_COUNTS, type CsvImportType } from '../../types/csvImport';

import type { Item, Assembly, StorageLocation } from '../../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { itemApi } from '../../services/inventoryService';
import { assemblyApi } from '../../services/assemblyService';
import { storageLocationApi } from '../../services/storageLocationService';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Preselected tab; the user's tab choice decides what gets imported. */
  initialType: CsvImportType;
}

export function CsvImportDialog({
  open,
  onClose,
  initialType,
}: Props) {
  const t = useT();
  const { user } = useAuth();
  const canCreateReferences = canEditEvents(user);
  // Import is an explicit exhaustive workflow: while the dialog is open it reads the complete catalog
  // once, so duplicates and references are matched against every item, assembly and location.
  const catalog = useQuery({ queryKey: ['items', 'all', 'csv-import'], enabled: open, networkMode: 'offlineFirst', staleTime: 0,
    queryFn: async () => {
      const [items, assemblies, storageLocations, eventTypes, factions] = await Promise.all([
        itemApi.getAll(), assemblyApi.getAll(), storageLocationApi.getAll(), getEventTypes(),
        canViewOrganization(user) ? getFactions() : Promise.resolve([]),
      ]);
      return { items, assemblies, storageLocations, eventTypes, factions };
    } });
  const items: Item[] = useMemo(() => catalog.data?.items ?? [], [catalog.data]);
  const assemblies: Assembly[] = useMemo(() => catalog.data?.assemblies ?? [], [catalog.data]);
  const storageLocations: StorageLocation[] = useMemo(() => catalog.data?.storageLocations ?? [], [catalog.data]);
  const catalogComplete = catalog.isSuccess;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tabType, setTabType] = useState<CsvImportType>(initialType);
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [assemblySearch, setAssemblySearch] = useState('');
  const [errorTarget, setErrorTarget] = useState<{ section: string; index: number } | null>(null);

  useEffect(() => {
    if (errorTarget) document.getElementById(`csv-import-${errorTarget.section}-row-${errorTarget.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errorTarget]);

  // Options
  const [updateExistingItems, setUpdateExistingItems] = useState(false);
  const [autoCreateLocations, setAutoCreateLocations] = useState(true);
  const [autoCreateReferences, setAutoCreateReferences] = useState(true);

  const queryClient = useQueryClient();
  const jobsKey = ['csv-imports', user?.id];
  const jobs = useQuery({ queryKey: jobsKey, queryFn: getCsvImports, enabled: open && !!user,
    staleTime: 0, refetchOnWindowFocus: true,
    refetchInterval: (query) => query.state.data?.some(csvImportRunning) ? 2000 : false });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [hiddenResultId, setHiddenResultId] = useState<string | null>(null);
  const pendingUpload = useRef<{ signature: string; commandId: string } | null>(null);
  const selectedJob = jobs.data?.find((job) => job.id === selectedJobId) ?? jobs.data?.[0];
  const isImporting = isUploading || !!jobs.data?.some(csvImportRunning);
  const importResult = selectedJob && !csvImportRunning(selectedJob) && selectedJob.id !== hiddenResultId ? selectedJob.result : null;
  const importedCounts = !csvContent && selectedJob ? csvImportCounts(selectedJob.result) : EMPTY_CSV_IMPORT_COUNTS;
  const importTotal = selectedJob?.totalRows ?? 0;
  const totalImported = Object.values(importedCounts).reduce((sum, count) => sum + count, 0);
  const refreshedJob = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedJob || csvImportRunning(selectedJob) || refreshedJob.current === selectedJob.id) return;
    refreshedJob.current = selectedJob.id;
    for (const key of ['items', 'assemblies', 'event-reports', 'faction-orders', 'general-orders', 'storageLocations']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [selectedJob, queryClient]);

  const { rows, newFactions, parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, totalErrorsCount, totalDuplicatesCount, totalToImport } = useMemo(
    () => buildCsvImportPlan({ csvContent: catalogComplete ? csvContent : '', tabType, items, assemblies, storageLocations, updateExistingItems,
      reference: { eventTypes: catalog.data?.eventTypes ?? [], factions: catalog.data?.factions ?? [] },
      autoCreateReferences: canCreateReferences && autoCreateReferences }),
    [csvContent, tabType, items, assemblies, storageLocations, updateExistingItems, catalogComplete, catalog.data, canCreateReferences, autoCreateReferences],
  );

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

    setItemSearch('');
    setAssemblySearch('');
    setErrorTarget(firstError);
  }

  function handleFileSelected(file: File) {
    setItemSearch('');
    setAssemblySearch('');
    setFileName(file.name);
    setHiddenResultId(selectedJob?.id ?? null);
    setUploadError('');
    const reader = new FileReader();
    reader.onload = (e) => setCsvContent((e.target?.result as string) || '');
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
    setItemSearch('');
    setAssemblySearch('');
    setErrorTarget(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCsvContent('');
    setFileName('');
    setHiddenResultId(selectedJob?.id ?? null);
    setUploadError('');
  }

  async function executeImport() {
    if (totalToImport === 0 || !catalogComplete || isUploading) return;
    const plan = { newFactions, parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders,
      parsedReturns, parsedCheckouts, parsedOperations, autoCreateLocations, tabType, updateExistingItems };
    const signature = JSON.stringify(plan);
    if (pendingUpload.current?.signature !== signature) pendingUpload.current = { signature, commandId: crypto.randomUUID() };
    setIsUploading(true);
    setUploadError('');
    try {
      const job = await uploadCsvImport(fileName || t('dialogs.csvImportDialog.loadedCSVData'), plan, pendingUpload.current.commandId);
      queryClient.setQueryData<CsvImportJob[]>(jobsKey, (current = []) => [job, ...current.filter((entry) => entry.id !== job.id)]);
      setSelectedJobId(job.id);
      setHiddenResultId(null);
      pendingUpload.current = null;
      setCsvContent('');
      setFileName('');
      setPasteOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showSnackbar(t('dialogs.csvImportDialog.backgroundStarted'), 'success');
      void queryClient.invalidateQueries({ queryKey: jobsKey });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={open} onClose={isUploading ? undefined : onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" component="span">
          {t('dialogs.csvImportDialog.cSVImportItemsAssemblies')}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button title={translate('dialogs.csvImportDialog.downloadACSVTemplateForThisImport')}
            size="small"
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => handleDownloadTemplate(tabType)}
          >
            {t('dialogs.csvImportDialog.downloadTemplate')}
          </Button>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {uploadError && <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert>}
        {jobs.isError && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => void jobs.refetch()}>{t('common.retry')}</Button>}>
          {t('dialogs.csvImportDialog.backgroundLoadFailed')}
        </Alert>}
        {jobs.data && jobs.data.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>{t('dialogs.csvImportDialog.recentImports')}</Typography>
            {jobs.data.map((job) => (
              <Box key={job.id} sx={{ mb: 1 }}>
                <Button size="small" onClick={() => { setSelectedJobId(job.id); setHiddenResultId(null); }}>
                  {job.filename} — {t(`dialogs.csvImportDialog.jobStatus.${job.status}`)} ({job.processedRows} / {job.totalRows})
                </Button>
                {csvImportRunning(job) && <LinearProgress variant="determinate" value={job.progress} aria-label={job.filename} />}
              </Box>
            ))}
            {jobs.data.some(csvImportRunning) && <Alert severity="info" sx={{ mt: 1 }}>{t('dialogs.csvImportDialog.backgroundContinues')}</Alert>}
          </Paper>
        )}
        {importResult && (
          <Alert
            severity={importResult.errors.length > 0 ? 'warning' : 'success'}
            sx={{ mb: 2 }}
            onClose={() => setHiddenResultId(selectedJob?.id ?? null)}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {selectedJob?.status === 'failed' ? t('dialogs.csvImportDialog.jobStatus.failed') : importResult.errors.length > 0
                ? t('dialogs.csvImportDialog.importCompletedWithErrors')
                : t('dialogs.csvImportDialog.importCompleted')}
            </Typography>
            <Typography variant="body2">
              {importResult.successItems > 0 && `${importResult.successItems} ${t('dialogs.csvImportDialog.itemsCreated')}. `}
              {importResult.updatedItems > 0 && `${importResult.updatedItems} ${t('dialogs.csvImportDialog.itemsUpdated')}. `}
              {importResult.successAssemblies > 0 && `${importResult.successAssemblies} ${t('dialogs.csvImportDialog.assembliesCreated')}. `}
              {importResult.successEvents > 0 && `${importResult.successEvents} ${t('dialogs.csvImportDialog.eventsCreated')}. `}
              {importResult.successOrders > 0 && `${importResult.successOrders} ${t('dialogs.csvImportDialog.ordersImported')}. `}
              {importResult.successGeneralOrders > 0 && `${importResult.successGeneralOrders} ${t('dialogs.csvImportDialog.generalOrdersImported')}. `}
              {importResult.successReturns > 0 && `${importResult.successReturns} ${t('dialogs.csvImportDialog.returnsRecorded')}. `}
              {importResult.successCheckouts > 0 && `${importResult.successCheckouts} ${t('dialogs.csvImportDialog.checkoutsRecorded')}. `}
              {importResult.successOperations > 0 && `${importResult.successOperations} ${t('dialogs.csvImportDialog.actionsImported')}. `}
            </Typography>
            {importResult.errors.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="error" sx={{ display: 'block', fontWeight: 600 }}>
                  {t('dialogs.csvImportDialog.warningsErrors')} ({importResult.errors.length}):
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2, overflowWrap: 'anywhere' }}>
                  {importResult.errors.map((err, idx) => (
                    <Typography component="li" key={idx} variant="caption" color="error">
                      {err}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Alert>
        )}
        <Tabs
          value={tabType}
          onChange={(_e, v) => { setTabType(v); setUploadError(''); }}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab title={translate('dialogs.csvImportDialog.importItemsFromCSV')} value="items" label={t('nav.items')} disabled={isImporting} />
          <Tab title={translate('dialogs.csvImportDialog.importAssembliesFromCSV')} value="assemblies" label={t('nav.assemblies')} disabled={isImporting} />
          <Tab title={translate('dialogs.csvImportDialog.importItemsAndAssembliesTogether')} value="combined" label={t('dialogs.csvImportDialog.combinedAll')} disabled={isImporting} />
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
              onDrop={isUploading ? undefined : handleDrop}
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
              onClick={() => { if (!isUploading) fileInputRef.current?.click(); }}
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
                {t('dialogs.csvImportDialog.dragDropCSVFileHereOrClickToSelect')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('dialogs.csvImportDialog.supportsCommaSemicolonAndTabsUTF8Encoded')}
              </Typography>
            </Paper>

            <Box sx={{ textAlign: 'center' }}>
              <Button title={translate('dialogs.csvImportDialog.showOrHideTheCSVTextInput')}
                variant="text"
                size="small"
                startIcon={<ContentPasteIcon />}
                endIcon={pasteOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setPasteOpen(!pasteOpen)}
              >
                {t('dialogs.csvImportDialog.orPasteCSVTextDirectly')}
              </Button>
              <Collapse in={pasteOpen}>
                <Box sx={{ mt: 2, textAlign: 'left' }}>
                  <TextField
                    multiline
                    rows={6}
                    fullWidth
                    placeholder={t('dialogs.csvImportDialog.pasteHeaderAndRowsHereEGNameCategoryAmount')}
                    value={csvContent}
                    onChange={(e) => {
                      setCsvContent(e.target.value);
                      setFileName('Eingefügter Text');
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
                {fileName || t('dialogs.csvImportDialog.loadedCSVData')} ({rows.length} {t('dialogs.csvImportDialog.rows')})
              </Typography>
              <Button title={translate('dialogs.csvImportDialog.resetTheSelectedFileAndImportPreview')}
                size="small"
                color="secondary"
                onClick={resetState}
                disabled={isImporting}
                sx={{ color: (theme) => theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.secondary.main }}
              >
                {t('dialogs.csvImportDialog.chooseAnotherFile')}
              </Button>
            </Stack>

            {/* Options */}
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, backgroundColor: 'background.default' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={updateExistingItems}
                      onChange={(e) => setUpdateExistingItems(e.target.checked)}
                      disabled={isImporting}
                    />
                  }
                  label={t('dialogs.csvImportDialog.updateExistingItemsOnDuplicateName')}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={autoCreateLocations}
                      onChange={(e) => setAutoCreateLocations(e.target.checked)}
                      disabled={isImporting}
                    />
                  }
                  label={t('dialogs.csvImportDialog.autoCreateMissingStorageLocations')}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {t('dialogs.csvImportDialog.locationColumnHelp')}
                </Typography>
                {canCreateReferences && (
                  <FormControlLabel
                    control={<Checkbox checked={autoCreateReferences} onChange={(e) => setAutoCreateReferences(e.target.checked)} disabled={isImporting} />}
                    label={t('dialogs.csvImportDialog.autoCreateMissingReferences')}
                  />
                )}
              </Stack>
            </Paper>

            {/* Statistics Banner */}
            {catalog.isError ? (
              <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => void catalog.refetch()}>{t('common.retry')}</Button>}>
                {t('dialogs.csvImportDialog.catalogLoadFailed', { message: catalog.error.message })}
              </Alert>
            ) : !catalogComplete && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('dialogs.csvImportDialog.catalogLoading')}
              </Alert>
            )}
            {catalogComplete && newFactions.length > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('dialogs.csvImportDialog.factionsToCreate', { factions: newFactions.map((faction) => `${faction.eventType}: ${faction.name}`).join(', ') })}
              </Alert>
            )}
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
              <Chip
                icon={<CheckCircleIcon />}
                color="success"
                variant="outlined"
                label={isImporting || importResult
                  ? t('dialogs.csvImportDialog.importTotalTotalImportedTotalImported', { importTotal: importTotal, totalImported: totalImported })
                  : t('dialogs.csvImportDialog.totalToImportReadyToImport', { totalToImport: totalToImport })}
              />
              {totalDuplicatesCount > 0 && (
                <Chip
                  color={updateExistingItems ? 'info' : 'warning'}
                  variant="outlined"
                  label={updateExistingItems
                    ? t('dialogs.csvImportDialog.totalDuplicatesCountDuplicatesWillUpdate', { totalDuplicatesCount: totalDuplicatesCount })
                    : t('dialogs.csvImportDialog.totalDuplicatesCountDuplicatesWillSkip', { totalDuplicatesCount: totalDuplicatesCount })}
                />
              )}
              {totalErrorsCount > 0 && (
                <Chip title={translate('dialogs.csvImportDialog.jumpToTheFirstImportRowWithAnError')}
                  icon={<ErrorIcon />}
                  color="error"
                  variant="outlined"
                  clickable
                  onClick={handleErrorSummaryClick}
                  aria-label={t('dialogs.csvImportDialog.jumpToTheFirstErrorRow')}
                  label={t('dialogs.csvImportDialog.totalErrorsCountErrorRows', { totalErrorsCount: totalErrorsCount })}
                />
              )}
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {t('dialogs.csvImportDialog.previewCountsTotalImported')}
            </Typography>
            <CsvImportPreview tabType={tabType} updateExistingItems={updateExistingItems} importedCounts={importedCounts} parsedItems={parsedItems} parsedAssemblies={parsedAssemblies} parsedEvents={parsedEvents} parsedOrders={parsedOrders} parsedGeneralOrders={parsedGeneralOrders} parsedReturns={parsedReturns} parsedCheckouts={parsedCheckouts} parsedOperations={parsedOperations} itemSearch={itemSearch} assemblySearch={assemblySearch} onItemSearchChange={setItemSearch} onAssemblySearchChange={setAssemblySearch} />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button title={translate('common.closeThisDialog')} onClick={onClose} disabled={isUploading}>
          {t('common.close')}
        </Button>
        {csvContent && (
          <Button title={translate('dialogs.csvImportDialog.importTheEntriesShownInThePreview')}
            variant="contained"
            onClick={executeImport}
            disabled={isImporting || jobs.isPending || jobs.isError || !catalogComplete || totalToImport === 0}
            startIcon={<CloudUploadIcon />}
          >
            {isImporting
              ? t('dialogs.csvImportDialog.uploading')
              : t('dialogs.csvImportDialog.importNowTotalToImport', { totalToImport: totalToImport })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
