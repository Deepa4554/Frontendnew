import React, { useMemo, useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal, Share, Switch, ActivityIndicator, Alert, Linking } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useTables, useMenuOnlyQrToken, useDeliveryQrToken } from '../../../../core/api/hooks/useTables';
import { useMenuPdfStatus, useUploadMenuPdf, useToggleMenuPdf, useRemoveMenuPdf } from '../../../../core/api/hooks/useMenuPdf';
import { pickPdfAsDataUri } from '../../../../core/utils/pdfPicker';
import { ApiTable } from '../../../../core/api/tablesApi';
import { getPublicOrderBaseUrl } from '../../../../core/config/env';
import { SkeletonGrid } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { showToast } from '../../../../core/store/uiSlice';
import { AppDispatch } from '../../../../core/store';
import { downloadQrCard } from '../../../../core/utils/qrCard';
import { useSettings } from '../../../../core/api/hooks/useSettings';
import { getApiErrorMessage } from '../../../../core/network/api';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

export const QRMenuScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch<AppDispatch>();
  const { data: settings } = useSettings();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const { data: allTables = [], isLoading, isError, refetch } = useTables();
  const { data: menuOnlyToken } = useMenuOnlyQrToken();
  const { data: deliveryToken } = useDeliveryQrToken();
  const { data: pdfStatus } = useMenuPdfStatus();
  const uploadPdf = useUploadMenuPdf();
  const togglePdf = useToggleMenuPdf();
  const removePdf = useRemoveMenuPdf();
  const [selected, setSelected] = useState<ApiTable | null>(null);
  const [genericVisible, setGenericVisible] = useState(false);
  const [deliveryVisible, setDeliveryVisible] = useState(false);

  // When a PDF is uploaded AND switched on, the general (menu-only) QR redirects to it
  // server-side (see backend PublicOrderPageController) — so the same printed code now opens
  // the PDF instead of the live digital menu.
  const pdfMenuActive = !!pdfStatus?.hasPdf && !!pdfStatus?.enabled;
  // Preview opens the exact page a customer's scan lands on — the /order/{token} viewer that
  // renders the PDF in-browser (same as genericOrderUrl). Absolute origin so it opens as its
  // own page load, not an in-app XHR.
  const pdfPreviewUrl = menuOnlyToken ? `${getPublicOrderBaseUrl()}/order/${menuOnlyToken.token}` : null;

  const openUrl = (url: string) => {
    const win: any = typeof window !== 'undefined' ? window : null;
    if (win?.open) win.open(url, '_blank');
    else Linking.openURL(url).catch(() => dispatch(showToast({ message: 'Could not open the PDF', tone: 'warning' })));
  };

  const handleUploadPdf = async () => {
    try {
      const picked = await pickPdfAsDataUri();
      if (!picked) return;
      await uploadPdf.mutateAsync({ dataUri: picked.dataUri, fileName: picked.fileName });
      dispatch(showToast({ message: 'Menu PDF uploaded — general QR now opens it', tone: 'success' }));
    } catch (e) {
      dispatch(showToast({ message: e instanceof Error ? e.message : 'Could not upload the PDF', tone: 'warning' }));
    }
  };

  const handleTogglePdf = async (enabled: boolean) => {
    try {
      await togglePdf.mutateAsync(enabled);
    } catch (e) {
      dispatch(showToast({ message: e instanceof Error ? e.message : 'Could not update the setting', tone: 'warning' }));
    }
  };

  const handleRemovePdf = () => {
    const doRemove = async () => {
      try {
        await removePdf.mutateAsync();
        dispatch(showToast({ message: 'Menu PDF removed', tone: 'success' }));
      } catch (e) {
        dispatch(showToast({ message: e instanceof Error ? e.message : 'Could not remove the PDF', tone: 'warning' }));
      }
    };
    Alert.alert('Remove menu PDF?', 'The general QR will go back to showing the live digital menu.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doRemove },
    ]);
  };

  const formatPdfSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

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

  const [downloading, setDownloading] = useState<string | null>(null);

  /**
   * Saves the code as a printable card rather than a bare image — see qrCard.ts for why the
   * wording around the code is the part that actually gets it scanned.
   */
  const handleDownloadQr = async (key: string, url: string, heading: string, instruction: string) => {
    setDownloading(key);
    try {
      await downloadQrCard({
        url,
        heading,
        instruction,
        businessName: settings?.businessName ?? 'Our Cafe',
        fileLabel: heading,
      });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not build the QR card'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setDownloading(null);
    }
  };

  // A render function, not a component defined inline: a component declared in the body gets a
  // fresh identity every render, so React tears this down and rebuilds it each time — which
  // would restart the spinner the moment `downloading` changes it.
  const renderDownloadQr = ({ qrKey, url, heading, instruction }: { qrKey: string; url: string; heading: string; instruction: string }) => (
    <TouchableOpacity
      style={styles.downloadBtn}
      disabled={downloading !== null}
      onPress={() => handleDownloadQr(qrKey, url, heading, instruction)}
    >
      {downloading === qrKey ? (
        <ActivityIndicator size="small" color={COLORS.heading} />
      ) : (
        <Icon name="printer-outline" size={14} color={COLORS.heading} />
      )}
      {/* One action, not two: on web this opens the browser's print dialog, where printing and
          "Save as PDF" are both destinations in the same list; on a phone it writes the file and
          hands it to the share sheet, which offers Print alongside everything else. A separate
          "Download" button would run the identical code and just look like a choice. */}
      <Text style={styles.downloadBtnText}>Print / Save QR card</Text>
    </TouchableOpacity>
  );

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
            <Text style={styles.genericCardSub}>
              {pdfMenuActive ? 'PDF menu ON — scanning opens your uploaded PDF' : "Browse only — ordering still needs a table's own code"}
            </Text>
          </View>
          {pdfMenuActive && <Icon name="file-pdf-box" size={18} color="#FFFFFF" style={{ marginRight: 2 }} />}
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
              <CloseButton onPress={() => setSelected(null)} size={18} />
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

            {selected && renderDownloadQr({
              qrKey: `table-${selected.code}`,
              url: orderUrl(selected),
              heading: `Table ${selected.code}`,
              instruction: 'Point your phone camera at the code to see the menu and order from your seat.',
            })}

            <Text style={styles.hintText}>
              Opens a print-ready card — your cafe's name, the code, and "Scan to Order" under it.
              Send it straight to a printer, or pick "Save as PDF" in the same dialog.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={genericVisible} transparent animationType="fade" onRequestClose={() => setGenericVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>General Menu</Text>
              <CloseButton onPress={() => setGenericVisible(false)} size={18} />
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

            {genericOrderUrl && renderDownloadQr({
              qrKey: 'generic',
              url: genericOrderUrl,
              heading: 'Our Menu',
              instruction: 'Point your phone camera at the code to browse the full menu.',
            })}

            <Text style={styles.hintText}>
              Not tied to any table — guests can browse the menu and prices here, but ordering is
              still table-only. Good for a counter display, printed flyers, or handing to a guest
              while every table is full, so they can look at the menu before they're seated.
            </Text>

            <View style={styles.pdfSection}>
              <View style={styles.pdfHeaderRow}>
                <Icon name="file-pdf-box" size={20} color={COLORS.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pdfTitle}>PDF Menu</Text>
                  <Text style={styles.pdfSub} numberOfLines={1}>
                    {pdfStatus?.hasPdf ? `${pdfStatus.fileName} · ${formatPdfSize(pdfStatus.sizeBytes)}` : 'No PDF uploaded yet'}
                  </Text>
                </View>
                {pdfStatus?.hasPdf && (
                  togglePdf.isPending
                    ? <ActivityIndicator size="small" color={COLORS.accent} />
                    : <Switch value={pdfStatus.enabled} onValueChange={handleTogglePdf} />
                )}
              </View>

              <Text style={styles.pdfExplain}>
                {pdfMenuActive
                  ? 'This general QR now opens your PDF menu when scanned. Turn it off to go back to the live digital menu.'
                  : 'Upload a designed PDF and turn it on — the same general QR above will then open the PDF instead of the live menu. Table QRs are never affected.'}
              </Text>

              <View style={styles.pdfBtnRow}>
                <TouchableOpacity style={styles.pdfPrimaryBtn} onPress={handleUploadPdf} disabled={uploadPdf.isPending}>
                  {uploadPdf.isPending
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <>
                        <Icon name={pdfStatus?.hasPdf ? 'file-replace' : 'upload'} size={14} color="#FFFFFF" />
                        <Text style={styles.pdfPrimaryBtnText}>{pdfStatus?.hasPdf ? 'Replace' : 'Upload PDF'}</Text>
                      </>}
                </TouchableOpacity>

                {pdfStatus?.hasPdf && pdfPreviewUrl && (
                  <TouchableOpacity style={styles.pdfGhostBtn} onPress={() => openUrl(pdfPreviewUrl)}>
                    <Icon name="eye-outline" size={14} color={COLORS.heading} />
                    <Text style={styles.pdfGhostBtnText}>Preview</Text>
                  </TouchableOpacity>
                )}

                {pdfStatus?.hasPdf && (
                  <TouchableOpacity style={styles.pdfGhostBtn} onPress={handleRemovePdf} disabled={removePdf.isPending}>
                    <Icon name="trash-can-outline" size={14} color={COLORS.dangerAccent} />
                    <Text style={[styles.pdfGhostBtnText, { color: COLORS.dangerAccent }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deliveryVisible} transparent animationType="fade" onRequestClose={() => setDeliveryVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Home Delivery</Text>
              <CloseButton onPress={() => setDeliveryVisible(false)} size={18} />
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

            {deliveryOrderUrl && renderDownloadQr({
              qrKey: 'delivery',
              url: deliveryOrderUrl,
              heading: 'Home Delivery',
              instruction: 'Point your phone camera at the code to order for delivery to your address.',
            })}

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
  /* Outlined against Share's solid fill: both are useful, but sharing a link is the everyday
     action and printing the card is the once-per-table one. */
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: 7.5,
    width: '100%',
    marginBottom: 7.5,
  },
  downloadBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.heading },
  shareBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  hintText: { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 17 },
  pdfSection: {
    width: '100%',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.divider,
  },
  pdfHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pdfTitle: { fontSize: 13, fontWeight: '800', color: COLORS.heading },
  pdfSub: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  pdfExplain: { fontSize: 11, color: COLORS.muted, lineHeight: 16, marginTop: 8 },
  pdfBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pdfPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: 7.5,
    paddingHorizontal: 12,
    minWidth: 108,
  },
  pdfPrimaryBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  pdfGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 6,
    paddingVertical: 7.5,
    paddingHorizontal: 12,
  },
  pdfGhostBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
