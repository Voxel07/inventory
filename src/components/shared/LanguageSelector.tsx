import { Box, FormControl, MenuItem, Select, Typography } from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import { setAppLanguage, useAppLanguage, useTranslate, type AppLanguage } from '../../utils/naming';

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const language = useAppLanguage();
  const t = useTranslate();

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TranslateIcon fontSize="small" color="action" />
      {!compact && <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{t('Sprache', 'Language')}</Typography>}
      <FormControl size="small" sx={{ minWidth: compact ? 112 : 125 }}>
        <Select
          value={language}
          onChange={(event) => setAppLanguage(event.target.value as AppLanguage)}
          inputProps={{ 'aria-label': t('Sprache', 'Language') }}
        >
          <MenuItem value="de">Deutsch</MenuItem>
          <MenuItem value="en">English</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}
