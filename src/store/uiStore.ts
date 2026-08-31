import { create } from 'zustand';
import { EVENT_TYPES, type EventType } from '../types';

const ACTIVE_EVENT_STORAGE_KEY = 'inventory-active-event';

function storedActiveEvent(): EventType {
  try {
    const value = localStorage.getItem(ACTIVE_EVENT_STORAGE_KEY);
    if (EVENT_TYPES.includes(value as EventType)) return value as EventType;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return 'DE';
}

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  activeEventType: EventType;
  setActiveEventType: (eventType: EventType) => void;

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

  activeEventType: storedActiveEvent(),
  setActiveEventType: (eventType) => {
    try {
      localStorage.setItem(ACTIVE_EVENT_STORAGE_KEY, eventType);
    } catch {
      // Keep the in-memory selection even when persistence is unavailable.
    }
    set({ activeEventType: eventType });
  },

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
