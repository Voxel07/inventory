import { Fragment, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import CategoryIcon from '@mui/icons-material/Category';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { Link } from 'react-router-dom';
import type { Assembly, Item } from '../../types';
import { useLocalizedText } from '../../utils/naming';

export interface CheckedOutRow {
  key: string;
  itemId: string;
  name: string;
  category: string;
  storageLocation: string;
  checkedOut: number;
  personId: string;
  person: string;
  eventKey: string;
  event: string;
  factionOrderId?: string;
  /** Resolved assembly this item belongs to (if from a faction order) */
  assemblyId?: string;
}

interface Props {
  rows: CheckedOutRow[];
  items?: Item[];
  assemblies?: Assembly[];
  isLoading?: boolean;
  showPerson?: boolean;
  onQuickReturn?: (row: CheckedOutRow) => void;
  onDamageReport?: (row: CheckedOutRow) => void;
  /** If true, show a link button to navigate to the item detail page */
  linkToItem?: boolean;
  returnPending?: boolean;
}

interface AssemblyGroup {
  assembly: Assembly;
  factionOrderId: string;
  rows: CheckedOutRow[];
}

/**
 * Shared component for displaying currently checked-out items.
 * Supports assembly grouping: items that are components of an assembly
 * (belonging to the same faction order) are nested under a collapsible
 * assembly header. Standalone items remain ungrouped.
 *
 * Used by: CheckedOutItems page and UserDashboard.
 */
export function CheckedOutList({
  rows,
  assemblies,
  isLoading,
  showPerson = true,
  onQuickReturn,
  onDamageReport,
  linkToItem,
  returnPending,
}: Props) {
  const t = useLocalizedText();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Build assembly groups: group rows that share a factionOrderId and belong to an assembly
  const { groups, ungroupedRows } = useMemo(() => {
    if (!assemblies?.length) return { groups: [], ungroupedRows: rows };
    // For each factionOrderId, figure out which assemblies are represented
    const byOrder = new Map<string, CheckedOutRow[]>();
    for (const row of rows) {
      if (!row.factionOrderId) continue;
      const existing = byOrder.get(row.factionOrderId) ?? [];
      existing.push(row);
      byOrder.set(row.factionOrderId, existing);
    }

    const groupList: AssemblyGroup[] = [];
    const groupedRowKeys = new Set<string>();

    for (const [factionOrderId, orderRows] of byOrder.entries()) {
      const orderItemIds = new Set(orderRows.map((r) => r.itemId));
      for (const assembly of assemblies) {
        const componentIds = Object.keys(assembly.itemQuantities ?? {});
        const matchingRows = orderRows.filter((r) => componentIds.includes(r.itemId));
        // Only group if at least 2 of the assembly's components are present
        if (matchingRows.length < 2) continue;
        // Skip if the assembly has very few components (avoid over-grouping 1-item assemblies)
        if (componentIds.length < 2) continue;
        groupList.push({ assembly, factionOrderId, rows: matchingRows });
        for (const r of matchingRows) groupedRowKeys.add(r.key);
        // Only use each assembly once per order
        break;
      }
      void orderItemIds; // used implicitly
    }

    const ungrouped = rows.filter((r) => !groupedRowKeys.has(r.key));
    return { groups: groupList, ungroupedRows: ungrouped };
  }, [assemblies, rows]);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (isLoading) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary">{t('Lade…', 'Loading…')}</Typography>
      </Paper>
    );
  }

  if (!rows.length) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{t('Derzeit sind keine Artikel ausgeliehen.', 'No items are currently checked out.')}</Typography>
      </Paper>
    );
  }

  if (isMobile) {
    return (
      <Stack spacing={1.25}>
        {groups.map((group) => {
          const groupKey = `${group.assembly.id}:${group.factionOrderId}`;
          const isExpanded = expandedGroups[groupKey] ?? false;
          return (
            <Card
              key={groupKey}
              variant="outlined"
              sx={{ borderColor: 'primary.dark', bgcolor: 'rgba(227, 6, 19, 0.035)' }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <CategoryIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{group.assembly.name}</Typography>
                    {showPerson && <Typography variant="caption" color="text.secondary">{group.rows[0]?.person}</Typography>}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {group.rows[0]?.event} · {group.rows.length} {t('Artikel', 'items')}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => toggleGroup(groupKey)}>
                    {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Stack>
                <Collapse in={isExpanded}>
                  <Divider sx={{ my: 1 }} />
                  <Stack spacing={1}>
                    {group.rows.map((row) => renderMobileRow(row))}
                  </Stack>
                </Collapse>
              </CardContent>
            </Card>
          );
        })}
        {ungroupedRows.map((row) => renderMobileRow(row))}
      </Stack>
    );
  }

  // Keep assembly groups and standalone items in one table so every column uses
  // the same width. Previously each assembly rendered its own table and omitted
  // the Event header, which left the header short and shifted the action column.
  const hasActions = Boolean(onQuickReturn || onDamageReport);
  const columnCount = 5 + (showPerson ? 1 : 0) + (hasActions ? 1 : 0);

  // Desktop table
  return (
    <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto' }}>
      <Table size="small" sx={{ width: '100%', minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('Name', 'Name')}</TableCell>
            <TableCell>{t('Kategorie', 'Category')}</TableCell>
            <TableCell>{t('Lagerort', 'Storage location')}</TableCell>
            {showPerson && <TableCell>{t('Person', 'Person')}</TableCell>}
            <TableCell>{t('Event', 'Event')}</TableCell>
            <TableCell align="right">{t('Ausgeliehen', 'Checked out')}</TableCell>
            {hasActions && <TableCell align="right">{t('Aktion', 'Action')}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((group) => {
            const groupKey = `${group.assembly.id}:${group.factionOrderId}`;
            const isExpanded = expandedGroups[groupKey] ?? true;
            return (
              <Fragment key={groupKey}>
                <TableRow
                  onClick={() => toggleGroup(groupKey)}
                  sx={{ cursor: 'pointer', bgcolor: 'rgba(227, 6, 19, 0.045)' }}
                >
                  <TableCell colSpan={columnCount} sx={{ py: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: '100%' }}>
                      <CategoryIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />
                      <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                        {group.assembly.name}
                      </Typography>
                      {group.rows[0]?.factionOrderId && (
                        <Chip
                          component={Link}
                          to={`/orders/faction/${group.rows[0].factionOrderId}`}
                          clickable
                          size="small"
                          color="primary"
                          variant="outlined"
                          label={group.rows[0].event}
                          onClick={(event) => event.stopPropagation()}
                          sx={{ maxWidth: '45%' }}
                        />
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {group.rows.length} {t('Positionen', 'items')}
                      </Typography>
                      {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </Stack>
                  </TableCell>
                </TableRow>
                {isExpanded && group.rows.map((row) => renderTableRow(row, true))}
              </Fragment>
            );
          })}
          {ungroupedRows.map((row) => renderTableRow(row))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  function renderMobileRow(row: CheckedOutRow) {
    return (
      <Paper key={row.key} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            {linkToItem
              ? <Typography variant="h6" sx={{ fontSize: '1rem', overflowWrap: 'anywhere' }} component={Link} to={`/items/${row.itemId}`} color="inherit" style={{ textDecoration: 'none', fontWeight: 700 }}>{row.name}</Typography>
              : <Typography variant="h6" sx={{ fontSize: '1rem', overflowWrap: 'anywhere' }}>{row.name}</Typography>}
            <Typography variant="body2" color="text.secondary">{row.category || '—'} · {row.storageLocation}</Typography>
            {showPerson && <Typography variant="body2">{row.person}</Typography>}
            <Typography variant="caption" color="text.secondary">{row.event}</Typography>
          </Box>
          <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
            <Typography variant="h5" color="warning.main">{row.checkedOut}</Typography>
            <Typography variant="caption" color="text.secondary">{t('draußen', 'out')}</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          {onQuickReturn && (
            <Button fullWidth variant="contained" color="success" startIcon={<AssignmentReturnIcon />} onClick={() => onQuickReturn(row)} disabled={returnPending} sx={{ minHeight: 44 }}>
              {t('Zurückgeben', 'Return')}
            </Button>
          )}
          {onDamageReport && (
            <Button fullWidth variant="outlined" color="error" startIcon={<ReportProblemIcon />} onClick={() => onDamageReport(row)} sx={{ minHeight: 44 }}>
              {t('Schaden', 'Damage')}
            </Button>
          )}
        </Stack>
      </Paper>
    );
  }

  function renderTableRow(row: CheckedOutRow, nested = false) {
    return (
      <TableRow key={row.key} hover>
        <TableCell sx={nested ? { pl: 5 } : undefined}>
          {linkToItem
            ? <Box component={Link} to={`/items/${row.itemId}`} sx={{ fontWeight: 700, color: 'inherit', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>{row.name}</Box>
            : row.name}
        </TableCell>
        <TableCell>{row.category || '—'}</TableCell>
        <TableCell>{row.storageLocation}</TableCell>
        {showPerson && <TableCell>{row.person}</TableCell>}
        <TableCell>
          {row.factionOrderId
            ? <Chip component={Link} to={`/orders/faction/${row.factionOrderId}`} clickable size="small" variant="outlined" color="primary" label={row.event} />
            : row.event}
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.main' }}>{row.checkedOut}</TableCell>
        {(onQuickReturn || onDamageReport) && (
          <TableCell align="right">
            <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
              {onQuickReturn && (
                <Tooltip title={t('1 Einheit zurückgeben', 'Return 1 unit')} arrow>
                  <span>
                    <Button size="small" variant="contained" color="success" startIcon={<AssignmentReturnIcon />} onClick={() => onQuickReturn(row)} disabled={returnPending}>
                      {t('Schnellrückgabe', 'Quick return')}
                    </Button>
                  </span>
                </Tooltip>
              )}
              {onDamageReport && (
                <Tooltip title={t('Schaden melden', 'Report damage')} arrow>
                  <Button size="small" variant="outlined" color="error" startIcon={<ReportProblemIcon />} onClick={() => onDamageReport(row)}>
                    {t('Schaden', 'Damage')}
                  </Button>
                </Tooltip>
              )}
            </Stack>
          </TableCell>
        )}
      </TableRow>
    );
  }
}
