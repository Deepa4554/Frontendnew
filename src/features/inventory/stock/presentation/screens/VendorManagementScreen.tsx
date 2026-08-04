import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useVendors, useCreateVendor, useUpdateVendor, useDeactivateVendor } from '../../../../../core/api/hooks/useVendors';
import { Vendor } from '../../../../../core/api/vendorsApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

interface DraftVendor {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  paymentTerms: string;
  notes: string;
}

const emptyDraft = (): DraftVendor => ({ name: '', phone: '', email: '', gstin: '', address: '', paymentTerms: '', notes: '' });

const draftFrom = (v: Vendor): DraftVendor => ({
  name: v.name, phone: v.phone ?? '', email: v.email ?? '', gstin: v.gstin ?? '',
  address: v.address ?? '', paymentTerms: v.paymentTerms ?? '', notes: v.notes ?? '',
});

export const VendorManagementScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const [showInactive, setShowInactive] = useState(false);
  const { data: vendors = [], isLoading, isError, refetch } = useVendors(showInactive);
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deactivateVendor = useDeactivateVendor();

  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftVendor>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormVisible(true);
  };

  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    setDraft(draftFrom(v));
    setFormVisible(true);
  };

  const patch = (p: Partial<DraftVendor>) => setDraft((d) => ({ ...d, ...p }));

  const submit = async () => {
    if (!draft.name.trim()) {
      dispatch(showToast({ message: 'Vendor name is required.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const phoneDigits = draft.phone.trim();
    if (phoneDigits && !/^\d{10}$/.test(phoneDigits)) {
      dispatch(showToast({ message: 'Phone must be a 10-digit number.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const req = {
      name: draft.name.trim(),
      phone: phoneDigits || undefined,
      email: draft.email.trim() || undefined,
      gstin: draft.gstin.trim() || undefined,
      address: draft.address.trim() || undefined,
      paymentTerms: draft.paymentTerms.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    };
    try {
      setSaving(true);
      if (editingId !== null) {
        await updateVendor.mutateAsync({ id: editingId, req: { ...req, isActive: true } });
        dispatch(showToast({ message: 'Vendor updated.', icon: 'check-circle', tone: 'success' }));
      } else {
        await createVendor.mutateAsync(req);
        dispatch(showToast({ message: 'Vendor added.', icon: 'check-circle', tone: 'success' }));
      }
      setFormVisible(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save vendor'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = (v: Vendor) => {
    Alert.alert('Deactivate vendor?', `${v.name} will be hidden from the vendor picker on future purchase orders. Past purchase orders are unaffected.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive', onPress: async () => {
          try {
            await deactivateVendor.mutateAsync(v.id);
            dispatch(showToast({ message: `${v.name} deactivated.`, icon: 'check-circle', tone: 'success' }));
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not deactivate vendor'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  const reactivate = async (v: Vendor) => {
    try {
      await updateVendor.mutateAsync({ id: v.id, req: { ...draftFrom(v), isActive: true } });
      dispatch(showToast({ message: `${v.name} reactivated.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not reactivate vendor'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const callVendor = (phone: string) => Linking.openURL(`tel:${phone}`);

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="account-tie-outline" title="Vendors" onBack={() => navigation?.goBack?.()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.titleBox}>
                 <TouchableOpacity style={styles.toggleRow} onPress={() => setShowInactive((s) => !s)}>
            <Icon name={showInactive ? 'checkbox-marked-outline' : 'checkbox-blank-outline'} size={18} color={COLORS.accent} />
            <Text style={styles.toggleText}>Show deactivated vendors</Text>
          </TouchableOpacity>
        </View>

        {isError && vendors.length === 0 ? (
          <ErrorState title="Couldn't load vendors" message="Check your connection and try again." onRetry={() => refetch()} />
        ) : (
          <>
            {isLoading && (
              <View style={{ paddingHorizontal: 16 }}>
                <SkeletonList rows={4} />
              </View>
            )}
            {!isLoading && vendors.length === 0 && (
              <View style={styles.emptyCard}>
                <Icon name="truck-outline" size={28} color={COLORS.muted} />
                <Text style={styles.emptyText}>No vendors yet.</Text>
                <Text style={styles.emptyHint}>Tap the + button to add your first supplier.</Text>
              </View>
            )}

            {vendors.map((v) => (
              <View key={v.id} style={[styles.card, !v.isActive && styles.cardInactive]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardName}>{v.name}</Text>
                  {!v.isActive && <View style={styles.inactiveBadge}><Text style={styles.inactiveBadgeText}>Inactive</Text></View>}
                </View>
                {!!v.phone && (
                  <TouchableOpacity style={styles.detailRow} onPress={() => callVendor(v.phone as string)}>
                    <Icon name="phone-outline" size={14} color={COLORS.muted} />
                    <Text style={styles.detailText}>{v.phone}</Text>
                  </TouchableOpacity>
                )}
                {!!v.email && (
                  <View style={styles.detailRow}>
                    <Icon name="email-outline" size={14} color={COLORS.muted} />
                    <Text style={styles.detailText}>{v.email}</Text>
                  </View>
                )}
                {!!v.gstin && (
                  <View style={styles.detailRow}>
                    <Icon name="file-document-outline" size={14} color={COLORS.muted} />
                    <Text style={styles.detailText}>GSTIN: {v.gstin}</Text>
                  </View>
                )}
                {!!v.paymentTerms && (
                  <View style={styles.detailRow}>
                    <Icon name="calendar-clock-outline" size={14} color={COLORS.muted} />
                    <Text style={styles.detailText}>{v.paymentTerms}</Text>
                  </View>
                )}
                {!!v.address && <Text style={styles.addressText}>{v.address}</Text>}
                {!!v.notes && <Text style={styles.notesText}>{v.notes}</Text>}

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.cardActionBtn} onPress={() => openEdit(v)}>
                    <Icon name="pencil-outline" size={14} color={COLORS.accent} />
                    <Text style={styles.cardActionText}>Edit</Text>
                  </TouchableOpacity>
                  {v.isActive ? (
                    <TouchableOpacity style={styles.cardActionBtn} onPress={() => confirmDeactivate(v)}>
                      <Icon name="close-circle-outline" size={14} color={COLORS.dangerAccent} />
                      <Text style={[styles.cardActionText, { color: COLORS.dangerAccent }]}>Deactivate</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.cardActionBtn} onPress={() => reactivate(v)}>
                      <Icon name="check-circle-outline" size={14} color={COLORS.accent} />
                      <Text style={styles.cardActionText}>Reactivate</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openCreate}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{editingId !== null ? 'Edit Vendor' : 'New Vendor'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Name *</Text>
              <View style={styles.nameInputWrap}>
                <TextInput style={styles.fieldInput} placeholder="e.g. Local Roasters Co." placeholderTextColor={COLORS.placeholder} value={draft.name} onChangeText={(t) => patch({ name: t })} />
              </View>

              <Text style={styles.fieldLabel}>Phone (for WhatsApp / calls)</Text>
              <View style={styles.phoneInputWrap}>
                <TextInput style={styles.fieldInput} placeholder="10-digit mobile" placeholderTextColor={COLORS.placeholder} keyboardType="number-pad" maxLength={10} value={draft.phone} onChangeText={(t) => patch({ phone: t.replace(/[^0-9]/g, '') })} />
              </View>

              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.emailInputWrap}>
                <TextInput style={styles.fieldInput} placeholder="vendor@example.com" placeholderTextColor={COLORS.placeholder} keyboardType="email-address" autoCapitalize="none" value={draft.email} onChangeText={(t) => patch({ email: t })} />
              </View>

              <Text style={styles.fieldLabel}>GSTIN</Text>
              <View style={styles.gstinInputWrap}>
                <TextInput style={styles.fieldInput} placeholder="22AAAAA0000A1Z5" placeholderTextColor={COLORS.placeholder} autoCapitalize="characters" value={draft.gstin} onChangeText={(t) => patch({ gstin: t })} />
              </View>

              <Text style={styles.fieldLabel}>Payment terms</Text>
              <View style={styles.paymentTermsInputWrap}>
                <TextInput style={styles.fieldInput} placeholder="e.g. Net 15, Cash on delivery" placeholderTextColor={COLORS.placeholder} value={draft.paymentTerms} onChangeText={(t) => patch({ paymentTerms: t })} />
              </View>

              <Text style={styles.fieldLabel}>Address</Text>
              <View style={styles.addressInputWrap}>
                <TextInput style={[styles.fieldInput, styles.multilineInput]} placeholder="Supplier address" placeholderTextColor={COLORS.placeholder} multiline value={draft.address} onChangeText={(t) => patch({ address: t })} />
              </View>

              <Text style={styles.fieldLabel}>Notes</Text>
              <View style={styles.notesInputWrap}>
                <TextInput style={[styles.fieldInput, styles.multilineInput]} placeholder="Anything worth remembering" placeholderTextColor={COLORS.placeholder} multiline value={draft.notes} onChangeText={(t) => patch({ notes: t })} />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setFormVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={submit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : (
                    <>
                      <Icon name="check" size={14} color="#FFFFFF" />
                      <Text style={styles.modalSaveText}>{editingId !== null ? 'Save Changes' : 'Add Vendor'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  titleBox: { marginHorizontal: isDesktopWeb ? 12 : 16, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 13 : 18, paddingTop: isDesktopWeb ? 3 : 4, paddingBottom: isDesktopWeb ? 9 : 12, marginBottom: isDesktopWeb ? 12 : 16, marginTop: 0 },
  title: { fontSize: 22, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 4.5 : 6 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 8 },
  toggleText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  emptyCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 45 : 60, gap: isDesktopWeb ? 6 : 8, paddingHorizontal: isDesktopWeb ? 22 : 30 },
  emptyText: { fontSize: 14, fontWeight: '600', color: COLORS.heading, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center' },
  card: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 12 : 16, borderRadius: 8, padding: isDesktopWeb ? 10 : 14, marginBottom: isDesktopWeb ? 9 : 12 },
  cardInactive: { opacity: 0.6 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 4.5 : 6 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.heading },
  inactiveBadge: { backgroundColor: COLORS.dangerAccent, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 6 : 8, paddingVertical: isDesktopWeb ? 1.5 : 2 },
  inactiveBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4.5 : 6, marginBottom: isDesktopWeb ? 3 : 4 },
  detailText: { fontSize: 12, color: COLORS.muted },
  addressText: { fontSize: 12, color: COLORS.muted, marginTop: 2, fontStyle: 'italic' },
  notesText: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 4.5 : 6 },
  cardActions: { flexDirection: 'row', gap: isDesktopWeb ? 12 : 16, marginTop: isDesktopWeb ? 7.5 : 10 },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 3 : 4 },
  cardActionText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.button, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 18 : 24 },
  modalSheet: { width: '100%', maxHeight: '85%', backgroundColor: COLORS.background, borderRadius: isDesktopWeb ? 10 : 12, padding: isDesktopWeb ? 12 : 16, overflow: 'hidden' },
  modalFieldsScroll: { flexGrow: 0 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 8 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 4.5 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 2.5 : 3, marginTop: isDesktopWeb ? 3 : 4 },
  fieldInput: { backgroundColor: COLORS.cardAlt, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 8 : 10, height: isDesktopWeb ? 30 : 34, fontSize: 12, color: COLORS.heading, borderWidth: 1, borderColor: COLORS.inputBorder },
  multilineInput: { height: isDesktopWeb ? 44 : 56, paddingTop: isDesktopWeb ? 6 : 8, textAlignVertical: 'top' },
  nameInputWrap: { borderRadius: 8 },
  phoneInputWrap: { borderRadius: 8 },
  emailInputWrap: { borderRadius: 8 },
  gstinInputWrap: { borderRadius: 8 },
  paymentTermsInputWrap: { borderRadius: 8 },
  addressInputWrap: { borderRadius: 8 },
  notesInputWrap: { borderRadius: 8 },
  modalActions: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 8, marginTop: isDesktopWeb ? 6 : 8 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 6, paddingVertical: isDesktopWeb ? 8 : 10 },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: { flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 8, backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: isDesktopWeb ? 8 : 10 },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
