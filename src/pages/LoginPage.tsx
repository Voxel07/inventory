import { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    Container,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import LoginIcon from '@mui/icons-material/Login';
import { usePocketBase } from '../hooks/usePocketBase';
import { useUIStore } from '../store/uiStore';

export function LoginPage() {
    const { pb } = usePocketBase();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [isLoading, setIsLoading] = useState(false);

    async function handleAuthentikLogin() {
        setIsLoading(true);
        try {
            // pocketbase JS SDK authWithOAuth2 triggers the Authentik provider login via popup
            await pb.collection('users').authWithOAuth2({ provider: 'oidc' });
            showSnackbar('Logged in successfully', 'success');
        } catch (err: any) {
            console.error('OAuth2 error:', err);
            showSnackbar(err.message || 'OAuth2 login failed.', 'error');
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
                backgroundColor: 'background.default',
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
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: 56,
                            height: 56,
                            borderRadius: '50%',
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            mb: 2.5,
                        }}
                    >
                        <ShieldIcon sx={{ fontSize: 28 }} />
                    </Box>
                    <Typography component="h1" variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
                        Inventory Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
                        Sign in using your organization account to manage and check out items.
                    </Typography>

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
                        {isLoading ? 'Connecting...' : 'Sign in with Authentik'}
                    </Button>
                </Paper>
            </Container>
        </Box>
    );
}
