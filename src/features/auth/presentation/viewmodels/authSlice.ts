import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { User } from '../../domain/entities/User';
import { AuthRepository } from '../../data/repositories/AuthRepository';
import { getApiErrorMessage } from '../../../../core/network/api';
import { queryClient } from '../../../../core/query';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isRestoring: true,
  error: null,
};

const authRepository = new AuthRepository();

export const loginWithEmail = createAsyncThunk(
  'auth/loginWithEmail',
  async ({ email, password, role }: { email: string; password: string; role?: User['role'] }, { rejectWithValue }) => {
    try {
      const session = await authRepository.loginWithEmail(email, password, role);
      // Any query fetched anonymously before login (e.g. settings/branding on the
      // splash/login screen) is cached under the same flat key regardless of tenant —
      // clear it so every screen refetches fresh, scoped to the account just signed
      // into, instead of showing whichever cafe's data happened to load first.
      queryClient.clear();
      return session.user;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, 'Login failed'));
    }
  },
);

export const registerCafe = createAsyncThunk(
  'auth/registerCafe',
  async (
    { cafeName, email, password, ownerName, phone, otp }: { cafeName: string; email: string; password: string; ownerName: string; phone: string; otp: string },
    { rejectWithValue },
  ) => {
    try {
      const session = await authRepository.registerCafe(cafeName, email, password, ownerName, phone, otp);
      queryClient.clear();
      return session.user;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, 'Could not create cafe'));
    }
  },
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await authRepository.logout();
  // Purge every cached query so the next login (possibly a different account on
  // the same device) never sees this session's leftover data.
  queryClient.clear();
});

// Called once on app boot (SplashScreen) to validate whatever access token is
// sitting in storage from a previous session, so a relaunch/reload doesn't
// force a fresh login as long as the underlying session is still valid.
export const restoreSession = createAsyncThunk('auth/restoreSession', async (_: void, { rejectWithValue }) => {
  const user = await authRepository.restoreSession();
  if (!user) return rejectWithValue('Session expired');
  // Same purge loginWithEmail does, and for the same reason — this is just the other way
  // into an authenticated session. Anything fetched while the app was still anonymous (the
  // settings/branding query ThemeProviderWrapper and RootNavigator both fire at boot, a
  // ~1.2s head start on SplashScreen's restoreSession call) is cached under a flat,
  // tenant-less key. Without this it survives straight into the restored session and keeps
  // rendering until something happens to invalidate it.
  queryClient.clear();
  return user;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // Invoked by the api client's session-expired hook (refresh token
    // failed/absent on a 401) — see registerSessionExpiredHandler wiring.
    forceLogout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
    },
    // Patches just the access-control fields from useLiveAccessSync's poll, in place —
    // a full user replace isn't used here so an in-flight edit elsewhere in the app
    // (rare, but e.g. a profile-photo upload mid-flight) never gets clobbered by a
    // background poll tick. Role rides along too since an Owner can change a staff
    // member's role from the same Staff Profile screen this access lives on.
    syncAccess: (
      state,
      action: PayloadAction<{
        role: User['role'];
        isPlatformAdmin: boolean;
        screenAccessMode: User['screenAccessMode'];
        allowedScreens: User['allowedScreens'];
        tenantScreenMode: User['tenantScreenMode'];
        tenantEnabledScreens: User['tenantEnabledScreens'];
        assignedStationId: User['assignedStationId'];
      }>,
    ) => {
      if (!state.user) return;
      state.user.role = action.payload.role;
      state.user.isPlatformAdmin = action.payload.isPlatformAdmin;
      state.user.screenAccessMode = action.payload.screenAccessMode;
      state.user.allowedScreens = action.payload.allowedScreens;
      state.user.tenantScreenMode = action.payload.tenantScreenMode;
      state.user.tenantEnabledScreens = action.payload.tenantEnabledScreens;
      state.user.assignedStationId = action.payload.assignedStationId;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginWithEmail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithEmail.fulfilled, (state, action: PayloadAction<User>) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
      })
      .addCase(loginWithEmail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(registerCafe.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerCafe.fulfilled, (state, action: PayloadAction<User>) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
      })
      .addCase(registerCafe.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
      })
      .addCase(restoreSession.pending, (state) => {
        state.isRestoring = true;
      })
      .addCase(restoreSession.fulfilled, (state, action: PayloadAction<User>) => {
        state.isRestoring = false;
        state.isAuthenticated = true;
        state.user = action.payload;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.isRestoring = false;
        state.isAuthenticated = false;
        state.user = null;
      });
  },
});

export const { clearError, forceLogout, syncAccess } = authSlice.actions;
export const authReducer = authSlice.reducer;
