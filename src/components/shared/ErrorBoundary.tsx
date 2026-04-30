import { Component, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h5" color="error" gutterBottom>
                        Something went wrong
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        {this.state.error?.message}
                    </Typography>
                    <Button variant="contained" onClick={() => this.setState({ hasError: false, error: null })}>
                        Try Again
                    </Button>
                </Box>
            );
        }
        return this.props.children;
    }
}
