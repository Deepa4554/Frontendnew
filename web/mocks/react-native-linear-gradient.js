// Web fallback for react-native-linear-gradient.
// Renders a plain View using a CSS linear-gradient background instead of the native gradient view.
const React = require('react');
const { View } = require('react-native');

const LinearGradient = React.forwardRef(({ colors, style, children, ...rest }, ref) => {
  const bg = Array.isArray(colors) && colors.length > 0
    ? { backgroundImage: `linear-gradient(180deg, ${colors.join(', ')})` }
    : {};
  return React.createElement(
    View,
    { ref, style: [style, bg], ...rest },
    children,
  );
});

Object.defineProperty(exports, '__esModule', { value: true });
exports.default = LinearGradient;
