// In-memory MMKV stand-in for jest (node has no MMKV native module and no
// localStorage). react-native-mmkv v4 exposes a createMMKV() factory (not a
// `new MMKV()` class), so we mirror that plus the subset of the instance API
// the app's storage wrapper uses.
const makeInstance = () => {
  const store = new Map();
  return {
    set(key, value) {
      store.set(key, value);
    },
    getString(key) {
      return store.has(key) ? String(store.get(key)) : undefined;
    },
    getBoolean(key) {
      return store.get(key) === true || store.get(key) === 'true';
    },
    getNumber(key) {
      return store.has(key) ? Number(store.get(key)) : 0;
    },
    contains(key) {
      return store.has(key);
    },
    delete(key) {
      store.delete(key);
    },
    remove(key) {
      store.delete(key);
    },
    clearAll() {
      store.clear();
    },
    getAllKeys() {
      return Array.from(store.keys());
    },
  };
};

const createMMKV = () => makeInstance();

// Export both the v4 factory and a class shim, so either import style works.
class MMKV {
  constructor() {
    return makeInstance();
  }
}

module.exports = { createMMKV, MMKV };
