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
  /** Desktop-web sidebar icon-only mode — lives here (not local component state)
   * because DesktopAppShell is re-instantiated fresh per screen (see withDesktopShell),
   * so local state would reset back to expanded on every navigation. */
  sidebarCollapsed: boolean;
}

const initialState: UiState = {
  toast: null,
  sidebarCollapsed: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast: (state, action: PayloadAction<ToastPayload>) => {
      state.toast = { ...action.payload, key: Date.now() };
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
