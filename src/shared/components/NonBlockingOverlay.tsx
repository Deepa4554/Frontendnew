import React from 'react';
import { Modal } from 'react-native';

interface Props {
  visible: boolean;
  /** Web-only (see NonBlockingOverlay.web.tsx) — native's Modal doesn't need it. */
  zIndex?: number;
  children: React.ReactNode;
}

// Native fallback: RN's own Modal already escapes the app's view tree into its own
// native window layer, which is exactly what's needed here (render above whatever
// screen-level Modal happens to be open) without the click-blocking problem the web
// override works around — see NonBlockingOverlay.web.tsx for why web needs a different
// approach.
export const NonBlockingOverlay: React.FC<Props> = ({ visible, children }) => (
  <Modal transparent visible={visible} animationType="none" onRequestClose={() => {}}>
    {children}
  </Modal>
);
