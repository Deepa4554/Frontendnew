import React, { useEffect, useState } from 'react';
 
// this RN project (tsconfig has no "dom" lib either — see the window/document casts
// below, same reason), and createPortal is only ever called on web.
const { createPortal } = require('react-dom');

interface Props {
  visible: boolean;
  zIndex: number;
  children: React.ReactNode;
}

// react-native-web's own <Modal> can't be used here — no matter what props are passed to
// it (transparent, pointerEvents, style), its internal ModalAnimation wrapper always
// renders a full-viewport `position: fixed` div with a hardcoded, unconfigurable
// `pointer-events: auto` (see node_modules/react-native-web/dist/exports/Modal/
// ModalAnimation.js — styles.container has no pointerEvents override for the visible/
// animationType="none" case, and that style object is built entirely from internal props
// our own <Modal> never gets to touch). The result: for as long as a Modal-wrapped toast
// or floating pill is mounted, that invisible layer sits on top of the whole app and eats
// every click underneath it — regardless of anything set on the *content* inside it.
//
// This sidesteps the problem by portaling straight to document.body ourselves (the same
// "escape the app's stacking context so it renders above any other on-screen Modal" trick,
// done manually) with a container that's pointer-events: none by default. Children opt
// back in individually via their own style.pointerEvents: 'auto' where something inside
// actually needs to stay tappable (see ToastHost / PendingOrdersHost).
export const NonBlockingOverlay: React.FC<Props> = ({ visible, zIndex, children }) => {
  const [container] = useState(() => (globalThis as any).document.createElement('div'));

  useEffect(() => {
    const doc: any = (globalThis as any).document;
    doc.body.appendChild(container);
    return () => {
      doc.body.removeChild(container);
    };
  }, [container]);

  if (!visible) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex, pointerEvents: 'none' }}>{children}</div>,
    container,
  );
};
