import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * On mobile web, react-native's Modal renders as `position: fixed` covering
 * the full layout viewport — but the on-screen keyboard only shrinks the
 * *visual* viewport (window.visualViewport), not the layout one. A
 * bottom-docked sheet (`justifyContent: 'flex-end'` in modalOverlay) still
 * flexes to the bottom of that full, unshrunk layout viewport, which is now
 * partly hidden under the keyboard — so the sheet's lower half (the field
 * that was just focused) ends up covered instead of pushed up above it.
 *
 * Returns how many px of the bottom of the screen the keyboard currently
 * covers (0 when it's closed). Apply as `paddingBottom` on the *full-height*
 * modalOverlay — NOT as a height/maxHeight cap on the overlay itself. The
 * overlay's own rgba backdrop must always cover the entire screen; capping
 * its height instead leaves the area below it fully transparent (whatever
 * screen is underneath — POS, KDS, etc. — shows through) the moment the
 * keyboard's actual height doesn't exactly match this value, e.g. mid-close.
 * Native ignores this entirely (always 0) — there, RN's own keyboard
 * handling already does the right thing.
 */
export const useKeyboardInsetWeb = (): number => {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height));
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  return inset;
};
