import { Box } from '@mui/material';
import { Button } from './ActionButtons';
import { translate, useLocalizedText } from '../../utils/naming';

/** Fetches the next server page of an on-demand list; renders nothing once every row is loaded. */
export function LoadMore({ list }: { list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  const t = useLocalizedText();
  if (!list.hasNextPage) return null;
  return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
    <Button title={translate('Die nächste Seite vom Server laden', 'Load the next page from the server')} variant="outlined"
      disabled={list.isFetchingNextPage} onClick={() => { void list.fetchNextPage(); }}>
      {list.isFetchingNextPage ? t('Wird geladen…', 'Loading…') : t('Weitere laden', 'Load more')}
    </Button>
  </Box>;
}
