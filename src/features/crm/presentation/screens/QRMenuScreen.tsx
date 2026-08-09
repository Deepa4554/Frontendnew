import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, Share } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useTables, useMenuOnlyQrToken, useDeliveryQrToken } from '../../../../core/api/hooks/useTables';
import { ApiTable } from '../../../../core/api/tablesApi';
import { getPublicOrderBaseUrl } from '../../../../core/config/env';
import { SkeletonGrid } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { showToast } from '../../../../core/store/uiSlice';
import { AppDispatch } from '../../../../core/store';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

export const QRMenuScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch<AppDispatch>();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const { data: allTables = [], isLoading, isError, refetch } = useTables();
  const { data: menuOnlyToken } = useMenuOnlyQrToken();
  const { data: deliveryToken } = useDeliveryQrToken();
  const [selected, setSelected] = useState<ApiTable | null>(null);
  const [genericVisible, setGenericVisible] = useState(false);
  const [deliveryVisible, setDeliveryVisible] = useState(false);

  // The cafe and table are never exposed in plain text — the URL carries only an
  // encrypted token (see backend QrTokenService) that the server decodes itself.
  const orderUrl = (table: ApiTable) => `${getPublicOrderBaseUrl()}/order/${table.qrToken}`;
  const genericOrderUrl = menuOnlyToken ? `${getPublicOrderBaseUrl()}/order/${menuOnlyToken.token}` : null;
  // Same page, same URL shape — the token itself is what puts it in delivery mode (see backend
  // QrTokenService.DeliveryTableCode), so nothing about this link gives away that it's special.
  const deliveryOrderUrl = deliveryToken ? `${getPublicOrderBaseUrl()}/order/${deliveryToken.token}` : null;

  // Every table gets a printed code, occupied or not — a scan on an occupied table
  // is handled by the guest-session JOIN flow server-side, so there's no need to
  // withhold the code based on live status.
  const zones = useMemo(() => Array.from(new Set(allTables.map((t) => t.zone))), [allTables]);

  // On desktop web, react-native-web's Share.share() rejects with "Share is not supported
  // in this browser" whenever window.navigator.share is unavailable (true of most desktop
  // browsers) — left uncaught, that surfaces as an unhandled-rejection runtime error.
  // Falling back to a clipboard copy keeps the button useful there instead of just erroring.
  const shareOrCopy = async (message: string, url: string) => {
    try {
      await Share.share({ message });
    } catch (err) {
      const notSupported = err instanceof Error && err.message.includes('not supported');
      if (!notSupported) return;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        dispatch(showToast({ message: 'Link copied to clipboard', tone: 'success' }));
      } else {
        dispatch(showToast({ message: 'Sharing is not supported on this device', tone: 'warning' }));
      }
    }
  };

  const handleShare = (table: ApiTable) => {
    shareOrCopy(`Order from Table ${table.code}: ${orderUrl(table)}`, orderUrl(table));
  };

  const handleShareGeneric = () => {
    if (genericOrderUrl) shareOrCopy(`Order our menu: ${genericOrderUrl}`, genericOrderUrl);
  };

  const handleShareDelivery = () => {
    if (deliveryOrderUrl) shareOrCopy(`Order home delivery: ${deliveryOrderUrl}`, deliveryOrderUrl);
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="qrcode" title="QR Ordering" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="qrcode" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>QR Ordering</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Icon name="qrcode-scan" size={22} color={COLORS.accent} />
          <Text style={styles.introText}>
            Every table has its own code below. Ordering is table-only; the general menu code is
            for browsing prices only, e.g. before a guest is seated.
          </Text>
        </View>

        <TouchableOpacity style={styles.genericCard} activeOpacity={0.85} onPress={() => setGenericVisible(true)}>
          <Icon name="silverware-fork-knife" size={22} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.genericCardTitle}>General Menu (No Table)</Text>
            <Text style={styles.genericCardSub}>Browse only — ordering still needs a table's own code</Text>
          </View>
          <Icon name="chevron-right" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.deliveryCard} activeOpacity={0.85} onPress={() => setDeliveryVisible(true)}>
          <Icon name="moped" size={22} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.genericCardTitle}>Home Delivery</Text>
            <Text style={styles.genericCardSub}>Customer orders to their address — no table needed</Text>
          </View>
          <Icon name="chevron-right" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {isError && allTables.length === 0 ? (
          <ErrorState
            title="Couldn't load tables"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {isLoading && <SkeletonGrid items={6} columns={2} />}

            {!isLoading && allTables.length === 0 && (
              <View style={styles.emptyState}>
                <Icon name="table-furniture" size={28} color={COLORS.muted} />
                <Text style={styles.emptyStateText}>No tables yet. Add tables from the Tables screen first.</Text>
              </View>
            )}

            {zones.map((zone) => (
              <View key={zone}>
                <Text style={styles.zoneTitle}>{zone.toUpperCase()}</Text>
                <View style={styles.grid}>
                  {allTables
                    .filter((t) => t.zone === zone)
                    .map((table) => (
                      <TouchableOpacity
                        key={table.id}
                        style={styles.tile}
                        activeOpacity={0.85}
                        onPress={() => setSelected(table)}
                      >
                        <View style={styles.tileQrBox}>
                          <QRCode value={orderUrl(table)} size={74} color={COLORS.heading} backgroundColor="#FFFFFF" />
                        </View>
                        <Text style={styles.tileCode}>{table.code}</Text>
                        <Text style={styles.tileSeats}>{table.seats} seats</Text>
                        {table.status !== 'empty' && (
                          <Text style={styles.tileOccupied}>Occupied</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Table {selected?.code}</Text>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrLarge}>
              {selected && <QRCode value={orderUrl(selected)} size={220} color={COLORS.heading} backgroundColor="#FFFFFF" />}
            </View>

            <Text style={styles.urlText} numberOfLines={2}>
              {selected ? orderUrl(selected) : ''}
            </Text>

            <TouchableOpacity style={styles.shareBtn} onPress={() => selected && handleShare(selected)}>
              <Icon name="share-variant" size={14} color="#FFFFFF" />
              <Text style={styles.shareBtnText}>Share Link</Text>
            </TouchableOpacity>

            <Text style={styles.hintText}>
              Print this code and place it on the table. Scanning opens the live menu for Table {selected?.code}.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={genericVisible} transparent animationType="fade" onRequestClose={() => setGenericVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>General Menu</Text>
              <TouchableOpacity onPress={() => setGenericVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrLarge}>
              {genericOrderUrl && <QRCode value={genericOrderUrl} size={220} color={COLORS.heading} backgroundColor="#FFFFFF" />}
            </View>

            <Text style={styles.urlText} numberOfLines={2}>
              {genericOrderUrl ?? ''}
            </Text>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShareGeneric}>
              <Icon name="share-variant" size={14} color="#FFFFFF" />
              <Text style={styles.shareBtnText}>Share Link</Text>
            </TouchableOpacity>

            <Text style={styles.hintText}>
              Not tied to any table — guests can browse the menu and prices here, but ordering is
              still table-only. Good for a counter display, printed flyers, or handing to a guest
              while every table is full, so they can look at the menu before they're seated.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={deliveryVisible} transparent animationType="fade" onRequestClose={() => setDeliveryVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Home Delivery</Text>
              <TouchableOpacity onPress={() => setDeliveryVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrLarge}>
              {deliveryOrderUrl && <QRCode value={deliveryOrderUrl} size={220} color={COLORS.heading} backgroundColor="#FFFFFF" />}
            </View>

            <Text style={styles.urlText} numberOfLines={2}>
              {deliveryOrderUrl ?? ''}
            </Text>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShareDelivery}>
              <Icon name="share-variant" size={14} color="#FFFFFF" />
              <Text style={styles.shareBtnText}>Share Link</Text>
            </TouchableOpacity>

            <Text style={styles.hintText}>
              Print this on flyers, packaging or a shopfront board. Scanning it opens the menu with
              an address box, so the order arrives as a delivery with the customer's location
              attached. Orders appear under Takeaway &amp; Delivery, where you set a prep time and
              book a rider — nothing is dispatched on its own.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingBottom: isDesktopWeb ? 9 : 9,
  },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  scrollContent: { paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 28 : 30 },
  introCard: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 7 : 7.5,
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    marginBottom: isDesktopWeb ? 14 : 15,
  },
  introText: { flex: 1, fontSize: isDesktopWeb ? 13 : 12, color: COLORS.heading, lineHeight: 19 },
  genericCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    backgroundColor: COLORS.button,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 14 : 15,
  },
  // Same card as the general-menu one, in the accent colour so the two aren't mistaken for
  // each other on a glance — one only browses, the other takes real orders and money.
  deliveryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 14 : 15,
  },
  genericCardTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  genericCardSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: isDesktopWeb ? 2 : 1.5 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 28 : 30, gap: isDesktopWeb ? 7 : 7.5 },
  emptyStateText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, textAlign: 'center', paddingHorizontal: isDesktopWeb ? 14 : 15 },
  zoneTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 14 : 15,
  },
  tile: {
    width: '47%',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    alignItems: 'center',
  },
  tileQrBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: isDesktopWeb ? 4 : 4.5,
    marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  tileCode: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: '800', color: COLORS.heading },
  tileSeats: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  tileOccupied: { fontSize: 11, fontWeight: '700', color: COLORS.dangerAccent, marginTop: isDesktopWeb ? 3 : 3 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 17 : 18,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 12 : 12,
    overflow: 'hidden',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading },
  qrLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 10 : 10.5,
  },
  urlText: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 9,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 7.5,
    width: '100%',
    marginBottom: 7.5,
  },
  shareBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  hintText: { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 17 },
});
