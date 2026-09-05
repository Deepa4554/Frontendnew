import { apiClient } from '../network/api';

export interface ApiSettings {
  id: number;
  /** The owning tenant's URL-safe slug — used to build tenant-aware QR ordering links. */
  tenantSlug: string | null;
  taxRatePct: number;
  /** Charge tax only on the tenders in `taxablePaymentModes` instead of on every bill.
   * Off for every cafe that hasn't deliberately turned it on. */
  taxByPaymentModeEnabled: boolean;
  /** Comma-separated tenders that carry tax while the switch above is on, e.g. "UPI,Card".
   * Stored as CSV; sent back up as a string ARRAY (see UpdateSettingsRequest). */
  taxablePaymentModes: string;
  /** Charge GST on the Service/Packing/Delivery charges too, instead of adding them on top of
   * an already-computed tax. Off for every cafe that hasn't turned it on, and it only ever
   * affects orders placed after the change — each bill snapshots the decision. */
  taxChargesEnabled: boolean;
  /** This cafe bills under the GST composition scheme, so its bill prints as a BILL OF SUPPLY
   * rather than a TAX INVOICE. */
  isCompositionScheme: boolean;
  /** HSN/SAC used for menu items with no code of their own — the whole menu at most cafes.
   * Null means no HSN is printed anywhere. */
  defaultHsnCode: string | null;
  currency: string;
  region: string;
  businessName: string;
  /** Which onboarding style card the Owner picked (see OnboardingTypeScreen) —
   * 'coffee' (QSR) / 'bakery' / 'restaurant' / 'lounge'. Not read by anything yet. */
  businessType: string | null;
  receiptHeader: string;
  receiptFooter: string;
  logoUrl: string | null;
  primaryColor: string;
  qrStyle: string;
  themeMode: string;
  twoFactorEnabled: boolean;
  terminalPasscodeRequired: boolean;
  inventoryAlertsEnabled: boolean;
  shiftReportsEnabled: boolean;
  orderPlacedAlertsEnabled: boolean;
  orderPendingConfirmationAlertsEnabled: boolean;
  orderReadyAlertsEnabled: boolean;
  /** "Approval needed" / granted / rejected notices — unlike the alerts above these only ever
   * reach whoever may actually resolve the request (see ApprovalsController.ResolverRoles). */
  approvalAlertsEnabled: boolean;
  /** Staff-Confirm Mode: a guest QR session's first order sits unfired until a staff member
   * confirms it (see ordersApi.confirmGuestOrder) instead of firing straight to the kitchen. */
  requireStaffOrderConfirmation: boolean;
  hasCompletedOnboarding: boolean;
  phone: string | null;
  address: string | null;
  /** Serialized JSON array of {day, open, from, to} — parse/stringify at the call site. */
  storeHoursJson: string;
  /** 'TWO_STAGE' (New → Ready) or 'THREE_STAGE' (New → Preparing → Ready, the default) —
   * how many taps the KDS screen needs per item/KOT. See KDSScreen's use of this. */
  kdsStageMode: 'TWO_STAGE' | 'THREE_STAGE';
  /** Which order-type pills POS offers — an Owner turns off whichever this cafe doesn't
   * do. At least one always stays true (enforced server-side). */
  dineInEnabled: boolean;
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  qsrEnabled: boolean;
  cashEnabled: boolean;
  /** Which of the 4 fixed attendance shifts (Morning/Evening/Night/General) roll-call
   * offers — an Owner turns off whichever this cafe doesn't run. At least one always
   * stays true (enforced server-side), same rule as the order types above. */
  morningShiftEnabled: boolean;
  eveningShiftEnabled: boolean;
  nightShiftEnabled: boolean;
  generalShiftEnabled: boolean;
  /** Which optional sections print on the customer bill — see Receipt Builder settings
   * and printing/receiptFormat.ts buildReceiptLines, the shared line model every print
   * transport/screen renders from. Business name, items, and totals always print. */
  receiptShowAddress: boolean;
  receiptShowWaiterName: boolean;
  receiptShowGuestPhone: boolean;
  receiptShowItemNotes: boolean;
  receiptShowFooter: boolean;
  /** GST/tax registration number line — blank/null means don't print one. */
  gstNumber: string | null;
  /** Food/trade licence number (FSSAI, shop licence), set on the Cafe Profile screen and
   * printed on every bill. Null until an Owner enters one. */
  licenceNumber: string | null;
  /** The cafe's UPI address ("cafe@okaxis") that bill QR codes are addressed to. Null until
   * an Owner sets one in Cafe Settings, and while it's null no UPI QR is offered anywhere —
   * see buildUpiPaymentUri and buildReceiptLines. */
  upiVpa: string | null;
  /** Where the "Rate us on Google" QR at the foot of a bill points. Null/blank = the cafe
   * hasn't set one up and no review QR appears anywhere. Stored as a finished https:// URL —
   * the server also accepts a bare Google Place ID and expands it (see GoogleReviewLink). */
  googleReviewUrl: string | null;
  /** The cafe's own registered coordinates — null until an Owner/Manager taps "Use
   * Current Location" in Cafe Profile. AttendanceController's punch-in/out geofence
   * check is skipped entirely while these are null. */
  latitude: number | null;
  longitude: number | null;
  /** Auto Charges — a default value a biller no longer has to type in on every bill, plus
   * which order types it starts pre-applied on (see OrderBillActions' removable tiles for
   * how a biller overrides/removes it per bill). Null default means the charge is off. */
  serviceChargeDefaultPct: number | null;
  serviceChargeAutoApplyDineIn: boolean;
  serviceChargeAutoApplyTakeaway: boolean;
  serviceChargeAutoApplyDelivery: boolean;
  serviceChargeAutoApplyToken: boolean;
  packingChargeDefaultAmount: number | null;
  packingChargeAutoApplyDineIn: boolean;
  packingChargeAutoApplyTakeaway: boolean;
  packingChargeAutoApplyDelivery: boolean;
  packingChargeAutoApplyToken: boolean;
  deliveryChargeDefaultAmount: number | null;
  deliveryChargeAutoApplyDineIn: boolean;
  deliveryChargeAutoApplyTakeaway: boolean;
  deliveryChargeAutoApplyDelivery: boolean;
  deliveryChargeAutoApplyToken: boolean;
  /** Percentage of a bill that comes back as loyalty points, 0-100. A point redeems for ₹1,
   * so this reads as the cashback rate: 5 means a ₹1000 bill earns 50 points worth ₹50. */
  loyaltyEarnPct: number;
}

