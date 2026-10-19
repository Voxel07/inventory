import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { IconButton } from './ActionButtons';
import { ActionMenu } from './ActionBar';
import { useOverflowCollapse } from '../../hooks/useOverflowCollapse';

export type RowAction = { key: string; label: string; icon: ReactNode; onClick: () => void; color?: 'error' };

/**
 * Inline icon buttons, or a single "more" menu when space is short. Pass `collapsed` when an outer
 * container (e.g. a scrolling table) decides; otherwise the actions measure their own row.
 */
export function RowActions({ actions, collapsed: forced }: { actions: RowAction[]; collapsed?: boolean }) {
    const { ref, collapsed: overflowing } = useOverflowCollapse<HTMLDivElement>();
    const collapsed = forced ?? overflowing;
    const content = collapsed ? <ActionMenu actions={actions} /> : <>
        {actions.map((action) => (
            <IconButton key={action.key} title={action.label} size="small" color={action.color} onClick={action.onClick}>
                {action.icon}
            </IconButton>
        ))}
    </>;
    if (forced !== undefined) return content;
    return <Box ref={ref} sx={{ display: 'flex', flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, ml: 'auto' }}>{content}</Box>
    </Box>;
}
