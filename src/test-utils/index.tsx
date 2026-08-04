import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { rootReducer, RootState } from '../core/store/rootReducer';

/**
 * A fresh, non-persisted store built from the real rootReducer. Unlike the app's
 * production store it skips redux-persist/MMKV entirely, so each test starts from
 * a clean, fully-controllable slice tree (optionally seeded via preloadedState).
 */
export const makeTestStore = (preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState as RootState | undefined,
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

/** Query client tuned for tests: no retries (fail fast) and no cache carry-over. */
export const makeTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

/** A jest-spied stand-in for the React Navigation `navigation` prop screens receive. */
export const createMockNavigation = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  pop: jest.fn(),
  popToTop: jest.fn(),
  reset: jest.fn(),
  setParams: jest.fn(),
  setOptions: jest.fn(),
  dispatch: jest.fn(),
  canGoBack: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
  isFocused: jest.fn(() => true),
});

/** A minimal `route` prop with the given params. */
export const createMockRoute = <P extends object>(params: P = {} as P, name = 'TestScreen') => ({
  key: `${name}-test`,
  name,
  params,
});

interface Options extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>;
  store?: ReturnType<typeof makeTestStore>;
  queryClient?: QueryClient;
}

/**
 * Renders `ui` wrapped in every provider a screen/component expects at runtime:
 * Redux, React Query, SafeArea, and the Paper theme. Returns the created store
 * and queryClient alongside the usual RTL query helpers.
 *
 * NOTE: `render` is async in @testing-library/react-native v14 (React 19
 * concurrent rendering), so this helper is async too — always `await` it.
 */
export async function renderWithProviders(ui: React.ReactElement, options: Options = {}) {
  const { preloadedState, store, queryClient, ...renderOptions } = options;
  const testStore = store ?? makeTestStore(preloadedState);
  const client = queryClient ?? makeTestQueryClient();

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider store={testStore}>
      <QueryClientProvider client={client}>
        <SafeAreaProvider>
          <PaperProvider>{children}</PaperProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </Provider>
  );

  const result = await render(ui, { wrapper: Wrapper, ...renderOptions });
  return { store: testStore, queryClient: client, ...result };
}

// Re-export everything from RTL so tests import from one place.
export * from '@testing-library/react-native';
