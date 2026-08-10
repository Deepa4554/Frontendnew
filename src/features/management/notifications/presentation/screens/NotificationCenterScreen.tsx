import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { Tooltip } from '../../../../../shared/components/atoms/Tooltip';
import { LoadingOverlay } from '../../../../../shared/components/atoms/LoadingOverlay';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { RADIUS } from '../../../../../shared/design/commonStyles';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useArchiveNotification,
  useDeleteNotification,
  useRetryNotification,
  useMyNotificationPreferences,
  useUpdateMyNotificationPreference,
} from '../../../../../core/api/hooks/useNotifications';
import { ApiNotification } from '../../../../../core/api/notificationsApi';
import { notificationCategoryLabel } from '../../../../../core/notifications/categoryLabels';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

// Keyed on exactly what the API sends — NotificationDto.From does a plain ToUpperInvariant() on
// the enum name, so a multi-word category arrives as ORDERPLACED/AIINSIGHT with no separator.
// Anything unmapped falls back to the generic bell below rather than rendering blank.
const CATEGORY_ICONS: Record<string, string> = {
  ORDER: 'receipt',
  ORDERPLACED: 'receipt',
  ORDERPENDINGCONFIRMATION: 'clock-alert-outline',
  INVENTORY: 'package-variant-closed',
  BILLING: 'credit-card-outline',
  STAFF: 'account-group',
  SYSTEM: 'cog',
  MARKETING: 'bullhorn',
  AIINSIGHT: 'robot-outline',
  TASK: 'clipboard-check-outline',
  APPROVAL: 'shield-check-outline',
};

