import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Gives an icon-only TouchableOpacity/View a real, visible-on-hover browser tooltip on web.
 *
 * react-native-web maps accessibilityLabel to aria-label, not to the HTML `title` attribute —
 * aria-label only reaches a screen reader, so an icon-only button (no visible text next to it)
 * has nothing a sighted mouse user can hover to find out what it does. Setting `title` as a
 * prop doesn't work either: it isn't in react-native-web's forwarded-props whitelist, so it's
 * silently dropped rather than reaching the DOM. This sets the attribute imperatively via a ref
 * instead, which sidesteps that filtering entirely.
 *
 * No-op on native — there's no hover there for a tooltip to appear on, and pointer events
 * (needed for a hover-only View) don't exist on a touchscreen. Pass the returned ref through to
 * the component's `ref` prop.
 */
export function useWebTooltip(text: string) {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current;
    if (node && typeof node.setAttribute === 'function') node.setAttribute('title', text);
  }, [text]);
  return ref;
}
