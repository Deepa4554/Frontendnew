import { User } from '../../features/auth/domain/entities/User';
import { PlanCategory, categoryMeetsMin } from '../plan/planCategory';
import { SCREEN_MIN_PLAN, ancestorsOf } from './screenCatalog';
import { ApiSettings } from '../api/settingsApi';

export type AppRole = User['role'];

// Every "More" destination route, gated by role. Routes not listed here are
// visible to everyone. This is the single source of truth for who can see what —
// update this map, not individual screens, when access rules change. This is the
// "Automatic" default (see StaffAccessMode) — a staff login in Custom mode ignores
// this entirely and uses only its own allowedScreens list instead.
const FLOOR_STAFF_HIDDEN_ROUTES = new Set([
  'Billing',
  'CRM',
  'TeamPortal',
  'Menu',
  'Inventory',
  'Dashboard',
  'Integrations',
  'WhatsAppSetup',
  'DeliveryPartner',
  'Branches',
  'Expenses',
  // Extending credit is a floor decision any cashier settling a bill can make; deciding a
  // customer's debt has been paid off is not — the backend restricts every khatabook endpoint
  // to Owner/Manager, so this hides a screen that would 403 anyway.
  'Khatabook',
  'SaaS',
  'SuperAdmin',
  'Profile', // Cafe Settings
  // Profile's own children — each guarded by its own route key (not 'Profile') since
  // they're independent Stack.Screens, so hiding the parent alone doesn't stop one of
  // these from being reached directly (e.g. a web URL from linking.ts bypasses the
  // in-app "Profile" entry point entirely).
  'PrinterSettings',
  'KitchenFlowSettings',
  'StationManagement',
  'TaxSlabManagement',
  'OrderTypesSettings',
  'AutoChargesSettings',
  'Offers',
  'ReceiptBuilder',
  'CafeProfileDetail',
  'Approvals',
  'Tasks',
]);

// Waiter, Chef, and KitchenStaff logins all get the same restricted view — a Chef/
// KitchenStaff login is meant to see exactly what a Waiter sees (see
// FLOOR_STAFF_HIDDEN_ROUTES above); the one place they differ from Waiter is
// notifications, which is filtered server-side (NotificationsController.List), not here.
const FLOOR_STAFF_ROLES = new Set<AppRole>(['Waiter', 'Chef', 'KitchenStaff']);

/// Routes gated to the platform operator only (you) — NOT any cafe's Owner.
/// See AppUser.IsPlatformAdmin on the backend; canAccessRoute needs the real flag,
/// not the role, or every cafe owner would see these too. Never affected by
/// StaffAccessMode.Custom — SuperAdmin isn't even in the screen catalog.
const PLATFORM_ADMIN_ONLY_ROUTES = new Set(['SuperAdmin']);

/// Routes whose write endpoints are hard-gated to Owner/Manager on the backend
/// (Policies.OwnerOrManager — see StaffController's screen-access/kitchen-assignment
/// actions) and must stay that way regardless of Custom Screen Access grants. These
/// aren't in SCREEN_CATALOG (never staff-assignable), but they're reached from inside
/// TeamPortal, so without this override, granting a staff login plain "Team Portal"
/// visibility in Custom mode would also silently unlock them — checked before the
/// Custom-mode allowedScreens branch below, unlike every other route.
const OWNER_MANAGER_ONLY_ROUTES = new Set(['StaffAccess', 'StaffKitchenAssignment']);

/**
 * What `role` sees in Automatic mode, screen by screen — the same rules canAccessRoute's
 * Automatic branch applies below, minus the plan and platform-admin gates (callers that
 * need those apply them separately; StaffAccessScreen greys plan-locked rows on its own).
 * Exported so the Screen Access picker can *show* an owner exactly which screens a role
 * gets on Automatic instead of just claiming "follows the role default" — sharing the
 * sets below means that preview can never drift from what the app actually enforces.
 */
export function isScreenInRoleDefault(role: AppRole | undefined, screenKey: string): boolean {
  if (!role) return false;
  if (role === 'Owner') return true;
  if (OWNER_MANAGER_ONLY_ROUTES.has(screenKey)) return role === 'Manager';
  if (FLOOR_STAFF_ROLES.has(role) && FLOOR_STAFF_HIDDEN_ROUTES.has(screenKey)) return false;
  return true;
}

/** Just the fields canAccessRoute needs off a full User — lets callers pass the Redux
 * user object directly without importing the whole User type. */
export interface AccessUser {
  role: AppRole | undefined;
  isPlatformAdmin?: boolean;
  screenAccessMode?: User['screenAccessMode'];
  allowedScreens?: User['allowedScreens'];
  /** Cafe-level ceiling set by a platform admin — see User['tenantScreenMode'] and the
   * matching Tenant.ScreenMode on the backend. */
  tenantScreenMode?: User['tenantScreenMode'];
  tenantEnabledScreens?: User['tenantEnabledScreens'];
}

/**
 * Whether `route` is included in the cafe's own plan-screen setup — the containment level
 * ABOVE role/staff access (plan → tenant → role/staff, see docs/screen-access-plan.md).
 * PlanDefault (every existing cafe, until a platform admin opts one into Custom) means
 * "everything the plan includes"; Custom means only tenantEnabledScreens. Applies to EVERY
 * login in the cafe, Owner included — this is platform packaging, not a staff restriction —
 * except the platform operator's own login, which always bypasses it (mirrors
 * ScreenAccessFilter's isPlatformAdmin bypass on the backend).
 */
export function isScreenEnabledForTenant(user: AccessUser | undefined, route: string): boolean {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  if (user.tenantScreenMode !== 'Custom') return true;
  return (user.tenantEnabledScreens ?? []).includes(route);
}

