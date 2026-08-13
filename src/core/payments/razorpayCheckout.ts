/**
 * Native (Metro) build of Razorpay checkout — there isn't one.
 *
 * Razorpay Standard Checkout is checkout.js in a browser: it needs a DOM to mount its modal
 * into and a window to hand the result back to, neither of which exists in a React Native
 * runtime. Bringing it to the Android/iOS builds means the separate react-native-razorpay
 * native module (its own SDK, its own Play Store/App Store billing questions), so this file
 * says "not here" and SubscriptionScreen falls back to the message it has always shown on
 * every platform: contact your PrabandhOS provider.
 *
 * Webpack prefers razorpayCheckout.web.ts for the web bundle (see webpack.config.js's
 * resolve.extensions) — that one is the real implementation. Both files must keep exporting
 * the same shapes.
 */

export interface RazorpayCheckoutOptions {
  keyId: string;
  orderId: string;
  /** Paise, straight from the created order — never re-derived on this side. */
  amount: number;
  currency: string;
  description: string;
  prefillName?: string;
  prefillEmail?: string;
  prefillContact?: string;
  themeColor?: string;
}

export interface RazorpayPaymentResult {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * `dismissed` is a first-class outcome, not an error — the owner closing the modal is the
 * most common way this ends, and it should never surface as "payment failed".
 */
export type RazorpayCheckoutOutcome =
  | { status: 'paid'; payment: RazorpayPaymentResult }
  | { status: 'dismissed' }
  | { status: 'failed'; message: string };

export const isRazorpayCheckoutAvailable = (): boolean => false;

export const openRazorpayCheckout = async (_options: RazorpayCheckoutOptions): Promise<RazorpayCheckoutOutcome> => ({
  status: 'failed',
  message: 'Online payment is only available in the web app right now.',
});
