import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import { useCreateOrder, useOrders } from '../../hooks/useOrders';
import { useTranslate } from '../../utils/naming';
import { useUIStore } from '../../store/uiStore';

export function GeneralOrders() {
  const t = useTranslate();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { data: orders = [], isLoading, isError } = useOrders();
  const createOrder = useCreateOrder();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [search, setSearch] = useState('');

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return orders;
    return orders.filter((order) => `${order.name} ${order.purpose} ${order.expand?.createdBy?.name ?? ''}`.toLocaleLowerCase().includes(term));
  }, [orders, search]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    createOrder.mutate({ name: name.trim(), purpose: purpose.trim() }, {
      onSuccess: () => {
        setName('');
        setPurpose('');
        setDialogOpen(false);
        showSnackbar(t('Bestellung erstellt', 'Order created'), 'success');
      },
      onError: (error) => showSnackbar(error instanceof Error ? error.message : t('Bestellung konnte nicht erstellt werden.', 'Order could not be created.'), 'error'),
    });
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4">{t('Allgemeine Bestellungen', 'General orders')}</Typography>
          <Typography color="text.secondary">
            {t('Bestellungen für Catering, Sponsorenzelte, Bühnen und andere Zwecke.', 'Orders for catering, sponsor tents, stages, and other purposes.')}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} sx={{ alignSelf: { sm: 'flex-start' } }}>
          {t('Neue Bestellung', 'New order')}
        </Button>
      </Stack>

      <TextField
        fullWidth
        size="small"
        label={t('Bestellungen durchsuchen', 'Search orders')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        sx={{ mb: 2, maxWidth: 520 }}
      />

      {isLoading && <LinearProgress sx={{ mb: 2 }} />}
      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Bestellungen konnten nicht geladen werden.', 'Orders could not be loaded.')}</Alert>}
      {!isLoading && !visibleOrders.length && (
        <Paper sx={{ p: 3 }}><Typography color="text.secondary">{t('Noch keine passenden Bestellungen vorhanden.', 'No matching orders yet.')}</Typography></Paper>
      )}
      <Stack spacing={1}>
        {visibleOrders.map((order) => (
          <Paper key={order.id} sx={{ p: 1.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6">{order.name}</Typography>
                <Typography>{order.purpose}</Typography>
              </Box>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary', flexShrink: 0 }}>
                <PersonIcon fontSize="small" />
                <Typography variant="body2">{order.expand?.createdBy?.name ?? order.createdBy}</Typography>
                <Typography variant="caption">· {new Date(order.created).toLocaleDateString()}</Typography>
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={submit}>
          <DialogTitle>{t('Neue Bestellung', 'New order')}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField autoFocus required label={t('Name', 'Name')} value={name} onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} />
              <TextField required multiline minRows={3} label={t('Zweck', 'Purpose')} placeholder={t('z. B. Catering, Sponsorenzelt oder Bühne', 'e.g. catering, sponsor tent, or stage')} value={purpose} onChange={(event) => setPurpose(event.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>{t('Abbrechen', 'Cancel')}</Button>
            <Button type="submit" variant="contained" disabled={createOrder.isPending || !name.trim() || !purpose.trim()}>{t('Erstellen', 'Create')}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
