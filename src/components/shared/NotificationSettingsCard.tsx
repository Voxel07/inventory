import { useState } from 'react';
import { Alert, Divider, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import CasinoIcon from '@mui/icons-material/Casino';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconButton } from './ActionButtons';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../utils/naming';
import { queryKeys } from '../../utils/queryKeys';
import { getNotificationSettings, updateNotificationSettings, type NotificationSettings } from '../../services/notificationService';

const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
const WEBHOOK = /^https:\/\/[^\s/?#]+\S*$/i;

function randomTopic() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `inventory-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Personal delivery channels; the ntfy section is hidden while the deployment has no ntfy server configured. */
export function NotificationSettingsCard() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: queryKeys.notificationSettings(user?.id), queryFn: getNotificationSettings, enabled: Boolean(user) });
  if (!data) return null;
  return <NotificationSettingsForm settings={data} userId={user?.id} />;
}

function NotificationSettingsForm({ settings, userId }: { settings: NotificationSettings; userId?: string }) {
  const t = useT();
  const client = useQueryClient();
  const [topic, setTopic] = useState(settings.ntfyTopic ?? '');
  const [webhook, setWebhook] = useState(settings.webhookUrl ?? '');
  const trimmedTopic = topic.trim();
  const trimmedWebhook = webhook.trim();
  const topicInvalid = trimmedTopic !== '' && !TOPIC.test(trimmedTopic);
  const webhookInvalid = trimmedWebhook !== '' && !WEBHOOK.test(trimmedWebhook);
  const unchanged = trimmedTopic === (settings.ntfyTopic ?? '') && trimmedWebhook === (settings.webhookUrl ?? '');
  const save = useMutation({
    mutationFn: () => updateNotificationSettings({ ntfyTopic: trimmedTopic || null, webhookUrl: trimmedWebhook || null }),
    onSuccess: (saved) => client.setQueryData(queryKeys.notificationSettings(userId), saved),
  });
  const server = settings.ntfyServer?.replace(/\/+$/, '');

  return (
    <Paper variant="outlined" sx={{ mt: 3, p: 2.5, width: '100%' }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">{t('profile.notifications.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('profile.notifications.description')}</Typography>
        <Typography variant="subtitle1">{t('profile.webhook.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('profile.webhook.description')}</Typography>
        <TextField fullWidth size="small" type="url" label={t('profile.webhook.url')} value={webhook} error={webhookInvalid} disabled={save.isPending}
          placeholder="https://" helperText={webhookInvalid ? t('profile.webhook.invalid') : t('profile.webhook.urlHelp')}
          slotProps={{ htmlInput: { maxLength: 2048, autoComplete: 'off', spellCheck: false } }}
          onChange={(event) => { setWebhook(event.target.value); save.reset(); }} />
        {server && (
          <>
            <Divider />
            <Typography variant="subtitle1">{t('profile.ntfy.title')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('profile.ntfy.description')}</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <TextField fullWidth size="small" label={t('profile.ntfy.topic')} value={topic} error={topicInvalid} disabled={save.isPending}
                helperText={t('profile.ntfy.topicHelp')} slotProps={{ htmlInput: { maxLength: 64 } }}
                onChange={(event) => { setTopic(event.target.value); save.reset(); }} />
              <IconButton title={t('profile.ntfy.generate')} disabled={save.isPending} onClick={() => { setTopic(randomTopic()); save.reset(); }}>
                <CasinoIcon />
              </IconButton>
            </Stack>
            {settings.ntfyTopic && (
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {t('profile.ntfy.subscribe')}{' '}
                <Link href={`${server}/${settings.ntfyTopic}`} target="_blank" rel="noopener noreferrer">{`${server}/${settings.ntfyTopic}`}</Link>
              </Typography>
            )}
          </>
        )}
        <Button title={t('common.save')} variant="contained" sx={{ alignSelf: 'flex-start' }}
          disabled={topicInvalid || webhookInvalid || save.isPending || unchanged} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
        {save.isSuccess && <Alert severity="success">{t('profile.notifications.saved')}</Alert>}
        {save.error && <Alert severity="error">{save.error.message}</Alert>}
      </Stack>
    </Paper>
  );
}
