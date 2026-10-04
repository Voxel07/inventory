import type { ReactNode } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { translate } from '../../utils/naming';

export type StateKind = 'loading' | 'error' | 'empty' | 'no-matches' | 'done';

const icons: Record<Exclude<StateKind, 'loading'>, ReactNode> = {
  error: <CloudOffIcon />,
  empty: <Inventory2OutlinedIcon />,
  'no-matches': <SearchOffIcon />,
  done: <TaskAltIcon />,
};

/**
 * One presentation for list states: initial loading, initial failure, an empty
 * collection, a filter with no matches, and an all-caught-up queue. A failure
 * never renders as an empty list. Technical detail belongs in `detail`, not the title.
 */
export function StateMessage({ kind, title, description, action, detail, compact }: {
  kind: StateKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  detail?: string;
  compact?: boolean;
}) {
  return <Box role={kind === 'error' ? 'alert' : 'status'} sx={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1,
    py: compact ? 2 : { xs: 4, sm: 6 }, px: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 2,
  }}>
    <Box aria-hidden sx={{ color: kind === 'error' ? 'error.main' : kind === 'done' ? 'success.main' : 'text.secondary', display: 'flex', '& svg': { fontSize: 32 } }}>
      {kind === 'loading' ? <CircularProgress size={28} /> : icons[kind]}
    </Box>
    <Typography variant="subtitle1" component="p">{title}</Typography>
    {description && <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>{description}</Typography>}
    {action && <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'center', mt: 0.5 }}>{action}</Stack>}
    {detail && <Typography variant="caption" color="text.secondary" component="details" sx={{ mt: 0.5, maxWidth: 480 }}>
      <summary style={{ cursor: 'pointer' }}>{translate('Technische Details', 'Technical details')}</summary>
      <span className="mono">{detail}</span>
    </Typography>}
  </Box>;
}
