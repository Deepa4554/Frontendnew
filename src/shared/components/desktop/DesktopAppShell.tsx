import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, TextInput, Platform, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../core/store/rootReducer';
import { AppDispatch } from '../../../core/store';
import { DesktopColors as COLORS } from '../../design/desktopWebTheme';
import { canAccessRoute, isRouteHiddenByOrderType, ROLE_LABELS } from '../../../core/auth/permissions';
import { usePlanCategory } from '../../../core/plan/planCategory';
import { useNotifications } from '../../../core/api/hooks/useNotifications';
import { useApprovals } from '../../../core/api/hooks/useApprovals';
import { useSettings } from '../../../core/api/hooks/useSettings';
import { useSearch } from '../../../core/api/hooks/useSearch';
import { SearchResult } from '../../../core/api/searchApi';
import { searchScreens, ScreenSearchEntry } from '../../../core/navigation/screenSearchIndex';
import { logout } from '../../../features/auth/presentation/viewmodels/authSlice';
import { confirmAlert } from '../ConfirmDialogHost';
import { showToast, setSidebarCollapsed } from '../../../core/store/uiSlice';
import { useResponsive } from '../../../core/utils/useResponsive';
import { Tooltip } from '../atoms/Tooltip';

const SEARCH_TYPE_ICON: Record<SearchResult['category'], string> = {
  Orders: 'receipt',
  Customers: 'account',
  Inventory: 'package-variant-closed',
  Menu: 'silverware-fork-knife',
  Tables: 'table-furniture',
};

