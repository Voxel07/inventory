import type { ReactNode } from 'react';
import { Box, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink } from 'react-router-dom';
import { IconButton } from './ActionButtons';
import { InfoTip } from './InfoTip';

/**
 * The page's single h1, an optional plain-language description, and its primary actions. Actions take the space
 * they need until the title would drop below 200 px; an {@link ActionBar} then collapses into its "more" menu.
 * `inlineActions` keeps compact (icon-only) actions beside the title on phones instead of on their own row.
 * On phones the description moves behind an ⓘ beside the title, and `back` is an arrow before it.
 */
export function PageHeader({ title, description, actions, inlineActions, back }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  inlineActions?: boolean;
  back?: { label: string; to: string };
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  return <Stack direction={inlineActions ? 'row' : { xs: 'column', sm: 'row' }} useFlexGap sx={{ mb: { xs: 2, md: 3 }, gap: { xs: 1.5, sm: 2 }, alignItems: inlineActions ? 'center' : { sm: 'flex-end' }, justifyContent: 'space-between' }}>
    <Box sx={{ minWidth: { xs: 0, sm: 200 }, flex: inlineActions ? '1 1 0' : { sm: '1 1 0' } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        {back && <IconButton title={back.label} component={RouterLink} to={back.to} sx={{ ml: -1, flexShrink: 0 }}><ArrowBackIcon /></IconButton>}
        <Typography variant="h4" component="h1" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{title}</Typography>
        {description && phone && <InfoTip>{description}</InfoTip>}
      </Stack>
      {description && !phone && <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>{description}</Typography>}
    </Box>
    {actions && <Box sx={{ flex: inlineActions ? '0 0 auto' : '1 1 auto', minWidth: 0, maxWidth: '100%', display: 'flex', justifyContent: { sm: 'flex-end' } }}>{actions}</Box>}
  </Stack>;
}
