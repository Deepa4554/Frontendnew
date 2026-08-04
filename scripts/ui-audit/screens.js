// Top-level destinations reachable from a fresh login, with the click-label
// used in each of the two web layouts (see core/utils/useResponsive.ts:
// width < 768 => bottom tabs + MoreScreen; width >= 768 => DesktopAppShell
// sidebar). `tab` entries are on the bottom tab bar directly (mobile) or
// under a sidebar item that itself dispatches navigation.navigate('MainTabs',
// {screen: tab}) (desktop) — same underlying screen either way.
module.exports = [
  { key: 'POS', mobile: null, desktop: null }, // default landing screen, no nav needed
  { key: 'Orders', mobile: { tab: 'Orders' }, desktop: { sidebar: 'Tables' } },
  { key: 'KDS', mobile: { tab: 'KDS' }, desktop: { sidebar: 'Kitchen' } },
  { key: 'AI', mobile: { tab: 'AI' }, desktop: { sidebar: 'AI Assistant' } },
  { key: 'TokenDashboard', mobile: { more: 'Token Orders' }, desktop: { sidebar: 'Token Orders' } },
  { key: 'QRMenu', mobile: { more: 'QR Ordering' }, desktop: { sidebar: 'QR Ordering' } },
  { key: 'Billing', mobile: { more: 'Billing' }, desktop: { sidebar: 'Billing' } },
  { key: 'CRM', mobile: { more: 'Customers (CRM)' }, desktop: { sidebar: 'CRM' } },
  { key: 'TeamPortal', mobile: { more: 'Team Portal' }, desktop: { sidebar: 'Team' } },
  { key: 'Menu', mobile: { more: 'Menu' }, desktop: { sidebar: 'Menu' } },
  { key: 'Inventory', mobile: { more: 'Inventory' }, desktop: { sidebar: 'Inventory' } },
  { key: 'Dashboard', mobile: { more: 'Dashboard' }, desktop: { sidebar: 'Dashboard' } },
  { key: 'AIChat', mobile: { more: 'AI Chat' }, desktop: { sidebar: 'AI Chat' } },
  { key: 'Search', mobile: { more: 'Global Search' }, desktop: { sidebar: 'Search' } },
  { key: 'Notifications', mobile: { more: 'Notifications' }, desktop: { sidebar: 'Notifications' } },
  { key: 'Approvals', mobile: { more: 'Approvals' }, desktop: { sidebar: 'Approvals' } },
  { key: 'Tasks', mobile: { more: 'Tasks' }, desktop: { sidebar: 'Tasks' } },
  { key: 'Integrations', mobile: { more: 'Integrations' }, desktop: { sidebar: 'Integrations' } },
  { key: 'Branches', mobile: { more: 'Branches' }, desktop: { sidebar: 'Branches' } },
  { key: 'Expenses', mobile: { more: 'Expenses' }, desktop: { sidebar: 'Expenses' } },
  { key: 'SaaS', mobile: { more: 'Subscription' }, desktop: { sidebar: 'Subscription' } },
  { key: 'Profile', mobile: { more: 'Cafe Settings' }, desktop: { sidebarFooter: 'Settings' } },
  { key: 'Help', mobile: { more: 'Help Center' }, desktop: { sidebarFooter: 'Support' } },
];
