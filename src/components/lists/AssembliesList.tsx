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
import type { Assembly, Item } from '../../types';

interface Props {
    assemblies: Assembly[] | undefined;
    items: Item[] | undefined;
    isLoading: boolean;
    onEdit: (assembly: Assembly) => void;
    onDelete: (id: string) => void;
}

export function AssembliesList({ assemblies, items, isLoading, onEdit, onDelete }: Props) {
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

    function getItemNames(itemIds: string[] | undefined | null) {
        if (!Array.isArray(itemIds)) return [];
        return itemIds
            .map((id) => items?.find((i) => i.id === id)?.name)
            .filter(Boolean);
    }

    function getAssemblyTotalValue(itemIds: string[] | undefined | null) {
        if (!Array.isArray(itemIds)) return 0;
        return itemIds.reduce((sum, id) => {
            const item = items?.find((i) => i.id === id);
            return sum + (item ? item.value : 0);
        }, 0);
    }

    return (
        <TableContainer component={Paper}>
            <Table>
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
                    {assemblies.map((assembly) => (
                        <TableRow key={assembly.id} hover>
                            <TableCell>{assembly.name}</TableCell>
                            <TableCell>{assembly.description}</TableCell>
                            <TableCell>
                                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
                                    {getItemNames(assembly.itemIds).map((name) => (
                                        <Chip key={name} label={name} size="small" variant="outlined" />
                                    ))}
                                </Stack>
                            </TableCell>
                            <TableCell align="right">
                                {getAssemblyTotalValue(assembly.itemIds).toFixed(2)} €
                            </TableCell>
                            <TableCell align="right">
                                <IconButton size="small" onClick={() => onEdit(assembly)} aria-label="edit assembly">
                                    <EditIcon />
                                </IconButton>
                                <IconButton size="small" onClick={() => onDelete(assembly.id)} aria-label="delete assembly">
                                    <DeleteIcon />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
