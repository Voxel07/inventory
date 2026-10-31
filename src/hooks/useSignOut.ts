import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useUIStore } from '../store/uiStore';
import { AuthPersistenceError } from '../services/authManager';
import { useT } from '../utils/naming';

/** Signs out, returning to the start page unless the identity provider takes over. */
export function useSignOut() {
    const t = useT();
    const navigate = useNavigate();
    const { logout } = useAuth();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    return () => {
        void logout()
            .then((redirectingToProvider) => {
                if (!redirectingToProvider) navigate('/');
            })
            .catch((error: unknown) => {
                navigate('/');
                showSnackbar(t(error instanceof AuthPersistenceError ? 'nav.signOutPersistFailed' : 'nav.signOutProviderFailed'), 'error');
            });
    };
}