export type UpdateSettingsRequest = Partial<
  Pick<
    ApiSettings,
    | 'taxRatePct'
    | 'loyaltyEarnPct'
    | 'currency'
    | 'region'
    | 'businessName'
    | 'businessType'
    | 'receiptHeader'
    | 'receiptFooter'
    | 'logoUrl'
    | 'primaryColor'
    | 'qrStyle'
    | 'themeMode'
    | 'twoFactorEnabled'
    | 'terminalPasscodeRequired'
    | 'inventoryAlertsEnabled'
    | 'shiftReportsEnabled'
    | 'orderPlacedAlertsEnabled'
    | 'orderPendingConfirmationAlertsEnabled'
    | 'orderReadyAlertsEnabled'
    | 'approvalAlertsEnabled'
    | 'requireStaffOrderConfirmation'
    | 'phone'
    | 'address'
    | 'storeHoursJson'
    | 'kdsStageMode'
    | 'dineInEnabled'
    | 'takeawayEnabled'
    | 'deliveryEnabled'
    | 'qsrEnabled'
    | 'cashEnabled'
    | 'morningShiftEnabled'
    | 'eveningShiftEnabled'
    | 'nightShiftEnabled'
    | 'generalShiftEnabled'
    | 'receiptShowAddress'
    | 'receiptShowWaiterName'
    | 'receiptShowGuestPhone'
    | 'receiptShowItemNotes'
    | 'receiptShowFooter'
    | 'gstNumber'
    | 'upiVpa'
    | 'googleReviewUrl'
    | 'latitude'
    | 'longitude'
    | 'serviceChargeDefaultPct'
    | 'serviceChargeAutoApplyDineIn'
    | 'serviceChargeAutoApplyTakeaway'
    | 'serviceChargeAutoApplyDelivery'
    | 'serviceChargeAutoApplyToken'
    | 'packingChargeDefaultAmount'
    | 'packingChargeAutoApplyDineIn'
    | 'packingChargeAutoApplyTakeaway'
    | 'packingChargeAutoApplyDelivery'
    | 'packingChargeAutoApplyToken'
    | 'deliveryChargeDefaultAmount'
    | 'deliveryChargeAutoApplyDineIn'
    | 'deliveryChargeAutoApplyTakeaway'
    | 'deliveryChargeAutoApplyDelivery'
    | 'deliveryChargeAutoApplyToken'
  >
> & {
  /** Send true to blank out that charge's default value (turn the charge off entirely) —
   * a plain `undefined` field is indistinguishable from "not sent" over JSON, so clearing
   * back to null needs its own explicit flag rather than passing the *DefaultPct/Amount
   * field as null. */
  serviceChargeClearDefault?: boolean;
  packingChargeClearDefault?: boolean;
  deliveryChargeClearDefault?: boolean;
  taxByPaymentModeEnabled?: boolean;
  /** A list going up, a CSV string coming back down (see ApiSettings) — the client never has
   * to know the storage format. An empty array is a real value ("no tender is taxable"), not
   * "leave unchanged"; omit the field entirely for that. */
  taxablePaymentModes?: string[];
  taxChargesEnabled?: boolean;
  isCompositionScheme?: boolean;
  /** Empty string clears it back to "no HSN"; omit the field to leave it unchanged. Digits
   * only, 4-8 of them — the server rejects anything else rather than printing it on a bill. */
  defaultHsnCode?: string;
};

/** A notification category that has no dedicated named toggle of its own (Billing, System,
 * Marketing, AI Insight, Task, ...). The server derives this list by walking the category enum,
 * so a category added on the backend shows up here with no frontend change — that's the whole
 * point of the generic tier (see the API's NotificationPreferences class). Categories that DO
 * have a named toggle are deliberately absent: they're set through settingsApi.update instead,
 * so there's exactly one source of truth per category. */
export interface NotificationCategoryPreference {
  category: string;
  enabled: boolean;
}

export const settingsApi = {
  get: () => apiClient.get<ApiSettings>('/settings').then((r) => r.data),
  update: (req: UpdateSettingsRequest) => apiClient.put<ApiSettings>('/settings', req).then((r) => r.data),
  completeOnboarding: () => apiClient.post<void>('/settings/complete-onboarding').then((r) => r.data),
  notificationPreferences: () =>
    apiClient.get<NotificationCategoryPreference[]>('/settings/notification-preferences').then((r) => r.data),
  updateNotificationPreference: (category: string, enabled: boolean) =>
    apiClient.put<void>('/settings/notification-preferences', { category, enabled }).then((r) => r.data),
};
