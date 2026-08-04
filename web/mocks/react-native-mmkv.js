// Web fallback for react-native-mmkv (native Nitro module, no browser binding).
// Backs the same API (set/getString/getBoolean/getNumber/remove/contains/getAllKeys/
// clearAll) with localStorage.
//
// The method names here have to track react-native-mmkv's own MMKV interface exactly
// — nothing type-checks this file against it, so a rename upstream shows up only as a
// "storage.x is not a function" at runtime, on web, in whichever feature happened to
// call it. v4 renamed delete() to remove(); that one broke sign-out, because
// clearAccessToken() -> removeItem() -> storage.remove() threw before the tokens were
// cleared. See node_modules/react-native-mmkv/lib/specs/MMKV.nitro.d.ts for the
// current surface.
function createMMKV() {
  return {
    set(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (e) {}
    },
    getString(key) {
      const v = window.localStorage.getItem(key);
      return v === null ? undefined : v;
    },
    getBoolean(key) {
      const v = window.localStorage.getItem(key);
      return v === null ? undefined : v === 'true';
    },
    getNumber(key) {
      const v = window.localStorage.getItem(key);
      return v === null ? undefined : Number(v);
    },
    contains(key) {
      return window.localStorage.getItem(key) !== null;
    },
    getAllKeys() {
      try {
        return Object.keys(window.localStorage);
      } catch (e) {
        return [];
      }
    },
    // Returns whether the key is gone, matching the native signature.
    remove(key) {
      try {
        window.localStorage.removeItem(key);
        return window.localStorage.getItem(key) === null;
      } catch (e) {
        return false;
      }
    },
    clearAll() {
      try {
        window.localStorage.clear();
      } catch (e) {}
    },
  };
}

module.exports = { createMMKV };