/**
 * canAccessRoute's per-key checks, without the ancestor-chain cascade — see canAccessRoute for
 * why the cascade has to be a separate outer step rather than folded in here.
 *
 * `checkPlan` defaults on for the route being checked directly, but canAccessRoute passes false
 * when walking ancestors. A child can be deliberately packaged below its parent hub's plan —
 * WhatsAppSetup and DeliveryPartner are both Plus, sitting under the Premium Integrations hub,
 * by design (see the comment on WhatsAppSetup in screenCatalog.ts) — and re-applying the
 * ancestor's own plan gate here would defeat exactly that packaging: every plan check the child
 * needs is already its own minPlan above, so the ancestor walk only has to confirm the tenant/
 * role gates a parent being switched off or hidden should still cascade down.
 */
function canAccessRouteSelf(user: AccessUser | undefined, route: string, planCategory: PlanCategory, checkPlan = true): boolean {
  if (!user?.role) return false;
  if (PLATFORM_ADMIN_ONLY_ROUTES.has(route) && !user.isPlatformAdmin) return false;

  if (checkPlan) {
    const minPlan = SCREEN_MIN_PLAN[route];
    if (minPlan && !categoryMeetsMin(planCategory, minPlan)) return false;
  }

  if (!isScreenEnabledForTenant(user, route)) return false;

  if (user.role === 'Owner') return true;

  if (OWNER_MANAGER_ONLY_ROUTES.has(route)) return user.role === 'Manager';

  if (user.screenAccessMode === 'Custom') {
    return (user.allowedScreens ?? []).includes(route);
  }

  if (FLOOR_STAFF_ROLES.has(user.role) && FLOOR_STAFF_HIDDEN_ROUTES.has(route)) return false;
  return true;
}

/**
 * Whether `user` can see `route`, given the cafe's current plan. Combines five
 * independent gates, all of which must pass:
 *  1. Platform-admin routes (SuperAdmin) — always role/mode-independent.
 *  2. Plan — a screen below the tenant's current plan is invisible to EVERYONE,
 *     Owner included (this is SaaS packaging, not a staff restriction).
 *  3. Tenant — a screen a platform admin switched off for this cafe (Custom mode) is
 *     invisible to EVERYONE in it, Owner included, same reasoning as the plan gate.
 *  4. Owner/Manager-only routes (OWNER_MANAGER_ONLY_ROUTES) — never overridable by
 *     a Custom Screen Access grant, since these mutate other staff members' access.
 *  5. Role/custom access — Owner always passes; everyone else follows either the
 *     Automatic role default (FLOOR_STAFF_HIDDEN_ROUTES) or, in Custom mode, only
 *     what's in their own allowedScreens.
 *
 * Then cascades up: a screen is only really reachable if every ancestor it's nested under
 * (see screenCatalog.ts's `parent` field / ancestorsOf) passes the same checks too — e.g.
 * PurchaseOrders is unreachable the moment Inventory itself fails any gate above, even if
 * PurchaseOrders' own key would otherwise pass. Mirrors ScreenCatalog.Normalize's
 * write-time cascade on the backend; this is the read-time half of the same rule, and
 * catches cases Normalize can't (e.g. Inventory failing the PLAN gate, which isn't stored
 * data at all).
 */
export function canAccessRoute(user: AccessUser | undefined, route: string, planCategory: PlanCategory): boolean {
  if (!canAccessRouteSelf(user, route, planCategory)) return false;
  return ancestorsOf(route).every((ancestor) => canAccessRouteSelf(user, ancestor, planCategory, /* checkPlan */ false));
}

// Routes whose entire purpose is dine-in table service — nothing left to show once
// an Owner turns Dine In off in Order Types settings (OrderTypesSettingsScreen).
// Deliberately separate from canAccessRoute's plan/role gates above: this is an
// operational toggle a tenant flips on their own plan, not a packaging/subscription
// rule, so it's ANDed on top at each call site instead of folded into SCREEN_MIN_PLAN.
const DINE_IN_ONLY_ROUTES = new Set(['Tables']);

export function isRouteHiddenByOrderType(
  route: string,
  settings: Pick<ApiSettings, 'dineInEnabled'> | undefined
): boolean {
  return DINE_IN_ONLY_ROUTES.has(route) && settings?.dineInEnabled === false;
}

export function isOwnerOrManager(role: AppRole | undefined): boolean {
  return role === 'Owner' || role === 'Manager';
}

export function canManageTables(role: AppRole | undefined): boolean {
  return isOwnerOrManager(role);
}

/// A discretionary markdown applied at the billing/payment stage is manager-level —
/// unlike the order-time discount (any staff) and coupon/gift-card redemption (any
/// staff, since those are pre-issued codes, not on-the-spot judgement calls).
export function canApplyBillDiscount(role: AppRole | undefined): boolean {
  return isOwnerOrManager(role);
}

/// Re-rating a single line on one open order ("iss customer ko yeh ₹100 me de do"). Manager-level
/// for the same reason as the bill discount above — it's the same discretionary markdown, just
/// aimed at one item instead of the whole bill, and the server gates it identically (see backend
/// OrdersController.UpdateItemPrice). Editing the MENU price is a different, catalog-wide act and
/// keeps its own permission.
export function canOverrideItemPrice(role: AppRole | undefined): boolean {
  return isOwnerOrManager(role);
}

export function canAccessSuperAdmin(isPlatformAdmin: boolean | undefined): boolean {
  return isPlatformAdmin === true;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  Owner: 'Owner',
  Manager: 'Manager',
  Cashier: 'Cashier',
  Chef: 'Chef',
  Waiter: 'Waiter',
  KitchenStaff: 'Kitchen Staff',
  Accountant: 'Accountant',
};
