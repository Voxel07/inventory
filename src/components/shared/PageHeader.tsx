import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/**
 * The page's single h1, an optional plain-language description, and its primary actions. Actions take the space
 * they need until the title would drop below 200 px; an {@link ActionBar} then collapses into its "more" menu.
 */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap sx={{ mb: { xs: 2, md: 3 }, gap: { xs: 1.5, sm: 2 }, alignItems: { sm: 'flex-end' }, justifyContent: 'space-between' }}>
    <Box sx={{ minWidth: { xs: 0, sm: 200 }, flex: { sm: '1 1 0' } }}>
      <Typography variant="h4" component="h1">{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>{description}</Typography>}
    </Box>
    {actions && <Box sx={{ flex: '1 1 auto', minWidth: 0, maxWidth: '100%', display: 'flex', justifyContent: { sm: 'flex-end' } }}>{actions}</Box>}
  </Stack>;
}
