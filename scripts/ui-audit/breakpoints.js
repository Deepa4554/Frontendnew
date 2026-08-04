// Defined viewport aspects for the UI audit pass. Kept as plain data (no
// framework import) so both the capture script and any future review tooling
// can share it.
module.exports = [
  { name: 'mobile', width: 390, height: 844 },   // phone (iPhone 12/13-ish)
  { name: 'tablet', width: 820, height: 1180 },  // iPad-ish
  { name: 'laptop', width: 1366, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
];
