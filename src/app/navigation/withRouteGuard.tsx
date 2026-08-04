import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { RootState } from '../../core/store/rootReducer';
import { canAccessRoute, isRouteHiddenByOrderType } from '../../core/auth/permissions';
import { usePlanCategory } from '../../core/plan/planCategory';
import { useSettings } from '../../core/api/hooks/useSettings';

/**
 * Applied at the navigator layer to every Owner/Manager (or platform-admin)
 * only screen — the same route set MoreScreen already hides from lower
 * roles via canAccessRoute. That menu-hiding alone was only a UI convenience:
 * nothing stopped the actual screen component from mounting (and its data
 * fetches firing) if something ever called navigation.navigate() on one of
 * these route names directly — e.g. a future web `linking` config exposing
 * them as real URLs, or any in-app navigation call that isn't the MoreScreen
 * list. This closes that gap by checking the same permission at the screen
 * itself: role is already synchronously available in Redux by the time an
 * authenticated user's navigator can mount at all, so the disallowed
 * component is never rendered even for a single frame — `navigation.replace`
 * only fires after this check as a side effect, the blocked content itself
 * always renders null.
 *
 * Also re-runs on every Redux update, including useLiveAccessSync's refetch — pushed almost
 * immediately via SignalR's "accessChanged" event (falling back to a safety-net poll) — so
 * if an Owner revokes this screen (or the cafe's plan drops below what it needs) while a
 * staff member is sitting on it, that update kicks them back to MainTabs even without them
 * navigating anywhere themselves.
 */
export const withRouteGuard = (Component: React.ComponentType<any>, routeKey: string) => {
  const Guarded = (props: any) => {
    const navigation = useNavigation<any>();
    const user = useSelector((s: RootState) => s.auth.user);
    const { category: planCategory } = usePlanCategory();
    const { data: settings } = useSettings();
    const allowed =
      canAccessRoute(user ?? undefined, routeKey, planCategory) && !isRouteHiddenByOrderType(routeKey, settings);

    React.useEffect(() => {
      if (!allowed) navigation.replace('MainTabs');
    }, [allowed, navigation]);

    if (!allowed) return null;
    return <Component {...props} />;
  };
  Guarded.displayName = `withRouteGuard(${routeKey})`;
  return Guarded;
};
