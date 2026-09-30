import { useState } from 'react';
import { Alert, Button, Card, CardContent, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { getWarehouses, saveWarehouse, type Warehouse } from '../../services/warehouseService';
import { useOperationCommand, useOperationList } from '../../hooks/useOperations';
import { useLocalizedText } from '../../utils/naming';

export function WarehousesPanel() {
  const t = useLocalizedText(); const list = useOperationList('warehouses', getWarehouses); const command = useOperationCommand();
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', active: true });
  return <Stack spacing={2}>
    {(list.error || command.error) && <Alert severity="error">{(list.error || command.error)?.message}</Alert>}
    <Typography variant="h6">{t('Lager / Standorte', 'Warehouses / sites')}</Typography>
    {list.data?.map((w) => <Card key={w.id}><CardContent><Typography>{w.code} · {w.name} · {w.active ? t('Aktiv', 'Active') : t('Inaktiv', 'Inactive')}</Typography><Typography>{w.description}</Typography><Button onClick={() => { setEditing(w); setForm({ code: w.code, name: w.name, description: w.description ?? '', active: w.active }); }}>{t('Bearbeiten', 'Edit')}</Button></CardContent></Card>)}
    <Stack component="form" spacing={2} onSubmit={(event) => { event.preventDefault(); command.mutate(() => saveWarehouse(form, editing?.id), { onSuccess: () => { setEditing(null); setForm({ code: '', name: '', description: '', active: true }); } }); }}>
      <Typography>{editing ? t('Standort bearbeiten', 'Edit site') : t('Standort hinzufügen', 'Add site')}</Typography>
      <TextField required label={t('Code', 'Code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      <TextField required label={t('Name', 'Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <TextField label={t('Beschreibung', 'Description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <FormControlLabel label={t('Aktiv', 'Active')} control={<Checkbox checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} />
      <Button type="submit" disabled={command.isPending || !form.code.trim() || !form.name.trim()}>{t('Speichern', 'Save')}</Button>
      {editing && <Button onClick={() => { setEditing(null); setForm({ code: '', name: '', description: '', active: true }); }}>{t('Abbrechen', 'Cancel')}</Button>}
    </Stack>
  </Stack>;
}
