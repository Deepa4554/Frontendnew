export interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: 'Owner' | 'Manager' | 'Cashier' | 'Chef' | 'Waiter' | 'KitchenStaff' | 'Accountant';
  cafeId: string;
  profilePhoto?: string;
  permissions?: string[];
  isPlatformAdmin?: boolean;
  /** Automatic = follow the role-based screen default; Custom = only screenAccess
   * lists which screens this login can see. Refreshed every few seconds while the app
   * is open (see useLiveAccessSync) so an Owner revoking access takes effect almost
   * immediately, without requiring a re-login. See core/auth/permissions.ts. */
  screenAccessMode?: 'Automatic' | 'Custom';
  allowedScreens?: string[] | null;
  /** Cafe-level ceiling a platform admin can set for the whole tenant — one level above
   * screenAccessMode/allowedScreens, same shape. PlanDefault (every cafe until a platform
   * admin opts one into Custom) means every plan screen is available; Custom means only
   * tenantEnabledScreens. See core/auth/permissions.ts's isScreenEnabledForTenant. */
  tenantScreenMode?: 'PlanDefault' | 'Custom';
  tenantEnabledScreens?: string[] | null;
  /** Server-side KDS station pin — see core/api/authApi.ts's ApiUser.assignedStationId. */
  assignedStationId?: number | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}
