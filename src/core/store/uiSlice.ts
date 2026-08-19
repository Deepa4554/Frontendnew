import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ToastPayload {
  message: string;
  icon?: string;
  tone?: 'success' | 'info' | 'warning' | 'danger';
  /** Overrides ToastHost's default 1800ms auto-dismiss — for a message someone actually
   * needs time to read out loud (e.g. a token number handed to a customer verbally when
   * there's no printer), not just a quick "saved" confirmation. */
  durationMs?: number;
}

interface ToastState extends ToastPayload {
  key: number;
}

interface UiState {
  toast: ToastState | null;
  /** Monotonic counter behind ToastState.key. ToastHost re-runs its show/auto-dismiss
   * effect when `toast.key` changes, so the key has to differ on every dispatch — the
   * previous `Date.now()` handed out the SAME value to toasts fired within one
   * millisecond, and the effect then never re-ran: that toast stayed on screen with no
   * running dismiss timer. */
  toastSeq: number;
  /** Desktop-web sidebar icon-only mode — lives here (not local component state)
   * because DesktopAppShell is re-instantiated fresh per screen (see withDesktopShell),
   * so local state would reset back to expanded on every navigation. */
  sidebarCollapsed: boolean;
}

const initialState: UiState = {
  toast: null,
  toastSeq: 0,
  sidebarCollapsed: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast: (state, action: PayloadAction<ToastPayload>) => {
      state.toastSeq += 1;
      state.toast = { ...action.payload, key: state.toastSeq };
    },
    hideToast: (state) => {
      state.toast = null;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
  },
});

export const { showToast, hideToast, setSidebarCollapsed } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
