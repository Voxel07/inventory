import { useState } from 'react';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '../shared/ActionButtons';
import { QueryFeedback } from '../common/QueryFeedback';
import { OperationLines } from './OperationLines';
import { OperationListEntry } from './OperationListEntry';
import { PurchaseDraft } from './PurchasingOperations';
import { PurchaseLink } from '../items/PurchaseLink';
import { useOperationCommand } from '../../hooks/useOperations';
import { getVendorSources, scanVendorSources, type VendorSourceGroup } from '../../services/procurementService';
import { queryKeys } from '../../utils/queryKeys';
import { formatDateTime } from '../../utils/dateFormat';
import { translate, useT } from '../../utils/naming';

/** Suppliers derived from item purchase links; the scan runs only when the button is pressed. */
export function VendorSourcesPanel() {
  const t = useT();
  const sources = useQuery({ queryKey: queryKeys.operations('vendor-sources'), queryFn: getVendorSources });
  const command = useOperationCommand();
  const [draft, setDraft] = useState<VendorSourceGroup | null>(null);
  const data = sources.data;
  return <Stack spacing={2}>
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">{t('operations.vendorSources.help')}</Typography>
      <Box><Button variant="contained" title={translate('operations.vendorSources.generateTitle')} disabled={command.isPending || sources.isLoading}
        onClick={() => command.mutate(() => scanVendorSources())}>
        {command.isPending ? t('operations.vendorSources.generating') : t('operations.vendorSources.generate')}
      </Button></Box>
      {data && (data.lastScannedAt == null
        ? <Typography>{t('operations.vendorSources.neverRun')}</Typography>
        : <Box>
          <Typography sx={{ fontWeight: 600 }}>{t('operations.vendorSources.lastRun', { date: formatDateTime(data.lastScannedAt), name: data.lastScannedBy ?? '—' })}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('operations.vendorSources.summary', { items: data.linkedItems, created: data.createdVendors })}
            {data.skippedItems > 0 && ` · ${t('operations.vendorSources.skipped', { count: data.skippedItems })}`}
          </Typography>
        </Box>)}
      {data && data.changedLinks > 0 && <Alert severity="info">{t('operations.vendorSources.changedLinks', { count: data.changedLinks })}</Alert>}
      {command.error && <Alert severity="error">{command.error.message}</Alert>}
    </Stack>
    <QueryFeedback isLoading={sources.isLoading} error={sources.error} isEmpty={!!data && !data.vendors.length} emptyMessage={t('operations.vendorSources.empty')} />
    {data?.vendors.map((group) => <OperationListEntry key={group.vendorId} status={group.active ? 'active' : 'inactive'}
      title={<Stack direction="row" useFlexGap sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{group.vendorName}</span>
        {group.generated && <Chip size="small" label={t('operations.vendorSources.generated')} />}
      </Stack>}
      actions={[
        { key: 'draft', label: t('operations.vendorSources.createPurchaseDraft'), pinned: true, disabled: !group.active,
          title: group.active ? translate('operations.vendorSources.createPurchaseDraftTitle') : translate('operations.vendorSources.inactiveSupplier'),
          onClick: () => setDraft(group) },
        { key: 'shop', label: t('operations.vendorSources.openShop'), title: translate('operations.vendorSources.openShopTitle'),
          onClick: () => window.open(`https://${group.host}`, '_blank', 'noopener,noreferrer') },
      ]}>
      {group.vendorName.toLowerCase() !== group.host && <Typography color="text.secondary">{group.host}</Typography>}
      <OperationLines label={t('operations.vendorSources.itemsToOrder')} headers={[t('common.item'), 'SKU', t('operations.vendorSources.link')]}
        rows={group.items.map((entry) => ({ id: entry.itemId, cells: [
          <Link key="item" to={`/items/${entry.itemId}`}>{entry.itemName}</Link>,
          entry.sku,
          <Stack key="link" spacing={0.25} sx={{ minWidth: 0 }}>
            <PurchaseLink url={entry.url} label={entry.url.replace(/^https?:\/\/(www\.)?/i, '')} />
            {entry.currentUrl !== entry.url && <Typography variant="caption" color="warning.main">
              {entry.currentUrl ? t('operations.vendorSources.linkChanged') : t('operations.vendorSources.linkRemoved')}
            </Typography>}
          </Stack>,
        ] }))} />
    </OperationListEntry>)}
    {draft && <PurchaseDraft key={draft.vendorId} vendor={{ id: draft.vendorId, name: draft.vendorName }} eventId=""
      initialLines={draft.items.map((entry) => ({ itemId: entry.itemId, orderedQuantity: 1 }))} onClose={() => setDraft(null)} />}
  </Stack>;
}
