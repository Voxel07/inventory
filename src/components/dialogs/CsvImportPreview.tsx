import { formatDate } from '../../utils/dateFormat';
import { formatMoney } from '../../utils/money';
import { Box, Typography, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Tooltip, TextField } from '@mui/material';
import { useT, type Translator } from '../../utils/naming';
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

/** Rendering is capped; error rows stay visible so the error jump can reach them. */
function getPreviewRows<T extends { status: string }>(rows: T[]): T[] {
  return rows.slice(0, 50).concat(rows.slice(50).filter((row) => row.status === 'error'));
}

function getOrderStatusChip(status: FactionOrderImportStatus, t: Translator) {
  switch (status) {
    case 'closed':
      return <Chip size="small" color="default" variant="outlined" label={t('enum.value.closed')} />;
    case 'returned':
      return <Chip size="small" color="success" label={t('enum.value.returned')} />;
    case 'partially_returned':
      return <Chip size="small" color="warning" label={t('dialogs.csvImportPreview.partiallyReturned')} />;
    case 'picked_up':
      return <Chip size="small" color="info" label={t('dialogs.csvImportPreview.pickedUp')} />;
    case 'ready':
      return <Chip size="small" color="primary" label={t('enum.value.ready')} />;
    case 'submitted':
      return <Chip size="small" color="primary" variant="outlined" label={t('enum.value.submitted')} />;
    default:
      return <Chip size="small" color="default" label={t('enum.value.draft')} />;
  }
}

