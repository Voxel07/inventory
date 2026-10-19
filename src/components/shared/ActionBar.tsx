import { useState, type ReactNode } from 'react';
import { Box, ListItemIcon, ListItemText, Menu, type Breakpoint, type ButtonProps, type SxProps, type Theme } from '@mui/material';
import type { SystemStyleObject } from '@mui/system';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Link as RouterLink } from 'react-router-dom';
import { Button, IconButton, MenuItem } from './ActionButtons';
import { useOverflowCollapse } from '../../hooks/useOverflowCollapse';
import { useT } from '../../utils/naming';

export type Action = {
    key: string;
    label: string;
    icon?: ReactNode;
    /** Runs the action; `to` instead navigates to an in-app route. */
    onClick?: () => void;
    to?: string;
    /** Explains the action; shown as a tooltip, or as the reason when the action is disabled. */
    title?: string;
    disabled?: boolean;
    variant?: ButtonProps['variant'];
    color?: ButtonProps['color'];
    /** Stays a visible button when the bar collapses; every other action moves into the "more" menu. */
    pinned?: boolean;
};

/** A "more" button whose menu lists the given actions. */
export function ActionMenu({ actions, size = 'small' }: { actions: Action[]; size?: 'small' | 'medium' }) {
    const t = useT();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    if (!actions.length) return null;
    const tone = (color?: ButtonProps['color']) => color && color !== 'inherit' ? { color: `${color}.main` } : undefined;
    return <>
        <IconButton title={t('shared.actionMenu.moreActions')} size={size} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
            onClick={(event) => setAnchor(event.currentTarget)}>
            <MoreVertIcon fontSize={size} />
        </IconButton>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            {actions.map((action) => (
                <MenuItem key={action.key} title={action.disabled ? action.title : undefined} disabled={action.disabled} sx={tone(action.color)}
                    {...(action.to ? { component: RouterLink, to: action.to } : {})}
                    onClick={() => { setAnchor(null); action.onClick?.(); }}>
                    {action.icon && <ListItemIcon sx={tone(action.color)}>{action.icon}</ListItemIcon>}
                    <ListItemText>{action.label}</ListItemText>
                </MenuItem>
            ))}
        </Menu>
    </>;
}

/**
 * A single row of labelled action buttons. When the row no longer fits its container, pinned actions stay
 * visible and the rest move into a "more" menu, so action rows never wrap or overflow on narrow screens.
 * Pass `collapsed` when an outer container decides instead, e.g. a scrolling table for its row actions.
 */
type Alignment = 'start' | 'end';
const margin = { start: 0, end: 'auto' } as const;

export function ActionBar({ actions: candidates, collapsed: forced, size = 'medium', align = { xs: 'start', sm: 'end' }, sx, buttonSx }: {
    /** Falsy entries are skipped, so permission checks can stay inline. */
    actions: (Action | false | null | undefined)[];
    collapsed?: boolean;
    size?: ButtonProps['size'];
    /** Per breakpoint; by default left on phones, where a bar usually gets its own row, and right from `sm` up. */
    align?: Alignment | Partial<Record<Breakpoint, Alignment>>;
    sx?: SxProps<Theme>;
    buttonSx?: SystemStyleObject<Theme>;
}) {
    const { ref, collapsed: overflowing } = useOverflowCollapse<HTMLDivElement>();
    const collapsed = forced ?? overflowing;
    const actions = candidates.filter((action): action is Action => Boolean(action));
    if (!actions.length) return null;
    const inline = collapsed ? actions.filter((action) => action.pinned) : actions;
    const ml: (typeof margin)[Alignment] | Partial<Record<Breakpoint, (typeof margin)[Alignment]>> = typeof align === 'string' ? margin[align]
        : Object.fromEntries(Object.entries(align).map(([breakpoint, value]) => [breakpoint, margin[value]]));
    const track = <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexShrink: collapsed ? 1 : 0, minWidth: 0, ml }}>
        {inline.map((action) => <Button key={action.key} title={action.title} size={size} variant={action.variant ?? 'outlined'}
            color={action.color} startIcon={action.icon} disabled={action.disabled} onClick={action.onClick}
            {...(action.to ? { component: RouterLink, to: action.to } : {})}
            sx={{ ...buttonSx, flexShrink: collapsed ? 1 : 0, minWidth: 0, whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{action.label}</Box>
        </Button>)}
        {collapsed && <ActionMenu actions={actions.filter((action) => !action.pinned)} size={size === 'large' ? 'medium' : 'small'} />}
    </Box>;
    if (forced !== undefined) return track;
    // The bar grows into all free space, so a collapsed bar notices when the full row fits again.
    // The inner track sizes to its content, so the observer sees it grow when actions are added.
    // An auto margin (not justify-content) aligns it right, so an overflow still extends to the right and is measured.
    return <Box ref={ref} sx={[{ display: 'flex', flex: '1 1 auto', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }, ...(Array.isArray(sx) ? sx : [sx])]}>
        {track}
    </Box>;
}
