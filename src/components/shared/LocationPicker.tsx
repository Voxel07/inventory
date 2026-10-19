import { Autocomplete, Box, TextField, Typography, createFilterOptions } from '@mui/material';
import type { StorageLocation } from '../../types';
import { holdsStock, locationPath } from '../../utils/locationHierarchy';

interface Props {
    locations: StorageLocation[];
    value: string | null | undefined;
    onChange: (location: StorageLocation | null) => void;
    label: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    size?: 'small' | 'medium';
    /**
     * Only sections and storage places can be chosen (default): stock is never kept directly in a top-level location.
     * Filters and parent choices pass `false`.
     */
    stockOnly?: boolean;
}

const filter = createFilterOptions<StorageLocation>({
    stringify: (location) => `${location.fullCode} ${location.hierarchyPath ?? location.name} ${location.name}`,
});

/** Locations in tree order, grouped by top-level location and found by code (`BH-CE-R3`), name or any part of their path. */
export function LocationPicker({ locations, value, onChange, label, helperText, required, disabled, size, stockOnly = true }: Props) {
    const options = [...locations].sort((a, b) => (a.rootLocationName ?? '').localeCompare(b.rootLocationName ?? '')
        || (a.fullCode ?? '').localeCompare(b.fullCode ?? '', undefined, { numeric: true }));
    return <Autocomplete
        options={options}
        filterOptions={filter}
        groupBy={(location) => location.rootLocationName ?? ''}
        getOptionLabel={(location) => location.fullCode ? `${location.fullCode} · ${locationPath(location, locations)}` : locationPath(location, locations)}
        getOptionDisabled={(location) => stockOnly && !holdsStock(location)}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        value={locations.find((location) => location.id === value) ?? null}
        onChange={(_event, location) => onChange(location)}
        disabled={disabled}
        size={size}
        fullWidth
        renderOption={({ key, ...props }, location) => {
            return <Box component="li" key={key} {...props} sx={{ pl: `${16 + Math.max(0, location.depth) * 12}px !important` }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        <Box component="span" className="mono" sx={{ mr: 1 }}>{location.fullCode}</Box>{location.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{locationPath(location, locations)}</Typography>
                </Box>
            </Box>;
        }}
        renderInput={(params) => <TextField {...params} label={label} helperText={helperText} required={required} fullWidth />}
    />;
}
