import { useState, type ReactNode } from 'react';
import { Box, Popover } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { IconButton } from './ActionButtons';
import { useT } from '../../utils/naming';

/** An ⓘ button that opens explanatory text on tap or click, for help that should not take screen space on phones. */
export function InfoTip({ children, label }: { children: ReactNode; label?: string }) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <IconButton title={label ?? t('shared.infoTip.moreInformation')} size="small" aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
      onClick={(event) => setAnchor(event.currentTarget)} sx={{ color: 'text.secondary', flexShrink: 0 }}>
      <InfoOutlinedIcon fontSize="small" />
    </IconButton>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{ paper: { sx: { p: 1.5, maxWidth: 'min(360px, calc(100vw - 32px))' } } }}>
      <Box sx={{ typography: 'body2', whiteSpace: 'pre-line' }}>{children}</Box>
    </Popover>
  </>;
}
