import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/**
 * The page's single h1, an optional plain-language description, and its primary actions. Actions take the space
 * they need until the title would drop below 200 px; an {@link ActionBar} then collapses into its "more" menu.
 * `inlineActions` keeps compact (icon-only) actions beside the title on phones instead of on their own row.
 */
export function PageHeader({ title, description, actions, inlineActions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; inlineActions?: boolean }) {
  return <Stack direction={inlineActions ? 'row' : { xs: 'column', sm: 'row' }} useFlexGap sx={{ mb: { xs: 2, md: 3 }, gap: { xs: 1.5, sm: 2 }, alignItems: inlineActions ? 'center' : { sm: 'flex-end' }, justifyContent: 'space-between' }}>
    <Box sx={{ minWidth: { xs: 0, sm: 200 }, flex: inlineActions ? '1 1 0' : { sm: '1 1 0' } }}>
      <Typography variant="h4" component="h1">{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>{description}</Typography>}
    </Box>
    {actions && <Box sx={{ flex: inlineActions ? '0 0 auto' : '1 1 auto', minWidth: 0, maxWidth: '100%', display: 'flex', justifyContent: { sm: 'flex-end' } }}>{actions}</Box>}
  </Stack>;
}
