import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV();

export const setItem = (key: string, value: string | boolean | number) => {
  storage.set(key, value);
};

export const getItem = (key: string) => {
  return storage.getString(key);
};

export const getBoolean = (key: string) => {
  return storage.getBoolean(key);
};

export const getNumber = (key: string) => {
  return storage.getNumber(key);
};

export const removeItem = (key: string) => {
  storage.remove(key);
};

export const clearAll = () => {
  storage.clearAll();
};
