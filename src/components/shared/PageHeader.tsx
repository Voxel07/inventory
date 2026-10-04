import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/** The page's single h1, an optional plain-language description, and its primary actions. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap sx={{ mb: { xs: 2, md: 3 }, gap: { xs: 1.5, sm: 2 }, alignItems: { sm: 'flex-end' }, justifyContent: 'space-between' }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="h4" component="h1">{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>{description}</Typography>}
    </Box>
    {actions && <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>{actions}</Stack>}
  </Stack>;
}
