import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Skeleton,
    Typography,
    Stack,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router-dom';
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
                        <TableCell>Description</TableCell>
                        <TableCell>Items</TableCell>
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
                                <TableCell>{assembly.description}</TableCell>
                                <TableCell>
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
                                    <IconButton size="small" onClick={() => navigate(`/assemblies/${assembly.id}`)} aria-label="view assembly">
                                        <VisibilityIcon />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => onEdit(assembly)} aria-label="edit assembly">
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => onDelete(assembly.id)} aria-label="delete assembly">
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
