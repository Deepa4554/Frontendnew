import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSelector, useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootState } from '../../core/store/rootReducer';
import { AppDispatch } from '../../core/store';
import { useThemeColors } from '../../core/theme/useThemeColors';
import { canAccessRoute, isRouteHiddenByOrderType, ROLE_LABELS } from '../../core/auth/permissions';
import { useNotifications } from '../../core/api/hooks/useNotifications';
import { useApprovals } from '../../core/api/hooks/useApprovals';
import { useSettings } from '../../core/api/hooks/useSettings';
import { usePlanCategory } from '../../core/plan/planCategory';
import { logout } from '../../features/auth/presentation/viewmodels/authSlice';
import { confirmAlert } from '../../shared/components/ConfirmDialogHost';
import { showToast } from '../../core/store/uiSlice';
import { SkeletonList } from '../../shared/components/atoms/Skeleton';
import { useResponsive } from '../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../shared/components/desktop/DesktopPageHeader';

interface MoreItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  /** Permission/plan check uses this key instead of `route` when the nav target
   * (e.g. "MyAttendance") isn't itself a screen-catalog entry — self-service screens
   * piggyback on the admin screen's catalog key ("Attendance") for gating without
   * needing their own duplicate catalog entry. Defaults to `route`. */
  permissionRoute?: string;
}

interface MoreSection {
  title: string;
  items: MoreItem[];
}

