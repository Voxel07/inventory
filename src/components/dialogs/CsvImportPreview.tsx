import { formatDate } from '../../utils/dateFormat';
import { formatMoney } from '../../utils/money';
import { Box, Typography, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Tooltip, TextField } from '@mui/material';
import { useLocalizedText } from '../../utils/naming';
import { type CsvImportCounts, type CsvImportType, type ParsedItemRow, type ParsedAssemblyRow, type ParsedEventReportRow, type ParsedFactionOrderRow, type ParsedGeneralOrderRow, type ParsedReturnRow, type FactionOrderImportStatus } from '../../types/csvImport';
import { CSV_OPERATIONS } from '../../utils/csvOperations';
import type { ParsedCheckoutRow } from '../../types/csvImport';
import type { ParsedOperationRow } from '../../utils/csvOperations';

interface Props {
  tabType: CsvImportType;
  updateExistingItems: boolean;
  importedCounts: CsvImportCounts;
  parsedItems: ParsedItemRow[];
  parsedAssemblies: ParsedAssemblyRow[];
  parsedEvents: ParsedEventReportRow[];
  parsedOrders: ParsedFactionOrderRow[];
  parsedGeneralOrders: ParsedGeneralOrderRow[];
  parsedReturns: ParsedReturnRow[];
  parsedCheckouts: ParsedCheckoutRow[];
  parsedOperations: ParsedOperationRow[];
  itemSearch: string;
  assemblySearch: string;
  onItemSearchChange: (value: string) => void;
  onAssemblySearchChange: (value: string) => void;
}

function searchRows<T extends { rawRow: Record<string, string>; statusMessage?: string; data: { name?: string; description?: string }; components?: { itemName: string }[] }>(rows: T[], query: string): T[] {
  const term = query.trim().toLocaleLowerCase();
  return term ? rows.filter((row) => [...Object.values(row.rawRow), row.data.name ?? '', row.data.description ?? '', row.statusMessage ?? '', ...(row.components?.map((component) => component.itemName) ?? [])]
    .some((value) => value.toLocaleLowerCase().includes(term))) : rows;
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

export function CsvImportPreview({ tabType, updateExistingItems, importedCounts, parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, itemSearch, assemblySearch, onItemSearchChange, onAssemblySearchChange }: Props) {
  const t = useLocalizedText();
  const visibleItems = searchRows(parsedItems, itemSearch);
  const visibleAssemblies = searchRows(parsedAssemblies, assemblySearch);
  return <>
            {/* Preview Tables */}
            {tabType !== 'assemblies' && parsedItems.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Artikel-Vorschau', 'Items Preview')} ({parsedItems.length} / {importedCounts.items})
                </Typography>
                <TextField fullWidth size="small" label={t('Artikel suchen', 'Search items')} value={itemSearch} onChange={(event) => onItemSearchChange(event.target.value)} sx={{ mb: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {t(`${visibleItems.length} von ${parsedItems.length} Artikeln`, `${visibleItems.length} of ${parsedItems.length} items`)}
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
                      {visibleItems.map((row) => (
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
                          <TableCell align="right">{formatMoney(row.data.value ?? 0)}</TableCell>
                          <TableCell>{row.storageLocationName || '—'}</TableCell>
                        </TableRow>
                      ))}
                      {!visibleItems.length && <TableRow><TableCell colSpan={8}>{t('Keine passenden Artikel.', 'No matching items.')}</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tabType !== 'items' && parsedAssemblies.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Baugruppen-Vorschau', 'Assemblies Preview')} ({parsedAssemblies.length} / {importedCounts.assemblies})
                </Typography>
                <TextField fullWidth size="small" label={t('Baugruppen suchen', 'Search assemblies')} value={assemblySearch} onChange={(event) => onAssemblySearchChange(event.target.value)} sx={{ mb: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {t(`${visibleAssemblies.length} von ${parsedAssemblies.length} Baugruppen`, `${visibleAssemblies.length} of ${parsedAssemblies.length} assemblies`)}
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
                      {visibleAssemblies.map((row) => (
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
                      {!visibleAssemblies.length && <TableRow><TableCell colSpan={5}>{t('Keine passenden Baugruppen.', 'No matching assemblies.')}</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tabType === 'combined' && parsedEvents.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Eventverlauf-Vorschau', 'Event History Preview')} ({parsedEvents.length} / {importedCounts.events})
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
                        <TableCell>{t('Teilnehmer / Reisezeiten', 'Attendees / travel times')}</TableCell>
                        <TableCell>{t('Zeitplan', 'Timeline')}</TableCell>
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
                          <TableCell sx={{ fontWeight: 500 }}>{row.data.name || (row.data.eventType === 'LS' ? 'LightSim' : row.data.eventType)}</TableCell>
                          <TableCell>{formatDate(row.data.startDate ?? row.data.eventDate)}{row.data.endDate !== row.data.startDate && ` – ${formatDate(row.data.endDate)}`}</TableCell>
                          <TableCell>{row.plannedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ') || '—'}</TableCell>
                          <TableCell>{row.usedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ') || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'pre-line', minWidth: 220 }}>{row.attendees.map((person) => `${person.personName}: ${person.arrivesAt?.replace('T', ' ') ?? '—'} – ${person.leavesAt?.replace('T', ' ') ?? '—'}`).join('\n') || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'pre-line', minWidth: 220 }}>{row.timeline.map((entry) => `${entry.title}: ${entry.startsAt.replace('T', ' ')}${entry.endsAt ? ` – ${entry.endsAt.replace('T', ' ')}` : ''}`).join('\n') || '—'}</TableCell>
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
                  {t('Bestellungs-Vorschau', 'Orders Preview')} ({parsedOrders.length} / {importedCounts.orders})
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
                          <TableCell>{formatDate(row.data.eventDate)}</TableCell>
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
                  {t('Allgemeine Bestellungen', 'General orders')} ({parsedGeneralOrders.length} / {importedCounts.generalOrders})
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
                      <TableCell>{row.data.name}</TableCell><TableCell>{row.eventType} · {formatDate(row.eventDate)}</TableCell>
                      <TableCell>{row.requestedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ')}</TableCell>
                    </TableRow>)}</TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tabType === 'combined' && parsedOperations.length > 0 && <Box sx={{ mt: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('Aktionen-Vorschau', 'Actions preview')} ({parsedOperations.length} / {importedCounts.operations})</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280, overflowY: 'auto' }}><Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>{t('Name', 'Name')}</TableCell><TableCell>{t('Aktion', 'Action')}</TableCell><TableCell>{t('Beschreibung', 'Description')}</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                <TableBody>{parsedOperations.map((row) => <TableRow key={row.index} id={`csv-import-operations-row-${row.index}`}>
                  <TableCell>{row.name}</TableCell><TableCell>{Object.hasOwn(CSV_OPERATIONS, row.operation) ? t(CSV_OPERATIONS[row.operation][0], CSV_OPERATIONS[row.operation][1]) : row.operation}</TableCell>
                  <TableCell>{row.description}</TableCell><TableCell>{row.statusMessage ?? t('Gültig', 'Valid')}</TableCell>
                </TableRow>)}</TableBody>
              </Table></TableContainer>
            </Box>}

            {tabType === 'combined' && parsedReturns.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('Rückgaben-Vorschau', 'Returns Preview')} ({parsedReturns.length} / {importedCounts.returns})
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
                  {t('Ausleihen-Vorschau', 'Checkouts preview')} ({parsedCheckouts.length} / {importedCounts.checkouts})
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
  </>;
}
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
