import type { ReactNode } from 'react';
import { Badge } from '@mui/material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import OutputIcon from '@mui/icons-material/Output';
import AssignmentReturnOutlinedIcon from '@mui/icons-material/AssignmentReturnOutlined';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import HistoryIcon from '@mui/icons-material/History';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useActionInboxDialog } from '../../hooks/useActionInboxDialog';
import { useInboxCount } from '../../hooks/useInbox';
import { useT } from '../../utils/naming';
import { canCreateInventory, canAccessProcurement, canAccessSharingGroups, canAccessWarehouseTasks, canManageInventory, canManageUsers, canViewCatalog, canViewOrganization } from '../../utils/access';
import type { MobileNavLayout, MobileNavPlacement, User } from '../../types';

export type NavItem = { label: string; path: string; icon: ReactNode };
export type NavGroup = { label: string; items: NavItem[] };

/** Destinations grouped by user task; each group appears only with at least one permitted entry. */
export function useNavGroups(user: User | null | undefined): NavGroup[] {
    const t = useT();
    const { canPreviewRoles } = useAuth();
    const manager = canManageInventory(user);
    const catalog = manager || canViewCatalog(user);
    const operations = canAccessWarehouseTasks(user);
    const organization = canViewOrganization(user);
    const groups: NavGroup[] = [
        { label: t('common.overview'), items: [
            { label: t('nav.home'), path: '/', icon: <HomeOutlinedIcon /> },
        ] },
        { label: t('header.inventory'), items: catalog ? [
            { label: t('nav.items'), path: '/items', icon: <Inventory2OutlinedIcon /> },
            { label: t('nav.assemblies'), path: '/assemblies', icon: <CategoryOutlinedIcon /> },
            { label: t('shared.navigation.locations'), path: '/storage-locations', icon: <RoomOutlinedIcon /> },
            ...(manager ? [{ label: t('shared.navigation.labelsQRCodes'), path: '/print-qr', icon: <QrCode2Icon /> }] : []),
            ...(canAccessSharingGroups(user) ? [{ label: t('common.sharingGroups'), path: '/sharing', icon: <GroupsOutlinedIcon /> }] : []),
        ] : [] },
        { label: t('shared.navigation.ordersReturns'), items: catalog ? [
            ...(organization ? [{ label: t('nav.orders'), path: '/orders', icon: <ReceiptLongOutlinedIcon /> }] : []),
            ...(canCreateInventory(user) ? [
                { label: t('shared.navigation.checkedOut'), path: '/checked-out', icon: <OutputIcon /> },
                { label: t('shared.navigation.reviewReturns'), path: '/returns', icon: <AssignmentReturnOutlinedIcon /> },
            ] : []),
        ] : [] },
        { label: t('nav.events'), items: organization ? [
            { label: t('common.eventPlanning'), path: '/events', icon: <EventOutlinedIcon /> },
            { label: t('common.eventAttendees'), path: '/events/attendees', icon: <PeopleOutlineIcon /> },
            { label: t('common.eventTimeline'), path: '/events/timeline', icon: <TimelineIcon /> },
        ] : [] },
        { label: t('shared.navigation.operations'), items: [
            ...(operations ? [{ label: t('shared.navigation.warehouseTasks'), path: '/operations', icon: <WarehouseOutlinedIcon /> }] : []),
            ...(canAccessProcurement(user) ? [{ label: t('nav.procurement'), path: '/procurement', icon: <ShoppingCartOutlinedIcon /> }] : []),
            ...(manager ? [{ label: t('nav.maintenance'), path: '/maintenance', icon: <BuildOutlinedIcon /> }] : []),
            ...(manager ? [{ label: t('nav.damageReports'), path: '/damage-reports', icon: <ReportProblemOutlinedIcon /> }] : []),
        ] },
        { label: t('shared.navigation.reports'), items: manager ? [
            { label: t('nav.transactions'), path: '/transactions', icon: <HistoryIcon /> },
        ] : [] },
        { label: t('shared.navigation.administration'), items: canManageUsers(user) || canPreviewRoles ? [
            { label: t('nav.userManagement'), path: '/users', icon: <ManageAccountsOutlinedIcon /> },
        ] : [] },
    ];
    return groups.filter((group) => group.items.length > 0);
}

export function isActivePath(pathname: string, path: string) {
    if (path === '/events' && (pathname === '/events/attendees' || pathname === '/events/timeline')) return false;
    return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}

export const DEFAULT_MOBILE_NAV: MobileNavLayout = { '/items': 'bottom', '/assemblies': 'bottom', '/orders': 'bottom', tasks: 'top' };

/** How many destinations fit beside "More" in the bottom bar, and beside the profile in the top bar, on a phone. */
export const MOBILE_NAV_LIMITS: Record<MobileNavPlacement, number> = { bottom: 4, top: 2 };

/** A destination that can be placed in the phone's bottom or top bar. */
export type MobileDestination = {
    key: string;
    label: string;
    icon: ReactNode;
    /** Set for routes, to mark the active destination. */
    path?: string;
    open: () => void;
    /** Has no entry in the "More" menu, so it must stay in one of the bars. */
    required?: boolean;
};

/** Every destination the user may open: Tasks (the action inbox), then the menu entries in menu order. */
export function useMobileDestinations(): MobileDestination[] {
    const t = useT();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { openActionInbox } = useActionInboxDialog();
    const inboxCount = useInboxCount();
    const groups = useNavGroups(user);
    return [
        { key: 'tasks', label: t('common.tasks'), icon: <Badge badgeContent={inboxCount} color="error" max={99}><InboxOutlinedIcon /></Badge>,
            open: openActionInbox, required: true },
        ...groups.flatMap((group) => group.items).map((item) => ({ key: item.path, ...item, open: () => { void navigate(item.path); } })),
    ];
}

/** The signed-in user's saved layout, or the default until they choose one. */
export function useMobileNavLayout(): MobileNavLayout {
    const { user } = useAuth();
    return user?.mobileNavigation ?? DEFAULT_MOBILE_NAV;
}

/** The placement of each destination; a required destination without one stays in the top bar. */
export function useMobileNavPlacement() {
    const layout = useMobileNavLayout();
    return (destination: MobileDestination): MobileNavPlacement | undefined => layout[destination.key] ?? (destination.required ? 'top' : undefined);
}

/** The phone's bottom- and top-bar destinations, limited to those the user may open. */
export function useMobileNavigation() {
    const destinations = useMobileDestinations();
    const placementOf = useMobileNavPlacement();
    const placed = (placement: MobileNavPlacement) => destinations.filter((destination) => placementOf(destination) === placement)
        .slice(0, MOBILE_NAV_LIMITS[placement]);
    const bottom = placed('bottom');
    // A layout chosen for other permissions may leave nothing the user can open; Home keeps the bar useful.
    return { bottom: bottom.length ? bottom : destinations.filter((destination) => destination.key === '/'), top: placed('top') };
}
