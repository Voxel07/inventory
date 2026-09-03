import { useState } from 'react';
import {
    Alert,
    Box,
    Paper,
    Typography,
    Button,
    Container,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import LoginIcon from '@mui/icons-material/Login';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { LanguageSelector } from '../components/shared/LanguageSelector';
import { useTranslate } from '../utils/naming';

export function LoginPage() {
    const t = useTranslate();
    const { login, error: authError } = useAuth();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [isLoading, setIsLoading] = useState(false);

    async function handleAuthentikLogin() {
        setIsLoading(true);
        try {
            await login();
            showSnackbar(t('Erfolgreich angemeldet', 'Signed in successfully'), 'success');
        } catch (err: unknown) {
            console.error('OAuth2 error:', err);
            showSnackbar(err instanceof Error ? err.message : t('OAuth2-Anmeldung fehlgeschlagen.', 'OAuth2 sign-in failed.'), 'error');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'secondary.main',
                backgroundImage: 'linear-gradient(135deg, rgba(227, 6, 19, 0.12), transparent 36%), repeating-linear-gradient(120deg, rgba(255,255,255,0.025) 0, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 28px)',
                py: 8,
            }}
        >
            <Container maxWidth="xs">
                <Paper
                    sx={{
                        p: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        backgroundColor: 'background.paper',
                        borderTop: '4px solid',
                        borderTopColor: 'primary.main',
                        boxShadow: '0 22px 70px rgba(0, 0, 0, 0.28)',
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: 56,
                            height: 56,
                            borderRadius: 0.5,
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            mb: 2.5,
                        }}
                    >
                        <ShieldIcon sx={{ fontSize: 28 }} />
                    </Box>
                    <Typography component="h1" variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
                        {t('Inventarverwaltung', 'Inventory management')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
                        {t('Melden Sie sich mit Ihrem Organisationskonto an, um Artikel zu verwalten und auszuleihen.', 'Sign in with your organization account to manage and check out items.')}
                    </Typography>

                    {authError && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{authError}</Alert>}

                    <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        startIcon={<LoginIcon />}
                        onClick={handleAuthentikLogin}
                        disabled={isLoading}
                        sx={{
                            py: 1.5,
                            fontWeight: 600,
                        }}
                    >
                        {isLoading ? t('Verbindung wird hergestellt...', 'Connecting...') : t('Mit Authentik anmelden', 'Sign in with Authentik')}
                    </Button>
                    <Box sx={{ mt: 3 }}><LanguageSelector compact /></Box>
                </Paper>
            </Container>
        </Box>
    );
}
