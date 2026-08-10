import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

// Both imports go through require() rather than ESM `import`: this file is the `.web.tsx`
// half of a Tooltip.tsx/Tooltip.web.tsx pair, and under the RN tsconfig's bundler module
// resolution a plain relative `import` from the `.web.tsx` sibling fails to resolve (the
// same reason NonBlockingOverlay.web.tsx require()s react-dom). require() is untyped, so
// the prop types are re-declared inline below to keep this file type-safe on its own.
const { DesktopColors: COLORS } = require('../../design/desktopWebTheme');
const { createPortal } = require('react-dom');

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  label?: string;
  children: React.ReactNode;
  placement?: TooltipPlacement;
  style?: any;
}

interface Coords {
  top: number;
  left: number;
  transform: string;
}

// Anchor the bubble to the hovered control's viewport rect. Rendered position:fixed in a
// body portal (below), so no ancestor's overflow:hidden / ScrollView / segmented-button
// clip can eat it — which the collapsed sidebar and the bill's segmented buttons all do.
const coordsFor = (placement: TooltipPlacement, r: any): Coords => {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  switch (placement) {
    case 'top':
      return { top: r.top - 6, left: cx, transform: 'translate(-50%, -100%)' };
    case 'left':
      return { top: cy, left: r.left - 8, transform: 'translate(-100%, -50%)' };
    case 'right':
      return { top: cy, left: r.right + 8, transform: 'translate(0, -50%)' };
    case 'bottom':
    default:
      return { top: r.bottom + 6, left: cx, transform: 'translate(-50%, 0)' };
  }
};

/**
 * Branded hover tooltip for icon-only controls on desktop/tablet web. Wraps the control
 * and, while the pointer is over it, shows the action's name in a dark rounded bubble.
 *
 * Hover is detected with native pointerenter/pointerleave listeners attached straight to the
 * wrapper's DOM node (react-native-web forwards a View's ref to its host <div>), NOT via an
 * onMouseEnter prop — react-native-web doesn't reliably fire mouse props on a plain View
 * (its own hover affordances go through Pressable's onHoverIn). The bubble is portalled to
 * <body> with position:fixed and coordinates read from the control's rect, so it renders
 * above everything and is never clipped.
 */
export const Tooltip: React.FC<TooltipProps> = ({ label, children, placement = 'bottom', style }) => {
  const ref = useRef<any>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!label || !node || typeof node.addEventListener !== 'function') return;
    const enter = (e: any) => {
      // Ignore touch/pen — a tap on a touchscreen shouldn't flash a tooltip.
      if (e && e.pointerType && e.pointerType !== 'mouse') return;
      setCoords(coordsFor(placement, node.getBoundingClientRect()));
    };
    const leave = () => setCoords(null);
    node.addEventListener('pointerenter', enter);
    node.addEventListener('pointerleave', leave);
    // A control that unmounts mid-hover (e.g. its row re-renders) never fires pointerleave.
    node.addEventListener('pointerdown', leave);
    return () => {
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('pointerdown', leave);
    };
  }, [placement, label]);

  if (!label) return <>{children}</>;

  const doc: any = (globalThis as any).document;

  return (
    <View ref={ref as never} style={style}>
      {children}
      {coords && doc &&
        createPortal(
          <div style={{ ...bubbleStyle, top: coords.top, left: coords.left, transform: coords.transform }}>
            {label}
          </div>,
          doc.body,
        )}
    </View>
  );
};

const bubbleStyle = {
  position: 'fixed' as const,
  zIndex: 100000,
  pointerEvents: 'none' as const,
  backgroundColor: COLORS.button,
  color: '#FFFFFF',
  fontFamily: COLORS.fontFamily,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.3,
  padding: '4px 8px',
  borderRadius: 6,
  whiteSpace: 'nowrap' as const,
  maxWidth: 260,
  boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
};
