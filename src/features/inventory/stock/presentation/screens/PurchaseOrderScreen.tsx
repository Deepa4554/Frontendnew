import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Linking, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useInventory } from '../../../../../core/api/hooks/useInventory';
import { usePurchaseOrders, useCreatePurchaseOrder, useReceivePurchaseOrder, useCancelPurchaseOrder } from '../../../../../core/api/hooks/useInventory';
import { useVendors } from '../../../../../core/api/hooks/useVendors';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { buildWhatsAppPurchaseOrderUrl } from '../../../../../core/utils/whatsappShare';
import type { PurchaseOrder } from '../../../../../core/api/inventoryApi';
import { DatePickerModal, isValidDateISO } from '../../../../../shared/components/atoms/DatePickerModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

interface DraftLine {
  key: string;
  inventoryItemId: number | null;
  quantity: string;
  unitCost: string;
}

const emptyLine = (): DraftLine => ({ key: `${Date.now()}-${Math.random()}`, inventoryItemId: null, quantity: '', unitCost: '' });

/** Local draft per line while filling out the Receive modal, keyed by PurchaseItem id. */
interface ReceiveLine {
  receivedQuantity: string;
  unitCost: string;
  expiryDate: string;
}

export const PurchaseOrderScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const { data: inventory = [] } = useInventory();
  const { data: orders = [], isLoading, isError, refetch } = usePurchaseOrders();
  const { data: vendors = [] } = useVendors();
  const { data: settings } = useSettings();
  const createPurchaseOrder = useCreatePurchaseOrder();
  const receivePurchaseOrder = useReceivePurchaseOrder();
  const cancelPurchaseOrder = useCancelPurchaseOrder();

  const [formVisible, setFormVisible] = useState(false);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [pickerLineKey, setPickerLineKey] = useState<string | null>(null);
  const [vendorPickerVisible, setVendorPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<number, ReceiveLine>>({});
  const [receiveExpiryPickerLineKey, setReceiveExpiryPickerLineKey] = useState<number | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const openForm = () => {
    setVendorId(null);
    setSupplierName('');
    setNote('');
    setLines([emptyLine()]);
    setFormVisible(true);
  };

  const addLine = () => setLines((l) => [...l, emptyLine()]);
  const removeLine = (key: string) => setLines((l) => (l.length > 1 ? l.filter((row) => row.key !== key) : l));
  const updateLine = (key: string, patch: Partial<DraftLine>) => setLines((l) => l.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Expected cost is optional at order time — lines without one just don't count toward the estimate.
  const calculateLineTotal = (line: DraftLine): number => {
    const qty = parseFloat(line.quantity);
    const cost = parseFloat(line.unitCost);
    if (isNaN(qty) || isNaN(cost)) return 0;
    return qty * cost;
  };

  const totalAmount = lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
  const totalWithTax = totalAmount * 1.18;

  const submit = async () => {
    const validLines = lines.filter((l) => l.inventoryItemId !== null && l.quantity.trim() !== '');
    if (validLines.length === 0) {
      dispatch(showToast({ message: 'Add at least one ingredient with a quantity.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    for (const l of validLines) {
      const qty = parseFloat(l.quantity);
      if (isNaN(qty) || qty <= 0) {
        dispatch(showToast({ message: 'Every line needs a quantity greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      if (l.unitCost.trim() !== '') {
        const cost = parseFloat(l.unitCost);
        if (isNaN(cost) || cost < 0) {
          dispatch(showToast({ message: 'Expected unit cost must be a non-negative number.', icon: 'alert-circle-outline', tone: 'warning' }));
          return;
        }
      }
    }
    try {
      setSaving(true);
      await createPurchaseOrder.mutateAsync({
        vendorId: vendorId ?? undefined,
        supplierName: vendorId === null ? (supplierName.trim() || undefined) : undefined,
        note: note.trim() || undefined,
        items: validLines.map((l) => {
          const item = inventory.find((i) => i.id === l.inventoryItemId);
          return {
            inventoryItemId: l.inventoryItemId as number, quantity: parseFloat(l.quantity), unit: item?.unit ?? '',
            unitCost: l.unitCost.trim() !== '' ? parseFloat(l.unitCost) : undefined,
          };
        }),
      });
      setFormVisible(false);
      dispatch(showToast({ message: 'Order placed — send it to your vendor, then mark it received when the goods arrive.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save purchase order'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(false);
    }
  };

  const openReceive = (order: PurchaseOrder) => {
    const draft: Record<number, ReceiveLine> = {};
    order.items.forEach((item) => {
      draft[item.purchaseItemId] = {
        receivedQuantity: String(item.quantity),
        unitCost: item.unitCost !== null ? String(item.unitCost) : '',
        expiryDate: '',
      };
    });
    setReceiveLines(draft);
    setReceivingOrder(order);
  };

  const updateReceiveLine = (purchaseItemId: number, patch: Partial<ReceiveLine>) =>
    setReceiveLines((rl) => ({ ...rl, [purchaseItemId]: { ...rl[purchaseItemId], ...patch } }));

  const submitReceive = async () => {
    if (!receivingOrder) return;
    const entries = Object.entries(receiveLines);
    for (const [, line] of entries) {
      const qty = parseFloat(line.receivedQuantity);
      const cost = parseFloat(line.unitCost);
      if (isNaN(qty) || qty <= 0) {
        dispatch(showToast({ message: 'Received quantity must be greater than 0 for every line.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      if (isNaN(cost) || cost < 0) {
        dispatch(showToast({ message: 'Enter the actual unit cost for every line.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      if (line.expiryDate.trim() && !isValidDateISO(line.expiryDate.trim())) {
        dispatch(showToast({ message: 'Enter a valid expiry date in YYYY-MM-DD format.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
    }
    try {
      setReceiving(true);
      await receivePurchaseOrder.mutateAsync({
        id: receivingOrder.id,
        req: {
          items: entries.map(([purchaseItemId, line]) => ({
            purchaseItemId: Number(purchaseItemId),
            receivedQuantity: parseFloat(line.receivedQuantity),
            unitCost: parseFloat(line.unitCost),
            // Already ISO — DatePickerModal emits yyyy-MM-dd, which is what the API takes.
            expiryDate: line.expiryDate.trim() || undefined,
          })),
        },
      });
      setReceivingOrder(null);
      dispatch(showToast({ message: 'Purchase order received — stock levels updated.', icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save receipt'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setReceiving(false);
    }
  };

  const handleCancelOrder = (order: PurchaseOrder) => {
    Alert.alert(
      'Cancel this order?',
      `This drops the order to ${order.supplierName || 'this vendor'} — stock was never touched, so nothing needs reversing.`,
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingId(order.id);
              await cancelPurchaseOrder.mutateAsync(order.id);
              dispatch(showToast({ message: 'Order cancelled.', icon: 'close-circle-outline', tone: 'success' }));
            } catch (err) {
              dispatch(showToast({ message: getApiErrorMessage(err, 'Could not cancel order'), icon: 'alert-circle-outline', tone: 'danger' }));
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const filteredOrders = orders.filter(po => {
    // Hide cancelled by default
    if (po.status === 'CANCELLED' && !showCancelled) return false;

    // Hide orders older than 30 days by default
    if (!showAll && new Date(po.createdAt) < thirtyDaysAgo) return false;

    // Search filter
    return (po.supplierName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      po.id.toString().includes(searchText);
  });

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="truck-outline" title="Purchase Orders" onBack={() => navigation?.goBack?.()} />
      <View style={styles.searchBox}>
        <Icon name="magnify" size={16} color={COLORS.muted} />
        <View style={styles.searchInputWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by supplier or order #..."
            placeholderTextColor={COLORS.placeholder}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close-circle" size={16} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterBar}>
        <TouchableOpacity style={[styles.filterPill, showCancelled && styles.filterPillActive]} onPress={() => setShowCancelled(!showCancelled)}>
          <Icon name={showCancelled ? 'check-circle' : 'circle-outline'} size={12} color={showCancelled ? COLORS.accent : COLORS.muted} />
          <Text style={[styles.filterPillText, showCancelled && styles.filterPillTextActive]}>Cancelled</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterPill, showAll && styles.filterPillActive]} onPress={() => setShowAll(!showAll)}>
          <Icon name={showAll ? 'check-circle' : 'circle-outline'} size={12} color={showAll ? COLORS.accent : COLORS.muted} />
          <Text style={[styles.filterPillText, showAll && styles.filterPillTextActive]}>All time</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>


        {isError && filteredOrders.length === 0 ? (
          <ErrorState
            title="Couldn't load purchase orders"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
        <>
        {isLoading && (
          <View style={{ paddingHorizontal: 16 }}>
            <SkeletonList rows={4} />
          </View>
        )}
        {!isLoading && filteredOrders.length === 0 && (
          <View style={styles.emptyCard}>
            <Icon name={searchText ? "magnify" : "cart-outline"} size={28} color={COLORS.muted} />
            <Text style={styles.emptyText}>{searchText ? "No matching orders" : "No purchase orders yet."}</Text>
            <Text style={styles.emptyHint}>{searchText ? "Try a different search." : "Tap the + button to place your first order."}</Text>
          </View>
        )}

        {filteredOrders.map((po) => {
          const isOrdered = po.status === 'ORDERED';
          const isCancelled = po.status === 'CANCELLED';
          const waUrl = isOrdered && po.vendorPhone
            ? buildWhatsAppPurchaseOrderUrl({
                businessName: settings?.businessName ?? 'Business',
                poId: po.id,
                vendorName: po.supplierName || 'Vendor',
                vendorPhone: po.vendorPhone,
                items: po.items.map((i) => ({ name: i.inventoryItemName, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost ?? undefined })),
                note: po.note,
              })
            : null;
          return (
          <View key={po.id} testID={`po-card-${po.id}`} style={[styles.orderCard, isCancelled && styles.orderCardCancelled]}>
            <View style={styles.orderHeaderRow}>
              <Text style={styles.orderSupplier}>{po.supplierName || 'Unnamed supplier'}</Text>
              <View style={[styles.statusPill, isOrdered ? styles.statusPillOrdered : isCancelled ? styles.statusPillCancelled : styles.statusPillReceived]}>
                <Text style={[styles.statusPillText, isOrdered ? styles.statusTextOrdered : isCancelled ? styles.statusTextCancelled : styles.statusTextReceived]}>
                  {isOrdered ? 'Ordered' : isCancelled ? 'Cancelled' : 'Received'}
                </Text>
              </View>
            </View>
            <Text style={styles.orderDate}>{new Date(po.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
            {!!po.note && <Text style={styles.orderNote}>{po.note}</Text>}
            {po.items.map((item, idx) => (
              <View key={idx} style={styles.orderLineRow}>
                <Text style={styles.orderLineName}>
                  {item.inventoryItemName}{item.expiryDate ? ` (exp. ${item.expiryDate})` : ''}
                </Text>
                <Text style={styles.orderLineQty}>
                  {isOrdered
                    ? `${item.quantity}${item.unit}${item.unitCost !== null ? ` × ₹${item.unitCost.toFixed(2)} (est.)` : ''}`
                    : `${item.receivedQuantity ?? item.quantity}${item.unit}${item.unitCost !== null ? ` × ₹${item.unitCost.toFixed(2)}` : ''}`}
                </Text>
              </View>
            ))}
            <View style={styles.orderFooterRow}>
              <Text style={styles.orderCreatedBy}>
                {isOrdered || isCancelled ? `Ordered by ${po.createdByName}` : `Received by ${po.receivedByName ?? po.createdByName}`}
              </Text>
            </View>
            {isOrdered && (
              <View style={styles.actionRow}>
                {!!waUrl && (
                  <TouchableOpacity testID="po-send-whatsapp" style={styles.waBtn} onPress={() => Linking.openURL(waUrl)}>
                    <Icon name="whatsapp" size={14} color="#25D366" />
                    <Text style={styles.waBtnText}>Send to vendor</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity testID="po-mark-received" style={styles.receiveBtn} onPress={() => openReceive(po)}>
                  <Icon name="check-circle" size={13} color="#FFFFFF" />
                  <Text style={styles.receiveBtnText}>Mark as Received</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="po-cancel-order" style={styles.cancelOrderBtn} onPress={() => handleCancelOrder(po)} disabled={cancellingId === po.id}>
                  {cancellingId === po.id ? <ActivityIndicator size="small" color={COLORS.dangerAccent} /> : <Text style={styles.cancelOrderBtnText}>Cancel</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
          );
        })}
        </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openForm} testID="po-fab">
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View testID="create-order-modal" style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Place Purchase Order</Text>
              <CloseButton onPress={() => setFormVisible(false)} size={18} />
            </View>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Vendor (optional)</Text>
              <TouchableOpacity style={styles.linePickerBtn} onPress={() => setVendorPickerVisible(true)}>
                <Text style={styles.linePickerText} numberOfLines={1}>
                  {vendorId !== null ? vendors.find((v) => v.id === vendorId)?.name ?? 'Select vendor...' : 'Select vendor...'}
                </Text>
                <Icon name="chevron-down" size={14} color={COLORS.muted} />
              </TouchableOpacity>

              {vendorId === null && (
                <>
                  <Text style={styles.fieldLabel}>Or type a one-off supplier name</Text>
                  <View style={styles.fieldInputWrap}>
                    <TextInput style={styles.fieldInput} placeholder="e.g. Local Roasters Co." placeholderTextColor={COLORS.placeholder} value={supplierName} onChangeText={setSupplierName} />
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>Note (optional)</Text>
              <View style={styles.fieldInputWrap}>
                <TextInput style={styles.fieldInput} placeholder="e.g. Weekly restock" placeholderTextColor={COLORS.placeholder} value={note} onChangeText={setNote} />
              </View>

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.fieldLabel}>Line items</Text>
                <TouchableOpacity style={styles.addRowBtn} onPress={addLine}>
                  <Icon name="plus" size={12} color={COLORS.accent} />
                  <Text style={styles.addRowText}>Add line</Text>
                </TouchableOpacity>
              </View>

              {lines.map((line) => {
                const ing = inventory.find((i) => i.id === line.inventoryItemId);
                return (
                  <View key={line.key} style={styles.lineGroup}>
                    <View style={styles.lineRow}>
                      <TouchableOpacity style={[styles.linePickerBtn, { flex: 1 }]} onPress={() => setPickerLineKey(line.key)}>
                        <Text style={styles.linePickerText} numberOfLines={1}>{ing ? ing.name : 'Select ingredient...'}</Text>
                        <Icon name="chevron-down" size={14} color={COLORS.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeLine(line.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Icon name="close-circle-outline" size={16} color={COLORS.dangerAccent} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.lineRow}>
                      <View style={styles.qtyInputWrap}>
                        <TextInput
                          style={styles.qtyInput}
                          placeholder={`Qty${ing ? ` (${ing.unit})` : ''}`}
                          placeholderTextColor={COLORS.placeholder}
                          keyboardType="decimal-pad"
                          value={line.quantity}
                          onChangeText={(t) => updateLine(line.key, { quantity: t.replace(/[^0-9.]/g, '') })}
                        />
                      </View>
                      <View style={styles.costInputWrap}>
                        <TextInput
                          style={styles.costInput}
                          placeholder="Expected ₹/unit (optional)"
                          placeholderTextColor={COLORS.placeholder}
                          keyboardType="decimal-pad"
                          value={line.unitCost}
                          onChangeText={(t) => updateLine(line.key, { unitCost: t.replace(/[^0-9.]/g, '') })}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}

              {totalAmount > 0 && (
                <View style={styles.totalsCard}>
                  <Text style={styles.totalsEstimateNote}>Estimate only — actual price is confirmed when the order is received.</Text>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Estimated Subtotal</Text>
                    <Text style={styles.totalValue}>₹{totalAmount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Tax (18% GST)</Text>
                    <Text style={styles.totalValue}>₹{(totalAmount * 0.18).toFixed(2)}</Text>
                  </View>
                  <View style={[styles.totalRow, styles.totalRowGrand]}>
                    <Text style={styles.totalLabelGrand}>Estimated Total</Text>
                    <Text style={styles.totalValueGrand}>₹{totalWithTax.toFixed(2)}</Text>
                  </View>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setFormVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="po-submit-create" style={styles.modalSaveBtn} onPress={submit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : (
                    <>
                      <Icon name="check" size={14} color="#FFFFFF" />
                      <Text style={styles.modalSaveText}>Place Order</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerLineKey !== null} transparent animationType="fade" onRequestClose={() => setPickerLineKey(null)}>
        <View style={styles.modalOverlay}>
          <View testID="ingredient-picker-modal" style={styles.pickerSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Select Ingredient</Text>
              <CloseButton onPress={() => setPickerLineKey(null)} size={18} />
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {inventory.map((i) => (
                <TouchableOpacity
                  key={i.id}
                  testID={`ingredient-row-${i.id}`}
                  style={styles.pickerRow}
                  onPress={() => { if (pickerLineKey) updateLine(pickerLineKey, { inventoryItemId: i.id }); setPickerLineKey(null); }}
                >
                  <Text style={styles.pickerRowText}>{i.name}</Text>
                  <Text style={styles.pickerRowSub}>{i.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setPickerLineKey(null)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={vendorPickerVisible} transparent animationType="fade" onRequestClose={() => setVendorPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View testID="vendor-picker-modal" style={styles.pickerSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Select Vendor</Text>
              <CloseButton onPress={() => setVendorPickerVisible(false)} size={18} />
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {vendors.length === 0 && <Text style={styles.emptyHint}>No vendors added yet — add one from the Vendors screen, or type a one-off supplier name below.</Text>}
              {vendors.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  testID={`vendor-row-${v.id}`}
                  style={styles.pickerRow}
                  onPress={() => { setVendorId(v.id); setSupplierName(''); setVendorPickerVisible(false); }}
                >
                  <Text style={styles.pickerRowText}>{v.name}</Text>
                  {!!v.phone && <Text style={styles.pickerRowSub}>{v.phone}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setVendorPickerVisible(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={receivingOrder !== null} transparent animationType="fade" onRequestClose={() => setReceivingOrder(null)}>
        <View style={styles.modalOverlay}>
          <View testID="receive-modal" style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Receive Order #{receivingOrder?.id}</Text>
              <CloseButton onPress={() => setReceivingOrder(null)} size={18} />
            </View>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.receiveHint}>Confirm what actually arrived — quantity, the vendor's real price, and expiry if it applies.</Text>

              {receivingOrder?.items.map((item) => {
                const line = receiveLines[item.purchaseItemId] ?? { receivedQuantity: '', unitCost: '', expiryDate: '' };
                return (
                  <View key={item.purchaseItemId} style={styles.lineGroup}>
                    <Text style={styles.receiveLineName}>{item.inventoryItemName} <Text style={styles.receiveLineOrdered}>(ordered {item.quantity}{item.unit})</Text></Text>
                    <View style={styles.lineRow}>
                      <View style={styles.qtyInputWrap}>
                        <TextInput
                          style={styles.qtyInput}
                          placeholder={`Received qty (${item.unit})`}
                          placeholderTextColor={COLORS.placeholder}
                          keyboardType="decimal-pad"
                          value={line.receivedQuantity}
                          onChangeText={(t) => updateReceiveLine(item.purchaseItemId, { receivedQuantity: t.replace(/[^0-9.]/g, '') })}
                        />
                      </View>
                      <View style={styles.costInputWrap}>
                        <TextInput
                          style={styles.costInput}
                          placeholder="Actual ₹/unit"
                          placeholderTextColor={COLORS.placeholder}
                          keyboardType="decimal-pad"
                          value={line.unitCost}
                          onChangeText={(t) => updateReceiveLine(item.purchaseItemId, { unitCost: t.replace(/[^0-9.]/g, '') })}
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.expiryInput, { justifyContent: 'center' }]}
                      onPress={() => setReceiveExpiryPickerLineKey(item.purchaseItemId)}
                    >
                      <Text style={{ fontSize: 12, color: line.expiryDate ? COLORS.heading : COLORS.placeholder, paddingTop: 2 }}>
                        {line.expiryDate || 'Expiry date (optional)'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setReceivingOrder(null)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="po-submit-receive" style={styles.modalSaveBtn} onPress={submitReceive} disabled={receiving}>
                  {receiving ? <ActivityIndicator color="#FFFFFF" /> : (
                    <>
                      <Icon name="check" size={14} color="#FFFFFF" />
                      <Text style={styles.modalSaveText}>Confirm Received</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={receiveExpiryPickerLineKey !== null}
        value={receiveExpiryPickerLineKey ? receiveLines[receiveExpiryPickerLineKey]?.expiryDate ?? '' : ''}
        title="Select Expiry Date"
        allowFutureDates={true}
        onCancel={() => setReceiveExpiryPickerLineKey(null)}
        onConfirm={(selectedDate) => {
          if (receiveExpiryPickerLineKey) {
            setReceiveLines((prev) => ({
              ...prev,
              [receiveExpiryPickerLineKey]: {
                ...prev[receiveExpiryPickerLineKey],
                expiryDate: selectedDate,
              },
            }));
            setReceiveExpiryPickerLineKey(null);
          }
        }}
      />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  searchInputWrap: { flex: 1, borderRadius: 6 },
  searchInput: { width: '100%', height: 36, backgroundColor: COLORS.cardAlt, borderRadius: 6, paddingHorizontal: 10, fontSize: 12, color: COLORS.heading, borderWidth: 1, borderColor: COLORS.inputBorder },
  filterBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.divider },
  filterPillActive: { backgroundColor: COLORS.successBg, borderColor: COLORS.success },
  filterPillText: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  filterPillTextActive: { color: COLORS.success },
  titleBox: { marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, padding: isDesktopWeb ? 13 : 13.5, marginBottom: isDesktopWeb ? 11 : 12, marginTop: isDesktopWeb ? 8 : 9 },
  title: { fontSize: isDesktopWeb ? 22 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 4 : 4.5 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 42 : 45, gap: isDesktopWeb ? 6 : 6, paddingHorizontal: isDesktopWeb ? 21 : 22.5 },
  emptyText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '600', color: COLORS.heading, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center' },
  orderCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 12, borderRadius: 8, padding: isDesktopWeb ? 10 : 10.5, marginBottom: isDesktopWeb ? 9 : 9 },
  orderCardCancelled: { opacity: 0.6 },
  orderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 3 : 3 },
  orderSupplier: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: COLORS.heading },
  orderDate: { fontSize: 11, color: COLORS.muted, marginBottom: 3 },
  orderNote: { fontSize: 11, color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 6, fontStyle: 'italic' },
  orderLineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: isDesktopWeb ? 3 : 3 },
  orderLineName: { fontSize: 12, color: COLORS.heading },
  orderLineQty: { fontSize: 12, color: COLORS.muted },
  orderCreatedBy: { fontSize: 10, color: COLORS.muted },
  orderFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: isDesktopWeb ? 4 : 4.5 },
  statusPill: { borderRadius: 8, paddingHorizontal: 7.5, paddingVertical: 3 },
  statusPillOrdered: { backgroundColor: COLORS.warningBg },
  statusPillReceived: { backgroundColor: COLORS.successBg },
  statusPillCancelled: { backgroundColor: COLORS.divider },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  statusTextOrdered: { color: COLORS.warning },
  statusTextReceived: { color: COLORS.success },
  statusTextCancelled: { color: COLORS.muted },
  actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9, marginTop: 7.5, paddingTop: 7.5, borderTopWidth: 1, borderTopColor: COLORS.divider },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 3 : 3 },
  waBtnText: { fontSize: 11, fontWeight: '700', color: '#25D366' },
  receiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4.5, backgroundColor: COLORS.button, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6 },
  receiveBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  cancelOrderBtn: { paddingHorizontal: 9, paddingVertical: 6 },
  cancelOrderBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.dangerAccent },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 9 : 9 },
  modalSheet: { width: '100%', maxWidth: 520, maxHeight: '85%', backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalFieldsScroll: { flexGrow: 0 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4 : 4.5 },
  // Wrapping View around each bare TextInput below — react-native-web's focus-ring CSS
  // rule (see index.html) rings whichever <div> is the DOM-level direct parent of the
  // raw <input>. Without a dedicated wrapper matching the input's own border-radius,
  // that parent ends up being the surrounding row/ScrollView container, so the ring
  // highlighted that entire container instead of just this input's box.
  fieldInputWrap: { borderRadius: 8 },
  fieldInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: 10, height: 34, fontSize: 12, color: COLORS.heading, borderWidth: 1, borderColor: COLORS.inputBorder },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: isDesktopWeb ? 7 : 7.5, marginBottom: isDesktopWeb ? 4 : 4.5 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 3 : 3 },
  addRowText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  lineGroup: { marginBottom: isDesktopWeb ? 6 : 6 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 4.5, marginBottom: isDesktopWeb ? 3 : 3 },
  expiryInputWrap: { borderRadius: 8 },
  expiryInput: {
    backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder,
    paddingHorizontal: isDesktopWeb ? 6 : 6, height: 32, fontSize: 12, color: COLORS.heading,
  },
  linePickerBtn: {
    flex: 1.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.cardAlt, borderRadius: 6, borderWidth: 1, borderColor: COLORS.inputBorder, paddingHorizontal: isDesktopWeb ? 9 : 9, height: 42, paddingVertical: isDesktopWeb ? 6 : 6,
  },
  linePickerText: { fontSize: 12, color: COLORS.heading, flexShrink: 1 },
  qtyInputWrap: { flex: 1, borderRadius: 8 },
  qtyInput: { width: '100%', backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, paddingHorizontal: isDesktopWeb ? 6 : 6, height: 34, fontSize: 12, color: COLORS.heading },
  costInputWrap: { flex: 1, borderRadius: 8 },
  costInput: { width: '100%', backgroundColor: COLORS.cardAlt, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, paddingHorizontal: isDesktopWeb ? 6 : 6, height: 34, fontSize: 12, color: COLORS.heading },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6, marginTop: isDesktopWeb ? 9 : 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 6, paddingVertical: isDesktopWeb ? 7 : 7.5 },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4 : 4.5, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: isDesktopWeb ? 7 : 7.5 },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  pickerSheet: { width: '100%', maxWidth: 420, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 10 : 10.5, maxHeight: '80%', overflow: 'hidden' },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: isDesktopWeb ? 6 : 6, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  pickerRowText: { fontSize: 12, color: COLORS.heading },
  pickerRowSub: { fontSize: 12, color: COLORS.muted },
  pickerCancelBtn: { alignItems: 'center', paddingVertical: isDesktopWeb ? 7 : 7.5, marginTop: isDesktopWeb ? 4 : 4.5 },
  pickerCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  receiveHint: { fontSize: 11, color: COLORS.muted, marginBottom: 9, fontStyle: 'italic' },
  receiveLineName: { fontSize: 12, fontWeight: '700', color: COLORS.heading, marginBottom: 4.5 },
  receiveLineOrdered: { fontSize: 11, fontWeight: '400', color: COLORS.muted },
  totalsCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  totalsEstimateNote: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic', marginBottom: 6 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  totalRowGrand: {
    borderBottomWidth: 0,
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.muted,
  },
  totalLabelGrand: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.heading,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  totalValueGrand: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accent,
  },
});