const SEARCH_ROUTE_FOR: Record<SearchResult['category'], string> = {
  Orders: 'Billing',
  Customers: 'CRM',
  Inventory: 'Inventory',
  Menu: 'Menu',
  Tables: 'Tables',
};

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Tab screen inside MainTabs instead of a top-level Stack route. */
  tab?: string;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS = (unreadCount: number, pendingApprovals: number): NavGroup[] => [
  {
    title: 'Operate',
    items: [
      { label: 'Dashboard', icon: 'view-dashboard-outline', route: 'Dashboard' },
      { label: 'POS', icon: 'cash-register', route: 'MainTabs', tab: 'POS' },
      { label: 'Tables', icon: 'table-chair', route: 'Tables' },
      { label: 'Token Orders', icon: 'ticket-confirmation-outline', route: 'TokenDashboard' },
      { label: 'Takeaway & Delivery', icon: 'moped-outline', route: 'TakeawayDelivery' },
      { label: 'QR Ordering', icon: 'qrcode', route: 'QRMenu' },
      { label: 'Kitchen', icon: 'chef-hat', route: 'MainTabs', tab: 'KDS' },
      { label: 'Menu', icon: 'food', route: 'Menu' },
      { label: 'Inventory', icon: 'clipboard-list-outline', route: 'Inventory' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Team', icon: 'account-group-outline', route: 'TeamPortal' },
      { label: 'CRM', icon: 'account-heart-outline', route: 'CRM' },
      { label: 'Tiffin', icon: 'silverware-fork-knife', route: 'Tiffin' },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Billing', icon: 'credit-card-outline', route: 'Billing' },
      { label: 'Expenses', icon: 'cash-minus', route: 'Expenses' },
      { label: 'Khatabook', icon: 'notebook-outline', route: 'Khatabook' },
      { label: 'Subscription', icon: 'cloud-check-outline', route: 'SaaS' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Reports', icon: 'file-chart-outline', route: 'Reports' },
      { label: 'AI Assistant', icon: 'creation', route: 'AI' },
      { label: 'AI Chat', icon: 'chat-processing-outline', route: 'AIChat' },
    ],
  },
  {
    title: 'Workflow',
    items: [
      { label: 'Notifications', icon: 'bell-outline', route: 'Notifications', badge: unreadCount },
      { label: 'Approvals', icon: 'check-decagram-outline', route: 'Approvals', badge: pendingApprovals },
      { label: 'Tasks', icon: 'format-list-checks', route: 'Tasks' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Integrations', icon: 'api', route: 'Integrations' },
      // Separate pill from Integrations — WhatsApp Business is Plus, the hub is Premium.
      // See the matching note in MoreScreen.
      { label: 'WhatsApp Business', icon: 'whatsapp', route: 'WhatsAppSetup' },
      { label: 'Delivery Partner', icon: 'moped', route: 'DeliveryPartner' },
      { label: 'Branches', icon: 'storefront-outline', route: 'Branches' },
    ],
  },
];

// Where the nav sidebar's ScrollView was last scrolled to. A plain module-level variable, not
// Redux/local state — same remount reason `collapsed` below is in Redux (this shell is
// re-instantiated fresh on every navigation), but the scroll offset itself is fired on every
// pixel of scrolling and never needs to trigger a re-render, so writing it to the store would
// just be a flood of pointless dispatches. Restored (not reset) on the next mount, so opening
// an item you scrolled down to find doesn't kick the list back to the top from under you.
let lastSidebarScrollY = 0;

interface Props {
  children: React.ReactNode;
  navigation: any;
  /** Route name (or tab name for MainTabs children) currently on screen, used to highlight the active sidebar pill. */
  activeRoute: string;
  /** Page title shown in the topbar search placeholder context; falls back to a generic search prompt. */
  searchPlaceholder?: string;
}

export const DesktopAppShell: React.FC<Props> = ({ children, navigation, activeRoute, searchPlaceholder }) => {
  const { isDesktopWeb, isTablet } = useResponsive();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.auth.user);
  const role = user?.role;
  const userName = user?.name;
  const { category: planCategory } = usePlanCategory();
  // Icon-only compact mode — lives in Redux, not local state: this component is
  // re-instantiated fresh per screen (see withDesktopShell), so local state would
  // reset back to expanded on every single navigation.
  const collapsed = useSelector((s: RootState) => s.ui.sidebarCollapsed);
  const { data: notificationsData } = useNotifications();
  const { data: settings } = useSettings();
  // Badge only — skipped entirely without Approvals access, since the API enforces the
  // same grant now and the call would 403 on every screen this shell wraps.
  const { data: pendingApprovalsData } = useApprovals(
    { status: 'PENDING' },
    { enabled: canAccessRoute(user ?? undefined, 'Approvals', planCategory) },
  );
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const pendingApprovals = pendingApprovalsData?.length ?? 0;

  // Live topbar search: typing shows a results dropdown right here instead of
  // navigating away. Mirrored by GlobalSearchTrigger for native/mobile-web,
  // which is the only other place search lives — there's no dedicated Search screen.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Restores the nav list's scroll position on this fresh mount (see lastSidebarScrollY above) —
  // animated: false so it lands there instantly instead of visibly scrolling past everything
  // above it on every single navigation.
  const navScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (lastSidebarScrollY > 0) navScrollRef.current?.scrollTo({ y: lastSidebarScrollY, animated: false });
  }, []);

  const { data: searchResults = [], isFetching: searchFetching } = useSearch(searchDebounced);
  const isSearchingLive = searchQuery.trim().length >= 2;
  const screenResults = isSearchingLive
    ? searchScreens(searchQuery, { user: user ?? undefined, planCategory, settings })
    : [];

  const goToSearchResult = (item: SearchResult) => {
    setSearchDropdownOpen(false);
    setSearchQuery('');
    navigation.navigate(SEARCH_ROUTE_FOR[item.category]);
  };

  const goToScreenResult = (entry: ScreenSearchEntry) => {
    setSearchDropdownOpen(false);
    setSearchQuery('');
    entry.navigate(navigation);
  };

  const canOpen = (routeKey: string) =>
    canAccessRoute(user ?? undefined, routeKey, planCategory) && !isRouteHiddenByOrderType(routeKey, settings);

  const groups = NAV_GROUPS(unreadCount, pendingApprovals)
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const routeKey = item.route === 'MainTabs' ? item.tab! : item.route;
        return canAccessRoute(user ?? undefined, routeKey, planCategory) && !isRouteHiddenByOrderType(routeKey, settings);
      }),
    }))
    .filter((g) => g.items.length > 0);

  const goTo = (item: NavItem) => {
    if (item.tab) {
      navigation.navigate('MainTabs', { screen: item.tab });
    } else {
      navigation.navigate(item.route);
    }
  };

  const handleSignOut = () => {
    confirmAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await dispatch(logout()).unwrap();
          } catch (e) {
            dispatch(showToast({ message: `Sign out failed: ${String(e)}`, icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  // A cafe name longer than 11 characters (spaces included) is too wide for the sidebar
  // brand slot at full size — drop the brand font to 16 for those so they still fit on one line.
  const brandName = settings?.businessName ?? 'PrabandhOS';
  const brandTitleStyle =
    brandName.length > 11
      ? [styles.brandTitle, { fontSize: 16 }]
      : styles.brandTitle;

  return (
    <View style={styles.root}>
      <View style={[styles.sidebar, isTablet && styles.sidebarTablet, collapsed && styles.sidebarCollapsed]}>
        <View style={[styles.brandBox, collapsed && styles.brandBoxCollapsed]}>
          {!collapsed && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={brandTitleStyle} numberOfLines={1}>{brandName}</Text>
              <Text style={styles.brandSubtitle}>Cafe Management System</Text>
            </View>
          )}
          <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement={collapsed ? 'right' : 'bottom'}>
            <TouchableOpacity
              style={styles.collapseToggleBtn}
              onPress={() => dispatch(setSidebarCollapsed(!collapsed))}
              activeOpacity={0.7}
            >
              <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} color={COLORS.sidebarInactiveText} />
            </TouchableOpacity>
          </Tooltip>
        </View>

        <ScrollView
          ref={navScrollRef}
          style={styles.navScroll}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => { lastSidebarScrollY = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={32}
        >
          {groups.map((group) => (
            <View key={group.title} style={styles.navGroup}>
              {!collapsed && <Text style={styles.navGroupLabel}>{group.title}</Text>}
              {group.items.map((item) => {
                const active = item.tab ? activeRoute === item.tab : activeRoute === item.route;
                return (
                  <Tooltip key={item.label} label={collapsed ? item.label : undefined} placement="right">
                    <TouchableOpacity
                      style={[styles.navRow, collapsed && styles.navRowCollapsed, active && styles.navRowActive]}
                      onPress={() => goTo(item)}
                      activeOpacity={0.7}
                    >
                      <View style={{ position: 'relative' }}>
                        <Icon name={item.icon} size={18} color={active ? COLORS.sidebarActiveText : COLORS.sidebarInactiveText} />
                        {collapsed && !!item.badge && <View style={styles.navBadgeDot} />}
                      </View>
                      {!collapsed && (
                        <>
                          <Text style={[styles.navRowText, active && styles.navRowTextActive]} numberOfLines={1}>{item.label}</Text>
                          {!!item.badge && (
                            <View style={styles.navBadge}>
                              <Text style={styles.navBadgeText}>{item.badge}</Text>
                            </View>
                          )}
                        </>
                      )}
                    </TouchableOpacity>
                  </Tooltip>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={styles.sidebarFooter}>
          {/* Same canAccessRoute the nav groups above go through — these two sat outside the
              NAV_GROUPS filter, so a login without Cafe Settings / Help Center still saw them
              and got bounced by the route guard on click. */}
          {canOpen('Profile') && (
            <Tooltip label={collapsed ? 'Settings' : undefined} placement="right">
              <TouchableOpacity style={[styles.footerRow, collapsed && styles.navRowCollapsed]} onPress={() => navigation.navigate('Profile')} activeOpacity={0.7}>
                <Icon name="cog-outline" size={18} color={COLORS.sidebarInactiveText} />
                {!collapsed && <Text style={styles.navRowText}>Settings</Text>}
              </TouchableOpacity>
            </Tooltip>
          )}
          {canOpen('Help') && (
            <Tooltip label={collapsed ? 'Support' : undefined} placement="right">
              <TouchableOpacity style={[styles.footerRow, collapsed && styles.navRowCollapsed]} onPress={() => navigation.navigate('Help')} activeOpacity={0.7}>
                <Icon name="lifebuoy" size={18} color={COLORS.sidebarInactiveText} />
                {!collapsed && <Text style={styles.navRowText}>Support</Text>}
              </TouchableOpacity>
            </Tooltip>
          )}
          {collapsed && (
            <Tooltip label="Sign Out" placement="right">
              <TouchableOpacity style={styles.navRowCollapsed} onPress={handleSignOut} activeOpacity={0.7}>
                <Icon name="logout" size={18} color={COLORS.sidebarInactiveText} />
              </TouchableOpacity>
            </Tooltip>
          )}

          <View style={[styles.profileCard, collapsed && styles.profileCardCollapsed]}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitial}>{(userName ?? 'U').charAt(0).toUpperCase()}</Text>
            </View>
            {!collapsed && (
              <>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.profileName} numberOfLines={1}>{userName ?? 'User'}</Text>
                  <Text style={styles.profileRole}>{role ? ROLE_LABELS[role].toUpperCase() : ''}</Text>
                </View>
                <Tooltip label="Sign Out" placement="top">
                  <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon name="logout" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </Tooltip>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.main}>
        <View style={styles.topbar}>
          <View style={styles.searchBarOuter}>
            <View style={[styles.searchBar, searchDropdownOpen && styles.searchBarFocused]}>
              <Icon name="magnify" size={18} color={COLORS.muted} />
              {/* Deliberately NOT wrapped in a layout <View>: the global focus ring lands on
                  whichever div directly holds the focused input (see public/index.html), so an
                  extra wrapper here drew a second ring around just the text — inside searchBar's
                  own accent focus border, reading as a broken double outline. Sitting directly
                  in searchBar means that one ring coincides with the border it already draws. */}
              <TextInput
                style={[styles.searchInput, webNoOutline]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={searchPlaceholder ?? 'Search orders, customers, menu, inventory, tables…'}
                placeholderTextColor={COLORS.muted}
                onFocus={() => {
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  setSearchDropdownOpen(true);
                }}
                onBlur={() => {
                  // Delayed so a tap on a dropdown result still registers before the
                  // dropdown unmounts.
                  blurTimeout.current = setTimeout(() => setSearchDropdownOpen(false), 150);
                }}
                returnKeyType="search"
                // Without this, the browser's own autofill/history suggestions for this
                // field render as a second, native dropdown stacked on top of the
                // results dropdown below — looking like duplicate/unrelated results.
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
              />
              {!!searchQuery && (
                <Tooltip label="Clear search" placement="bottom">
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close-circle" size={16} color={COLORS.muted} />
                  </TouchableOpacity>
                </Tooltip>
              )}
            </View>

            {searchDropdownOpen && isSearchingLive && (
              <View style={styles.searchDropdown}>
                {searchFetching ? (
                  <Text style={styles.searchDropdownStatus}>Searching…</Text>
                ) : searchResults.length === 0 && screenResults.length === 0 ? (
                  <Text style={styles.searchDropdownStatus}>No results for "{searchQuery}"</Text>
                ) : (
                  <ScrollView style={styles.searchResultsScroll} showsVerticalScrollIndicator={false}>
                    {screenResults.map((entry) => (
                      <TouchableOpacity
                        key={`screen_${entry.id}`}
                        style={styles.searchResultRow}
                        onPress={() => goToScreenResult(entry)}
                        activeOpacity={0.7}
                      >
                        <Icon name={entry.icon} size={16} color={COLORS.muted} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.searchResultTitle} numberOfLines={1}>{entry.label}</Text>
                        </View>
                        <Text style={styles.searchResultCategory}>Screen</Text>
                      </TouchableOpacity>
                    ))}
                    {searchResults.map((item) => (
                      <TouchableOpacity
                        key={`${item.category}_${item.id}`}
                        style={styles.searchResultRow}
                        onPress={() => goToSearchResult(item)}
                        activeOpacity={0.7}
                      >
                        <Icon name={SEARCH_TYPE_ICON[item.category]} size={16} color={COLORS.muted} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.searchResultTitle} numberOfLines={1}>{item.title}</Text>
                          <Text style={styles.searchResultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                        </View>
                        <Text style={styles.searchResultCategory}>{item.category}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
          <View style={styles.topbarIcons}>
            {canOpen('Notifications') && (
              <Tooltip label="Notifications" placement="bottom">
                <TouchableOpacity style={styles.topbarIconBtn} onPress={() => navigation.navigate('Notifications')}>
                  <Icon name="bell-outline" size={20} color={COLORS.heading} />
                  {unreadCount > 0 && <View style={styles.topbarDot} />}
                </TouchableOpacity>
              </Tooltip>
            )}
            {canOpen('Profile') && (
              <Tooltip label="Profile" placement="bottom">
                <TouchableOpacity style={styles.topbarIconBtn} onPress={() => navigation.navigate('Profile')}>
                  <Icon name="account-circle-outline" size={22} color={COLORS.heading} />
                </TouchableOpacity>
              </Tooltip>
            )}
          </View>
        </View>
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    // web-only style (RNW passes fontFamily on View through to CSS, cascading to every
    // Text descendant since none of them set their own fontFamily) — not part of RN's ViewStyle type
    ...({ fontFamily: COLORS.fontFamily } as object),
  },
  sidebar: {
    // 25% narrower than the original 280px desktop sidebar (per design request).
    width: 210,
    backgroundColor: COLORS.sidebarBg,
    borderRightWidth: 1,
    borderRightColor: COLORS.divider,
    paddingTop: isDesktopWeb ? 14 : 21,
  },
  // ~25% narrower than the full 280px desktop sidebar — frees up content width for the
  // card grids on tablet-width browsers, which otherwise inherit the desktop sidebar as-is.
  sidebarTablet: {
    width: 210,
  },
  sidebarCollapsed: {
    width: 76,
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 18 : 18,
    marginBottom: isDesktopWeb ? 10 : 15,
  },
  brandBoxCollapsed: {
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  collapseToggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.chipBg,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.heading,
  },
  brandSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
  },
  navScroll: {
    flex: 1,
  },
  navGroup: {
    marginBottom: isDesktopWeb ? 6 : 10.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
  },
  navGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: isDesktopWeb ? 4 : 4.5,
    marginLeft: isDesktopWeb ? 10 : 9,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 9,
    paddingHorizontal: isDesktopWeb ? 10 : 9,
    paddingVertical: isDesktopWeb ? 6 : 8.25,
    borderRadius: 999,
    marginBottom: isDesktopWeb ? 0.5 : 1.5,
  },
  navRowActive: {
    backgroundColor: COLORS.sidebarActivePillBg,
  },
  navRowCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
    marginVertical: isDesktopWeb ? 2 : 1.5,
  },
  navRowText: {
    flex: 1,
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '600',
    color: COLORS.sidebarInactiveText,
  },
  navRowTextActive: {
    color: COLORS.sidebarActiveText,
    fontWeight: '700',
  },
  navBadge: {
    backgroundColor: COLORS.dangerAccent,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isDesktopWeb ? 4 : 3,
  },
  navBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  navBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.dangerAccent,
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 8 : 9,
    paddingBottom: isDesktopWeb ? 12 : 15,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 9,
    paddingHorizontal: isDesktopWeb ? 10 : 9,
    paddingVertical: isDesktopWeb ? 6 : 6.75,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 7.5,
    backgroundColor: COLORS.button,
    borderRadius: 8,
    padding: isDesktopWeb ? 8 : 9,
    marginTop: isDesktopWeb ? 6 : 7.5,
  },
  profileCardCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileName: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileRole: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.4,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 8 : 7.5,
    paddingHorizontal: isDesktopWeb ? 16 : 15,
    paddingVertical: isDesktopWeb ? 6 : 6.75,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    zIndex: 10,
  },
  searchBarOuter: {
    flex: 1,
    maxWidth: 520,
    position: 'relative',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 3.75,
    backgroundColor: COLORS.chipBg,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    height: 28,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  searchBarFocused: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.background,
  },
  searchInput: {
    // flex (not width:'100%') now that the input sits straight in searchBar's row — it takes
    // the space left by the magnifier and the clear button. minWidth:0 lets it actually shrink
    // instead of shoving the clear button past the pill's right edge on a long placeholder.
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: COLORS.heading,
  },
  searchDropdown: {
    position: 'absolute',
    top: '100%',
    marginTop: isDesktopWeb ? 6 : 4.5,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
    zIndex: 20,
  },
  searchResultsScroll: {
    maxHeight: 420,
  },
  searchDropdownStatus: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: COLORS.muted,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    paddingVertical: isDesktopWeb ? 12 : 9,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 10 : 7.5,
    paddingHorizontal: isDesktopWeb ? 14 : 10.5,
    paddingVertical: isDesktopWeb ? 9 : 6.75,
  },
  searchResultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.heading,
  },
  searchResultSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 0.75,
  },
  searchResultCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  topbarIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topbarIconBtn: {
    position: 'relative',
  },
  topbarDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.dangerAccent,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
