import { Box, Button, Typography } from '@mui/material';
import { useLocalizedText } from '../../utils/naming';

export const ORDER_CATALOG_PAGE_SIZE = 12;

interface Props {
  count: number;
  page: number;
  onPageChange: (page: number) => void;
}

export function OrderCatalogPager({ count, page, onPageChange }: Props) {
  const t = useLocalizedText();
  if (count <= ORDER_CATALOG_PAGE_SIZE) return null;
  const pageCount = Math.ceil(count / ORDER_CATALOG_PAGE_SIZE);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1 }}>
      <Button size="small" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t('Zurück', 'Previous')}
      </Button>
      <Typography variant="caption" color="text.secondary" aria-live="polite">
        {Math.min((page - 1) * ORDER_CATALOG_PAGE_SIZE + 1, count)}–{Math.min(page * ORDER_CATALOG_PAGE_SIZE, count)} {t('von', 'of')} {count}
      </Typography>
      <Button size="small" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        {t('Weiter', 'Next')}
      </Button>
    </Box>
  );
}
