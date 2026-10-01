import { createContext, useContext } from 'react';

export const ActionInboxDialogContext = createContext<{
  openActionInbox: () => void;
  closeActionInbox: () => void;
} | null>(null);

export function useActionInboxDialog() {
  const context = useContext(ActionInboxDialogContext);
  if (!context) throw new Error('Actions & reminders require ActionInboxDialogProvider');
  return context;
}
