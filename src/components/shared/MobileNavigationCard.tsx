import { useEffect, useState } from 'react';
import { Accordion, AccordionDetails, Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { AccordionSummary, Button, IconButton } from './ActionButtons';
import { useUIStore } from '../../store/uiStore';
import { saveMobileNavigation } from '../../services/apiClient';
import { MOBILE_NAV_LIMITS, TASKS_KEY, resolveMobileNav, useMobileDestinations, useMobileNavLayout, type MobileDestination } from './navDestinations';
import { useT } from '../../utils/naming';
import type { MobileNavLayout, MobileNavPlacement } from '../../types';

type Choice = MobileNavPlacement | 'menu' | 'hidden';

/**
 * Arranges the phone's bottom and top bars, what stays under "More", and what phones leave out. Changes show at once
 * but are saved to the user's account only on Save; leaving the card unsaved discards them.
 */
export function MobileNavigationCard() {
  const t = useT();
  const destinations = useMobileDestinations();
  const draft = useUIStore((s) => s.mobileNavDraft);
  const setDraft = useUIStore((s) => s.setMobileNavDraft);
  const [saving, setSaving] = useState(false);
  const layout = resolveMobileNav(useMobileNavLayout(), destinations);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const change = (next: MobileNavLayout | null) => setDraft(next);
  useEffect(() => () => setDraft(undefined), [setDraft]);
  const save = () => {
    if (draft === undefined) return;
    setSaving(true);
    saveMobileNavigation(draft)
      .then(() => { setDraft(undefined); showSnackbar(t('profile.mobileNavigation.saved'), 'success'); })
      .catch((error: unknown) => showSnackbar(error instanceof Error ? error.message : t('profile.mobileNavigation.saveFailed'), 'error'))
      .finally(() => setSaving(false));
  };
  const without = (key: string): MobileNavLayout => ({
    ...layout,
    bottom: layout.bottom.filter((candidate) => candidate !== key),
    top: layout.top.filter((candidate) => candidate !== key),
    hidden: layout.hidden.filter((candidate) => candidate !== key),
  });
  const place = (key: string, choice: Choice) => {
    const next = without(key);
    if (choice !== 'menu') next[choice] = [...next[choice], key];
    change(next);
  };
  const move = (bar: MobileNavPlacement, index: number, offset: number) => {
    const keys = [...layout[bar]];
    [keys[index], keys[index + offset]] = [keys[index + offset], keys[index]];
    change({ ...layout, [bar]: keys });
  };
  const setInboxInProfile = (inboxInProfile: boolean) => {
    if (inboxInProfile) {
      change({ ...without(TASKS_KEY), inboxInProfile });
      return;
    }
    // Tasks gets a free bar slot back; with both bars full it takes the first top-bar slot.
    const top = layout.top.length < MOBILE_NAV_LIMITS.top ? [...layout.top, TASKS_KEY] : layout.top;
    const bottom = top.includes(TASKS_KEY) || layout.bottom.length >= MOBILE_NAV_LIMITS.bottom ? layout.bottom : [...layout.bottom, TASKS_KEY];
    change({ ...layout, top, bottom, inboxInProfile });
  };

  const byKey = new Map(destinations.map((destination) => [destination.key, destination]));
  const listed = (keys: string[]) => keys.flatMap((key) => byKey.get(key) ?? []);
  const placed = new Set([...layout.bottom, ...layout.top, ...layout.hidden]);
  const menu = destinations.filter((destination) => !placed.has(destination.key) && destination.menuEntry);

  const row = (destination: MobileDestination, choice: Choice, index?: number) => {
    const bar = choice === 'bottom' || choice === 'top' ? choice : undefined;
    const full = (target: MobileNavPlacement) => choice !== target && layout[target].length >= MOBILE_NAV_LIMITS[target];
    return <Box component="li" key={destination.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5 }}>
      <Box sx={{ display: 'flex', color: 'text.secondary' }}>{destination.icon}</Box>
      <Typography sx={{ flex: 1, minWidth: 0 }} noWrap title={destination.label}>{destination.label}</Typography>
      {bar && index !== undefined && <>
        <IconButton size="small" sx={{ p: 0.25 }} disabled={index === 0} onClick={() => move(bar, index, -1)}
          aria-label={t('profile.mobileNavigation.moveEarlier', { label: destination.label })}><KeyboardArrowUpIcon fontSize="small" /></IconButton>
        <IconButton size="small" sx={{ p: 0.25 }} disabled={index === layout[bar].length - 1} onClick={() => move(bar, index, 1)}
          aria-label={t('profile.mobileNavigation.moveLater', { label: destination.label })}><KeyboardArrowDownIcon fontSize="small" /></IconButton>
      </>}
      <TextField select size="small" value={choice} sx={{ width: 100, flexShrink: 0 }}
        onChange={(event) => place(destination.key, event.target.value as Choice)}
        slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('profile.mobileNavigation.placement', { label: destination.label }) } } }}
        title={destination.hideable ? undefined : t('profile.mobileNavigation.tasksRequired')}>
        <MenuItem value="bottom" disabled={full('bottom')}>{t('profile.mobileNavigation.bottom')}</MenuItem>
        <MenuItem value="top" disabled={full('top')}>{t('profile.mobileNavigation.top')}</MenuItem>
        <MenuItem value="menu" disabled={!destination.menuEntry}>{t('profile.mobileNavigation.menu')}</MenuItem>
        <MenuItem value="hidden" disabled={!destination.hideable}>{t('profile.mobileNavigation.hidden')}</MenuItem>
      </TextField>
    </Box>;
  };
  const section = (title: string, rows: MobileDestination[], choice: Choice) => <Box>
    <Typography variant="overline" color="text.secondary">{title}</Typography>
    {rows.length
      ? <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>{rows.map((destination, index) => row(destination, choice, index))}</Box>
      : <Typography variant="body2" color="text.secondary">{t('profile.mobileNavigation.empty')}</Typography>}
  </Box>;

  return (
    <Accordion variant="outlined" disableGutters sx={{ mt: 3, width: '100%', borderRadius: 1, '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: { xs: 2, sm: 2.5 } }}>
        <Typography variant="h6">{t('profile.mobileNavigation.title')}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5, pt: 0 }}>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('profile.mobileNavigation.description')} {t('profile.mobileNavigation.limits', { bottom: MOBILE_NAV_LIMITS.bottom, top: MOBILE_NAV_LIMITS.top })}
          </Typography>
          <FormControlLabel control={<Switch checked={layout.inboxInProfile} onChange={(_, checked) => setInboxInProfile(checked)} />}
            label={t('profile.mobileNavigation.inboxInProfile')} />
          {section(t('profile.mobileNavigation.bottomBar', { used: layout.bottom.length, limit: MOBILE_NAV_LIMITS.bottom }), listed(layout.bottom), 'bottom')}
          {section(t('profile.mobileNavigation.topBar', { used: layout.top.length, limit: MOBILE_NAV_LIMITS.top }), listed(layout.top), 'top')}
          {section(t('profile.mobileNavigation.menuSection'), menu, 'menu')}
          {section(t('profile.mobileNavigation.hiddenSection'), listed(layout.hidden), 'hidden')}
          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <Button variant="outlined" disabled={draft === undefined || saving} onClick={save}>{t('common.save')}</Button>
            <Button variant="outlined" disabled={saving} onClick={() => change(null)}>{t('profile.mobileNavigation.reset')}</Button>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
