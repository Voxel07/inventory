import { useState, type ReactNode } from 'react';
import { ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { IconButton } from './ActionButtons';
import { useT } from '../../utils/naming';

export type RowAction = { key: string; label: string; icon: ReactNode; onClick: () => void; color?: 'error' };

/** Inline icon buttons, or a single "more" menu when space is short. */
export function RowActions({ actions, collapsed }: { actions: RowAction[]; collapsed: boolean }) {
    const t = useT();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    if (!collapsed) {
        return <>
            {actions.map((action) => (
                <IconButton key={action.key} title={action.label} size="small" color={action.color} onClick={action.onClick}>
                    {action.icon}
                </IconButton>
            ))}
        </>;
    }

    return <>
        <IconButton title={t('shared.rowActions.moreActions')} size="small" aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)}>
            <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            {actions.map((action) => (
                <MenuItem key={action.key} onClick={() => { setAnchor(null); action.onClick(); }} sx={action.color ? { color: `${action.color}.main` } : undefined}>
                    <ListItemIcon sx={action.color ? { color: `${action.color}.main` } : undefined}>{action.icon}</ListItemIcon>
                    <ListItemText>{action.label}</ListItemText>
                </MenuItem>
            ))}
        </Menu>
    </>;
}
