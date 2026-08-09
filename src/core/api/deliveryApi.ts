import { apiClient } from '../network/api';

/**
 * Third-party courier booking (Borzo) for DELIVERY orders — see backend DeliveryController.
 *
 * Deliberately its own module rather than more surface on ordersApi: nothing here is part of
 * taking an order, and the Borzo token never reaches this layer at all. The app asks the
 * backend to price or book; the credential stays on the server, where it can't be read out of
 * a JS bundle.
 */

export interface DeliverySettings {
  enabled: boolean;
  /** Whether a token is saved — never the token itself. */
  hasAuthToken: boolean;
  useTestEnvironment: boolean;
  passFeeToCustomer: boolean;
  pickupAddress: string | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  /** False while something required is still missing, so the screen can say what's blocking
   * instead of letting a booking fail later. */
  readyToBook: boolean;
}

export interface UpdateDeliverySettingsRequest {
  enabled?: boolean;
  /** Empty string clears the saved token; omit the field to leave it untouched. */
  authToken?: string;
  useTestEnvironment?: boolean;
  passFeeToCustomer?: boolean;
  pickupAddress?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
}

export interface DeliveryQuote {
  ok: boolean;
  fee: number | null;
  passedToCustomer: boolean;
  message: string | null;
}

export interface DeliveryStatus {
  orderId: number;
  /** Where the order is going, as the customer typed it. */
  deliveryAddress: string | null;
  /** Whether the customer also shared a map location — without it no rider can be booked. */
  hasLocation: boolean;
  provider: string | null;
  courierOrderId: string | null;
  status: string | null;
  trackingUrl: string | null;
  fee: number | null;
  riderName: string | null;
  riderPhone: string | null;
  bookedAt: string | null;
}

export const deliveryApi = {
  getSettings: () => apiClient.get<DeliverySettings>('/delivery/settings').then((r) => r.data),
  updateSettings: (req: UpdateDeliverySettingsRequest) =>
    apiClient.put<DeliverySettings>('/delivery/settings', req).then((r) => r.data),

  /** Prices a rider without booking one — creates nothing and costs nothing, so it's safe to
   * call whenever the screen wants a number to show. */
  quote: (orderId: number) =>
    apiClient.get<DeliveryQuote>(`/delivery/orders/${orderId}/quote`).then((r) => r.data),

  /** Books a real rider and spends the cafe's Borzo balance. Only ever call this from an
   * explicit press. `prepMinutes` is how long the kitchen needs, and becomes the courier's
   * pickup time so the rider isn't left waiting at the counter. */
  book: (orderId: number, prepMinutes: number) =>
    apiClient.post<DeliveryStatus>(`/delivery/orders/${orderId}/book`, { prepMinutes }).then((r) => r.data),

  cancel: (orderId: number) =>
    apiClient.post<DeliveryStatus>(`/delivery/orders/${orderId}/cancel`, {}).then((r) => r.data),

  status: (orderId: number) =>
    apiClient.get<DeliveryStatus>(`/delivery/orders/${orderId}`).then((r) => r.data),
};
