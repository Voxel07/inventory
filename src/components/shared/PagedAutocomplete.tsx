import { useState } from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import { usePagedList } from '../../hooks/usePagedList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Page } from '../../services/apiPagination';
import type { Option } from '../../types/operationForm';
import { LoadMore } from './LoadMore';

/** Search and continuation are server-side; retain the selected label across searches. */
export function PagedAutocomplete({ value, selectedLabel, onChange, label, queryKey, getPage, required, disabled, size, helperText }: {
  value?: string | null; selectedLabel?: string; onChange: (value: string) => void; label: string;
  queryKey: readonly unknown[]; getPage: (search: string, page: number, size: number) => Promise<Page<Option>>;
  required?: boolean; disabled?: boolean; size?: 'small' | 'medium'; helperText?: string;
}) {
  const [input, setInput] = useState('');
  const [chosen, setChosen] = useState<Option | null>(null);
  const search = useDebouncedValue(input.trim());
  const list = usePagedList([...queryKey, 'picker', search], (page, count) => getPage(search, page, count), { size: 25, enabled: !disabled });
  const current = value ? list.data?.find(option => option.value === value)
    ?? (chosen?.value === value ? chosen : { value, label: selectedLabel || value }) : null;
  const options = current && !list.data?.some(option => option.value === value) ? [current, ...(list.data ?? [])] : list.data ?? [];
  return <Box sx={{ width: '100%', minWidth: 0 }}>
    <Autocomplete options={options} value={current} fullWidth disabled={disabled} size={size}
      loading={list.isFetching} filterOptions={rows => rows} getOptionLabel={option => option.label}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      onInputChange={(_, next, reason) => { if (reason === 'input' || reason === 'clear') setInput(next); }}
      onChange={(_, option) => { setChosen(option); setInput(''); onChange(option?.value ?? ''); }}
      renderInput={params => <TextField {...params} label={label} required={required} error={list.isError} helperText={list.error?.message ?? helperText} />} />
    <LoadMore list={list} />
  </Box>;
}
