import { useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Skeleton,
    Typography,
    Stack,
    Menu,
    MenuItem,
    IconButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Box,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MenuIcon from '@mui/icons-material/Menu';
import { useNavigate } from 'react-router-dom';
import { TooltipButton } from '../shared/TooltipButton';
import type { Assembly, Item } from '../../types';

interface Props {
    assemblies: Assembly[] | undefined;
    items: Item[] | undefined;
    isLoading: boolean;
    onEdit: (assembly: Assembly) => void;
    onDelete: (id: string) => void;
}

export function AssembliesList({ assemblies, items, isLoading, onEdit, onDelete }: Props) {
    const navigate = useNavigate();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedAssembly, setSelectedAssembly] = useState<Assembly | null>(null);

    const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, assembly: Assembly) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
        setSelectedAssembly(assembly);
    };

    const handleCloseMenu = () => {
        setAnchorEl(null);
        setSelectedAssembly(null);
    };

    const handleView = () => {
        if (selectedAssembly) {
            navigate(`/assemblies/${selectedAssembly.id}`);
        }
        handleCloseMenu();
    };

    const handleEdit = () => {
        if (selectedAssembly) {
            onEdit(selectedAssembly);
        }
        handleCloseMenu();
    };

    const handleDelete = () => {
        if (selectedAssembly) {
            onDelete(selectedAssembly.id);
        }
        handleCloseMenu();
    };

    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!assemblies?.length) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No assemblies found</Typography>
            </Paper>
        );
    }

    function getExpandedItems(assembly: Assembly): Item[] {
        if (assembly.expand?.itemIds?.length) return assembly.expand.itemIds;
        if (!Array.isArray(assembly.itemIds) || !items) return [];
        return assembly.itemIds
            .map((id) => items.find((i) => i.id === id))
            .filter((i): i is Item => !!i);
    }

    function getAssemblyTotalValue(assembly: Assembly): number {
        const quantities = assembly.itemQuantities ?? {};
        return getExpandedItems(assembly).reduce(
            (sum, item) => sum + (item.value ?? 0) * (quantities[item.id] ?? 1), 0,
        );
    }

    return (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Description</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Items</TableCell>
                        <TableCell align="right">Total Value</TableCell>
                        <TableCell align="right">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {assemblies.map((assembly) => {
                        const assemblyItems = getExpandedItems(assembly);
                        return (
                            <TableRow
                                key={assembly.id}
                                hover
                                onClick={() => navigate(`/assemblies/${assembly.id}`)}
                                sx={{ cursor: 'pointer' }}
                            >
                                <TableCell>{assembly.name}</TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                    {assembly.description}
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
                                        {assemblyItems.map((item) => {
                                            const qty = assembly.itemQuantities?.[item.id] ?? 1;
                                            return (
                                                <Chip
                                                    key={item.id}
                                                    label={qty > 1 ? `${qty}× ${item.name}` : item.name}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            );
                                        })}
                                    </Stack>
                                </TableCell>
                                <TableCell align="right">
                                    {getAssemblyTotalValue(assembly).toFixed(2)} €
                                </TableCell>
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                    {/* Burger menu for small screens (xs) */}
                                    <Box sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
                                        <Tooltip title="Actions" arrow>
                                            <IconButton
                                                onClick={(e) => handleOpenMenu(e, assembly)}
                                                size="small"
                                            >
                                                <MenuIcon />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>

                                    {/* Individual buttons for larger screens (sm and up) */}
                                    <Box sx={{ display: { xs: 'none', sm: 'inline-flex' }, gap: 0.5 }}>
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText="View Assembly details"
                                            icon={<VisibilityIcon />}
                                            size="small"
                                            color="info"
                                            onClick={() => navigate(`/assemblies/${assembly.id}`)}
                                        />
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText="Edit Assembly details"
                                            icon={<EditIcon />}
                                            size="small"
                                            color="warning"
                                            onClick={() => onEdit(assembly)}
                                        />
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText="Delete Assembly"
                                            icon={<DeleteIcon />}
                                            size="small"
                                            color="error"
                                            onClick={() => onDelete(assembly.id)}
                                        />
                                    </Box>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleCloseMenu}
                onClick={(e) => e.stopPropagation()}
            >
                <MenuItem onClick={handleView}>
                    <ListItemIcon>
                        <VisibilityIcon fontSize="small" color="info" />
                    </ListItemIcon>
                    <ListItemText>View Details</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleEdit}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" color="warning" />
                    </ListItemIcon>
                    <ListItemText>Edit</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDelete}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                </MenuItem>
            </Menu>
        </TableContainer>
    );
}
