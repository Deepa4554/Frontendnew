// Web fallback for react-native-share.
Object.defineProperty(exports, '__esModule', { value: true });
exports.default = {
  open: () => {
    window.alert('Sharing is not available in the web preview.');
    return Promise.resolve();
  },
};
