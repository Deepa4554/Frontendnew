import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../authApi';
import { syncAccess } from '../../../features/auth/presentation/viewmodels/authSlice';
import { RootState } from '../../store/rootReducer';
import { AppDispatch } from '../../store';

/**
 * Keeps role + screen-access fresh against the backend while the app is open, mounted
 * once at the AppNavigator level (like PendingOrdersHost). An Owner revoking or changing a
 * staff member's screen access reaches this device almost immediately via the "accessChanged"
 * SignalR push (see useOrdersRealtime, which owns the actual connection, and
 * StaffController.UpdateScreenAccess on the API) — the refetchInterval below is only the
 * same rarely-firing safety net useOrders/useTables use for their own pushes, not the
 * primary update mechanism. Patches the Redux user in place via authSlice.syncAccess rather
 * than replacing it, so withRouteGuard/MoreScreen/DesktopAppShell (all read straight off
 * Redux) re-render with the new access as soon as this query refetches.
 */
export const useLiveAccessSync = () => {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);

  const { data } = useQuery({
    queryKey: ['auth', 'liveAccess'],
    queryFn: authApi.me,
    enabled: isAuthenticated,
    refetchInterval: 60000,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    dispatch(
      syncAccess({
        role: data.role,
        isPlatformAdmin: data.isPlatformAdmin,
        screenAccessMode: data.accessMode,
        allowedScreens: data.allowedScreens,
        tenantScreenMode: data.tenantScreenMode,
        tenantEnabledScreens: data.tenantEnabledScreens,
        assignedStationId: data.assignedStationId,
      }),
    );
  }, [data, dispatch]);
};