export const MoreScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const role = user?.role;
  const { category: planCategory, isLoading: planLoading } = usePlanCategory();
  const { data: settings } = useSettings();
  const { data: notificationsData } = useNotifications();
  // Badge only — don't call an endpoint this login has no Approvals access to (the API
  // now enforces the same grant, so an ungated call would just 403 on every render).
  const { data: pendingApprovalsData } = useApprovals(
    { status: 'PENDING' },
    { enabled: canAccessRoute(user ?? undefined, 'Approvals', planCategory) },
  );
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const pendingApprovals = pendingApprovalsData?.length ?? 0;

  const allSections: MoreSection[] = [
    {
      title: 'Operations',
      items: [
        { label: 'Tables', icon: 'table-chair', route: 'Tables' },
        { label: 'Token Orders', icon: 'ticket-confirmation-outline', route: 'TokenDashboard' },
        { label: 'Takeaway & Delivery', icon: 'moped-outline', route: 'TakeawayDelivery' },
        { label: 'QR Ordering', icon: 'qrcode', route: 'QRMenu' },
        { label: 'Billing', icon: 'credit-card-outline', route: 'Billing' },
        { label: 'Customers (CRM)', icon: 'account-heart', route: 'CRM' },
        { label: 'Tiffin', icon: 'silverware-fork-knife', route: 'Tiffin' },
        { label: 'Team Portal', icon: 'account-group', route: 'TeamPortal' },
        { label: 'Menu', icon: 'food', route: 'Menu' },
        { label: 'Inventory', icon: 'clipboard-list', route: 'Inventory' },
      ],
    },
    {
      title: 'My Workspace',
      items: [
        { label: 'My Attendance', icon: 'clock-check-outline', route: 'MyAttendance', permissionRoute: 'Attendance' },
        { label: 'My Leave', icon: 'calendar-remove-outline', route: 'MyLeave', permissionRoute: 'Leave' },
        { label: 'My Payslips', icon: 'file-document-outline', route: 'MyPayslips', permissionRoute: 'Payroll' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { label: 'Dashboard', icon: 'view-dashboard', route: 'Dashboard' },
        { label: 'Reports', icon: 'file-chart-outline', route: 'Reports' },
        { label: 'AI Assistant', icon: 'creation', route: 'AI' },
        { label: 'AI Chat', icon: 'chat-processing-outline', route: 'AIChat' },
      ],
    },
    {
      title: 'Workflow',
      items: [
        { label: 'Notifications', icon: 'bell-outline', route: 'Notifications', badge: unreadCount },
        { label: 'Approvals', icon: 'check-decagram', route: 'Approvals', badge: pendingApprovals },
        { label: 'Tasks', icon: 'format-list-checks', route: 'Tasks' },
      ],
    },
    {
      title: 'Business',
      items: [
        { label: 'Integrations', icon: 'api', route: 'Integrations' },
        // Listed alongside (not under) Integrations on purpose: WhatsApp Business is a Plus
        // feature while the hub itself stays Premium, so this is the only way a Plus cafe can
        // reach the setup screen. Premium cafes see both entries — harmless, the hub's
        // WhatsApp card routes to the same screen.
        { label: 'WhatsApp Business', icon: 'whatsapp', route: 'WhatsAppSetup' },
        // Same reasoning as WhatsApp above: Plus feature, Premium hub. The Integrations hub
        // also can't route here anyway — its cards are built from the server's Integration
        // rows, and a courier partner isn't one of them.
        { label: 'Delivery Partner', icon: 'moped', route: 'DeliveryPartner' },
        { label: 'Branches', icon: 'storefront', route: 'Branches' },
        { label: 'Expenses', icon: 'cash-minus', route: 'Expenses' },
        { label: 'Khatabook', icon: 'notebook-outline', route: 'Khatabook' },
        { label: 'Subscription', icon: 'cloud-check', route: 'SaaS' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Super Admin', icon: 'shield-crown', route: 'SuperAdmin' },
        { label: 'Cafe Settings', icon: 'store-cog', route: 'Profile' },
        { label: 'Help Center', icon: 'lifebuoy', route: 'Help' },
      ],
    },
  ];

  const sections: MoreSection[] = allSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          canAccessRoute(user ?? undefined, item.permissionRoute ?? item.route, planCategory) &&
          !isRouteHiddenByOrderType(item.permissionRoute ?? item.route, settings)
      ),
    }))
    .filter((section) => section.items.length > 0);

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
            // .unwrap() throws RTK's SerializedError — a plain object, not an Error
            // instance, so String(e) always produced the useless "[object Object]"
            // instead of the actual message.
            const message = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
              ? (e as { message: string }).message
              : 'Something went wrong.';
            dispatch(showToast({ message: `Sign out failed: ${message}`, icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="view-grid-outline" title="More" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.title}>More</Text>
          <Text style={styles.subtitle}>Everything else, in one place</Text>
          {!!role && (
            <View style={styles.roleBadge}>
              <Icon name="account-circle-outline" size={14} color={COLORS.accent} />
              <Text style={styles.roleBadgeText}>Logged in as {ROLE_LABELS[role]}</Text>
            </View>
          )}
        </View>
      )}

      {planLoading ? (
        <View style={styles.scrollContent}>
          <SkeletonList rows={6} />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.route}
                  style={[
                    styles.row,
                    index !== section.items.length - 1 && styles.rowDivider,
                  ]}
                  onPress={() => navigation.navigate(item.route)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowIconBox}>
                    <Icon name={item.icon} size={20} color={COLORS.heading} />
                  </View>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {!!item.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  )}
                  <Icon name="chevron-right" size={20} color={COLORS.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Icon name="logout" size={18} color={COLORS.dangerAccent} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: isDesktopWeb ? 15 : 15,
    paddingTop: isDesktopWeb ? 11 : 12,
    paddingBottom: isDesktopWeb ? 8 : 9,
  },
  title: {
    fontSize: isDesktopWeb ? 24 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1.5 : 1.5,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 4 : 3.75,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 12,
    paddingHorizontal: isDesktopWeb ? 8 : 7.5,
    paddingVertical: isDesktopWeb ? 4 : 3.75,
    marginTop: isDesktopWeb ? 7 : 7.5,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  scrollContent: {
    paddingHorizontal: isDesktopWeb ? 15 : 15,
    paddingBottom: isDesktopWeb ? 28 : 30,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: isDesktopWeb ? 13 : 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 6 : 6,
    marginLeft: isDesktopWeb ? 3 : 3,
    textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
    gap: isDesktopWeb ? 9 : 9,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  rowIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.aiCardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: isDesktopWeb ? 15 : 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  badge: {
    backgroundColor: COLORS.dangerAccent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isDesktopWeb ? 4 : 3.75,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
    marginTop: isDesktopWeb ? 3 : 3,
  },
  signOutText: {
    fontSize: isDesktopWeb ? 15 : 12,
    fontWeight: '700',
    color: COLORS.dangerAccent,
  },
});
