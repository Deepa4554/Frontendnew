import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { store, persistor } from '../core/store';
import { queryClient } from '../core/query';
import { registerSessionExpiredHandler, registerConflictHandler, registerPlanExpiredHandler } from '../core/network/api';
import { forceLogout } from '../features/auth/presentation/viewmodels/authSlice';
import { ThemeProviderWrapper } from '../core/theme/ThemeProvider';
import { RootNavigator } from './navigation/RootNavigator';
import { ToastHost } from '../shared/components/ToastHost';
import { ConfirmDialogHost } from '../shared/components/ConfirmDialogHost';
import { SubscriptionExpiredOverlay, showSubscriptionExpired } from '../shared/components/SubscriptionExpiredOverlay';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';

// Wired once, outside the component tree, to avoid store.dispatch being
// captured stale across re-renders — this fires whenever a refresh-token
// attempt fails (see core/network/api.ts response interceptor).
registerSessionExpiredHandler(() => store.dispatch(forceLogout()));

// A 409 on an order write means another device won the race (see registerConflictHandler).
// Pull the truth back down straight away so the screen that just failed is showing what
// actually happened rather than the state it acted on — otherwise a waiter whose Settle was
// rejected keeps looking at a table the app still draws as unpaid.
registerConflictHandler((url) => {
  if (!url.includes('/orders')) return;
  queryClient.invalidateQueries({ queryKey: ['orders'] });
  queryClient.invalidateQueries({ queryKey: ['tables'] });
});

// Fires on the first 402 any screen's query hits (see SubscriptionExpiryMiddleware on
// the backend) — shows one blocking overlay app-wide instead of every open screen
// independently surfacing its own "plan expired" error.
registerPlanExpiredHandler(() => showSubscriptionExpired());

export const App = () => {
  useEffect(() => {
    // Clears any query cache left over from a previous session's role/user —
    // otherwise switching accounts could briefly show stale cached data. Only
    // fires on the authenticated -> logged-out transition, not on every
    // action while already logged out (would otherwise thrash the cache that
    // backs the pre-login theme/settings query).
    let wasAuthenticated = store.getState().auth.isAuthenticated;
    const unsubscribe = store.subscribe(() => {
      const isAuthenticated = store.getState().auth.isAuthenticated;
      if (wasAuthenticated && !isAuthenticated) {
        queryClient.clear();
      }
      wasAuthenticated = isAuthenticated;
    });
    return unsubscribe;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <QueryClientProvider client={queryClient}>
              <ThemeProviderWrapper>
                <ErrorBoundary>
                  <RootNavigator />
                </ErrorBoundary>
                <ToastHost />
                <ConfirmDialogHost />
                <SubscriptionExpiredOverlay />
              </ThemeProviderWrapper>
            </QueryClientProvider>
          </PersistGate>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
