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

import { useLocalizedText } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';
import {
  parseCsv,
  detectCsvType,
  parseItemsFromCsv,
  parseAssembliesFromCsv,
  parseEventReportsFromCsv,
  parseFactionOrdersFromCsv,
  parseGeneralOrdersFromCsv,
  generateSampleItemsCsv,
  generateSampleAssembliesCsv,
  generateSampleCombinedCsv,
  type CsvImportType,
  type ParsedItemRow,
  type ParsedAssemblyRow,
  type ParsedEventReportRow,
  type ParsedFactionOrderRow,
  type ParsedGeneralOrderRow,
  type ParsedReturnRow,
  type FactionOrderImportStatus,
  parseReturnsFromCsv,
  parseCheckoutsFromCsv,
} from '../../utils/csvImport';
import type { Item, Assembly, StorageLocation } from '../../types';
import { createItem, updateItem, createItemAssets, getItemAssets, getItem } from '../../services/inventoryService';
import { createAssembly } from '../../services/assemblyService';
import { createEventReport, getEventReports, updateEventReport } from '../../services/eventService';
import {
  createFactionOrder,
  getFactionOrders,
  getFactionOrder,
  submitFactionOrder,
  updateFactionOrder,
  saveFactionOrderPreparation,
  markFactionOrderReady,
  pickUpFactionOrder,
  returnFactionOrder,
  closeFactionOrder,
} from '../../services/factionOrderService';
import { createTransaction, getTransactions } from '../../services/transactionService';
import { createOrder, getOrders, returnOrder, transitionOrder } from '../../services/orderService';
import { createStorageLocation } from '../../services/storageLocationService';
import { useQueryClient } from '@tanstack/react-query';
import { getItemStock } from '../../utils/stock';
import { LIST_PAGE_SIZE } from '../../hooks/useProgressiveList';

interface Props {
  open: boolean;
  onClose: () => void;
  items: Item[];
  assemblies: Assembly[];
  storageLocations: StorageLocation[];
  catalogComplete: boolean;
}

async function loadAllPages<T>(getPage: (page: number, size: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; ; page++) {
    const batch = await getPage(page, LIST_PAGE_SIZE);
    all.push(...batch);
    if (batch.length < LIST_PAGE_SIZE) return all;
  }
}

function getPreviewRows<T extends { status: string }>(rows: T[]): T[] {
  return rows.slice(0, 50).concat(rows.slice(50).filter((row) => row.status === 'error'));
}

