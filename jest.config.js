module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // RN ecosystem packages ship untranspiled ESM/Flow — let babel transform them
  // instead of choking on `import` in node_modules (the preset's default only
  // whitelists react-native itself).
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native|@react-navigation|react-native-.*|@shopify/flash-list)/',
  ],
  moduleNameMapper: {
    // MMKV has no node build; the app already ships a localStorage-backed web
    // shim, but tests run under node — so point it at a dedicated jest mock.
    'react-native-mmkv': '<rootDir>/jest/mocks/react-native-mmkv.js',
  },
};
