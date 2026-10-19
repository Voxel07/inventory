import { Chip, IconButton, Button } from '../shared/ActionButtons';
import type { CheckedOutRow } from '../../types/custody';
import { Fragment, useState } from 'react';
import { Box, Card, CardContent, Collapse, Divider, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import CategoryIcon from '@mui/icons-material/Category';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { Link } from 'react-router-dom';
import type { Assembly, Item } from '../../types';
import { translate, useT } from '../../utils/naming';
import { ListPagination } from '../shared/ListPagination';
import { useClientPagination } from '../../hooks/useClientPagination';
import { factionOrderOf } from '../../utils/custody';

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
  orderId: string;
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
  const t = useT();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { pageItems: pageRows, page: currentPage, setPage, pageSize, onPageSizeChange } = useClientPagination(rows);

  // Build assembly groups: group rows that share a faction order and belong to an assembly
  const { groups, ungroupedRows } = (() => {
    if (!assemblies?.length) return { groups: [], ungroupedRows: pageRows };
    // For each faction order, figure out which assemblies are represented
    const byOrder = new Map<string, CheckedOutRow[]>();
    for (const row of pageRows) {
      const orderId = factionOrderOf(row);
      if (!orderId) continue;
      const existing = byOrder.get(orderId) ?? [];
      existing.push(row);
      byOrder.set(orderId, existing);
    }

    const groupList: AssemblyGroup[] = [];
    const groupedRowKeys = new Set<string>();

    for (const [orderId, orderRows] of byOrder.entries()) {
      const orderItemIds = new Set(orderRows.map((r) => r.itemId));
      for (const assembly of assemblies) {
        const componentIds = Object.keys(assembly.itemQuantities ?? {});
        const matchingRows = orderRows.filter((r) => componentIds.includes(r.itemId));
        // Only group if at least 2 of the assembly's components are present
        if (matchingRows.length < 2) continue;
        // Skip if the assembly has very few components (avoid over-grouping 1-item assemblies)
        if (componentIds.length < 2) continue;
        groupList.push({ assembly, orderId, rows: matchingRows });
        for (const r of matchingRows) groupedRowKeys.add(r.key);
        // Only use each assembly once per order
        break;
      }
      void orderItemIds; // used implicitly
    }

    const ungrouped = pageRows.filter((r) => !groupedRowKeys.has(r.key));
    return { groups: groupList, ungroupedRows: ungrouped };
  })();

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (isLoading) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary">{t('lists.checkedOutList.loading')}</Typography>
      </Paper>
    );
  }

  if (!rows.length) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{t('lists.checkedOutList.noItemsAreCurrentlyCheckedOut')}</Typography>
      </Paper>
    );
  }

  if (isMobile) {
    return (
      <>
      <Stack spacing={1.25}>
        {groups.map((group) => {
          const groupKey = `${group.assembly.id}:${group.orderId}`;
          const isExpanded = expandedGroups[groupKey] ?? false;
          return (
            <Card
              key={groupKey}
              variant="outlined"
              sx={{ borderColor: 'primary.dark', bgcolor: 'action.selected' }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <CategoryIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{group.assembly.name}</Typography>
                    {showPerson && <Typography variant="caption" color="text.secondary">{group.rows[0]?.person}</Typography>}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {group.rows[0]?.event} · {group.rows.length} {t('common.items')}
                    </Typography>
                  </Box>
                  <IconButton title={translate('lists.checkedOutList.showOrHideThisGroupSCheckedOutItems')} size="small" onClick={() => toggleGroup(groupKey)}>
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
      <ListPagination pageSize={pageSize} onPageSizeChange={onPageSizeChange} count={rows.length} page={currentPage} onChange={setPage} />
      </>
    );
  }

  // Keep assembly groups and standalone items in one table so every column uses
  // the same width. Previously each assembly rendered its own table and omitted
  // the Event header, which left the header short and shifted the action column.
  const hasActions = Boolean(onQuickReturn || onDamageReport);
  const columnCount = 5 + (showPerson ? 1 : 0) + (hasActions ? 1 : 0);

  // Desktop table
  return (
    <>
    <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto' }}>
      <Table size="small" sx={{ width: '100%', minWidth: 900 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('profile.name')}</TableCell>
            <TableCell>{t('common.category')}</TableCell>
            <TableCell>{t('common.storageLocation')}</TableCell>
            {showPerson && <TableCell>{t('enum.value.person')}</TableCell>}
            <TableCell>{t('nav.event')}</TableCell>
            <TableCell align="right">{t('nav.checkedOut')}</TableCell>
            {hasActions && <TableCell align="right">{t('common.action')}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((group) => {
            const groupKey = `${group.assembly.id}:${group.orderId}`;
            const isExpanded = expandedGroups[groupKey] ?? true;
            return (
              <Fragment key={groupKey}>
                <TableRow
                  onClick={() => toggleGroup(groupKey)}
                  sx={{ cursor: 'pointer', bgcolor: 'action.selected' }}
                >
                  <TableCell colSpan={columnCount} sx={{ py: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: '100%' }}>
                      <CategoryIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />
                      <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                        {group.assembly.name}
                      </Typography>
                      {factionOrderOf(group.rows[0]) && (
                        <Chip title={translate('lists.checkedOutList.openTheRelatedFactionOrder')}
                          component={Link}
                          to={`/orders/faction/${group.orderId}`}
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
                        {group.rows.length} {t('lists.checkedOutList.items')}
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
    <ListPagination pageSize={pageSize} onPageSizeChange={onPageSizeChange} count={rows.length} page={currentPage} onChange={setPage} />
    </>
  );

  function renderMobileRow(row: CheckedOutRow) {
    return (
      <Paper key={row.key} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            {linkToItem
              ? <Typography variant="h6" sx={{ fontSize: '1rem', overflowWrap: 'anywhere' }} component={Link} to={`/items/${row.itemId}`} color="inherit" style={{ textDecoration: 'none' }}>{row.name}</Typography>
              : <Typography variant="h6" sx={{ fontSize: '1rem', overflowWrap: 'anywhere' }}>{row.name}</Typography>}
            <Typography variant="body2" color="text.secondary">{row.category || '—'} · {row.storageLocation}</Typography>
            {showPerson && <Typography variant="body2">{row.person}</Typography>}
            <Typography variant="caption" color="text.secondary">{row.event}</Typography>
          </Box>
          <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
            <Typography variant="h5" component="p" color="warning.main">{row.checkedOut}</Typography>
            {!!row.pendingQuantity && <Chip color="info" size="small" label={`${t('lists.checkedOutList.pendingInspection')}: ${row.pendingQuantity}`} />}
            <Typography variant="caption" color="text.secondary">{t('lists.checkedOutList.out')}</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          {onQuickReturn && (
            <Button title={translate('lists.checkedOutList.submitAReturnForThisItem')} fullWidth variant="contained" color="success" startIcon={<AssignmentReturnIcon />} onClick={() => onQuickReturn(row)} disabled={returnPending || (row.pendingQuantity ?? 0) >= row.checkedOut} sx={{ minHeight: 44 }}>
              {t('enum.action.checkin')}
            </Button>
          )}
          {onDamageReport && (
            <Button title={translate('lists.checkedOutList.reportDamageToThisItem')} fullWidth variant="outlined" color="error" startIcon={<ReportProblemIcon />} onClick={() => onDamageReport(row)} sx={{ minHeight: 44 }}>
              {t('common.damage')}
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
          {factionOrderOf(row)
            ? <Chip component={Link} to={`/orders/faction/${factionOrderOf(row)}`} clickable size="small" variant="outlined" color="primary" label={row.event} />
            : row.event}
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.main' }}>{row.checkedOut}{!!row.pendingQuantity && <Typography variant="caption" sx={{ display: 'block' }}>{t('lists.checkedOutList.pendingInspection')}: {row.pendingQuantity}</Typography>}</TableCell>
        {(onQuickReturn || onDamageReport) && (
          <TableCell align="right">
            <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
              {onQuickReturn && (

                    <Button title={translate('lists.checkedOutList.submitAReturnForThisItem')} size="small" variant="contained" color="success" startIcon={<AssignmentReturnIcon />} onClick={() => onQuickReturn(row)} disabled={returnPending || (row.pendingQuantity ?? 0) >= row.checkedOut}>
                      {t('lists.checkedOutList.quickReturn')}
                    </Button>

              )}
              {onDamageReport && (

                <Button title={t('common.reportDamage')} size="small" variant="outlined" color="error" startIcon={<ReportProblemIcon />} onClick={() => onDamageReport(row)}>
                  {t('common.damage')}
                </Button>

              )}
            </Stack>
          </TableCell>
        )}
      </TableRow>
    );
  }
}
