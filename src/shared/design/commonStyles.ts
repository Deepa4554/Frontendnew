import type { TextStyle } from 'react-native';

/**
 * Standard border width for every text input box in the app. Screens had
 * drifted between 1 / 1.5 / 2 over time — 1 is the deliberate "thin" outline
 * design calls for; import this instead of hardcoding a literal so it stays
 * uniform going forward.
 */
export const INPUT_BORDER_WIDTH = 1;

/**
 * Every popup/modal that covers half the screen (Guest Details, Apply
 * Discount, Fire to Kitchen, Select a Table, etc.) titles itself with the
 * screen's local `modalTitle`-style token, but those tokens had drifted to
 * different font sizes per screen with no consistent spacing above them.
 * Spread this onto the heading `<Text>` alongside the screen's own title
 * style: `style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}`.
 * Keeps that screen's base title size as-is and adds a uniform 12px of top
 * spacing — the same number everywhere instead of each screen inventing its own.
 */
export const modalHeadingOverride = (baseFontSize: number): TextStyle => ({
  fontSize: baseFontSize,
  marginTop: 12,
});

/**
 * Target corner radii for the "sharper, more professional" pass — screens had
 * drifted to increasingly rounded buttons (12-18px)/cards (14-24px)/modals
 * (20-28px) over time with no shared reference point. These are the numbers
 * to converge new and updated styles on; not auto-applied everywhere (pills
 * at 999 and circular avatars/icon badges at width/2 are a different shape
 * category entirely and must stay untouched).
 */
export const RADIUS = {
  button: 6,
  card: 8,
  modal: 12,
} as const;
