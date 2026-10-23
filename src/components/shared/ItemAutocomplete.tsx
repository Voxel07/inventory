import { useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { searchItems } from '../../services/inventoryService';
import { useItemsByIds } from '../../hooks/useItems';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Item } from '../../types';
import { useT } from '../../utils/naming';

const RESULT_SIZE = 25;

/**
 * Item picker backed by server search, so selecting an item never downloads the catalog. The selected item is
 * resolved by id; `filter` narrows the returned matches (e.g. serialized items only).
 */
export function ItemAutocomplete({ value, onChange, label, required, disabled, helperText, filter, size, getOptionLabel, showMoreHint = true }: {
  value: string | null | undefined;
  onChange: (item: Item | null) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  filter?: (item: Item) => boolean;
  size?: 'small' | 'medium';
  getOptionLabel?: (item: Item) => string;
  showMoreHint?: boolean;
}) {
  const t = useT();
  const [input, setInput] = useState('');
  const search = useDebouncedValue(input.trim());
  const selected = useItemsByIds(value ? [value] : []);
  const results = useQuery({
    queryKey: ['items', 'search', search],
    queryFn: () => searchItems(search, RESULT_SIZE),
    networkMode: 'offlineFirst',
    staleTime: 30_000,
    enabled: !disabled,
  });
  const current = selected.data?.find((item) => item.id === value) ?? null;
  const matches = (results.data?.rows ?? []).filter((item) => !filter || filter(item));
  const options = current && !matches.some((item) => item.id === current.id) ? [current, ...matches] : matches;
  const label_ = getOptionLabel ?? ((item: Item) => item.sku ? `${item.name} (${item.sku})` : item.name);
  return <Autocomplete
    options={options}
    value={current}
    disabled={disabled}
    size={size}
    loading={results.isFetching || selected.isFetching}
    filterOptions={(rows) => rows}
    getOptionLabel={label_}
    isOptionEqualToValue={(option, chosen) => option.id === chosen.id}
    onInputChange={(_, next, reason) => { if (reason === 'input' || reason === 'clear') setInput(next); }}
    onChange={(_, item) => { setInput(''); onChange(item); }}
    noOptionsText={search ? t('shared.itemAutocomplete.noMatchingItems') : t('shared.itemAutocomplete.typeToSearch')}
    renderInput={(params) => <TextField {...params} label={label} required={required}
      error={results.isError}
      helperText={results.isError ? t('shared.itemAutocomplete.itemSearchFailed')
        : showMoreHint && results.data?.more ? t('shared.itemAutocomplete.moreMatchesRefineTheSearch') : helperText} />}
  />;
}
