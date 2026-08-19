// `qrcode` ships no typings and there's no @types package for it, so the one bit of surface
// the printed bill needs is declared here — same approach as react-native-vector-icons.d.ts.
//
// Deliberately the `lib/browser` entry rather than the package root: the root pulls in the
// Node-only file/stream renderers, which webpack would then have to shim. Only the SVG
// renderer is declared, because BrowserPrinter.web.ts inlines the markup instead of loading
// an <img> — nothing has to finish decoding before the print dialog opens that way.
declare module 'qrcode/lib/browser' {
  export function toString(
    text: string,
    options?: {
      type?: 'svg';
      /** Quiet-zone width, in modules. */
      margin?: number;
      width?: number;
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    },
  ): Promise<string>;
}
