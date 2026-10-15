import { Box } from '@mui/material';
import { Button } from './ActionButtons';
import { translate, useT } from '../../utils/naming';

/** Fetches the next server page of an on-demand list; renders nothing once every row is loaded. */
export function LoadMore({ list }: { list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  const t = useT();
  if (!list.hasNextPage) return null;
  return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
    <Button title={translate('shared.loadMore.loadTheNextPageFromTheServer')} variant="outlined"
      disabled={list.isFetchingNextPage} onClick={() => { void list.fetchNextPage(); }}>
      {list.isFetchingNextPage ? t('shared.loadMore.loading') : t('shared.loadMore.loadMore')}
    </Button>
  </Box>;
}
