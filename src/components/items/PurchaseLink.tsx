import { Box, Link } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { purchaseHost } from '../../utils/purchaseLinks';

/** A purchase link opened in a new tab and labelled with its shop; anything that is not http(s) stays plain text. */
export function PurchaseLink({ url, label }: { url: string; label?: string }) {
  const host = purchaseHost(url);
  if (!host) return <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{url}</Box>;
  return <Link href={url} target="_blank" rel="noopener noreferrer" underline="hover" title={url}
    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
    <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label ?? host}</Box>
    <OpenInNewIcon sx={{ fontSize: 14, flexShrink: 0 }} />
  </Link>;
}
