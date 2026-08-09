import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RootState } from '../../../../../core/store/rootReducer';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { useOrders, useAdvanceOrder, useAdvanceUnits, useBulkAdvance, useRushForecast } from '../../../../../core/api/hooks/useOrders';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { useStations } from '../../../../../core/api/hooks/useStations';
import { OrderStatus, ApiOrder, OrderItem, FireBatch, STAGE_FLOW, unitsAtStage } from '../../../../../core/api/ordersApi';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { VegNonVegBadge } from '../../../../../shared/components/atoms/VegNonVegBadge';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import { getKdsDefaultStation, saveKdsDefaultStation, getKdsLocked, saveKdsLocked } from '../../../../../core/kds/kdsDeviceSettings';
import { GlobalSearchTrigger } from '../../../../../shared/components/search/GlobalSearchTrigger';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

// The action that advances a unit OUT of each stage (its label on the button).
const ACTION_LABEL: Record<OrderStatus, string> = {
  NEW: 'Start Preparing',
  READ: 'Start Preparing',  // Fallback (READ stage skipped)
  PREPARING: 'Mark Ready',
  READY: 'Mark Served',
  SERVED: '',
};

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Live mm:ss since firedAt, ticking inside this one leaf component — replaces the
 * screen-level 1-second setNow tick that re-rendered every ticket on every beat, which
 * was the KDS's single biggest render cost. Only this Text re-renders per second now. */
const ElapsedTimer = React.memo(({ firedAt, color, style }: { firedAt: string; color: string; style: object }) => {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  return <Text style={[style, { color }]}>{fmtElapsed(Date.now() - new Date(firedAt).getTime())}</Text>;
});

/** The header's HH:MM wall clock, self-ticking for the same reason as ElapsedTimer. */
const WallClock = React.memo(({ style }: { style: object }) => {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  return <Text style={style}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>;
});

/** Per-station status breakdown for a ticket's items — mirrors the backend's
 * RecomputeBatchStatus rollup (least-progressed active item, else SERVED) but scoped to
 * each station's own subset of lines, so a multi-station KOT can show "Tandoor: Ready,
 * Chinese: Preparing" instead of only the whole-ticket combined status. */
const groupByStationStatus = (items: OrderItem[]): { station: string; status: OrderStatus }[] => {
  const byStation = new Map<string, OrderItem[]>();
  for (const it of items) {
    const list = byStation.get(it.stationName) ?? [];
    list.push(it);
    byStation.set(it.stationName, list);
  }
  return Array.from(byStation.entries()).map(([station, lines]) => {
    const active = lines.filter((l) => l.status !== 'SERVED');
    if (active.length === 0) return { station, status: 'SERVED' as OrderStatus };
    const status = active.reduce((worst, l) =>
      STAGE_FLOW.indexOf(l.status) < STAGE_FLOW.indexOf(worst) ? l.status : worst, active[0].status);
    return { station, status };
  });
};

type ViewMode = 'kot' | 'production' | 'item_wise_kot';
type KdsTicket = { order: ApiOrder; batch: FireBatch; items: OrderItem[] };
type PendingStage = 'NEW' | 'PREPARING' | 'READY';
const PENDING_STAGES: PendingStage[] = ['NEW', 'PREPARING', 'READY'];
// One Production-View row: a dish summed across every KOT, broken down by stage —
// no single "active stage" filter anymore, so every not-yet-served unit is included.
type ProdGroup = {
  menuItemId: number;
  name: string;
  vegNonVegType?: OrderItem['vegNonVegType'];
  byStage: Record<PendingStage, number>;
  lines: { orderId: number; itemId: number; tableLabel: string; kotNumber: string; qtyByStage: Record<PendingStage, number> }[];
};
// Item-wise KOT view: items grouped by name with KOT references
type ItemWiseKotGroup = {
  menuItemId: number;
  name: string;
  vegNonVegType?: OrderItem['vegNonVegType'];
  totalQty: number;
  items: { orderId: number; itemId: number; tableLabel: string; kotNumber: string; status: OrderStatus; qty: number }[];
};

