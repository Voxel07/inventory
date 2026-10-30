import { Box, Paper, Stack, ToggleButtonGroup, Typography } from '@mui/material';
import { Button, ToggleButton } from './ActionButtons';
import { useUIStore } from '../../store/uiStore';
import { saveMobileNavigation } from '../../services/apiClient';
import { MOBILE_NAV_LIMITS, useMobileDestinations, useMobileNavLayout, useMobileNavPlacement } from './navDestinations';
import { useT } from '../../utils/naming';
import type { MobileNavPlacement } from '../../types';

type Choice = MobileNavPlacement | 'menu';

/** Places each destination in the phone's bottom bar, its top bar, or only the "More" menu; saved to the user's account. */
export function MobileNavigationCard() {
  const t = useT();
  const destinations = useMobileDestinations();
  const layout = useMobileNavLayout();
  const placementOf = useMobileNavPlacement();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const save = (next: Parameters<typeof saveMobileNavigation>[0]) => {
    saveMobileNavigation(next).catch((error: unknown) => showSnackbar(error instanceof Error ? error.message : t('profile.mobileNavigation.saveFailed'), 'error'));
  };
  const setPlacement = (key: string, placement: MobileNavPlacement | null) => {
    const rest = Object.fromEntries(Object.entries(layout).filter(([candidate]) => candidate !== key));
    save(placement ? { ...rest, [key]: placement } : rest);
  };
  const used = (placement: MobileNavPlacement) => destinations.filter((destination) => placementOf(destination) === placement).length;
  const full = { bottom: used('bottom') >= MOBILE_NAV_LIMITS.bottom, top: used('top') >= MOBILE_NAV_LIMITS.top };

  return (
    <Paper variant="outlined" sx={{ mt: 3, p: 2.5, width: '100%' }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">{t('profile.mobileNavigation.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('profile.mobileNavigation.description')} {t('profile.mobileNavigation.limits', MOBILE_NAV_LIMITS)}
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {destinations.map((destination) => {
            const current: Choice = placementOf(destination) ?? 'menu';
            return <Box component="li" key={destination.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
              <Box sx={{ display: 'flex', color: 'text.secondary' }}>{destination.icon}</Box>
              <Typography sx={{ flex: 1, minWidth: 0 }} noWrap title={destination.label}>{destination.label}</Typography>
              <ToggleButtonGroup exclusive size="small" value={current} sx={{ flexShrink: 0 }}
                aria-label={t('profile.mobileNavigation.placement', { label: destination.label })}
                onChange={(_, value: Choice | null) => { if (value) setPlacement(destination.key, value === 'menu' ? null : value); }}>
                <ToggleButton value="bottom" disabled={current !== 'bottom' && full.bottom}>{t('profile.mobileNavigation.bottom')}</ToggleButton>
                <ToggleButton value="top" disabled={current !== 'top' && full.top}>{t('profile.mobileNavigation.top')}</ToggleButton>
                <ToggleButton value="menu" disabled={destination.required} title={destination.required ? t('profile.mobileNavigation.tasksRequired') : undefined}>
                  {t('profile.mobileNavigation.menu')}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>;
          })}
        </Box>
        <Box><Button onClick={() => save(null)}>{t('profile.mobileNavigation.reset')}</Button></Box>
      </Stack>
    </Paper>
  );
}
