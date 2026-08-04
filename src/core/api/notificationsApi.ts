import { apiClient } from '../network/api';

export interface ApiNotification {
  id: number;
  title: string;
  body: string;
  category: string;
  channel: string;
  isRead: boolean;
  isArchived: boolean;
  deliveryStatus: string;
  createdAt: string;
  actionUrl: string | null;
}

export interface NotificationsList {
  items: ApiNotification[];
  unreadCount: number;
}

/** One category's row in "my notification settings". `enabled` is this user's own choice
 * (defaults true); `enabledForCafe` is the cafe-wide switch only an Owner/Manager can change —
 * when it's false the category reaches nobody, so the UI shows the personal toggle as
 * overridden rather than letting it look like it does something. */
export interface MyNotificationPreference {
  category: string;
  enabled: boolean;
  enabledForCafe: boolean;
}

export const notificationsApi = {
  myPreferences: () =>
    apiClient.get<MyNotificationPreference[]>('/notifications/my-preferences').then((r) => r.data),
  updateMyPreference: (category: string, enabled: boolean) =>
    apiClient.put<void>('/notifications/my-preferences', { category, enabled }).then((r) => r.data),
  list: (includeArchived = false) =>
    apiClient.get<NotificationsList>('/notifications', { params: { includeArchived } }).then((r) => r.data),
  markRead: (id: number) => apiClient.patch<void>(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => apiClient.post<void>('/notifications/read-all').then((r) => r.data),
  archive: (id: number) => apiClient.patch<void>(`/notifications/${id}/archive`).then((r) => r.data),
  retry: (id: number) => apiClient.post<ApiNotification>(`/notifications/${id}/retry`).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/notifications/${id}`).then((r) => r.data),
};
