import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Chip, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { ServerListPagination } from '../shared/ServerListPagination';
import { useAuth } from '../../hooks/useAuth';
import { getUserAccessHistory } from '../../services/userService';
import type { Faction, User } from '../../types';
import type { UserAccessState } from '../../types/user';
import { canManageUsers, factionKeyOf } from '../../utils/access';
import { useAppLanguage, useT } from '../../utils/naming';
import { UserRoleChips } from './UserRoleChips';

function AccessState({ state, factions }: { state: UserAccessState; factions: Faction[] }) {
  const t = useT();
  return <Stack spacing={1}>
    <UserRoleChips roles={state.roles} />
    <Typography variant="caption" color="text.secondary">{t('profile.assignedFactions')}</Typography>
    {state.factions.length ? <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
      {state.factions.map(key => {
        const faction = factions.find(candidate => factionKeyOf(candidate) === key);
        return <Chip key={key} size="small" variant="outlined" label={faction ? `${faction.eventType} · ${faction.name}` : key} />;
      })}
    </Stack> : <Typography variant="body2" color="text.secondary">{t('profile.noAssignedFactions')}</Typography>}
  </Stack>;
}

export function UserAccessHistory({ user, factions, onClose }: { user: User; factions: Faction[]; onClose: () => void }) {
  const t = useT();
  const language = useAppLanguage();
  const { user: me } = useAuth();
  const allowed = canManageUsers(me);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const history = useQuery({ queryKey: ['users', 'history', user.id, { page, size }], enabled: allowed,
    queryFn: () => getUserAccessHistory(user.id, page, size), gcTime: 0 });
  if (!allowed) return null;
  const rows = history.data?.rows ?? [];
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  return <Dialog open onClose={onClose} fullWidth maxWidth="xl">
    <DialogTitle>{t('pages.userManagement.accessHistory')}: {user.name || user.email}</DialogTitle>
    <DialogContent>
      {history.isError && <Alert severity="error" action={<Button onClick={() => { void history.refetch(); }}>{t('common.retryLoadingTheData')}</Button>}>
        {t('pages.userManagement.historyCouldNotBeLoaded')}
      </Alert>}
      <TableContainer><Table size="small" aria-label={t('pages.userManagement.accessHistory')}>
        <TableHead><TableRow>
          <TableCell>{t('pages.userManagement.changedAt')}</TableCell>
          <TableCell>{t('pages.userManagement.changedBy')}</TableCell>
          <TableCell>{t('pages.userManagement.before')}</TableCell>
          <TableCell>{t('pages.userManagement.after')}</TableCell>
          <TableCell>{t('pages.userManagement.reasonForChange')}</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {history.isPending && <TableRow><TableCell colSpan={5}>{t('pages.userManagement.loadingHistory')}</TableCell></TableRow>}
          {history.isSuccess && !rows.length && <TableRow><TableCell colSpan={5}>{t('pages.userManagement.noAccessHistory')}</TableCell></TableRow>}
          {!history.isError && rows.map(entry => <TableRow key={entry.id} sx={{ '& td': { verticalAlign: 'top', py: 2 } }}>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{date.format(new Date(entry.occurredAt))}</TableCell>
            <TableCell>{entry.changedBy?.name || t('profile.unknownUser')}</TableCell>
            <TableCell><AccessState state={entry.before} factions={factions} /></TableCell>
            <TableCell><AccessState state={entry.after} factions={factions} /></TableCell>
            <TableCell sx={{ minWidth: 220, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.reason}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table></TableContainer>
      <ServerListPagination page={page} size={size} rowCount={rows.length} more={history.data?.more ?? false}
        loading={history.isFetching} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(0); }} />
    </DialogContent>
    <DialogActions><Button onClick={onClose}>{t('common.close')}</Button></DialogActions>
  </Dialog>;
}