function getOrderStatusChip(status: FactionOrderImportStatus, t: (de: string, en: string) => string) {
  switch (status) {
    case 'closed':
      return <Chip size="small" color="default" variant="outlined" label={t('Abgeschlossen', 'Closed')} />;
    case 'returned':
      return <Chip size="small" color="success" label={t('Zurückgegeben', 'Returned')} />;
    case 'partially_returned':
      return <Chip size="small" color="warning" label={t('Teilrückgabe', 'Partially returned')} />;
    case 'picked_up':
      return <Chip size="small" color="info" label={t('Ausgegeben', 'Picked up')} />;
    case 'ready':
      return <Chip size="small" color="primary" label={t('Bereit', 'Ready')} />;
    case 'submitted':
      return <Chip size="small" color="primary" variant="outlined" label={t('Eingereicht', 'Submitted')} />;
    default:
      return <Chip size="small" color="default" label={t('Entwurf', 'Draft')} />;
  }
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
  const [importResult, setImportResult] = useState<{
    successItems: number;
    updatedItems: number;
    successAssemblies: number;
    successEvents: number;
    successOrders: number;
    successGeneralOrders: number;
    successReturns: number;
    successCheckouts: number;
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

  const effectiveItemsForAssemblies = useMemo(() => {
    if (tabType !== 'combined') return items;
    const map = new Map<string, Item>();
    for (const it of items) {
      map.set(it.name.toLowerCase().trim(), it);
    }
    for (const p of parsedItems) {
      if (p.data.name && !map.has(p.data.name.toLowerCase().trim())) {
        map.set(p.data.name.toLowerCase().trim(), {
          id: `csv-new-${p.index}`,
          name: p.data.name,
          category: p.data.category,
          amount: p.data.amount ?? 0,
          minStock: p.data.minStock,
          value: p.data.value,
          storageLocation: p.storageLocationId || '',
          created: '',
          updated: '',
        } as Item);
      }
    }
    return Array.from(map.values());
  }, [items, parsedItems, tabType]);

  const parsedAssemblies: ParsedAssemblyRow[] = useMemo(() => {
    if (tabType === 'items' || rows.length === 0) return [];
    return parseAssembliesFromCsv(rows, effectiveItemsForAssemblies, assemblies);
  }, [rows, tabType, effectiveItemsForAssemblies, assemblies]);

  const parsedEvents: ParsedEventReportRow[] = useMemo(() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseEventReportsFromCsv(rows, effectiveItemsForAssemblies);
  }, [rows, tabType, effectiveItemsForAssemblies]);

  const parsedOrders: ParsedFactionOrderRow[] = useMemo(() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseFactionOrdersFromCsv(rows, effectiveItemsForAssemblies);
  }, [rows, tabType, effectiveItemsForAssemblies]);

  const parsedGeneralOrders: ParsedGeneralOrderRow[] = useMemo(() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseGeneralOrdersFromCsv(rows, effectiveItemsForAssemblies);
  }, [rows, tabType, effectiveItemsForAssemblies]);

  const parsedReturns: ParsedReturnRow[] = useMemo(() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseReturnsFromCsv(rows, effectiveItemsForAssemblies, storageLocations);
  }, [rows, tabType, effectiveItemsForAssemblies, storageLocations]);
  const parsedCheckouts = useMemo(() => tabType === 'combined'
    ? parseCheckoutsFromCsv(rows, effectiveItemsForAssemblies) : [], [rows, tabType, effectiveItemsForAssemblies]);

  // Statistics
  const validItemsCount = parsedItems.filter((i) => i.status === 'valid' || i.status === 'warning' || (i.status === 'duplicate' && updateExistingItems)).length;
  const validAssembliesCount = parsedAssemblies.filter((a) => a.status === 'valid').length;
  const validEventsCount = parsedEvents.filter((event) => event.status === 'valid').length;
  const validOrdersCount = parsedOrders.filter((order) => order.status === 'valid').length;
  const validGeneralOrdersCount = parsedGeneralOrders.filter((order) => order.status === 'valid').length;
  const validReturnsCount = parsedReturns.filter((r) => r.status === 'valid' && r.targetStatus === 'accepted').length;
  const validCheckoutsCount = parsedCheckouts.filter((r) => r.status === 'valid').length;
  const totalErrorsCount = parsedItems.filter((i) => i.status === 'error').length
    + parsedAssemblies.filter((a) => a.status === 'error').length
    + parsedEvents.filter((event) => event.status === 'error').length
    + parsedOrders.filter((order) => order.status === 'error').length
    + parsedGeneralOrders.filter((order) => order.status === 'error').length
    + parsedReturns.filter((r) => r.status === 'error').length
    + parsedCheckouts.filter((r) => r.status === 'error').length;
  const totalDuplicatesCount = parsedItems.filter((i) => i.status === 'duplicate').length + parsedAssemblies.filter((a) => a.status === 'duplicate').length;

  function firstErrorTarget(section: 'items' | 'assemblies' | 'events' | 'orders' | 'returns' | 'checkouts', rows: { index: number; status: string }[]) {
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
          ?? firstErrorTarget('checkouts', parsedCheckouts);

    if (!firstError) return;

    document.getElementById(`csv-import-${firstError.section}-row-${firstError.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const totalToImport = (tabType === 'assemblies' ? 0 : validItemsCount)
    + (tabType === 'items' ? 0 : validAssembliesCount)
    + validEventsCount
    + validOrdersCount
    + validGeneralOrdersCount
    + validReturnsCount + validCheckoutsCount;

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

    const errors: string[] = [
      ...parsedItems.filter((row) => row.status === 'error').map((row) => `Artikel Zeile ${row.index}: ${row.statusMessage}`),
      ...parsedAssemblies.filter((row) => row.status === 'error').map((row) => `Baugruppe Zeile ${row.index}: ${row.statusMessage}`),
      ...parsedEvents.filter((row) => row.status === 'error').map((row) => `Event Zeile ${row.index}: ${row.statusMessage}`),
      ...parsedOrders.filter((row) => row.status === 'error').map((row) => `Bestellung Zeile ${row.index}: ${row.statusMessage}`),
      ...parsedGeneralOrders.filter((row) => row.status === 'error').map((row) => `Allgemeine Bestellung Zeile ${row.index}: ${row.statusMessage}`),
      ...parsedReturns.filter((row) => row.status === 'error').map((row) => `Rückgabe Zeile ${row.index}: ${row.statusMessage}`),
      ...parsedCheckouts.filter((row) => row.status === 'error').map((row) => `Ausleihe Zeile ${row.index}: ${row.statusMessage}`),
    ];
    let successItems = 0;
    let updatedItems = 0;
    let successAssemblies = 0;
    let successEvents = 0;
    let successOrders = 0;
    let successGeneralOrders = 0;

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
    const totalSteps = itemsToProcess.length
      + (tabType === 'items' ? 0 : parsedAssemblies.filter((a) => a.status === 'valid').length)
      + validEventsCount
      + validOrdersCount
      + validGeneralOrdersCount
      + validReturnsCount + validCheckoutsCount;
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

        const hasCustomAssets = row.data.trackingMode === 'serialized' && Boolean(row.assetCodes && row.assetCodes.length > 0);
        const payload = {
          ...row.data,
          storageLocation: locationId,
          // When serialized and explicit asset codes are provided, start with amount 0 on item creation
          // so backend does not generate default SKU-xxx assets, then register the explicit codes
          amount: hasCustomAssets ? 0 : row.data.amount,
        };

        try {
          if (row.isExisting && updateExistingItems && row.existingId) {
            const updated = await updateItem(row.existingId, payload);
            updatedItems++;
            createdItemsMap.set(updated.name.toLowerCase().trim(), updated);

            if (hasCustomAssets && row.assetCodes) {
              for (const code of row.assetCodes) {
                try {
                  await createItemAssets(row.existingId, {
                    assetCode: code,
                    currentLocationId: locationId || undefined,
                  });
                } catch {
                  // Asset code might already exist, ignore conflict
                }
              }
            }
          } else if (!row.isExisting) {
            const created = await createItem(payload);
            successItems++;
            createdItemsMap.set(created.name.toLowerCase().trim(), created);

            if (hasCustomAssets && row.assetCodes) {
              for (const code of row.assetCodes) {
                try {
                  await createItemAssets(created.id, {
                    assetCode: code,
                    currentLocationId: locationId || undefined,
                  });
                } catch (assetErr: unknown) {
                  errors.push(`Fehler beim Erstellen von Asset "${code}" für "${row.data.name}": ${(assetErr as Error).message || assetErr}`);
                }
              }
            }
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
          const isTempId = comp.itemId?.startsWith('csv-new-');
          const item = (!isTempId && comp.itemId) ? items.find((i) => i.id === comp.itemId) : createdItemsMap.get(comp.itemName.toLowerCase().trim());
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

    // Step 4: Import event history after all referenced items exist. Matching
    // type/date records are updated so retrying a sample import is safe.
    const existingEvents = parsedEvents.length > 0 || parsedGeneralOrders.length > 0 ? await getEventReports() : [];
    for (const row of parsedEvents.filter((event) => event.status === 'valid')) {
      currentStep++;
      setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
      setImportStatusText(t(
        `Erstelle ${row.data.eventType}-Event vom ${row.data.eventDate}...`,
        `Creating ${row.data.eventType} event on ${row.data.eventDate}...`,
      ));

      const resolveQuantities = (components: ParsedEventReportRow['usedItems']) => {
        const quantities: Record<string, number> = {};
        for (const component of components) {
          const isTempId = component.itemId?.startsWith('csv-new-');
          const item = (!isTempId && component.itemId)
            ? items.find((candidate) => candidate.id === component.itemId)
            : createdItemsMap.get(component.itemName.toLowerCase().trim());
          if (!item) throw new Error(`Artikel "${component.itemName}" konnte nicht gefunden werden`);
          quantities[item.id] = (quantities[item.id] ?? 0) + component.quantity;
        }
        return quantities;
      };

      try {
        const plannedQuantities = resolveQuantities(row.plannedItems);
        const usedQuantities = resolveQuantities(row.usedItems);
        const data = {
          ...row.data,
          itemIds: Object.keys(usedQuantities),
          plannedQuantities,
          usedQuantities,
        };
        const existing = existingEvents.find((event) => (
          event.eventType === data.eventType && event.eventDate.slice(0, 10) === data.eventDate.slice(0, 10)
        ));
        const saved = existing
          ? await updateEventReport(existing.id, data)
          : await createEventReport(data);
        if (!existing) existingEvents.push(saved);
        successEvents++;
      } catch (err: unknown) {
        errors.push(`Event ${row.data.eventType} ${row.data.eventDate}: ${(err as Error).message || err}`);
      }
    }

    // Step 5: Import faction orders after their event occurrences exist.
    const existingOrders = parsedOrders.length > 0
      ? await loadAllPages((page, size) => getFactionOrders({ page, size })) : [];
    for (const row of parsedOrders.filter((order) => order.status === 'valid')) {
      currentStep++;
      setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
      setImportStatusText(t(
        `Importiere Bestellung ${row.data.faction} für ${row.data.eventDate}...`,
        `Importing ${row.data.faction} order for ${row.data.eventDate}...`,
      ));

      try {
        const requestedQuantities: Record<string, number> = {};
        for (const component of row.requestedItems) {
          const isTempId = component.itemId?.startsWith('csv-new-');
          const item = (!isTempId && component.itemId)
            ? items.find((candidate) => candidate.id === component.itemId)
            : createdItemsMap.get(component.itemName.toLowerCase().trim());
          if (!item) throw new Error(`Artikel "${component.itemName}" konnte nicht gefunden werden`);
          requestedQuantities[item.id] = (requestedQuantities[item.id] ?? 0) + component.quantity;
        }
        const data = {
          ...row.data,
          itemIds: Object.keys(requestedQuantities),
          requestedQuantities,
        };
        const existing = existingOrders.find((order) => (
          order.eventType === data.eventType
          && order.faction.toLowerCase() === data.faction.toLowerCase()
          && order.eventDate.slice(0, 10) === data.eventDate.slice(0, 10)
          && (order.notes || '').trim() === (data.notes || '').trim()
        ));
        let finalOrder = existing ? await getFactionOrder(existing.id) : await createFactionOrder(data);
        if (finalOrder.status === 'preparing') {
          finalOrder = await submitFactionOrder(finalOrder.id);
        }
        if (['draft', 'submitted'].includes(finalOrder.status) && existing) {
          finalOrder = await updateFactionOrder(finalOrder.id, data);
        }
        if (row.targetStatus !== 'draft' && finalOrder.status === 'draft') {
          finalOrder = await submitFactionOrder(finalOrder.id);
        }
        if (['ready', 'picked_up', 'returned', 'closed'].includes(row.targetStatus)) {
          if (finalOrder.status === 'submitted') {
            const assetAssignments: Record<string, string[]> = {};
            for (const [id, quantity] of Object.entries(finalOrder.requestedQuantities || {})) {
              const item = [...createdItemsMap.values()].find((candidate) => candidate.id === id);
              if (item?.trackingMode !== 'serialized') continue;
              const available = (await loadAllPages((page, size) => getItemAssets(id, { page, size })))
                .filter((asset) => asset.availabilityStatus === 'available');
              if (available.length < quantity) throw new Error(`Nicht genügend Assets für ${item.name}`);
              assetAssignments[id] = available.slice(0, quantity).map((asset) => asset.id);
            }
            finalOrder = await saveFactionOrderPreparation(
              finalOrder.id,
              finalOrder.requestedQuantities || {},
              finalOrder.requestedAssemblyQuantities || {},
              assetAssignments,
            );
          }
          if (finalOrder.status === 'preparing') {
            finalOrder = await markFactionOrderReady(finalOrder.id, 'Automatisch vorbereitet');
          }
          if (['picked_up', 'returned', 'closed'].includes(row.targetStatus) && finalOrder.status === 'ready') {
            finalOrder = await pickUpFactionOrder(finalOrder.id);
          }
          if (['returned', 'closed'].includes(row.targetStatus) && ['picked_up', 'partially_returned'].includes(finalOrder.status)) {
            finalOrder = await returnFactionOrder(finalOrder.id);
          }
          if (row.targetStatus === 'closed' && finalOrder.status === 'returned') {
            finalOrder = await closeFactionOrder(finalOrder.id);
          }
        }
        if (finalOrder.status !== row.targetStatus) {
          throw new Error(`Status ${finalOrder.status} statt ${row.targetStatus}`);
        }
        if (existing) existingOrders.splice(existingOrders.findIndex((order) => order.id === existing.id), 1, finalOrder);
        else existingOrders.push(finalOrder);
        successOrders++;
      } catch (err: unknown) {
        errors.push(`Bestellung ${row.data.eventType} ${row.data.eventDate} ${row.data.faction}: ${(err as Error).message || err}`);
      }
    }

    // Step 6: Simulate general orders using the same lifecycle as the order page.
    const existingGeneralOrders = parsedGeneralOrders.length > 0
      ? await loadAllPages((page, size) => getOrders({ page, size })) : [];
    for (const row of parsedGeneralOrders.filter((order) => order.status === 'valid')) {
      currentStep++;
      setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
      setImportStatusText(t(`Importiere allgemeine Bestellung ${row.data.name}...`, `Importing general order ${row.data.name}...`));
      try {
        const resolve = (components: ParsedGeneralOrderRow['requestedItems']) => {
          const quantities: Record<string, number> = {};
          for (const component of components) {
            const item = items.find((candidate) => candidate.id === component.itemId)
              ?? createdItemsMap.get(component.itemName.toLowerCase().trim());
            if (!item) throw new Error(`Artikel "${component.itemName}" konnte nicht gefunden werden`);
            quantities[item.id] = (quantities[item.id] ?? 0) + component.quantity;
          }
          return quantities;
        };
        let event = existingEvents.find((candidate) => candidate.eventType === row.eventType && candidate.eventDate.slice(0, 10) === row.eventDate);
        if (!event) {
          event = await createEventReport({ eventType: row.eventType!, eventDate: row.eventDate,
            status: 'planned', itemIds: [], plannedQuantities: {}, usedQuantities: {}, notes: '' });
          existingEvents.push(event);
        }
        const requestedQuantities = resolve(row.requestedItems);
        let order = existingGeneralOrders.find((candidate) => candidate.name.toLowerCase() === row.data.name.toLowerCase()
          && candidate.eventOccurrenceId === event.id);
        if (order) {
          successGeneralOrders++;
          continue;
        }
        order = await createOrder({ name: row.data.name, purpose: row.data.purpose,
          eventOccurrenceId: event.id, requestedQuantities });
        existingGeneralOrders.push(order);
        if (row.targetStatus !== 'draft') order = await transitionOrder(order.id, 'submit');
        if (['ready', 'picked_up', 'partially_returned', 'returned', 'closed'].includes(row.targetStatus)) order = await transitionOrder(order.id, 'ready');
        if (['picked_up', 'partially_returned', 'returned', 'closed'].includes(row.targetStatus)) {
          const assetAssignments: Record<string, string[]> = {};
          for (const [id, quantity] of Object.entries(requestedQuantities)) {
            const item = items.find((candidate) => candidate.id === id) ?? [...createdItemsMap.values()].find((candidate) => candidate.id === id);
            if (item?.trackingMode === 'serialized') {
              const available = (await loadAllPages((page, size) => getItemAssets(id, { page, size })))
                .filter((asset) => asset.availabilityStatus === 'available');
              if (available.length < quantity) throw new Error(`Nicht genügend Assets für ${item.name}`);
              assetAssignments[id] = available.slice(0, quantity).map((asset) => asset.id);
            }
          }
          order = await transitionOrder(order.id, 'pickup', assetAssignments);
        }
        if (['partially_returned', 'returned', 'closed'].includes(row.targetStatus)) {
          order = await returnOrder(order.id, resolve(row.returnedItems), resolve(row.consumedItems));
        }
        if (row.targetStatus === 'closed') await transitionOrder(order.id, 'close');
        successGeneralOrders++;
      } catch (err: unknown) {
        errors.push(`Allgemeine Bestellung ${row.data.name}: ${(err as Error).message || err}`);
      }
    }

    // Step 7: Import standalone returns if any
    let successReturns = 0;
    for (const ret of parsedReturns.filter((r) => r.status === 'valid' && r.targetStatus === 'accepted')) {
      currentStep++;
      setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
      setImportStatusText(t(
        `Importiere Rückgabe für ${ret.itemName}...`,
        `Importing return for ${ret.itemName}...`,
      ));

      try {
        const item = items.find((candidate) => candidate.id === ret.itemId) || createdItemsMap.get(ret.itemName.toLowerCase().trim());
        if (!item) throw new Error(`Artikel "${ret.itemName}" nicht gefunden`);

        if (ret.generalOrderName) {
          const order = existingGeneralOrders.find((candidate) => candidate.name.toLowerCase() === ret.generalOrderName?.toLowerCase()
            && (!ret.date || existingEvents.find((event) => event.id === candidate.eventOccurrenceId)?.eventDate.slice(0, 10) === ret.date));
          if (!order) throw new Error(`Allgemeine Bestellung "${ret.generalOrderName}" nicht gefunden`);
          if (['returned', 'closed'].includes(order.status)) continue;
          const updated = await returnOrder(order.id, { [item.id]: ret.quantity }, {});
          existingGeneralOrders.splice(existingGeneralOrders.findIndex((candidate) => candidate.id === order.id), 1, updated);
        } else if (item.trackingMode === 'serialized') {
          const assets = await loadAllPages((page, size) => getItemAssets(item.id, { page, size }));
          if (ret.assetCodes.length !== ret.quantity) throw new Error('AssetCodes müssen der Menge entsprechen');
          let recorded = false;
          for (const code of ret.assetCodes) {
            const asset = assets.find((candidate) => candidate.assetCode.toLowerCase() === code.toLowerCase());
            if (!asset) throw new Error(`Asset "${code}" nicht gefunden`);
            if (asset.availabilityStatus === 'available') continue;
            if (!['in_field', 'in_custody', 'returned_pending_check'].includes(asset.availabilityStatus)) {
              throw new Error(`Asset "${code}" kann im Status ${asset.availabilityStatus} nicht zurückgegeben werden`);
            }
            await createTransaction({
              itemId: item.id,
              transactionType: 'checkin',
              quantityChanged: 1,
              assetInstanceId: asset.id,
              reason: 'CSV-Import Rückgabe',
              notes: `CSV return row ${ret.index}: ${ret.notes}`,
              eventType: ret.eventType,
              faction: ret.faction,
            });
            recorded = true;
          }
          if (!recorded) continue;
        } else {
          const marker = `CSV return row ${ret.index}`;
          const previous = await loadAllPages((page, size) => getTransactions({ itemId: item.id, page, size }));
          if (previous.some((tx) => tx.transactionType === 'checkin' && tx.notes?.includes(marker))) continue;
          const current = await getItem(item.id);
          if (getItemStock(current).checkedOut === 0) continue;
          if (getItemStock(current).checkedOut < ret.quantity) throw new Error('Rückgabemenge übersteigt den ausgeliehenen Bestand');
          await createTransaction({
            itemId: item.id,
            transactionType: 'checkin',
            quantityChanged: ret.quantity,
            reason: 'CSV-Import Rückgabe',
            notes: `${marker}: ${ret.notes}`,
            eventType: ret.eventType,
            faction: ret.faction,
          });
        }
        successReturns++;
      } catch (err: unknown) {
        errors.push(`Rückgabe ${ret.itemName}: ${(err as Error).message || err}`);
      }
    }

    // Step 8: Apply explicit checkout rows after item and asset creation.
    let successCheckouts = 0;
    for (const row of parsedCheckouts.filter((entry) => entry.status === 'valid')) {
      currentStep++;
      setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
      try {
        const item = createdItemsMap.get(row.itemName.toLowerCase().trim());
        if (!item) throw new Error(`Artikel "${row.itemName}" nicht gefunden`);
        const marker = `CSV checkout row ${row.index}`;
        const previous = await loadAllPages((page, size) => getTransactions({ itemId: item.id, page, size }));
        const imported = previous.filter((tx) => tx.transactionType === 'checkout' && tx.notes?.includes(marker));
        if (item.trackingMode === 'serialized') {
          const assets = await loadAllPages((page, size) => getItemAssets(item.id, { page, size }));
          const selected = row.assetCodes.length
            ? row.assetCodes.map((code) => assets.find((asset) => asset.assetCode === code))
            : assets.filter((asset) => asset.availabilityStatus === 'available').slice(0, row.quantity - imported.length);
          if ((row.assetCodes.length ? selected.length !== row.quantity : selected.length !== row.quantity - imported.length)
            || selected.some((asset) => !asset || (asset.availabilityStatus !== 'available' && !imported.some((tx) => tx.assetInstanceId === asset.id)))) {
            throw new Error('Nicht genügend passende Seriengeräte verfügbar');
          }
          for (const asset of selected) {
            if (imported.some((tx) => tx.assetInstanceId === asset!.id)) continue;
            await createTransaction({ itemId: item.id, transactionType: 'checkout', quantityChanged: 1,
              assetInstanceId: asset!.id, eventType: row.eventType, faction: row.faction,
              reason: 'CSV-Import Ausleihe', notes: `${marker}: ${row.notes}` });
          }
        } else {
          if (imported.length) continue;
          await createTransaction({ itemId: item.id, transactionType: 'checkout', quantityChanged: row.quantity,
            eventType: row.eventType, faction: row.faction,
            reason: 'CSV-Import Ausleihe', notes: `${marker}: ${row.notes}` });
        }
        successCheckouts++;
      } catch (err: unknown) {
        errors.push(`Ausleihe ${row.itemName}: ${(err as Error).message || err}`);
      }
    }

    // Invalidate caches
    queryClient.invalidateQueries({ queryKey: ['items'] });
    queryClient.invalidateQueries({ queryKey: ['assemblies'] });
    queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['event-reports'] });
    queryClient.invalidateQueries({ queryKey: ['faction-orders'] });
    queryClient.invalidateQueries({ queryKey: ['general-orders'] });

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
      errors,
    });
    if (errors.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setCsvContent('');
      setFileName('');
      setPasteOpen(false);
    }

    const totalSuccess = successItems + updatedItems + successAssemblies + successEvents + successOrders + successGeneralOrders + successReturns + successCheckouts;
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
                      {getPreviewRows(parsedItems).map((row) => (
                        <TableRow key={row.index} id={`csv-import-items-row-${row.index}`} hover>
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
                          <TableCell sx={{ fontWeight: 500 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{row.data.name || '—'}</span>
                              {row.data.trackingMode === 'serialized' && (
                                <Tooltip
                                  title={row.assetCodes?.length ? `Asset-Codes (${row.assetCodes.length}): ${row.assetCodes.join(', ')}` : t('Seriennummernverwaltung (TrackingMode: serialized)', 'Serialized tracking')}
                                  arrow
                                >
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                    label={row.assetCodes?.length ? `${t('Seriell', 'Serialized')} (${row.assetCodes.length})` : t('Seriell', 'Serialized')}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
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
                      {getPreviewRows(parsedAssemblies).map((row) => (
                        <TableRow key={row.index} id={`csv-import-assemblies-row-${row.index}`} hover>
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

            {tabType === 'combined' && parsedEvents.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Eventverlauf-Vorschau', 'Event History Preview')} ({parsedEvents.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('Status', 'Status')}</TableCell>
                        <TableCell>{t('Event', 'Event')}</TableCell>
                        <TableCell>{t('Datum', 'Date')}</TableCell>
                        <TableCell>{t('Geplant', 'Planned')}</TableCell>
                        <TableCell>{t('Verwendet', 'Used')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedEvents.map((row) => (
                        <TableRow key={row.index} id={`csv-import-events-row-${row.index}`} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' ? (
                              <Chip size="small" color="success" label={t('Gültig', 'Valid')} />
                            ) : (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('Fehler', 'Error')} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{row.data.eventType === 'LS' ? 'LightSim' : row.data.eventType}</TableCell>
                          <TableCell>{row.data.eventDate}</TableCell>
                          <TableCell>{row.plannedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ') || '—'}</TableCell>
                          <TableCell>{row.usedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ') || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tabType === 'combined' && parsedOrders.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Bestellungs-Vorschau', 'Orders Preview')} ({parsedOrders.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('Status', 'Status')}</TableCell>
                        <TableCell>{t('Event', 'Event')}</TableCell>
                        <TableCell>{t('Datum', 'Date')}</TableCell>
                        <TableCell>{t('Fraktion', 'Faction')}</TableCell>
                        <TableCell>{t('Bestellte Artikel', 'Requested items')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedOrders.map((row) => (
                        <TableRow key={row.index} id={`csv-import-orders-row-${row.index}`} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' ? (
                              getOrderStatusChip(row.targetStatus, t)
                            ) : (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('Fehler', 'Error')} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{row.data.eventType === 'LS' ? 'LightSim' : row.data.eventType}</TableCell>
                          <TableCell>{row.data.eventDate}</TableCell>
                          <TableCell>{row.data.faction}</TableCell>
                          <TableCell>{row.requestedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ') || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tabType === 'combined' && parsedGeneralOrders.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Allgemeine Bestellungen', 'General orders')} ({parsedGeneralOrders.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead><TableRow><TableCell>#</TableCell><TableCell>{t('Status', 'Status')}</TableCell>
                      <TableCell>{t('Name', 'Name')}</TableCell><TableCell>{t('Event', 'Event')}</TableCell>
                      <TableCell>{t('Bestellte Artikel', 'Requested items')}</TableCell></TableRow></TableHead>
                    <TableBody>{parsedGeneralOrders.map((row) => <TableRow key={row.index} id={`csv-import-orders-row-${row.index}`}>
                      <TableCell>{row.index}</TableCell>
                      <TableCell>{row.status === 'valid' ? getOrderStatusChip(row.targetStatus, t)
                        : <Tooltip title={row.statusMessage || ''} arrow><Chip size="small" color="error" label={t('Fehler', 'Error')} /></Tooltip>}</TableCell>
                      <TableCell>{row.data.name}</TableCell><TableCell>{row.eventType} · {row.eventDate}</TableCell>
                      <TableCell>{row.requestedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ')}</TableCell>
                    </TableRow>)}</TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tabType === 'combined' && parsedReturns.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Rückgaben-Vorschau', 'Returns Preview')} ({parsedReturns.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('Status', 'Status')}</TableCell>
                        <TableCell>{t('Artikel', 'Item')}</TableCell>
                        <TableCell align="right">{t('Menge', 'Quantity')}</TableCell>
                        <TableCell>{t('Lagerort', 'Storage Location')}</TableCell>
                        <TableCell>{t('Event / Fraktion', 'Event / Faction')}</TableCell>
                        <TableCell>{t('Hinweis', 'Notes')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedReturns.map((row) => (
                        <TableRow key={row.index} id={`csv-import-returns-row-${row.index}`} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' ? (
                              <Chip
                                size="small"
                                color={row.targetStatus === 'accepted' ? 'success' : row.targetStatus === 'pending' ? 'warning' : 'error'}
                                label={row.targetStatus === 'accepted' ? t('Bestätigt', 'Accepted') : row.targetStatus === 'pending' ? t('Ausstehend', 'Pending') : t('Abgelehnt', 'Rejected')}
                              />
                            ) : (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('Fehler', 'Error')} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{row.itemName}</span>
                              {row.assetCode && (
                                <Chip size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.7rem' }} label={row.assetCode} />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">{row.quantity}</TableCell>
                          <TableCell>{row.storageLocationName || '—'}</TableCell>
                          <TableCell>{[row.eventType, row.faction, row.person].filter(Boolean).join(' · ') || '—'}</TableCell>
                          <TableCell>{row.notes || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
            {tabType === 'combined' && parsedCheckouts.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Ausleihen-Vorschau', 'Checkouts preview')} ({parsedCheckouts.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead><TableRow><TableCell>#</TableCell><TableCell>{t('Status', 'Status')}</TableCell>
                      <TableCell>{t('Artikel', 'Item')}</TableCell><TableCell>{t('Menge', 'Quantity')}</TableCell>
                      <TableCell>{t('Asset-Codes', 'Asset codes')}</TableCell><TableCell>{t('Event / Fraktion', 'Event / faction')}</TableCell></TableRow></TableHead>
                    <TableBody>{parsedCheckouts.map((row) => <TableRow key={row.index} id={`csv-import-checkouts-row-${row.index}`} hover>
                      <TableCell>{row.index}</TableCell>
                      <TableCell>{row.status === 'valid' ? <Chip size="small" color="success" label={t('Bereit', 'Ready')} />
                        : <Tooltip title={row.statusMessage || ''} arrow><Chip size="small" color="error" label={t('Fehler', 'Error')} /></Tooltip>}</TableCell>
                      <TableCell>{row.itemName}</TableCell><TableCell>{row.quantity}</TableCell>
                      <TableCell>{row.assetCodes.join(', ') || '—'}</TableCell><TableCell>{row.eventType} · {row.faction}</TableCell>
                    </TableRow>)}</TableBody>
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
