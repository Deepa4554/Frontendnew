// Web has no filesystem access — export/PDF features are desktop/mobile-only.
Object.defineProperty(exports, '__esModule', { value: true });
exports.default = {
  DocumentDirectoryPath: '/web-not-supported',
  writeFile: () => Promise.reject(new Error('File export is not available on web.')),
  readFile: () => Promise.reject(new Error('File export is not available on web.')),
};