export const KDSScreen = () => {
  const navigation = useNavigation<any>();
  const COLORS = useThemeColors();
  const { isDesktopWeb, isTablet } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb, isTablet);
  const insets = useSafeAreaInsets();
  // Shared status color language across all three views (New/Preparing/Ready) — a ticket
  // or item's own current stage always reads the same color everywhere in the screen.
  const STATUS_COLOR: Record<OrderStatus, string> = {
    NEW: COLORS.accent,
    READ: COLORS.accent,
    PREPARING: COLORS.warning,
    READY: COLORS.success,
    SERVED: COLORS.muted,
  };
  // A KOT sitting this long in New/Preparing is flagged urgent (red) regardless of its
  // stage — Ready tickets are done cooking so aging doesn't apply to them.
  const KOT_AGING_THRESHOLD_MS = 10 * 60 * 1000;

  const { data: ordersPage, isLoading: ordersLoading } = useOrders({ activeOnly: true, kdsReady: true });
  const { data: rushForecast } = useRushForecast();
  const { data: settings } = useSettings();
  const { data: stations = [], isSuccess: stationsLoaded } = useStations();
  // Which prep station's tickets/items this screen currently shows — 'ALL' (default) means
  // no filtering. Only worth showing the tab row once a cafe actually has >1 station set up.
  // Seeded from this device's persisted choice (see kdsDeviceSettings) so a terminal
  // mounted at one station keeps showing that station after every reload/logout.
  const [activeStation, setActiveStationState] = useState<string>(() => getKdsDefaultStation());
  const [stationLocked, setStationLocked] = useState<boolean>(() => getKdsLocked());
  const setActiveStation = (name: string) => {
    setActiveStationState(name);
    saveKdsDefaultStation(name);
  };
  const unlockStation = () => {
    confirmAlert('Unlock station?', `This terminal is locked to ${activeStation === 'ALL' ? 'All Stations' : activeStation}. Unlock to switch stations?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlock', onPress: () => { setStationLocked(false); saveKdsLocked(false); } },
    ]);
  };
  const lockStation = () => { setStationLocked(true); saveKdsLocked(true); };
  const stationNames = useMemo(() => stations.filter((s) => s.active).map((s) => s.name), [stations]);

  // Per-USER kitchen pin (see AppUser.AssignedStationId / Staff Profile's Kitchen
  // Assignment) — an Owner/Manager setting so a Chef/KitchenStaff login always opens
  // straight to their own kitchen on ANY device, no manual tab switching. Distinct from
  // the per-DEVICE lock above (stationLocked): that's "this tablet only ever shows
  // Tandoor", this is "this person only ever sees Tandoor". Owner logins are never
  // pinned. Takes priority over the device's own remembered station whenever present.
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const pinnedStationName = useMemo(() => {
    if (!currentUser || currentUser.role === 'Owner' || currentUser.assignedStationId == null) return null;
    return stations.find((s) => s.id === currentUser.assignedStationId)?.name ?? null;
  }, [currentUser, stations]);
  useEffect(() => {
    // setActiveStationState (not the wrapped setActiveStation) — a server-side pin must
    // never overwrite this device's own remembered station in storage, since a
    // different, unpinned staff member may log into the same device next.
    if (pinnedStationName && activeStation !== pinnedStationName) setActiveStationState(pinnedStationName);
  }, [pinnedStationName]);
  // The remembered station (see kdsDeviceSettings) only means anything for the tenant it
  // was saved under. Logging into a DIFFERENT cafe on the same device leaves a stale
  // station name that matches nothing here — every ticket silently fails matchesStation
  // below, showing "0 active" with no visible cause (the station-tab row that would let
  // someone notice/reset it only renders once a cafe has >1 station). Once this tenant's
  // real station list is in, drop back to 'ALL' the moment the remembered one doesn't
  // exist in it, same as this device never had a station saved at all.
  useEffect(() => {
    // Exclude the server-side pin: an assigned station that's since been deactivated
    // still isn't in stationNames (filtered to .active), but the pin effect above
    // legitimately wants it applied — don't fight that.
    if (stationsLoaded && activeStation !== 'ALL' && activeStation !== pinnedStationName && !stationNames.includes(activeStation)) {
      setActiveStation('ALL');
    }
  }, [stationsLoaded, stationNames, activeStation, pinnedStationName]);
  // Owner-configurable (Settings → Kitchen Flow): 2-step skips the Preparing tap/column
  // entirely — a New item/KOT jumps straight to Ready in one tap instead of two.
  const twoStage = settings?.kdsStageMode === 'TWO_STAGE';
  const actionLabelFor = (status: OrderStatus) => (status === 'NEW' && twoStage ? 'Mark Ready' : ACTION_LABEL[status]);
  const orders = ordersPage?.items ?? [];
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (ordersPage && !hasLoadedOnce) setHasLoadedOnce(true);
  }, [ordersPage, hasLoadedOnce]);

  const advanceOrder = useAdvanceOrder();
  const advanceUnits = useAdvanceUnits();
  const bulkAdvance = useBulkAdvance();

  // Per-button in-flight tracking (a card can have several advances at once).
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const runPending = async (key: string, fn: () => Promise<unknown>) => {
    if (pendingKeys.has(key)) return;
    setPendingKeys((prev) => new Set(prev).add(key));
    try { await fn(); } catch { /* advance never surfaced errors */ } finally {
      setPendingKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const [viewMode, setViewMode] = useState<ViewMode>('kot');

  // One ticket per (order, non-served fire batch). A KOT is always ONE card even when its
  // items sit at different stages — the card lives in the column of its least-progressed item.
  const matchesStation = (it: OrderItem) => activeStation === 'ALL' || it.stationName === activeStation;

  const tickets: KdsTicket[] = useMemo(() => orders.flatMap((order) =>
    order.fireBatches
      .filter((b) => b.status !== 'SERVED')
      .map((batch) => ({ order, batch, items: order.items.filter((it) => it.fireBatch === batch.batchNumber && matchesStation(it)) }))
      .filter((t) => t.items.length > 0)
  ), [orders, activeStation]);

  // Urgent (aging) flags, still checked every second — same 1s granularity the old
  // whole-screen `setNow` tick had — but setState only fires when a ticket actually
  // crosses the threshold (membership change), so the screen no longer re-renders
  // every beat just to keep timers moving (ElapsedTimer handles those itself).
  const [urgentKeys, setUrgentKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const compute = () => {
      const next = new Set<string>();
      tickets.forEach((t) => {
        if (t.batch.status !== 'READY' && Date.now() - new Date(t.batch.firedAt).getTime() > KOT_AGING_THRESHOLD_MS)
          next.add(`${t.order.id}-${t.batch.batchNumber}`);
      });
      setUrgentKeys((prev) => (prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next));
    };
    compute();
    const t = setInterval(compute, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  // KOT-view tab counts = KOT cards whose overall stage is that stage.
  const kotCounts = useMemo(() => {
    const c: Record<OrderStatus, number> = { NEW: 0, READ: 0, PREPARING: 0, READY: 0, SERVED: 0 };
    tickets.forEach((t) => { c[t.batch.status] = (c[t.batch.status] ?? 0) + 1; });
    return c;
  }, [tickets]);

  // Production-view tab counts = total units at that stage across every fired line.
  const unitCounts = useMemo(() => {
    const c: Record<OrderStatus, number> = { NEW: 0, READ: 0, PREPARING: 0, READY: 0, SERVED: 0 };
    orders.forEach((o) => o.items.filter((it) => it.fireBatch > 0 && matchesStation(it)).forEach((it) => {
      STAGE_FLOW.forEach((s) => { c[s] += unitsAtStage(it, s); });
    }));
    return c;
  }, [orders, activeStation]);

  // CRITICAL: item-wise KOT view must use unitCounts, not kotCounts
  const counts = viewMode === 'production' || viewMode === 'item_wise_kot' ? unitCounts : kotCounts;

  // KOT View shows every active ticket together (no stage tabs) — newest first, so a
  // freshly fired order is immediately visible at the top instead of buried below
  // whatever's already been sitting in the queue.
  const allTicketsSorted = useMemo(
    () => [...tickets].sort((a, b) => new Date(b.batch.firedAt).getTime() - new Date(a.batch.firedAt).getTime()),
    [tickets],
  );

  // Production groups: every dish with ≥1 not-yet-served unit, broken down by stage —
  // no tab filter, so New/Preparing/Ready all show together (see byStage per card).
  const prodGroups: ProdGroup[] = useMemo(() => {
    const map = new Map<number, ProdGroup>();
    for (const order of orders) {
      for (const it of order.items) {
        if (it.fireBatch === 0 || !matchesStation(it)) continue;
        const qtyByStage: Record<PendingStage, number> = {
          NEW: unitsAtStage(it, 'NEW'), PREPARING: unitsAtStage(it, 'PREPARING'), READY: unitsAtStage(it, 'READY'),
        };
        if (qtyByStage.NEW + qtyByStage.PREPARING + qtyByStage.READY <= 0) continue;
        let g = map.get(it.menuItemId);
        if (!g) { g = { menuItemId: it.menuItemId, name: it.name, vegNonVegType: it.vegNonVegType, byStage: { NEW: 0, PREPARING: 0, READY: 0 }, lines: [] }; map.set(it.menuItemId, g); }
        PENDING_STAGES.forEach((s) => { g!.byStage[s] += qtyByStage[s]; });
        const batch = order.fireBatches.find((b) => b.batchNumber === it.fireBatch);
        g.lines.push({
          orderId: order.id,
          itemId: it.id,
          tableLabel: order.tableCode ? `Table ${order.tableCode}` : order.title,
          kotNumber: batch?.kotNumber ?? '',
          qtyByStage,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.byStage.NEW + b.byStage.PREPARING + b.byStage.READY) - (a.byStage.NEW + a.byStage.PREPARING + a.byStage.READY));
  }, [orders, activeStation]);

  // Item-wise KOT groups: every not-yet-served item line grouped by dish name, each
  // carrying its OWN real current status (not a tab filter) for its tap-to-advance pill.
  const itemWiseKotGroups: ItemWiseKotGroup[] = useMemo(() => {
    const map = new Map<number, ItemWiseKotGroup>();
    for (const order of orders) {
      for (const it of order.items) {
        if (it.fireBatch === 0 || !matchesStation(it)) continue;
        const q = unitsAtStage(it, 'NEW') + unitsAtStage(it, 'PREPARING') + unitsAtStage(it, 'READY');
        if (q <= 0) continue;
        let g = map.get(it.menuItemId);
        if (!g) { g = { menuItemId: it.menuItemId, name: it.name, vegNonVegType: it.vegNonVegType, totalQty: 0, items: [] }; map.set(it.menuItemId, g); }
        const batch = order.fireBatches.find((b) => b.batchNumber === it.fireBatch);
        g.totalQty += q;
        g.items.push({
          orderId: order.id,
          itemId: it.id,
          tableLabel: order.tableCode ? `Table ${order.tableCode}` : order.title,
          kotNumber: batch?.kotNumber ?? '',
          status: it.status,
          qty: q,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [orders, activeStation]);

  // ----- KOT View actions -----
  // In 2-step mode, a New KOT/item should jump straight to Ready — the backend only
  // ever advances one stage per call, so that's two chained calls instead of one.
  const advanceWholeBatch = (orderId: number, batchNumber: number, fromStatus: OrderStatus) =>
    runPending(`batch-${orderId}-${batchNumber}`, async () => {
      await advanceOrder.mutateAsync({ id: orderId, batchNumber });
      if (twoStage && fromStatus === 'NEW') await advanceOrder.mutateAsync({ id: orderId, batchNumber });
    });

  // Tapping an item's own status pill (KOT View and Items View both use this) advances
  // just that line one stage forward from wherever it currently sits — no checkbox/
  // selection step needed.
  const advanceItemOwnStage = (orderId: number, itemId: number, status: OrderStatus) => {
    if (status === 'SERVED') return;
    runPending(`item-${itemId}`, async () => {
      await advanceUnits.mutateAsync({ id: orderId, itemId, fromStage: status });
      if (twoStage && status === 'NEW') await advanceUnits.mutateAsync({ id: orderId, itemId, fromStage: 'PREPARING' });
    });
  };

  // ----- Production View popup -----
  const [prodPopup, setProdPopup] = useState<ProdGroup | null>(null);
  const [prodSelected, setProdSelected] = useState<Set<number>>(new Set());
  const [prodQty, setProdQty] = useState('');
  const [prodFifo, setProdFifo] = useState(true);
  // Which stage's units this popup is currently acting on — the card itself has no
  // single stage anymore (it shows the full New/Preparing/Ready breakdown), so the
  // popup asks once it's opened instead of inheriting an outer tab.
  const [prodStage, setProdStage] = useState<PendingStage>('NEW');
  const openProd = (g: ProdGroup) => {
    const defaultStage: PendingStage = g.byStage.NEW > 0 ? 'NEW' : g.byStage.PREPARING > 0 ? 'PREPARING' : 'READY';
    setProdPopup(g);
    setProdStage(defaultStage);
    setProdSelected(new Set(g.lines.filter((l) => l.qtyByStage[defaultStage] > 0).map((l) => l.itemId)));
    setProdQty(String(g.byStage[defaultStage]));
    setProdFifo(true);
  };
  const switchProdStage = (s: PendingStage) => {
    if (!prodPopup) return;
    setProdStage(s);
    setProdSelected(new Set(prodPopup.lines.filter((l) => l.qtyByStage[s] > 0).map((l) => l.itemId)));
    setProdQty(String(prodPopup.byStage[s]));
  };
  const closeProd = () => { setProdPopup(null); setProdSelected(new Set()); setProdQty(''); };
  const confirmProd = () => {
    if (!prodPopup) return;
    const g = prodPopup;
    // In 2-step mode, starting from New means jumping straight to Ready — same chained-
    // call approach as advanceWholeBatch/advanceItemOwnStage, reusing the exact same
    // qty/allocations for both hops since it's the same units moving twice.
    const secondHop = twoStage && prodStage === 'NEW';
    runPending(`prod-${g.menuItemId}`, async () => {
      if (prodFifo) {
        const qty = Math.min(g.byStage[prodStage], Math.max(0, parseInt(prodQty || '0', 10)));
        if (qty > 0) {
          await bulkAdvance.mutateAsync({ menuItemId: g.menuItemId, fromStage: prodStage, qty });
          if (secondHop) await bulkAdvance.mutateAsync({ menuItemId: g.menuItemId, fromStage: 'PREPARING', qty });
        }
      } else {
        const allocations = g.lines.filter((l) => prodSelected.has(l.itemId)).map((l) => ({ orderId: l.orderId, itemId: l.itemId, qty: l.qtyByStage[prodStage] }));
        if (allocations.length > 0) {
          await bulkAdvance.mutateAsync({ menuItemId: g.menuItemId, fromStage: prodStage, allocations });
          if (secondHop) await bulkAdvance.mutateAsync({ menuItemId: g.menuItemId, fromStage: 'PREPARING', allocations });
        }
      }
      closeProd();
    });
  };

  const totalActive = viewMode === 'production' ? unitCounts.NEW + unitCounts.PREPARING + unitCounts.READY : tickets.length;

  return (
    <View style={styles.container}>
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Icon name="chef-hat" size={24} color={COLORS.heading} />
          <Text style={styles.brandTitle} numberOfLines={1}>{settings?.businessName ?? 'PrabandhOS'}</Text>
          <GlobalSearchTrigger navigation={navigation} style={styles.searchBtn} />
          <View style={styles.clockPill}>
            <Icon name="clock-outline" size={14} color="#FFFFFF" />
            <WallClock style={styles.clockText} />
          </View>
        </View>
      )}
      <DesktopPageHeader
        icon="chef-hat"
        title="Kitchen"
        right={(
          <View style={styles.clockPill}>
            <Icon name="clock-outline" size={14} color="#FFFFFF" />
            <WallClock style={styles.clockText} />
          </View>
        )}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Mode toggle: KOT View (per-ticket) vs Item-wise KOT vs Production View (grouped dishes) */}
        <View style={[styles.modeRow, isDesktopWeb && { paddingHorizontal: 18 }]}>
          <TouchableOpacity style={[styles.modePill, viewMode === 'kot' && styles.modePillActive]} onPress={() => setViewMode('kot')}>
            <Icon name="receipt" size={15} color={viewMode === 'kot' ? '#FFFFFF' : COLORS.heading} />
            <Text style={[styles.modeText, viewMode === 'kot' && styles.modeTextActive]}>KOT View</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modePill, viewMode === 'item_wise_kot' && styles.modePillActive]} onPress={() => setViewMode('item_wise_kot')}>
            <Icon name="clipboard-list-outline" size={15} color={viewMode === 'item_wise_kot' ? '#FFFFFF' : COLORS.heading} />
            <Text style={[styles.modeText, viewMode === 'item_wise_kot' && styles.modeTextActive]}>Items</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modePill, viewMode === 'production' && styles.modePillActive]} onPress={() => setViewMode('production')}>
            <Icon name="fire" size={15} color={viewMode === 'production' ? '#FFFFFF' : COLORS.heading} />
            <Text style={[styles.modeText, viewMode === 'production' && styles.modeTextActive]}>Production</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.totalPill}><Text style={styles.totalPillText}>{totalActive} active</Text></View>
        </View>

        {/* Station filter — only worth showing once this cafe has more than one prep
            station set up (Profile → Kitchen Stations). Filters every view below by
            OrderItem.stationName, the station snapshotted onto each line at fire time.
            Locking hides this row entirely so a permanently-mounted terminal (e.g. a
            tablet bolted up in the Tandoor section) can't get bumped to another
            station by a passing staff member. A per-user kitchen pin (see
            pinnedStationName above) takes over this row completely — no switching, no
            unlock, since only an Owner/Manager can change it, from Staff Profile. */}
        {stationNames.length > 1 && (
          pinnedStationName ? (
            <View style={[styles.modeRow, isDesktopWeb && { paddingHorizontal: 30 }]}>
              <View style={styles.lockedStationPill}>
                <Icon name="chef-hat" size={13} color={COLORS.muted} />
                <Text style={styles.modeText}>{pinnedStationName}</Text>
              </View>
            </View>
          ) : stationLocked ? (
            <View style={[styles.modeRow, isDesktopWeb && { paddingHorizontal: 30 }]}>
              <TouchableOpacity style={styles.lockedStationPill} onPress={unlockStation}>
                <Icon name="lock-outline" size={13} color={COLORS.muted} />
                <Text style={styles.modeText}>{activeStation === 'ALL' ? 'All Stations' : activeStation}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.modeRow, isDesktopWeb && { paddingHorizontal: 30 }]}>
              <TouchableOpacity style={[styles.stationPill, activeStation === 'ALL' && styles.stationPillActive]} onPress={() => setActiveStation('ALL')}>
                <Text style={[styles.modeText, activeStation === 'ALL' && styles.modeTextActive]}>All Stations</Text>
              </TouchableOpacity>
              {stationNames.map((name) => (
                <TouchableOpacity key={name} style={[styles.stationPill, activeStation === name && styles.stationPillActive]} onPress={() => setActiveStation(name)}>
                  <Text style={[styles.modeText, activeStation === name && styles.modeTextActive]}>{name}</Text>
                </TouchableOpacity>
              ))}
              {activeStation !== 'ALL' && (
                <TouchableOpacity style={styles.lockToggleBtn} onPress={lockStation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="lock-open-variant-outline" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
          )
        )}

        {/* Passive legend — counts only, not filters. Every view shows everything at
            once (see each item/ticket's own colored status pill) instead of tabbing
            between stages. */}
        <View style={[styles.kotLegendRow, isDesktopWeb && { paddingHorizontal: 18 }]}>
          <View style={styles.kotLegendItem}>
            <View style={[styles.kotLegendDot, { backgroundColor: STATUS_COLOR.NEW }]} />
            <Text style={styles.kotLegendText}>New · {counts.NEW}</Text>
          </View>
          <View style={styles.kotLegendItem}>
            <View style={[styles.kotLegendDot, { backgroundColor: STATUS_COLOR.PREPARING }]} />
            <Text style={styles.kotLegendText}>Preparing · {counts.PREPARING}</Text>
          </View>
          <View style={styles.kotLegendItem}>
            <View style={[styles.kotLegendDot, { backgroundColor: STATUS_COLOR.READY }]} />
            <Text style={styles.kotLegendText}>Ready · {counts.READY}</Text>
          </View>
        </View>

        {(ordersLoading && !hasLoadedOnce) ? (
          <SkeletonList rows={3} style={{ ...styles.ticketList, paddingTop: 4 }} />
        ) : viewMode === 'item_wise_kot' ? (
          // ---------------- ITEM-WISE KOT VIEW ----------------
          <View style={[styles.ticketList, isDesktopWeb && styles.ticketListDesktop]}>
            {itemWiseKotGroups.length === 0 && (
              <View style={styles.emptyBox}><Icon name="check-all" size={32} color={COLORS.muted} /><Text style={styles.emptyText}>No items pending right now.</Text></View>
            )}
            {itemWiseKotGroups.map((g) => (
              <View key={g.menuItemId} style={styles.ticketCard}>
                <View style={styles.ticketBody}>
                  <View style={styles.groupHeaderRow}>
                    {!!g.vegNonVegType && <VegNonVegBadge type={g.vegNonVegType} size={12} style={{ marginRight: 5 }} />}
                    <Text style={[styles.ticketId, styles.groupHeaderText]} numberOfLines={1} ellipsizeMode="tail">ITEM GROUP · {g.name}</Text>
                  </View>
                  <Text style={styles.ticketTitle} numberOfLines={1}>{g.totalQty}× total · {g.items.length} KOT{g.items.length === 1 ? '' : 's'}</Text>

                  <View style={[styles.itemsBox, { marginTop: 8 }]}>
                    {g.items.map((item) => {
                      const itemPending = pendingKeys.has(`item-${item.itemId}`);
                      const itemColor = STATUS_COLOR[item.status];
                      return (
                        <View key={item.itemId} style={styles.itemRow}>
                          <Text style={styles.itemName} numberOfLines={1} ellipsizeMode="tail">{item.qty}× {item.tableLabel} · KOT {item.kotNumber}</Text>
                          <TouchableOpacity
                            style={[styles.itemStatusPill, { backgroundColor: `${itemColor}22` }]}
                            onPress={() => advanceItemOwnStage(item.orderId, item.itemId, item.status)}
                            disabled={item.status === 'SERVED' || itemPending}
                            activeOpacity={0.6}
                          >
                            {itemPending ? (
                              <ActivityIndicator size="small" color={itemColor} />
                            ) : (
                              <Text style={[styles.itemStatusPillText, { color: itemColor }]}>{item.status}</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : viewMode === 'production' ? (
          // ---------------- PRODUCTION VIEW ----------------
          <View style={[styles.ticketList, isDesktopWeb && styles.ticketListDesktop]}>
            {prodGroups.length === 0 && (
              <View style={styles.emptyBox}><Icon name="check-all" size={32} color={COLORS.muted} /><Text style={styles.emptyText}>No dishes pending right now.</Text></View>
            )}
            {prodGroups.map((g) => {
              const total = g.byStage.NEW + g.byStage.PREPARING + g.byStage.READY;
              return (
                <TouchableOpacity key={g.menuItemId} style={[styles.prodCard, isDesktopWeb && styles.ticketCardDesktop]} onPress={() => openProd(g)} activeOpacity={0.8}>
                  <View style={styles.prodCardBody}>
                    <View style={styles.groupHeaderRow}>
                      {!!g.vegNonVegType && <VegNonVegBadge type={g.vegNonVegType} size={12} style={{ marginRight: 5 }} />}
                      <Text style={[styles.prodName, styles.groupHeaderText]} numberOfLines={1} ellipsizeMode="tail">{g.name}</Text>
                    </View>
                    <Text style={styles.prodMeta}>{g.lines.length} KOT{g.lines.length === 1 ? '' : 's'}</Text>
                    <View style={styles.prodBreakdownRow}>
                      {PENDING_STAGES.filter((s) => g.byStage[s] > 0).map((s) => (
                        <View key={s} style={styles.prodBreakdownItem}>
                          <View style={[styles.kotLegendDot, { backgroundColor: STATUS_COLOR[s] }]} />
                          <Text style={styles.prodBreakdownText}>{g.byStage[s]}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <Text style={styles.prodQty}>×{total}</Text>
                  <Icon name="chevron-right" size={22} color={COLORS.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          // ---------------- KOT VIEW ----------------
          <View style={[styles.ticketList, isDesktopWeb && styles.ticketListDesktop]}>
            {allTicketsSorted.length === 0 && (
              <View style={styles.emptyBox}><Icon name="check-all" size={32} color={COLORS.muted} /><Text style={styles.emptyText}>No active KOTs right now.</Text></View>
            )}
            {allTicketsSorted.map((t) => {
              const { order, batch, items } = t;
              const key = `${order.id}-${batch.batchNumber}`;
              const action = actionLabelFor(batch.status);
              const pending = pendingKeys.has(`batch-${key}`);
              const urgent = urgentKeys.has(key);
              const cardColor = urgent ? COLORS.dangerAccent : STATUS_COLOR[batch.status];
              const stageSet = new Set<OrderStatus>();
              items.forEach((it) => STAGE_FLOW.forEach((s) => { if (unitsAtStage(it, s) > 0) stageSet.add(s); }));
              const mixed = stageSet.size > 1;
              const stationBreakdown = groupByStationStatus(items);
              const multiStation = stationBreakdown.length > 1;
              return (
                <View key={key} style={[styles.kotCard, { borderColor: cardColor }, isDesktopWeb && styles.ticketCardDesktop]}>
                  <View style={[styles.kotCardHeader, { backgroundColor: `${cardColor}18` }]}>
                    <View style={styles.ticketHeaderLeft}>
                      <Text style={[styles.ticketTitle, { color: cardColor }]} numberOfLines={1} ellipsizeMode="tail">
                        KOT {batch.kotNumber}{order.tableCode ? ` · Table ${order.tableCode}` : ` · ${order.title}`}
                      </Text>
                      {!!(order.servedByName ?? order.createdByName) && (
                        <Text style={styles.ticketWaiter} numberOfLines={1}>Captain: {order.servedByName ?? order.createdByName}</Text>
                      )}
                    </View>
                    <View style={[styles.timerBadge, { backgroundColor: `${cardColor}22` }]}>
                      <Icon name="timer-outline" size={12} color={cardColor} />
                      <ElapsedTimer firedAt={batch.firedAt} color={cardColor} style={styles.timerText} />
                    </View>
                  </View>

                  <View style={styles.ticketBody}>
                    {multiStation ? (
                      <View style={styles.stationBreakdownRow}>
                        {stationBreakdown.map(({ station, status }) => (
                          <View key={station} style={[styles.stationStatusChip, { backgroundColor: `${STATUS_COLOR[status]}22` }]}>
                            <View style={[styles.kotLegendDot, { backgroundColor: STATUS_COLOR[status] }]} />
                            <Text style={[styles.stationStatusChipText, { color: STATUS_COLOR[status] }]}>{station}: {status}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      mixed && <Text style={styles.progressText}>Mixed status</Text>
                    )}

                    <View style={styles.itemsBox}>
                      {items.map((it) => {
                        const itemPending = pendingKeys.has(`item-${it.id}`);
                        const itemColor = STATUS_COLOR[it.status];
                        return (
                          <View key={it.id}>
                            <View style={styles.itemRow}>
                              <View style={styles.itemNameRow}>
                                {!!it.vegNonVegType && <VegNonVegBadge type={it.vegNonVegType} size={11} style={{ marginRight: 4 }} />}
                                <Text style={styles.itemName} numberOfLines={1} ellipsizeMode="tail">
                                  {it.qty}× {it.name}{it.variantName ? ` (${it.variantName})` : ''}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={[styles.itemStatusPill, { backgroundColor: `${itemColor}22` }]}
                                onPress={() => advanceItemOwnStage(order.id, it.id, it.status)}
                                disabled={it.status === 'SERVED' || itemPending}
                                activeOpacity={0.6}
                              >
                                {itemPending ? (
                                  <ActivityIndicator size="small" color={itemColor} />
                                ) : (
                                  <Text style={[styles.itemStatusPillText, { color: itemColor }]}>{it.status}</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                            {/* Toppings/add-ons chosen for this line, above the free-text
                                note — the station has to see these to make the right thing. */}
                            {it.selectedModifiers?.map((m) => (
                              <Text key={m.modifierOptionId} style={styles.itemModifier}>
                                + {m.qty > 1 ? `${m.qty}x ` : ''}{m.name}
                              </Text>
                            ))}
                            {!!it.modifier && <Text style={styles.itemModifier}>– {it.modifier}</Text>}
                          </View>
                        );
                      })}
                    </View>

                    {!!action && (
                      <TouchableOpacity
                        style={[styles.advanceBtn, { backgroundColor: cardColor }, pending && { opacity: 0.7 }]}
                        onPress={() => advanceWholeBatch(order.id, batch.batchNumber, batch.status)}
                        disabled={pending}
                      >
                        {pending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                          <Text style={styles.advanceBtnText}>{action}</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ---------- Production bulk popup ---------- */}
      <Modal visible={!!prodPopup} transparent animationType="fade" onRequestClose={closeProd}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{prodPopup?.name}</Text>
              <TouchableOpacity onPress={closeProd} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Icon name="close" size={18} color={COLORS.muted} /></TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Pending at {prodStage.toLowerCase()}: {prodPopup?.byStage[prodStage] ?? 0}. {actionLabelFor(prodStage)}.</Text>

            {/* Which stage's units this action applies to — the card shows all three at
                once now, so the popup asks instead of inheriting an outer tab. */}
            {prodPopup && (
              <View style={styles.prodModeRow}>
                {PENDING_STAGES.filter((s) => prodPopup.byStage[s] > 0).map((s) => (
                  <TouchableOpacity key={s} style={[styles.prodModeBtn, prodStage === s && styles.prodModeBtnActive]} onPress={() => switchProdStage(s)}>
                    <Text style={[styles.prodModeText, prodStage === s && styles.prodModeTextActive]}>{s} ({prodPopup.byStage[s]})</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Mode: FIFO quantity vs manual KOT pick */}
            <View style={styles.prodModeRow}>
              <TouchableOpacity style={[styles.prodModeBtn, prodFifo && styles.prodModeBtnActive]} onPress={() => setProdFifo(true)}>
                <Text style={[styles.prodModeText, prodFifo && styles.prodModeTextActive]}>Quantity (FIFO)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.prodModeBtn, !prodFifo && styles.prodModeBtnActive]} onPress={() => setProdFifo(false)}>
                <Text style={[styles.prodModeText, !prodFifo && styles.prodModeTextActive]}>Pick KOTs</Text>
              </TouchableOpacity>
            </View>

            {prodFifo ? (
              <View style={styles.prodQtyRow}>
                <Text style={styles.prodQtyLabel}>Quantity</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput style={styles.prodQtyInput} value={prodQty} onChangeText={(x) => setProdQty(x.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.placeholder} />
                </View>
                <Text style={styles.prodFifoHint}>Oldest KOT first</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {prodPopup?.lines.filter((l) => l.qtyByStage[prodStage] > 0).map((l) => {
                  const on = prodSelected.has(l.itemId);
                  return (
                    <TouchableOpacity key={l.itemId} style={styles.prodLineRow} onPress={() => setProdSelected((prev) => { const n = new Set(prev); on ? n.delete(l.itemId) : n.add(l.itemId); return n; })}>
                      <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={16} color={on ? COLORS.accent : COLORS.muted} />
                      <Text style={styles.prodLineText}>{l.tableLabel} · KOT {l.kotNumber}</Text>
                      <Text style={styles.prodLineQty}>×{l.qtyByStage[prodStage]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity style={[styles.advanceBtn, { backgroundColor: STATUS_COLOR[prodStage], marginTop: 16 }, pendingKeys.has(`prod-${prodPopup?.menuItemId}`) && { opacity: 0.7 }]} onPress={confirmProd} disabled={pendingKeys.has(`prod-${prodPopup?.menuItemId}`)}>
              {pendingKeys.has(`prod-${prodPopup?.menuItemId}`) ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.advanceBtnText}>{actionLabelFor(prodStage)}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean, isTablet: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 16 : 12, paddingTop: isDesktopWeb ? 12 : 9, paddingBottom: isDesktopWeb ? 12 : 9 },
  brandTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.heading, flex: 1 },
  searchBtn: { padding: isDesktopWeb ? 6 : 4.5, marginRight: isDesktopWeb ? 8 : 6 },
  clockPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.button, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 8 : 7.5, paddingVertical: isDesktopWeb ? 5 : 4.5, gap: isDesktopWeb ? 5 : 4.5 },
  clockText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: isDesktopWeb ? 5 : 4.5, paddingHorizontal: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 8 : 7.5 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 4.5, backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 10 : 9, paddingVertical: isDesktopWeb ? 6 : 5.25 },
  modePillActive: { backgroundColor: COLORS.button },
  modeText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  modeTextActive: { color: '#FFFFFF' },
  stationPill: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 4.5, backgroundColor: COLORS.chipBg, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 10 : 9, paddingVertical: isDesktopWeb ? 6 : 5.25 },
  stationPillActive: { backgroundColor: COLORS.accent },
  lockedStationPill: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 4.5, backgroundColor: COLORS.chipBg, borderRadius: 20, paddingHorizontal: isDesktopWeb ? 11 : 10.5, paddingVertical: isDesktopWeb ? 6 : 6 },
  lockToggleBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.chipBg },
  totalPill: { backgroundColor: COLORS.cardAlt, borderRadius: 20, paddingHorizontal: isDesktopWeb ? 10 : 9, paddingVertical: isDesktopWeb ? 5 : 4.5 },
  totalPillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  ticketList: { paddingHorizontal: isDesktopWeb ? 16 : 12, gap: isDesktopWeb ? 10 : 7.5 },
  ticketListDesktop: { paddingHorizontal: isDesktopWeb ? 18 : 18, flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 11 : 12 },
  ticketCard: { flexDirection: 'row', backgroundColor: COLORS.cardAlt, borderRadius: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  // 2-up on a tablet-width browser, 3-up on real desktop — 31% cards were cramped
  // once the tablet content column shrank below what desktop's grid math assumed.
  ticketCardDesktop: { width: isTablet ? '48%' : '31%', alignSelf: 'flex-start' },
  ticketBody: { flex: 1, padding: isDesktopWeb ? 9 : 9 },
  // KOT View card — full colored border + tinted header instead of the thin accent strip,
  // so a ticket's status (and aging urgency) reads at a glance across the whole card.
  kotCard: { backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1.5, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  kotCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 7 : 7.5 },
  itemStatusPill: { borderRadius: 999, paddingHorizontal: isDesktopWeb ? 10 : 7.5, paddingVertical: isDesktopWeb ? 5 : 3.75, minWidth: 76, alignItems: 'center' },
  itemStatusPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  kotLegendRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 10 : 10.5, paddingHorizontal: isDesktopWeb ? 16 : 12, paddingBottom: isDesktopWeb ? 9 : 9 },
  kotLegendItem: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 4.5 },
  kotLegendDot: { width: 9, height: 9, borderRadius: 5 },
  kotLegendText: { fontSize: isDesktopWeb ? 12.5 : 12, fontWeight: '700', color: COLORS.muted },
  ticketHeaderLeft: { flex: 1, minWidth: 0, marginRight: isDesktopWeb ? 8 : 7.5 },
  ticketId: { fontSize: 11, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 1 : 0.75 },
  ticketTitle: { fontSize: isDesktopWeb ? 15 : 14, fontWeight: 'bold', color: COLORS.heading },
  ticketWaiter: { fontSize: 11, fontWeight: '600', color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 3 : 2.25, gap: isDesktopWeb ? 3 : 2.25 },
  timerText: { fontSize: 12, fontWeight: '700' },
  progressText: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.2, marginBottom: isDesktopWeb ? 5 : 4.5 },
  stationBreakdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 5 : 4.5, marginBottom: isDesktopWeb ? 6 : 6 },
  stationStatusChip: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 3.75, borderRadius: 999, paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 4 : 3 },
  stationStatusChipText: { fontSize: 10.5, fontWeight: '700' },
  itemsBox: { gap: isDesktopWeb ? 5 : 3.75 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: isDesktopWeb ? 6 : 6 },
  itemName: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '600', color: COLORS.heading, flexShrink: 1, flex: 1, minWidth: 0 },
  // Veg/non-veg badge + a group's dish name, used by all three KDS views (ITEM GROUP,
  // Production, and the per-line name inside a KOT card).
  groupHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  groupHeaderText: { flexShrink: 1, minWidth: 0 },
  itemModifier: { fontSize: 12, fontStyle: 'italic', color: COLORS.muted, marginTop: isDesktopWeb ? 1 : 0.75, marginLeft: isDesktopWeb ? 18 : 18 },
  advanceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 5 : 4.5, borderRadius: 6, paddingVertical: isDesktopWeb ? 8 : 7.5, marginTop: isDesktopWeb ? 8 : 7.5 },
  advanceBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: '#FFFFFF' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 48 : 45, gap: isDesktopWeb ? 8 : 7.5 },
  emptyText: { fontSize: isDesktopWeb ? 14 : 12, color: COLORS.muted },
  // Production view
  prodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 8, overflow: 'hidden', paddingRight: isDesktopWeb ? 9 : 9 },
  prodCardBody: { flex: 1, paddingVertical: isDesktopWeb ? 11 : 12, paddingLeft: isDesktopWeb ? 11 : 10.5 },
  prodName: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '800', color: COLORS.heading },
  prodMeta: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  prodBreakdownRow: { flexDirection: 'row', gap: isDesktopWeb ? 9 : 9, marginTop: isDesktopWeb ? 5 : 4.5 },
  prodBreakdownItem: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 3 },
  prodBreakdownText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  prodQty: { fontSize: isDesktopWeb ? 22 : 12, fontWeight: '800', marginRight: isDesktopWeb ? 5 : 4.5, color: COLORS.heading },
  // Production popup
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: isDesktopWeb ? 16 : 15 },
  modalSheet: { backgroundColor: COLORS.card, borderRadius: 12, padding: 10.5, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 14, fontWeight: '800', color: COLORS.heading },
  modalSub: { fontSize: 12, color: COLORS.muted, marginTop: 3, marginBottom: 6 },
  prodModeRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  prodModeBtn: { flex: 1, alignItems: 'center', backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingVertical: 5.25 },
  prodModeBtnActive: { backgroundColor: COLORS.button },
  prodModeText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  prodModeTextActive: { color: '#FFFFFF' },
  prodQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prodQtyLabel: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  prodQtyInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: 7.5, height: 34, minWidth: 80, fontSize: 16, fontWeight: '700', color: COLORS.heading, textAlign: 'center' },
  prodFifoHint: { fontSize: 11, color: COLORS.muted, flex: 1 },
  prodLineRow: { flexDirection: 'row', alignItems: 'center', gap: 7.5, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  prodLineText: { flex: 1, fontSize: 12, color: COLORS.heading },
  prodLineQty: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
});
