import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Switch } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useTaxGroups, useCreateTaxGroup, useUpdateTaxGroup, useDeleteTaxGroup } from '../../../../../core/api/hooks/useTaxGroups';
import { useSettings, useUpdateSettings } from '../../../../../core/api/hooks/useSettings';
import { TaxGroup } from '../../../../../core/api/taxGroupsApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';
import { METHODS, PaymentMethod } from '../../../../../shared/components/billing/PaymentMethodPicker';

/** Tax & GST Configuration — the global flat rate, plus the master list of GST rates menu
 * items are assigned to (see MenuScreen's Tax Slab picker), so one bill can carry more than
 * one rate. An item with no slab of its own follows whichever slab is marked default; with
 * no default at all, it falls back to the single flat rate above, which is how the app
 * behaved before slabs existed.
 *
 * Editing a rate only affects FUTURE orders — every placed line snapshotted the rate it was
 * billed at, so past bills never silently re-price. */
export const TaxSlabManagementScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const { data: groups, isLoading } = useTaxGroups();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const createGroup = useCreateTaxGroup();
  const updateGroup = useUpdateTaxGroup();
  const deleteGroup = useDeleteTaxGroup();

  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingRate, setEditingRate] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [globalRateDraft, setGlobalRateDraft] = useState('');
  const [globalRateError, setGlobalRateError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  // Optimistic mirror of the tender ticks, so a tap lands instantly instead of waiting out the
  // round trip — cleared back to the server's answer whenever fresh settings arrive.
  const [modeOverride, setModeOverride] = useState<Partial<Record<PaymentMethod, boolean>> | null>(null);
  const [byModeOverride, setByModeOverride] = useState<boolean | null>(null);
  // Same optimistic-mirror trick as the tender ticks above, for the same reason: a switch that
  // waits out the round trip before moving reads as a switch that didn't work.
  const [chargesTaxOverride, setChargesTaxOverride] = useState<boolean | null>(null);
  const [compositionOverride, setCompositionOverride] = useState<boolean | null>(null);
  const [hsnDraft, setHsnDraft] = useState('');
  const [hsnError, setHsnError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setGlobalRateDraft(String(settings.taxRatePct));
      setHsnDraft(settings.defaultHsnCode ?? '');
    }
    setModeOverride(null);
    setByModeOverride(null);
    setChargesTaxOverride(null);
    setCompositionOverride(null);
  }, [settings]);

  const chargesTaxOn = chargesTaxOverride ?? settings?.taxChargesEnabled ?? false;
  const compositionOn = compositionOverride ?? settings?.isCompositionScheme ?? false;

  const toggleChargesTax = async (next: boolean) => {
    if (!settings) return;
    setChargesTaxOverride(next);
    try {
      await updateSettings.mutateAsync({ taxChargesEnabled: next });
    } catch (err) {
      setChargesTaxOverride(null);
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const toggleComposition = async (next: boolean) => {
    if (!settings) return;
    setCompositionOverride(next);
    try {
      await updateSettings.mutateAsync({ isCompositionScheme: next });
    } catch (err) {
      setCompositionOverride(null);
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const saveHsn = async () => {
    if (!settings) return;
    const code = hsnDraft.trim();
    // Mirrors HsnCode.Normalize on the server so a typo is caught before the round trip; the
    // server still validates, this just spares the user a toast for something the field knows.
    if (code && !/^\d{4,8}$/.test(code)) {
      setHsnError('HSN/SAC codes are 4 to 8 digits, numbers only.');
      return;
    }
    setHsnError(null);
    try {
      // Empty string is the "clear it" value, not "leave unchanged" — see UpdateSettingsRequest.
      await updateSettings.mutateAsync({ defaultHsnCode: code });
      dispatch(showToast({ message: code ? 'HSN/SAC code saved' : 'HSN/SAC code cleared', icon: 'check-circle-outline', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  // Which tenders currently carry tax. The server stores this as CSV; the screen works in ticks
  // and sends a list back up (see UpdateSettingsRequest.taxablePaymentModes).
  const taxableModes = new Set(
    (settings?.taxablePaymentModes ?? '').split(',').map((m) => m.trim()).filter(Boolean),
  );
  const byModeOn = byModeOverride ?? settings?.taxByPaymentModeEnabled ?? false;
  const isModeTaxed = (m: PaymentMethod) => modeOverride?.[m] ?? taxableModes.has(m);

  const saveTaxByMode = async (next: { enabled?: boolean; modes?: PaymentMethod[] }) => {
    if (!settings) return;
    try {
      await updateSettings.mutateAsync({
        ...(next.enabled === undefined ? {} : { taxByPaymentModeEnabled: next.enabled }),
        ...(next.modes === undefined ? {} : { taxablePaymentModes: next.modes }),
      });
    } catch (err) {
      setModeOverride(null);
      setByModeOverride(null);
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const toggleByMode = (on: boolean) => {
    setByModeOverride(on);
    // Switching on with nothing ticked would quietly make the entire menu tax-free, which is
    // never what an Owner reaching for this meant — seed it with the tender they were going to
    // tick anyway. Turning it back off leaves the ticks alone, so a re-enable remembers them.
    const seed: PaymentMethod[] | undefined = on && taxableModes.size === 0 ? ['UPI'] : undefined;
    if (seed) setModeOverride(Object.fromEntries(METHODS.map((x) => [x, seed.includes(x)])));
    saveTaxByMode({ enabled: on, modes: seed });
  };

  const toggleTaxableMode = (m: PaymentMethod) => {
    const next = METHODS.filter((x) => (x === m ? !isModeTaxed(x) : isModeTaxed(x)));
    setModeOverride(Object.fromEntries(METHODS.map((x) => [x, next.includes(x)])));
    saveTaxByMode({ modes: next });
  };

  const sorted = [...(groups ?? [])].sort((a, b) => a.ratePct - b.ratePct);
  const hasDefault = sorted.some((g) => g.isDefault);

  const parseRate = (raw: string): number | null => {
    const rate = parseFloat(raw);
    if (isNaN(rate) || rate < 0 || rate > 100) return null;
    return rate;
  };

  const saveGlobalRate = async () => {
    if (!settings) return;
    const rate = parseRate(globalRateDraft);
    if (rate === null) {
      setGlobalRateError('Enter a rate between 0 and 100.');
      return;
    }
    setGlobalRateError(null);
    if (rate === settings.taxRatePct) return;
    try {
      await updateSettings.mutateAsync({ taxRatePct: rate });
      dispatch(showToast({ message: `Global tax rate updated to ${rate}%.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      setGlobalRateDraft(String(settings.taxRatePct));
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    const rate = parseRate(newRate);
    const nameInvalid = !name;
    const rateInvalid = rate === null;
    setNameError(nameInvalid ? 'Give the slab a name, e.g. "GST 5%".' : null);
    setRateError(rateInvalid ? 'Enter a rate between 0 and 100.' : null);
    if (nameInvalid || rateInvalid) return;
    try {
      // The very first slab becomes the default, so items with no explicit slab have
      // something to follow rather than silently dropping back to the flat rate.
      await createGroup.mutateAsync({ name, ratePct: rate as number, isDefault: !hasDefault });
      setNewName('');
      setNewRate('');
      dispatch(showToast({ message: `"${name}" added.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add tax slab'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const startEdit = (group: TaxGroup) => {
    setEditingId(group.id);
    setEditingName(group.name);
    setEditingRate(String(group.ratePct));
  };

  const commitEdit = async () => {
    if (editingId == null) return;
    const id = editingId;
    const name = editingName.trim();
    const rate = parseRate(editingRate);
    setEditingId(null);
    if (!name || rate === null) {
      dispatch(showToast({ message: 'Name is required and the rate must be 0-100.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      setBusyId(id);
      await updateGroup.mutateAsync({ id, req: { name, ratePct: rate } });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update tax slab'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const makeDefault = async (group: TaxGroup) => {
    if (group.isDefault) return;
    try {
      setBusyId(group.id);
      await updateGroup.mutateAsync({ id: group.id, req: { isDefault: true } });
      dispatch(showToast({ message: `"${group.name}" is now the default slab.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not set default'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (group: TaxGroup) => {
    Alert.alert(
      'Delete tax slab?',
      `Remove "${group.name}"? Any menu item using it falls back to the default slab from its next order onwards. Bills already placed keep the rate they were charged at.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusyId(group.id);
              await deleteGroup.mutateAsync(group.id);
            } catch (err) {
              dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete tax slab'), icon: 'alert-circle-outline', tone: 'danger' }));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="percent-outline" title="Tax & GST" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tax & GST Configuration</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* ---------- Global Tax Rate ---------- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIcon}>
              <Icon name="percent-outline" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Global Tax Rate</Text>
              <Text style={styles.cardDesc}>
                Applied live on POS to any item with no tax slab of its own, and to every item if no slab below is default.
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Rate</Text>
          <View style={styles.valueInputRow}>
            <View style={[styles.inputWrap, globalRateError && styles.inputWrapError]}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={globalRateDraft}
                onChangeText={(t) => { setGlobalRateDraft(t); if (globalRateError) setGlobalRateError(null); }}
                placeholder="8"
                placeholderTextColor={COLORS.placeholder}
              />
              <Text style={styles.inputUnit}>%</Text>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={saveGlobalRate} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          {globalRateError && <Text style={styles.fieldError}>{globalRateError}</Text>}
        </View>

        {/* ---------- Tax by Payment Mode ---------- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIcon}>
              <Icon name="cash-multiple" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Tax by Payment Mode</Text>
              <Text style={styles.cardDesc}>
                Charge tax only on the tenders ticked below. A bill settled on any other tender is billed at 0%.
              </Text>
            </View>
            <Switch
              value={byModeOn}
              onValueChange={toggleByMode}
              disabled={!settings || updateSettings.isPending}
              trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          {byModeOn && (
            <>
              <Text style={styles.fieldLabel}>Tax charged on</Text>
              <View style={styles.modeRow}>
                {METHODS.map((m) => {
                  const on = isModeTaxed(m);
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.modeChip, on && styles.modeChipOn]}
                      onPress={() => toggleTaxableMode(m)}
                      disabled={updateSettings.isPending}
                    >
                      <Icon
                        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={15}
                        color={on ? COLORS.accent : COLORS.muted}
                      />
                      <Text style={[styles.modeChipText, on && styles.modeChipTextOn]}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Said plainly, once, where the decision is actually being made. */}
              <Text style={styles.warnText}>
                GST is due on the sale itself, not on how the customer pays — no tender here makes a sale
                tax-free in law. Only switch this on if your accountant has told you to bill this way.
                {METHODS.every((m) => !isModeTaxed(m)) ? '\n\nNothing is ticked, so no bill will carry any tax at all.' : ''}
              </Text>
              <Text style={styles.cardDesc}>
                Applies at settle time: a bill carries its tax while it is open, and the tax comes off the
                moment a non-taxable tender is picked. Split across tenders? If any one of them is ticked
                above, the whole bill is taxed. Bills already settled are never re-priced.
              </Text>
            </>
          )}
        </View>

        {/* ---------- GST on service / packing / delivery charges ---------- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIcon}>
              <Icon name="room-service-outline" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>GST on Service & Delivery Charges</Text>
              <Text style={styles.cardDesc}>
                Charge GST on the service, packing and delivery charges too, at the global rate above.
              </Text>
            </View>
            <Switch
              value={chargesTaxOn}
              onValueChange={toggleChargesTax}
              disabled={!settings || updateSettings.isPending}
              trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={styles.cardDesc}>
            Under GST these charges are part of the same supply as the food, so they are taxable — but turning
            this on RAISES the total of every new bill that carries one. Orders already placed keep the tax they
            were billed with, so a period you have already filed never changes.
          </Text>
        </View>

        {/* ---------- Invoice identity: composition scheme + default HSN ---------- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIcon}>
              <Icon name="file-document-outline" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Composition Scheme</Text>
              <Text style={styles.cardDesc}>
                Your bill prints as a BILL OF SUPPLY instead of a TAX INVOICE.
              </Text>
            </View>
            <Switch
              value={compositionOn}
              onValueChange={toggleComposition}
              disabled={!settings || updateSettings.isPending}
              trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Text style={styles.fieldLabel}>Default HSN / SAC code</Text>
          <View style={styles.valueInputRow}>
            <View style={[styles.inputWrap, hsnError && styles.inputWrapError]}>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={hsnDraft}
                onChangeText={(t) => { setHsnDraft(t); if (hsnError) setHsnError(null); }}
                placeholder="996331"
                placeholderTextColor={COLORS.placeholder}
              />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={saveHsn} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          {hsnError && <Text style={styles.fieldError}>{hsnError}</Text>}
          <Text style={styles.cardDesc}>
            Printed on every bill line and summarised in the Tax / GST report. Most cafes need only this one code
            — 996331 covers restaurant service. Set a different code on individual menu items only for packaged
            goods sold across the counter. Leave blank to print no HSN at all.
          </Text>
        </View>

        {/* ---------- Add Tax Slab ---------- */}
        <Text style={styles.sectionHeading}>Tax Slabs</Text>
        <Text style={styles.subtitle}>
          Set up the GST rates this cafe charges (e.g. GST 5% on food, GST 12% on packaged goods), then assign each menu item
          to one from the Menu screen. The bill shows tax split per rate. Changing a rate here only affects future orders.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIcon}>
              <Icon name="playlist-plus" size={22} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Add a Tax Slab</Text>
              <Text style={styles.cardDesc}>Give it a name and rate, e.g. "GST 5%".</Text>
            </View>
          </View>

          <View style={styles.valueInputRow}>
            <View style={[styles.inputWrap, styles.nameInputWrap, nameError && styles.inputWrapError]}>
              <TextInput
                style={styles.input}
                placeholder='Name, e.g. "GST 5%"'
                placeholderTextColor={COLORS.placeholder}
                value={newName}
                onChangeText={(t) => { setNewName(t); if (nameError) setNameError(null); }}
              />
            </View>
            <View style={[styles.inputWrap, styles.rateInputWrap, rateError && styles.inputWrapError]}>
              <TextInput
                style={[styles.input, { textAlign: 'right' }]}
                placeholder="5"
                placeholderTextColor={COLORS.placeholder}
                value={newRate}
                onChangeText={(t) => { setNewRate(t); if (rateError) setRateError(null); }}
                keyboardType="decimal-pad"
                onSubmitEditing={handleAdd}
                returnKeyType="done"
              />
              <Text style={styles.inputUnit}>%</Text>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={createGroup.isPending}>
              {createGroup.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Icon name="plus" size={13} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>Add</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {(nameError || rateError) && <Text style={styles.fieldError}>{nameError || rateError}</Text>}
        </View>

        {isLoading && <SkeletonList rows={4} avatarShape="square" />}

        {!isLoading && sorted.map((group) => (
          <View key={group.id} style={styles.slabCard}>
            <View style={styles.cardIcon}>
              <Icon name="sale" size={20} color={COLORS.accent} />
            </View>

            <View style={{ flex: 1 }}>
              {editingId === group.id ? (
                <View style={styles.editRow}>
                  <View style={styles.editNameInputWrap}>
                    <TextInput
                      style={[styles.editInput, { width: '100%' }]}
                      value={editingName}
                      onChangeText={setEditingName}
                      autoFocus
                      returnKeyType="next"
                    />
                  </View>
                  <View style={styles.editRateInputWrap}>
                    <TextInput
                      style={[styles.editInput, { width: '100%', textAlign: 'right' }]}
                      value={editingRate}
                      onChangeText={setEditingRate}
                      keyboardType="decimal-pad"
                      onSubmitEditing={commitEdit}
                      onBlur={commitEdit}
                      returnKeyType="done"
                    />
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => startEdit(group)}>
                  <Text style={styles.cardTitle}>{group.name}</Text>
                  <Text style={styles.cardDesc}>
                    {group.ratePct}%{group.isDefault ? ' · Default for unassigned items' : ''}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {busyId === group.id ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <>
                <TouchableOpacity style={styles.defaultBtn} onPress={() => makeDefault(group)} disabled={group.isDefault}>
                  <Icon
                    name={group.isDefault ? 'star' : 'star-outline'}
                    size={18}
                    color={group.isDefault ? COLORS.accent : COLORS.muted}
                  />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(group)}>
                  <Icon name="trash-can-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}

        {!isLoading && sorted.length === 0 && (
          <Text style={styles.emptyText}>
            No tax slabs yet. Everything is billed at the single {settings ? `${settings.taxRatePct}%` : 'flat'} global rate
            above — add a slab to charge different rates per item.
          </Text>
        )}

        {!isLoading && sorted.length > 0 && !hasDefault && (
          <Text style={styles.warnText}>
            No default slab is set. Items without a slab of their own are billed at the flat
            {settings ? ` ${settings.taxRatePct}%` : ''} global rate above — tap a star below to make one the default.
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 9, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 4.5 : 4.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: 'bold', color: COLORS.heading },
  sectionHeading: { fontSize: 12, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 3 },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 12 : 12 },

  // Global Tax Rate / Add Slab cards — mirrors AutoChargesSettingsScreen's card system.
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 8 : 8 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  cardDesc: { fontSize: 12, color: COLORS.muted, marginTop: 1.5 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: COLORS.muted, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 4 },
  fieldError: { fontSize: 12, color: COLORS.danger, marginTop: -2 },
  // minWidth: 0 overrides the browser default (min-width: auto) that stops a flex item from
  // shrinking below its content width — without it, typed text pushes the input wider than
  // its pill on web instead of staying clipped inside it.
  valueInputRow: { flexDirection: 'row', gap: 8, minWidth: 0 },
  inputWrap: { flex: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.background, paddingHorizontal: 8, height: 28, overflow: 'hidden' },
  inputWrapError: { borderColor: COLORS.danger },
  nameInputWrap: { flex: 1 },
  rateInputWrap: { flex: 1 },
  input: { flex: 1, minWidth: 0, fontSize: 12, color: COLORS.heading, height: '100%' },
  inputUnit: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  saveBtn: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 8, backgroundColor: COLORS.button },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  // Individual tax slab rows.
  slabCard: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10.5 : 10.5, marginBottom: isDesktopWeb ? 7.5 : 7.5 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, minWidth: 0 },
  editNameInputWrap: { flex: 1, minWidth: 0 },
  editRateInputWrap: { width: 54, flexShrink: 0 },
  editInput: { fontSize: 12, fontWeight: '700', color: COLORS.heading, borderBottomWidth: 1, borderBottomColor: COLORS.accent, paddingVertical: isDesktopWeb ? 1.5 : 1.5, minWidth: 0 },
  defaultBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  // Tender ticks for "Tax by Payment Mode" — the same checkbox-chip idiom PaymentMethodPicker
  // uses, so the list an Owner configures reads like the one a cashier settles with.
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 8, borderWidth: 1, borderColor: COLORS.background, backgroundColor: COLORS.background },
  modeChipOn: { borderColor: COLORS.accent },
  modeChipText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  modeChipTextOn: { color: COLORS.heading },
  emptyText: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 24, lineHeight: 20 },
  warnText: { fontSize: 12, color: COLORS.danger, marginTop: 9, lineHeight: 18 },
});
