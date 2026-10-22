import { Button } from '../components/shared/ActionButtons';
import { useState } from 'react';
import {
    Alert,
    Box,
    Paper,
    Typography,
    Container,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import LoginIcon from '@mui/icons-material/Login';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/uiStore';
import { LanguageSelector } from '../components/shared/LanguageSelector';
import { translate, useT } from '../utils/naming';
import { AUTH_CONFIGURATION_ERROR } from '../config/runtimeConfig';
import { InstallAppCard } from '../components/shared/InstallAppCard';

export function LoginPage() {
    const t = useT();
    const { login, error: authError } = useAuth();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [isLoading, setIsLoading] = useState(false);

    async function handleAuthentikLogin() {
        setIsLoading(true);
        try {
            await login();
            showSnackbar(t('pages.loginPage.signedInSuccessfully'), 'success');
        } catch (err: unknown) {
            console.error('OAuth2 error:', err);
            showSnackbar(err instanceof Error ? err.message : t('pages.loginPage.oAuth2SignInFailed'), 'error');
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
                        borderRadius: 3,
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
                    <Typography component="h1" variant="h5" sx={{ mb: 1 }}>
                        {t('pages.loginPage.inventoryManagement')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
                        {t('pages.loginPage.signInWithYourOrganizationAccountToManageAndCheck')}
                    </Typography>

                    {AUTH_CONFIGURATION_ERROR && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{AUTH_CONFIGURATION_ERROR}</Alert>}
                    {authError && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{authError}</Alert>}

                    <Button title={translate('pages.loginPage.signInThroughAuthentik')}
                        variant="contained"
                        fullWidth
                        size="large"
                        startIcon={<LoginIcon />}
                        onClick={handleAuthentikLogin}
                        disabled={isLoading || Boolean(AUTH_CONFIGURATION_ERROR)}
                        sx={{
                            py: 1.5,
                            fontWeight: 600,
                        }}
                    >
                        {isLoading ? t('pages.loginPage.connecting') : t('pages.loginPage.signInWithAuthentik')}
                    </Button>
                    <Box sx={{ mt: 3 }}><LanguageSelector compact /></Box>
                </Paper>
                <InstallAppCard />
            </Container>
        </Box>
    );
}