const NotificationItem: React.FC<{ item: ApiNotification; COLORS: ReturnType<typeof useThemeColors> }> = ({ item, COLORS }) => {
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const [actionsOpen, setActionsOpen] = useState(false);
  const markRead = useMarkNotificationRead();
  const archive = useArchiveNotification();
  const remove = useDeleteNotification();
  const retry = useRetryNotification();
  const iconColor = item.isRead ? COLORS.muted : COLORS.accent;
  const timeAgo = getTimeAgo(item.createdAt);

  return (
    <TouchableOpacity
      onPress={() => markRead.mutate(item.id)}
      activeOpacity={0.8}
      style={[
        styles.notifItem,
        { backgroundColor: item.isRead ? COLORS.cardAlt : COLORS.pillActiveBg, opacity: item.isArchived ? 0.6 : 1 },
      ]}
    >
      <View style={[styles.notifIcon, { backgroundColor: item.isRead ? COLORS.chipBg : COLORS.aiIconBg }]}>
        <Icon name={CATEGORY_ICONS[item.category] ?? 'bell-outline'} size={20} color={iconColor} />
      </View>

      <View style={styles.notifBody}>
        <View style={styles.notifHeader}>
          <Text style={[styles.notifTitle, { fontWeight: item.isRead ? '500' : '700' }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifTime}>{timeAgo}</Text>
        </View>
        <Text style={styles.notifBody2} numberOfLines={2}>
          {item.body}
        </Text>
        {item.deliveryStatus === 'FAILED' && (
          <TouchableOpacity onPress={() => retry.mutate(item.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={styles.retryText}>Retry Delivery</Text>
          </TouchableOpacity>
        )}
      </View>

      {actionsOpen ? (
        <View style={styles.notifActions}>
          <TouchableOpacity
            style={styles.notifActionBtn}
            onPress={() => { archive.mutate(item.id); setActionsOpen(false); }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="archive-outline" size={18} color={COLORS.muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notifActionBtn}
            onPress={() => { remove.mutate(item.id); setActionsOpen(false); }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="delete-outline" size={18} color={COLORS.dangerAccent} />
          </TouchableOpacity>
        </View>
      ) : (
        <Tooltip label="Actions" placement="left">
          <TouchableOpacity style={styles.menuBtn} onPress={() => setActionsOpen(true)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Icon name="dots-vertical" size={20} color={COLORS.muted} />
          </TouchableOpacity>
        </Tooltip>
      )}
    </TouchableOpacity>
  );
};

function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const NotificationPreferencesModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  COLORS: ReturnType<typeof useThemeColors>;
}> = ({ visible, onClose, COLORS }) => {
  const { isDesktopWeb } = useResponsive();
  const styles = makePrefStyles(COLORS, isDesktopWeb);
  const { data, isLoading, isError, refetch } = useMyNotificationPreferences();
  const update = useUpdateMyNotificationPreference();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>My Notifications</Text>
          <Text style={styles.sheetSub}>
            Choose what reaches this account. Anything addressed to you personally — a task
            assigned to you, your own approval's outcome — always comes through.
          </Text>

          {isError ? (
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>Couldn't load — tap to retry</Text>
            </TouchableOpacity>
          ) : isLoading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={COLORS.accent} />
          ) : (
            <ScrollView style={{ maxHeight: 380 }}>
              {(data ?? []).map((p) => (
                <View key={p.category} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{notificationCategoryLabel(p.category)}</Text>
                    {!p.enabledForCafe && (
                      <Text style={styles.rowNote}>Switched off for the whole cafe by an owner</Text>
                    )}
                  </View>
                  <Switch
                    // Forced visually off when the cafe-wide switch is off: the personal
                    // preference row still exists and is honoured the moment the cafe turns
                    // the category back on, but showing it as "on" here would promise
                    // notifications that can't arrive.
                    value={p.enabled && p.enabledForCafe}
                    disabled={!p.enabledForCafe || update.isPending}
                    onValueChange={() => update.mutate({ category: p.category, enabled: !p.enabled })}
                    trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Inside the Modal, not at the screen root — on native a Modal is its own
            window, so an overlay outside it would be painted underneath. */}
        <LoadingOverlay visible={update.isPending} message="Saving…" />
      </View>
    </Modal>
  );
};

const makePrefStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: isDesktopWeb ? 460 : 400, backgroundColor: COLORS.cardAlt, borderRadius: RADIUS.modal, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: COLORS.heading },
  sheetSub: { fontSize: 12, color: COLORS.muted, marginTop: 6, marginBottom: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: COLORS.heading },
  rowNote: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  retryBtn: { paddingVertical: 20, alignItems: 'center' },
  retryText: { fontSize: 13, color: COLORS.dangerAccent, fontWeight: '600' },
  doneBtn: { marginTop: 14, backgroundColor: COLORS.accent, borderRadius: RADIUS.button, paddingVertical: 12, alignItems: 'center' },
  doneText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});

type FilterTab = 'ALL' | 'UNREAD' | 'ARCHIVED';

export const NotificationCenterScreen: React.FC = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const [tab, setTab] = useState<FilterTab>('ALL');
  const [prefsOpen, setPrefsOpen] = useState(false);

  const filtered = notifications.filter((n) => {
    if (tab === 'UNREAD') return !n.isRead && !n.isArchived;
    if (tab === 'ARCHIVED') return n.isArchived;
    return !n.isArchived;
  });

  return (
    <View style={styles.container}>
      <DesktopPageHeader
        icon="bell-outline"
        title="Notifications"
        right={(
          <>
            {unreadCount > 0 && (
              <Tooltip label="Mark all read" placement="bottom">
                <TouchableOpacity style={styles.headerIconBtn} onPress={() => markAllRead.mutate()}>
                  <Icon name="check-all" size={22} color={COLORS.heading} />
                </TouchableOpacity>
              </Tooltip>
            )}
            <Tooltip label="Notification settings" placement="bottom">
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => setPrefsOpen(true)}>
                <Icon name="cog-outline" size={22} color={COLORS.heading} />
              </TouchableOpacity>
            </Tooltip>
          </>
        )}
      />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="bell-outline" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>
            {`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </Text>
          <View style={{ flex: 1 }} />
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => markAllRead.mutate()}>
              <Icon name="check-all" size={22} color={COLORS.heading} />
            </TouchableOpacity>
          )}
          {/* Lives here rather than in Cafe Settings because these toggles are every staff
              member's own — and Cafe Settings ('Profile') is hidden from Waiter/Chef/KitchenStaff
              entirely (see permissions.ts's FLOOR_STAFF_HIDDEN_ROUTES), so floor staff could
              never have reached them there. */}
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setPrefsOpen(true)}>
            <Icon name="cog-outline" size={22} color={COLORS.heading} />
          </TouchableOpacity>
        </View>
      )}

      <NotificationPreferencesModal visible={prefsOpen} onClose={() => setPrefsOpen(false)} COLORS={COLORS} />

      <View style={styles.tabs}>
        {(['ALL', 'UNREAD', 'ARCHIVED'] as FilterTab[]).map((t) => {
          const active = tab === t;
          return (
            <TouchableOpacity key={t} style={[styles.tabChip, active && styles.tabChipActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                {t === 'ALL' ? 'All' : t === 'UNREAD' ? `Unread (${unreadCount})` : 'Archived'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isError && notifications.length === 0 ? (
        <ErrorState
          title="Couldn't load notifications"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <View style={styles.listContent}>
          <SkeletonList rows={6} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="bell-outline" title="No Notifications" description={tab === 'UNREAD' ? 'You are all caught up!' : 'Nothing to show here.'} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <NotificationItem item={item} COLORS={COLORS} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7 : 7.5 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  tabs: { flexDirection: 'row', padding: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 6 : 6 },
  tabChip: {
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 6 : 6,
    borderRadius: 999,
    backgroundColor: COLORS.chipBg,
  },
  tabChipActive: { backgroundColor: COLORS.chipActiveBg },
  tabChipText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.heading },
  tabChipTextActive: { color: '#FFFFFF' },
  listContent: { padding: isDesktopWeb ? 9 : 9 },
  notifItem: {
    flexDirection: 'row',
    padding: isDesktopWeb ? 9 : 9,
    borderRadius: RADIUS.card,
    marginBottom: isDesktopWeb ? 6 : 6,
    alignItems: 'flex-start',
  },
  notifIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isDesktopWeb ? 9 : 9,
    marginTop: isDesktopWeb ? 1 : 1.5,
  },
  notifBody: { flex: 1 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: isDesktopWeb ? 3 : 3 },
  notifTitle: { fontSize: 13, flex: 1, marginRight: isDesktopWeb ? 6 : 6, color: COLORS.heading },
  notifTime: { fontSize: 11, color: COLORS.muted },
  notifBody2: { fontSize: 12, lineHeight: 18, color: COLORS.muted },
  retryText: { fontSize: 12, fontWeight: '700', color: COLORS.dangerAccent, marginTop: 4.5 },
  menuBtn: { padding: 3 },
  notifActions: { flexDirection: 'row', gap: 3 },
  notifActionBtn: { padding: 3 },
});
