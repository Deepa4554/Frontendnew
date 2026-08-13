/// <reference lib="dom" />
// The RN TypeScript config deliberately omits the DOM lib (this project targets native
// platforms primarily) — this file is web-only (see webpack.config.js's resolve.extensions),
// so it layers the real browser document/window typings back in just for itself, the same way
// pushNotifications.web.ts does.
import type {
  RazorpayCheckoutOptions,
  RazorpayCheckoutOutcome,
  RazorpayPaymentResult,
} from './razorpayCheckout';

export type { RazorpayCheckoutOptions, RazorpayCheckoutOutcome, RazorpayPaymentResult };

const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Loaded on demand rather than from a <script> tag in index.html. This is a POS that spends
 * its day on the Orders/KDS screens; making every cold start wait on a third-party script
 * that only one screen ever uses is a real cost, and a tablet with flaky Wi-Fi shouldn't have
 * its boot held up by Razorpay's CDN. Memoised, so the second Upgrade press reuses it.
 *
 * Note the page CSP has to allow this host — see public/index.html's script-src/frame-src.
 */
let scriptPromise: Promise<void> | null = null;

const loadCheckoutScript = (): Promise<void> => {
  if ((window as any).Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let the next attempt retry from scratch — a blocked script here is usually a
      // transient network/ad-blocker condition, not a permanent one.
      scriptPromise = null;
      reject(new Error('script failed to load'));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
};

export const isRazorpayCheckoutAvailable = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Opens the Razorpay modal and resolves once the user is finished with it, whichever way that
 * goes. Deliberately never rejects on a user action: paid / dismissed / failed are all normal
 * endings that the caller renders differently, and only a broken script load is an exception.
 *
 * The `settled` latch matters. checkout.js can fire more than one of these callbacks for a
 * single session — most commonly `payment.failed` followed by `modal.ondismiss` when the user
 * closes the modal after a decline — and a Promise only honours its first settle, so without
 * the latch the outcome depends on callback ordering. First one wins, explicitly.
 */
export const openRazorpayCheckout = async (options: RazorpayCheckoutOptions): Promise<RazorpayCheckoutOutcome> => {
  try {
    await loadCheckoutScript();
  } catch {
    return { status: 'failed', message: 'Could not load the payment window. Check your connection and try again.' };
  }

  const RazorpayCheckout = (window as any).Razorpay;
  if (!RazorpayCheckout) {
    return { status: 'failed', message: 'Could not load the payment window. Check your connection and try again.' };
  }

  return new Promise<RazorpayCheckoutOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: RazorpayCheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const checkout = new RazorpayCheckout({
      key: options.keyId,
      order_id: options.orderId,
      amount: options.amount,
      currency: options.currency,
      name: 'PrabandhOS',
      description: options.description,
      prefill: {
        name: options.prefillName,
        email: options.prefillEmail,
        contact: options.prefillContact,
      },
      theme: { color: options.themeColor },
      // Razorpay's own confirmation prompt when the user clicks away mid-payment. Without it,
      // a stray click outside the modal silently abandons a payment that may already be
      // authorising on the bank's side.
      modal: {
        confirm_close: true,
        ondismiss: () => settle({ status: 'dismissed' }),
      },
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        // None of this is trusted yet — it's three strings from a browser. The signature is
        // only meaningful once the server re-computes it with the key secret
        // (PaymentsController.Verify), which is where the plan actually changes.
        settle({
          status: 'paid',
          payment: {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          },
        });
      },
    });

    checkout.on('payment.failed', (event: { error?: { description?: string; reason?: string } }) => {
      // Razorpay's description is written for the payer ("Your card was declined by the
      // issuing bank") and is far more useful than anything generic we could substitute.
      settle({
        status: 'failed',
        message: event?.error?.description || 'The payment could not be completed. No money has been taken.',
      });
    });

    checkout.open();
  });
};