export function CsvImportPreview({ tabType, updateExistingItems, importedCounts, parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, itemSearch, assemblySearch, onItemSearchChange, onAssemblySearchChange }: Props) {
  const t = useT();
  const visibleItems = searchRows(parsedItems, itemSearch);
  const visibleAssemblies = searchRows(parsedAssemblies, assemblySearch);
  const shownItems = getPreviewRows(visibleItems);
  const shownAssemblies = getPreviewRows(visibleAssemblies);
  return <>
            {/* Preview Tables */}
            {tabType !== 'assemblies' && parsedItems.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('dialogs.csvImportPreview.itemsPreview')} ({parsedItems.length} / {importedCounts.items})
                </Typography>
                <TextField fullWidth size="small" label={t('common.searchItems')} value={itemSearch} onChange={(event) => onItemSearchChange(event.target.value)} sx={{ mb: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {t('dialogs.csvImportPreview.visibleItemCountOfParsedItemCountItems', { visibleItemCount: String(visibleItems.length), parsedItemCount: String(parsedItems.length) })}
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.itemName')}</TableCell>
                        <TableCell>{t('common.category')}</TableCell>
                        <TableCell align="right">{t('dialogs.csvImportPreview.initialStock')}</TableCell>
                        <TableCell align="right">{t('dialogs.csvImportPreview.minStock')}</TableCell>
                        <TableCell align="right">{t('dialogs.csvImportPreview.value')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.storageLocation')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {shownItems.map((row) => (
                        <TableRow key={row.index} id={`csv-import-items-row-${row.index}`} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' && <Chip size="small" color="success" label={t('enum.value.valid')} />}
                            {row.status === 'warning' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={t('dialogs.csvImportPreview.newLoc')} />
                              </Tooltip>
                            )}
                            {row.status === 'duplicate' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip
                                  size="small"
                                  color={updateExistingItems ? 'info' : 'default'}
                                  label={updateExistingItems ? t('dialogs.csvImportPreview.update') : t('dialogs.csvImportPreview.skip')}
                                />
                              </Tooltip>
                            )}
                            {row.status === 'error' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('enum.value.error')} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{row.data.name || '—'}</span>
                              {row.data.trackingMode === 'serialized' && (
                                <Tooltip
                                  title={row.assetCodes?.length ? `Asset-Codes (${row.assetCodes.length}): ${row.assetCodes.join(', ')}` : t('dialogs.csvImportPreview.serializedTracking')}
                                  arrow
                                >
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                    label={row.assetCodes?.length ? `${t('dialogs.csvImportPreview.serialized')} (${row.assetCodes.length})` : t('dialogs.csvImportPreview.serialized')}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>{[row.data.category, row.data.subcategory].filter(Boolean).join(' · ') || '—'}</TableCell>
                          <TableCell align="right">{row.data.amount ?? 0}</TableCell>
                          <TableCell align="right">{row.data.minStock ?? 5}</TableCell>
                          <TableCell align="right">{formatMoney(row.data.value ?? 0)}</TableCell>
                          <TableCell>{row.storageLocationName || '—'}</TableCell>
                        </TableRow>
                      ))}
                      {!visibleItems.length && <TableRow><TableCell colSpan={8}>{t('common.noMatchingItems')}</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
                {shownItems.length < visibleItems.length && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {t('dialogs.csvImportPreview.showingFirst50OfVisibleItemCountItemsAndAllErrorRows', { visibleItemCount: String(visibleItems.length) })}
                  </Typography>
                )}
              </Box>
            )}

            {tabType !== 'items' && parsedAssemblies.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('dialogs.csvImportPreview.assembliesPreview')} ({parsedAssemblies.length} / {importedCounts.assemblies})
                </Typography>
                <TextField fullWidth size="small" label={t('dialogs.csvImportPreview.searchAssemblies')} value={assemblySearch} onChange={(event) => onAssemblySearchChange(event.target.value)} sx={{ mb: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {t('dialogs.csvImportPreview.visibleAssemblieCountOfParsedAssemblieCountAssemblies', { visibleAssemblieCount: String(visibleAssemblies.length), parsedAssemblieCount: String(parsedAssemblies.length) })}
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('enum.value.assembly')}</TableCell>
                        <TableCell>{t('common.category')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.components')}</TableCell>
                        <TableCell>{t('common.description')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {shownAssemblies.map((row) => (
                        <TableRow key={row.index} id={`csv-import-assemblies-row-${row.index}`} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' && <Chip size="small" color="success" label={t('enum.value.valid')} />}
                            {row.status === 'duplicate' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="default" label={t('dialogs.csvImportPreview.skip')} />
                              </Tooltip>
                            )}
                            {row.status === 'error' && (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('enum.value.error')} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{row.data.name || '—'}</TableCell>
                          <TableCell>{[row.data.category, row.data.subcategory].filter(Boolean).join(' · ') || '—'}</TableCell>
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
                      {!visibleAssemblies.length && <TableRow><TableCell colSpan={6}>{t('common.noMatchingAssemblies')}</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
                {shownAssemblies.length < visibleAssemblies.length && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {t('dialogs.csvImportPreview.showingFirst50OfVisibleAssemblieCountAssembliesAndAllErrorRows', { visibleAssemblieCount: String(visibleAssemblies.length) })}
                  </Typography>
                )}
              </Box>
            )}

            {tabType === 'combined' && parsedEvents.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('dialogs.csvImportPreview.eventHistoryPreview')} ({parsedEvents.length} / {importedCounts.events})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('nav.event')}</TableCell>
                        <TableCell>{t('common.date')}</TableCell>
                        <TableCell>{t('common.planned')}</TableCell>
                        <TableCell>{t('common.used')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.attendeesTravelTimes')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.timeline')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsedEvents.map((row) => (
                        <TableRow key={row.index} id={`csv-import-events-row-${row.index}`} hover>
                          <TableCell>{row.index}</TableCell>
                          <TableCell>
                            {row.status === 'valid' ? (
                              <Chip size="small" color="success" label={t('enum.value.valid')} />
                            ) : (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('enum.value.error')} />
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
                  {t('dialogs.csvImportPreview.ordersPreview')} ({parsedOrders.length} / {importedCounts.orders})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('nav.event')}</TableCell>
                        <TableCell>{t('common.date')}</TableCell>
                        <TableCell>{t('common.faction')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.requestedItems')}</TableCell>
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
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('enum.value.error')} />
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
                  {t('common.generalOrders')} ({parsedGeneralOrders.length} / {importedCounts.generalOrders})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead><TableRow><TableCell>#</TableCell><TableCell>{t('common.status')}</TableCell>
                      <TableCell>{t('profile.name')}</TableCell><TableCell>{t('nav.event')}</TableCell>
                      <TableCell>{t('dialogs.csvImportPreview.requestedItems')}</TableCell></TableRow></TableHead>
                    <TableBody>{parsedGeneralOrders.map((row) => <TableRow key={row.index} id={`csv-import-orders-row-${row.index}`}>
                      <TableCell>{row.index}</TableCell>
                      <TableCell>{row.status === 'valid' ? getOrderStatusChip(row.targetStatus, t)
                        : <Tooltip title={row.statusMessage || ''} arrow><Chip size="small" color="error" label={t('enum.value.error')} /></Tooltip>}</TableCell>
                      <TableCell>{row.data.name}</TableCell><TableCell>{row.eventType} · {formatDate(row.eventDate)}</TableCell>
                      <TableCell>{row.requestedItems.map((item) => `${item.itemName}: ${item.quantity}`).join(', ')}</TableCell>
                    </TableRow>)}</TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {tabType === 'combined' && parsedOperations.length > 0 && <Box sx={{ mt: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>{t('dialogs.csvImportPreview.actionsPreview')} ({parsedOperations.length} / {importedCounts.operations})</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280, overflowY: 'auto' }}><Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>{t('profile.name')}</TableCell><TableCell>{t('common.action')}</TableCell><TableCell>{t('common.description')}</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                <TableBody>{parsedOperations.map((row) => <TableRow key={row.index} id={`csv-import-operations-row-${row.index}`}>
                  <TableCell>{row.name}</TableCell><TableCell>{Object.hasOwn(CSV_OPERATIONS, row.operation) ? t(CSV_OPERATIONS[row.operation].label) : row.operation}</TableCell>
                  <TableCell>{row.description}</TableCell><TableCell>{row.statusMessage ?? t('enum.value.valid')}</TableCell>
                </TableRow>)}</TableBody>
              </Table></TableContainer>
            </Box>}

            {tabType === 'combined' && parsedReturns.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('dialogs.csvImportPreview.returnsPreview')} ({parsedReturns.length} / {importedCounts.returns})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('common.item')}</TableCell>
                        <TableCell align="right">{t('common.quantity')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.storageLocation')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.eventFaction')}</TableCell>
                        <TableCell>{t('dialogs.csvImportPreview.notes')}</TableCell>
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
                                label={row.targetStatus === 'accepted' ? t('dialogs.csvImportPreview.accepted') : row.targetStatus === 'pending' ? t('enum.value.pending') : t('enum.value.rejected')}
                              />
                            ) : (
                              <Tooltip title={row.statusMessage || ''} arrow>
                                <Chip size="small" color="error" icon={<ErrorIcon />} label={t('enum.value.error')} />
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
                  {t('dialogs.csvImportPreview.checkoutsPreview')} ({parsedCheckouts.length} / {importedCounts.checkouts})
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead><TableRow><TableCell>#</TableCell><TableCell>{t('common.status')}</TableCell>
                      <TableCell>{t('common.item')}</TableCell><TableCell>{t('common.quantity')}</TableCell>
                      <TableCell>{t('dialogs.csvImportPreview.assetCodes')}</TableCell><TableCell>{t('dialogs.csvImportPreview.eventFaction2')}</TableCell></TableRow></TableHead>
                    <TableBody>{parsedCheckouts.map((row) => <TableRow key={row.index} id={`csv-import-checkouts-row-${row.index}`} hover>
                      <TableCell>{row.index}</TableCell>
                      <TableCell>{row.status === 'valid' ? <Chip size="small" color="success" label={t('enum.value.ready')} />
                        : <Tooltip title={row.statusMessage || ''} arrow><Chip size="small" color="error" label={t('enum.value.error')} /></Tooltip>}</TableCell>
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
