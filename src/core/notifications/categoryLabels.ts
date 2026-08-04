/**
 * Human labels for NotificationCategory, shared by the two screens that list categories: Cafe
 * Settings (cafe-wide switches, Owner/Manager) and the Notification Center's own "My
 * Notifications" sheet (per-user mutes, everyone). Kept in one place so the two can't drift into
 * calling the same category different things.
 *
 * Keys are the enum member names exactly as the preference endpoints send them — PascalCase via
 * JsonStringEnumConverter with no naming policy. Note this is NOT the casing the notification
 * LIST uses: NotificationDto.From upper-cases there ("ORDERPLACED"), which is why the icon map
 * in NotificationCenterScreen is keyed differently from this.
 *
 * Unknown categories fall back to the enum name with spaces inserted, so a category added on the
 * backend reads sensibly here without a frontend deploy — the same "walk the enum, don't
 * hardcode a list" property the server side has.
 */
const CATEGORY_LABELS: Record<string, string> = {
  OrderPlaced: 'New Order Placed',
  OrderPendingConfirmation: 'Order Awaiting Confirmation',
  Order: 'Order Ready to Serve',
  Inventory: 'Low Stock',
  Billing: 'Billing',
  Staff: 'Shift Reports',
  System: 'System',
  Marketing: 'Marketing',
  AiInsight: 'AI Insights',
  Task: 'Tasks',
  Approval: 'Approvals',
};

export const notificationCategoryLabel = (category: string): string =>
  CATEGORY_LABELS[category] ?? category.replace(/([a-z])([A-Z])/g, '$1 $2');
