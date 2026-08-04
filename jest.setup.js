/* eslint-env jest */
// @testing-library/react-native v12.4+ (we're on v14) auto-registers its jest
// matchers — toBeOnTheScreen(), toHaveTextContent(), etc. — on first import of
// the library, so no separate extend-expect import is needed here.

// react-native-safe-area-context ships a jest mock with sane default insets.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default ??
  require('react-native-safe-area-context/jest/mock'),
);

// Reanimated's official jest mock (no-op animations, synchronous values).
jest.mock('react-native-reanimated', () => {
  try {
    return require('react-native-reanimated/mock');
  } catch {
    return {};
  }
});

// Vector icons render as a plain host component in tests — we don't assert on glyphs.
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

// Native-only view wrappers with no jest binding — render as plain host components.
jest.mock('react-native-linear-gradient', () => 'LinearGradient');

// Firebase messaging is native-only; the app already guards every call site with
// Platform.OS checks, so an empty module is enough under jest.
jest.mock('@react-native-firebase/messaging', () => () => ({
  requestPermission: jest.fn(),
  getToken: jest.fn(() => Promise.resolve('test-token')),
  onMessage: jest.fn(() => jest.fn()),
}));

// Silence the noisy "not wrapped in act(...)" style warnings that the RN preset's
// animation timers can emit during async settling — keep real errors visible.
jest.spyOn(console, 'warn').mockImplementation((msg, ...rest) => {
  if (typeof msg === 'string' && /useNativeDriver|not wrapped in act/.test(msg)) return;
   
  console.error(msg, ...rest);
});
