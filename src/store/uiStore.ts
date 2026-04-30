import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  snackbar: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' };
  showSnackbar: (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
  hideSnackbar: () => void;

  transactionFilters: {
    itemId: string;
    userId: string;
    transactionType: string;
    startDate: string;
    endDate: string;
  };
  setTransactionFilters: (filters: Partial<UIState['transactionFilters']>) => void;
  resetTransactionFilters: () => void;
}

const defaultFilters = {
  itemId: '',
  userId: '',
  transactionType: '',
  startDate: '',
  endDate: '',
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  snackbar: { open: false, message: '', severity: 'info' },
  showSnackbar: (message, severity = 'info') =>
    set({ snackbar: { open: true, message, severity } }),
  hideSnackbar: () =>
    set((s) => ({ snackbar: { ...s.snackbar, open: false } })),

  transactionFilters: defaultFilters,
  setTransactionFilters: (filters) =>
    set((s) => ({ transactionFilters: { ...s.transactionFilters, ...filters } })),
  resetTransactionFilters: () => set({ transactionFilters: defaultFilters }),
}));
