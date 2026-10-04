import { useMediaQuery, useTheme } from '@mui/material';

/** Phones and tablets show catalog records as compact rows instead of a wide table. */
export function useCompactCatalog() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}
