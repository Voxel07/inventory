import { InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export function CatalogSearchField({ value, onChange, ...props }: Omit<TextFieldProps, 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }) {
  return <TextField fullWidth size="small" {...props} value={value} onChange={(event) => onChange(event.target.value)}
    slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />;
}
