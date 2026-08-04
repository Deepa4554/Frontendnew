import React from 'react';
import { useResponsive } from '../../../core/utils/useResponsive';
import { DesktopAppShell } from './DesktopAppShell';

/**
 * Wraps a screen so it automatically gets the "Warm Precision" desktop-web sidebar
 * shell — applied once here at the navigator layer instead of importing/rendering
 * DesktopAppShell in all ~25 individual screen files. Native app and mobile-width
 * browser render `Component` completely untouched (isDesktopWeb is false there).
 */
export const withDesktopShell = (Component: React.ComponentType<any>, routeKey: string) => {
  const Wrapped = (props: any) => {
    const { isDesktopWeb } = useResponsive();
    if (!isDesktopWeb) return <Component {...props} />;
    return (
      <DesktopAppShell navigation={props.navigation} activeRoute={routeKey}>
        <Component {...props} />
      </DesktopAppShell>
    );
  };
  Wrapped.displayName = `withDesktopShell(${routeKey})`;
  return Wrapped;
};
