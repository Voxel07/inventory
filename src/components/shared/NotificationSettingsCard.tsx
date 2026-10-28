import { useRef, useState } from 'react';
import { Divider, Link, Paper, Stack, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from './ActionButtons';
import { AlertsManager, type AlertsManagerHandle } from './AlertsManager';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../utils/naming';
import { queryKeys } from '../../utils/queryKeys';
import { getNotificationSettings, sendNtfyTest, updateNotificationSettings, type NotificationSettings } from '../../services/notificationService';

const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
const WEBHOOK = /^https:\/\/[^\s/?#]+\S*$/i;

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
  const alerts = useRef<AlertsManagerHandle>(null);
  const [topic, setTopic] = useState(settings.ntfyTopic ?? '');
  const [webhook, setWebhook] = useState(settings.webhookUrl ?? '');
  const trimmedTopic = topic.trim();
  const trimmedWebhook = webhook.trim();
  const topicInvalid = trimmedTopic !== '' && !TOPIC.test(trimmedTopic);
  const webhookInvalid = trimmedWebhook !== '' && !WEBHOOK.test(trimmedWebhook);
  const unchanged = trimmedTopic === (settings.ntfyTopic ?? '') && trimmedWebhook === (settings.webhookUrl ?? '');
  const save = useMutation({
    mutationFn: () => updateNotificationSettings({ ntfyTopic: trimmedTopic || null, webhookUrl: trimmedWebhook || null }),
    onSuccess: (saved) => {
      client.setQueryData(queryKeys.notificationSettings(userId), saved);
      alerts.current?.showAlert('success', t('profile.notifications.saved'));
    },
    onError: (error) => alerts.current?.showAlert('error', error.message),
  });
  const test = useMutation({
    mutationFn: sendNtfyTest,
    onSuccess: () => alerts.current?.showAlert('success', t('profile.ntfy.testSent')),
    onError: (error) => alerts.current?.showAlert('error', error.message),
  });
  const server = settings.ntfyServer?.replace(/\/+$/, '');

  return (
    <Paper variant="outlined" sx={{ mt: 3, p: 2.5, width: '100%' }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">{t('profile.notifications.title')}</Typography>
        <Typography variant="subtitle1">{t('profile.webhook.title')}</Typography>
        <TextField fullWidth size="small" type="url" label={t('profile.webhook.url')} value={webhook} error={webhookInvalid} disabled={save.isPending}
          placeholder="https://" helperText={webhookInvalid ? t('profile.webhook.invalid') : t('profile.webhook.urlHelp')}
          slotProps={{ htmlInput: { maxLength: 2048, autoComplete: 'off', spellCheck: false } }}
          onChange={(event) => { setWebhook(event.target.value); save.reset(); }} />
        {server && (
          <>
            <Divider />
            <Typography variant="subtitle1">{t('profile.ntfy.title')}</Typography>
            <TextField fullWidth size="small" label={t('profile.ntfy.topic')} value={topic} error={topicInvalid} disabled={save.isPending}
              helperText={t('profile.ntfy.topicHelp')} slotProps={{ htmlInput: { maxLength: 64 } }}
              onChange={(event) => { setTopic(event.target.value); save.reset(); test.reset(); }} />
            {settings.ntfyTopic && (
              <>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {t('profile.ntfy.subscribe')}{' '}
                  <Link href={`${server}/${settings.ntfyTopic}`} target="_blank" rel="noopener noreferrer">{`${server}/${settings.ntfyTopic}`}</Link>
                </Typography>
                {/* Tests the saved topic, so it is only offered while the field still shows it. */}
                <Button title={t('profile.ntfy.test')} variant="outlined" startIcon={<SendIcon />} sx={{ alignSelf: 'flex-start' }}
                  disabled={test.isPending || save.isPending || trimmedTopic !== settings.ntfyTopic} onClick={() => test.mutate()}>
                  {t('profile.ntfy.test')}
                </Button>
              </>
            )}
          </>
        )}
        <Button title={t('common.save')} variant="contained" sx={{ alignSelf: 'flex-start' }}
          disabled={topicInvalid || webhookInvalid || save.isPending || unchanged} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
        <AlertsManager ref={alerts} />
      </Stack>
    </Paper>
  );
}
