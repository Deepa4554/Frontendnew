import { useEffect, useState } from 'react';
import { Platform, Dimensions } from 'react-native';

/**
 * Width thresholds shared by every screen that adapts its layout — a phone
 * (native or a narrow mobile browser) stays under `tablet`, an iPad/small
 * browser window lands in `tablet`, and a laptop/desktop browser is
 * `desktop`. Same numbers on native and web so an iPad in landscape gets the
 * same wide-layout treatment as a similarly-sized browser window.
 */
export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
} as const;

export type ScreenSize = 'mobile' | 'tablet' | 'desktop';

export interface Responsive {
  width: number;
  height: number;
  screenSize: ScreenSize;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Wide enough for a sidebar nav / multi-column grid / persistent side panel instead of the mobile stack-and-tabs layout. */
  isWideLayout: boolean;
  /**
   * True only for a tablet/desktop-width **browser** tab — never for the native app,
   * even on a tablet at the same width. The "Warm Precision" desktop redesign is a
   * web-only visual layer (new sidebar shell, new color tokens, new typography); the
   * native APK keeps its existing look at every size, and so does a narrow mobile
   * browser. Anything gating the new desktop-web look must check this, not
   * `isWideLayout` (which native tablets also satisfy).
   */
  isDesktopWeb: boolean;
}

const computeScreenSize = (width: number): ScreenSize =>
  width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'mobile';

export const useResponsive = (): Responsive => {
  // Deliberately NOT useWindowDimensions() — on mobile web, react-native-web's
  // Dimensions module tracks window.visualViewport, which fires a 'resize' on
  // every on-screen keyboard open/close (not just real width/orientation
  // changes). useWindowDimensions() re-renders on every one of those, and
  // every one of this hook's ~17 call sites only branches on the derived
  // screenSize bucket — never on raw width/height. That re-render cascade,
  // firing the instant a TextInput gets focus and the keyboard starts
  // opening, was tearing down and rebuilding enough of the tree that the
  // just-focused input lost focus before a single keystroke landed. Only
  // re-rendering when the bucket actually changes (real resize/orientation
  // change, not a keyboard toggle) fixes that without changing behavior for
  // any consumer, since none of them read live width/height.
  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims((prev) => (computeScreenSize(prev.width) === computeScreenSize(window.width) ? prev : window));
    });
    return () => sub.remove();
  }, []);

  const screenSize = computeScreenSize(dims.width);
  const isWideLayout = screenSize !== 'mobile';

  return {
    width: dims.width,
    height: dims.height,
    screenSize,
    isMobile: screenSize === 'mobile',
    isTablet: screenSize === 'tablet',
    isDesktop: screenSize === 'desktop',
    isWideLayout,
    isDesktopWeb: Platform.OS === 'web' && isWideLayout,
  };
};
