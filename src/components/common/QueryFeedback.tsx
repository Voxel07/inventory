import type { ReactNode } from 'react';
import { Alert, LinearProgress } from '@mui/material';

interface QueryFeedbackProps {
  isLoading?: boolean;
  error?: { message: string } | null;
  isEmpty?: boolean;
  emptyMessage?: ReactNode;
}

/** Shared feedback for query-backed lists; errors take precedence over empty results. */
export function QueryFeedback({ isLoading, error, isEmpty, emptyMessage }: QueryFeedbackProps) {
  return <>
    {isLoading && <LinearProgress />}
    {error && <Alert severity="error">{error.message}</Alert>}
    {!isLoading && !error && isEmpty && emptyMessage && <Alert severity="info">{emptyMessage}</Alert>}
  </>;
}
