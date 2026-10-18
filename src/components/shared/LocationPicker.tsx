import { Autocomplete, Box, TextField, Typography, createFilterOptions } from '@mui/material';
import type { StorageLocation } from '../../types';
import { locationPath } from '../../utils/locationHierarchy';

interface Props {
    locations: StorageLocation[];
    value: string | null | undefined;
    onChange: (location: StorageLocation | null) => void;
    label: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    size?: 'small' | 'medium';
}

const filter = createFilterOptions<StorageLocation>({
    stringify: (location) => `${location.fullCode} ${location.hierarchyPath ?? location.name} ${location.name}`,
});

/** Locations in tree order, found by code (`WH1-E1-R3`), name or any part of their path. */
export function LocationPicker({ locations, value, onChange, label, helperText, required, disabled, size }: Props) {
    const options = [...locations].sort((a, b) => (a.fullCode ?? '').localeCompare(b.fullCode ?? '', undefined, { numeric: true }));
    return <Autocomplete
        options={options}
        filterOptions={filter}
        groupBy={(location) => location.warehouseName ?? ''}
        getOptionLabel={(location) => location.fullCode ? `${location.fullCode} · ${locationPath(location, locations)}` : locationPath(location, locations)}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        value={locations.find((location) => location.id === value) ?? null}
        onChange={(_event, location) => onChange(location)}
        disabled={disabled}
        size={size}
        fullWidth
        renderOption={({ key, ...props }, location) => {
            const depth = location.fullCode ? location.fullCode.split('-').length - (location.warehouseId ? 2 : 1) : 0;
            return <Box component="li" key={key} {...props} sx={{ pl: `${16 + Math.max(0, depth) * 12}px !important` }}>
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
