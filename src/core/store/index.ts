import { configureStore } from '@reduxjs/toolkit';
import { Platform } from 'react-native';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  Storage,
} from 'redux-persist';
import { rootReducer } from './rootReducer';
import { storage } from '../storage/mmkv';

// Redux Persist MMKV Storage Engine
export const reduxStorage: Storage = {
  setItem: (key, value) => {
    storage.set(key, value);
    return Promise.resolve(true);
  },
  getItem: (key) => {
    const value = storage.getString(key);
    return Promise.resolve(value);
  },
  removeItem: (key) => {
    storage.remove(key);
    return Promise.resolve();
  },
};

const persistConfig = {
  key: 'root',
  storage: reduxStorage,
  // Mobile: 'auth' persists (name/email/role/tenantId + isAuthenticated) so a
  // relaunch survives without a fresh login — MMKV is sandboxed native storage,
  // not reachable by a malicious webpage, so there's no XSS threat model to
  // guard against there.
  // Web: 'auth' is deliberately left OUT. reduxStorage backs onto plain
  // localStorage on web (see web/mocks/react-native-mmkv.js) — persisting it
  // there would sit that same PII in DevTools > Application > Local Storage in
  // plaintext, and worse, would rehydrate isAuthenticated:true instantly on
  // every reload, which skipped SplashScreen's restoreSession() check
  // entirely (RootNavigator only branches on isAuthenticated) and let the
  // authenticated app shell render on a stale/possibly-revoked session before
  // any real check ran. Not persisting it means isAuthenticated always starts
  // false on web boot, so SplashScreen -> restoreSession() always runs first,
  // and nothing protected renders until that's actually confirmed.
  // branch: a POS device is usually dedicated to one physical location, so the
  // active-branch selection persists on both platforms — it's not sensitive.
  whitelist: Platform.OS === 'web' ? ['branch'] : ['auth', 'branch'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type AppDispatch = typeof store.dispatch;
