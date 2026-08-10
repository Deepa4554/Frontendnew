import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The action name shown on hover. When empty/undefined, no tooltip is rendered. */
  label?: string;
  children: React.ReactNode;
  /** Which side of the wrapped control the bubble appears on. Default 'bottom'. */
  placement?: TooltipPlacement;
  /** Style for the wrapping element — pass this when the button was a flex item. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Hover tooltip for icon-only controls. Native has no hover, so this is a pass-through
 * here; the real branded bubble lives in Tooltip.web.tsx. When a caller moves the
 * control's own layout style onto the tooltip (e.g. an absolutely-positioned button),
 * we still render the wrapping View so that positioning survives on native too.
 */
export const Tooltip: React.FC<TooltipProps> = ({ children, style }) =>
  style ? <View style={style}>{children}</View> : <>{children}</>;
