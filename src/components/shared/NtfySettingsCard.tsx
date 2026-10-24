import { useState } from 'react';
import { Alert, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import CasinoIcon from '@mui/icons-material/Casino';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconButton } from './ActionButtons';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../utils/naming';
import { queryKeys } from '../../utils/queryKeys';
import { getNtfySettings, updateNtfySettings, type NtfySettings } from '../../services/notificationService';

const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;

function randomTopic() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `inventory-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Personal ntfy topic; hidden while the deployment has no ntfy server configured. */
export function NtfySettingsCard() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: queryKeys.ntfySettings(user?.id), queryFn: getNtfySettings, enabled: Boolean(user) });
  if (!data?.server) return null;
  return <NtfySettingsForm key={data.topic ?? ''} settings={data} userId={user?.id} />;
}

function NtfySettingsForm({ settings, userId }: { settings: NtfySettings; userId?: string }) {
  const t = useT();
  const client = useQueryClient();
  const [topic, setTopic] = useState(settings.topic ?? '');
  const trimmed = topic.trim();
  const invalid = trimmed !== '' && !TOPIC.test(trimmed);
  const save = useMutation({
    mutationFn: () => updateNtfySettings(trimmed || null),
    onSuccess: (saved) => client.setQueryData(queryKeys.ntfySettings(userId), saved),
  });
  const server = settings.server!.replace(/\/+$/, '');

  return (
    <Paper variant="outlined" sx={{ mt: 3, p: 2.5, width: '100%' }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">{t('profile.ntfy.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('profile.ntfy.description')}</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField fullWidth size="small" label={t('profile.ntfy.topic')} value={topic} error={invalid} disabled={save.isPending}
            helperText={t('profile.ntfy.topicHelp')} slotProps={{ htmlInput: { maxLength: 64 } }}
            onChange={(event) => { setTopic(event.target.value); save.reset(); }} />
          <IconButton title={t('profile.ntfy.generate')} disabled={save.isPending} onClick={() => { setTopic(randomTopic()); save.reset(); }}>
            <CasinoIcon />
          </IconButton>
        </Stack>
        {settings.topic && (
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {t('profile.ntfy.subscribe')}{' '}
            <Link href={`${server}/${settings.topic}`} target="_blank" rel="noopener noreferrer">{`${server}/${settings.topic}`}</Link>
          </Typography>
        )}
        <Button title={t('common.save')} variant="contained" sx={{ alignSelf: 'flex-start' }}
          disabled={invalid || save.isPending || trimmed === (settings.topic ?? '')} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
        {save.isSuccess && <Alert severity="success">{t('profile.ntfy.saved')}</Alert>}
        {save.error && <Alert severity="error">{save.error.message}</Alert>}
      </Stack>
    </Paper>
  );
}
