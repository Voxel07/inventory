import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Card, CardContent, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { getWarehouses, saveWarehouse, type Warehouse } from '../../services/warehouseService';
import { LoadMore } from '../shared/LoadMore';
import { useOperationCommand, useOperationList } from '../../hooks/useOperations';
import { translate, useT } from '../../utils/naming';

export function WarehousesPanel() {
  const t = useT(); const list = useOperationList('warehouses', getWarehouses); const command = useOperationCommand();
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', active: true });
  return <Stack spacing={2}>
    {(list.error || command.error) && <Alert severity="error">{(list.error || command.error)?.message}</Alert>}
    <Typography variant="h6">{t('operations.warehousesPanel.warehousesSites')}</Typography>
    {list.data?.map((w) => <Card key={w.id}><CardContent><Typography>{w.code} · {w.name} · {w.active ? t('enum.value.active') : t('common.inactive')}</Typography><Typography>{w.description}</Typography><Button title={translate('operations.warehousesPanel.editTheWarehouseDetails')} onClick={() => { setEditing(w); setForm({ code: w.code, name: w.name, description: w.description ?? '', active: w.active }); }}>{t('common.edit')}</Button></CardContent></Card>)}
    <LoadMore list={list} />
    <Stack component="form" spacing={2} onSubmit={(event) => { event.preventDefault(); command.mutate(() => saveWarehouse(form, editing?.id), { onSuccess: () => { setEditing(null); setForm({ code: '', name: '', description: '', active: true }); } }); }}>
      <Typography>{editing ? t('operations.warehousesPanel.editSite') : t('operations.warehousesPanel.addSite')}</Typography>
      <TextField required label={t('operations.warehousesPanel.code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      <TextField required label={t('profile.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <TextField label={t('common.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <FormControlLabel label={t('enum.value.active')} control={<Checkbox checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />} />
      <Button title={translate('operations.warehousesPanel.saveTheWarehouseDetails')} type="submit" disabled={command.isPending || !form.code.trim() || !form.name.trim()}>{t('common.save')}</Button>
      {editing && <Button title={translate('common.discardChangesAndClose')} onClick={() => { setEditing(null); setForm({ code: '', name: '', description: '', active: true }); }}>{t('common.cancel')}</Button>}
    </Stack>
  </Stack>;
}
