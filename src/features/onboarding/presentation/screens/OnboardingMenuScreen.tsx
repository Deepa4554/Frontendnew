import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, Platform, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { showToast } from '../../../../core/store/uiSlice';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { OnboardingScaffold } from '../components/OnboardingScaffold';
import { useBulkCreateMenuItems } from '../../../../core/api/hooks/useMenu';
import { CreateMenuItemRequest } from '../../../../core/api/menuApi';
import { getApiErrorMessage } from '../../../../core/network/api';
import { setPostOnboardingIntent } from '../../../../core/navigation/postOnboardingIntent';
import { pickAndParseCsv, normalizeMenuCsvRows } from '../../../../core/utils/csvMenuImport';
import { pickImageAsDataUri } from '../../../../core/utils/imagePicker';
import { extractMenuItemsFromPhoto } from '../../../../core/utils/menuPhotoImport';
import { useResponsive } from '../../../../core/utils/useResponsive';

// A real predefined starter menu — not AI-generated, just a sensible default spread
// across the app's standard categories so a brand-new cafe isn't starting from zero.
// Every item here is genuinely vegetarian (coffee/pastries/toast, nothing containing
// meat/egg), so tagging them Veg is a real claim, not a default guess.
const STARTER_MENU_TEMPLATE: CreateMenuItemRequest[] = [
  { name: 'Espresso', category: 'Espresso', price: 90, subtitle: 'Bold & intense', description: 'A concentrated shot of pure coffee.', vegNonVegType: 'Veg' },
  { name: 'Cappuccino', category: 'Espresso', price: 130, subtitle: 'Espresso, steamed milk & foam', description: 'A classic Italian favorite with a thick foam cap.', vegNonVegType: 'Veg' },
  { name: 'Cafe Latte', category: 'Espresso', price: 140, subtitle: 'Smooth & milky', description: 'Espresso with steamed milk and a light layer of foam.', vegNonVegType: 'Veg' },
  { name: 'Americano', category: 'Espresso', price: 100, subtitle: 'Espresso with hot water', description: 'A milder, black-coffee-style espresso drink.', vegNonVegType: 'Veg' },
  { name: 'Cold Brew', category: 'Cold Brew', price: 150, subtitle: 'Slow-steeped, smooth', description: 'Coffee steeped cold for 18 hours — naturally sweet and low-acid.', vegNonVegType: 'Veg' },
  { name: 'Iced Latte', category: 'Cold Brew', price: 150, subtitle: 'Chilled espresso & milk', description: 'Espresso poured over ice with cold milk.', vegNonVegType: 'Veg' },
  { name: 'Butter Croissant', category: 'Pastries', price: 90, subtitle: 'Flaky & buttery', description: 'A classic French pastry, baked fresh.', vegNonVegType: 'Veg' },
  { name: 'Blueberry Muffin', category: 'Pastries', price: 100, subtitle: 'Soft & fruity', description: 'Moist muffin loaded with real blueberries.', vegNonVegType: 'Veg' },
  { name: 'Chocolate Chip Cookie', category: 'Pastries', price: 70, subtitle: 'Chewy & rich', description: 'A generously sized cookie with real chocolate chips.', vegNonVegType: 'Veg' },
  { name: 'Grilled Sandwich', category: 'Food', price: 160, subtitle: 'Veg or cheese', description: 'A warm, toasted sandwich served with a side.', vegNonVegType: 'Veg' },
  { name: 'Avocado Toast', category: 'Food', price: 190, subtitle: 'Fresh & filling', description: 'Sourdough toast topped with smashed avocado.', vegNonVegType: 'Veg' },
];

export const OnboardingMenuScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch();
  const [selected, setSelected] = useState<'starter' | 'import' | 'photo' | 'scratch'>('scratch');
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<CreateMenuItemRequest[]>([]);
  const [photoRows, setPhotoRows] = useState<CreateMenuItemRequest[]>([]);
  const [importing, setImporting] = useState(false);
  const [importingPhoto, setImportingPhoto] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [csvExpanded, setCsvExpanded] = useState(false);
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [editingRow, setEditingRow] = useState<{ source: 'csv' | 'photo'; index: number } | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const bulkCreate = useBulkCreateMenuItems();

  const rowsFor = (source: 'csv' | 'photo') => (source === 'csv' ? csvRows : photoRows);
  const setRowsFor = (source: 'csv' | 'photo') => (source === 'csv' ? setCsvRows : setPhotoRows);

  const deleteRow = (source: 'csv' | 'photo', index: number) => {
    setRowsFor(source)((rows) => rows.filter((_, i) => i !== index));
  };

  const openEditRow = (source: 'csv' | 'photo', index: number) => {
    const row = rowsFor(source)[index];
    setEditName(row.name);
    setEditPrice(String(row.price));
    setEditingRow({ source, index });
  };

  const saveEditRow = () => {
    if (!editingRow) return;
    const trimmedName = editName.trim();
    const parsedPrice = parseFloat(editPrice);
    if (!trimmedName || isNaN(parsedPrice) || parsedPrice <= 0) {
      dispatch(showToast({ message: 'Enter a name and a positive price.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    setRowsFor(editingRow.source)((rows) =>
      rows.map((row, i) => (i === editingRow.index ? { ...row, name: trimmedName, price: parsedPrice } : row)),
    );
    setEditingRow(null);
  };

  const handlePickPhoto = async () => {
    setImportingPhoto(true);
    try {
      // Uncropped — a forced square crop would cut items off a landscape/portrait
      // menu page before OCR ever sees them (see the same note on MenuScreen's photo import).
      const dataUri = await pickImageAsDataUri({ crop: false });
      if (!dataUri) return; // user closed the file dialog without choosing anything
      const extracted = await extractMenuItemsFromPhoto(dataUri);
      if (extracted.length === 0) {
        dispatch(showToast({ message: "Couldn't find any menu items in that photo. Try a clearer, well-lit shot.", icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      setPhotoRows(extracted);
      setPhotoExpanded(false);
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : getApiErrorMessage(err, 'Could not read that photo'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setImportingPhoto(false);
    }
  };

  const handlePickFile = async () => {
    setImporting(true);
    try {
      const picked = await pickAndParseCsv();
      if (!picked) return; // user closed the file dialog without choosing anything
      const { fileName, rows } = picked;
      const parsed = normalizeMenuCsvRows(rows);
      if (parsed.length === 0) {
        dispatch(showToast({ message: 'The CSV needs at least a name and price column, with a positive price on each row.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      setCsvFileName(fileName);
      setCsvRows(parsed);
      setCsvExpanded(false);
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : String(err), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setImporting(false);
    }
  };

  const finish = async () => {
    if (selected === 'import' && csvRows.length === 0) {
      dispatch(showToast({ message: 'Select a CSV file to import, or pick a different option.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (selected === 'photo' && photoRows.length === 0) {
      dispatch(showToast({ message: 'Take or choose a photo of your menu, or pick a different option.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    setFinishing(true);
    try {
      if (selected === 'import') {
        const result = await bulkCreate.mutateAsync(csvRows);
        if (result.skippedCount > 0) {
          dispatch(showToast({ message: `Added ${result.createdCount} items. Skipped ${result.skippedCount} row(s) with a missing name or invalid price.`, icon: 'check-circle', tone: 'success' }));
        }
      } else if (selected === 'photo') {
        const result = await bulkCreate.mutateAsync(photoRows);
        dispatch(showToast({
          message: `Added ${result.createdCount} items from the photo. (Scanned on-device — double-check these.)`,
          icon: 'check-circle',
          tone: 'success',
        }));
      } else if (selected === 'starter') {
        await bulkCreate.mutateAsync(STARTER_MENU_TEMPLATE);
      }
      // Land on the real Menu screen once onboarding actually completes (after the
      // Crew step) — "scratch" needs it to add the first item, "import" needs it to
      // review what just came in from the CSV.
      setPostOnboardingIntent('Menu');
      navigation.navigate('OnboardingCrew');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Setup failed'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <OnboardingScaffold
      step={3}
      onBack={() => navigation.goBack()}
      onNext={finish}
      nextLabel={finishing ? 'Finishing…' : 'Continue'}
      nextEnabled={!finishing}
    >
      <Text style={styles.headline}>Build Your Menu</Text>
      <Text style={styles.subtitle}>Choose how you'd like to set up your cafe offerings.</Text>

      {/* Starter menu template */}
      <TouchableOpacity
        style={[styles.optionCard, selected === 'starter' && styles.optionCardSelected]}
        onPress={() => setSelected('starter')}
        activeOpacity={0.85}
      >
        <View style={styles.optionRow}>
          <View style={[styles.optionIcon, { backgroundColor: COLORS.vibeCrema }]}>
            <Icon name="silverware-fork-knife" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Use a starter menu</Text>
            <Text style={styles.optionDesc}>{STARTER_MENU_TEMPLATE.length} common cafe items across Espresso, Cold Brew, Pastries & Food — edit or remove any of them later.</Text>
          </View>
          <Icon name="chevron-right" size={22} color={COLORS.muted} />
        </View>
      </TouchableOpacity>

      {/* Import */}
      <TouchableOpacity
        style={[styles.optionCard, selected === 'import' && styles.optionCardSelected]}
        onPress={() => setSelected('import')}
        activeOpacity={0.85}
      >
        <View style={styles.optionRow}>
          <View style={[styles.optionIcon, { backgroundColor: COLORS.proTipBg }]}>
            <Icon name="file-upload-outline" size={24} color={COLORS.accent} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Import from CSV</Text>
            <Text style={styles.optionDesc}>
              Columns: name, category, price, subtitle, description, veg (Veg/NonVeg/Jain/Eggetarian, optional).
            </Text>
          </View>
          <Icon name="chevron-right" size={22} color={COLORS.muted} />
        </View>

        {selected === 'import' && (
          <>
            <TouchableOpacity style={styles.chooseFileBtn} onPress={handlePickFile} disabled={importing}>
              {importing ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <>
                  <Icon name="paperclip" size={16} color={COLORS.accent} />
                  <Text style={styles.chooseFileText}>{csvFileName ? 'Choose a different file' : 'Choose CSV file'}</Text>
                </>
              )}
            </TouchableOpacity>

            {csvRows.length > 0 && (
              <View style={styles.previewCard}>
                <Text style={styles.previewLabel}>
                  {csvFileName?.toUpperCase()} · {csvRows.length} ITEM{csvRows.length === 1 ? '' : 'S'} READY
                </Text>
                {(csvExpanded ? csvRows : csvRows.slice(0, 3)).map((row, i, arr) => (
                  <React.Fragment key={`${row.name}_${i}`}>
                    <TouchableOpacity style={styles.previewRow} onPress={() => openEditRow('csv', i)}>
                      <Text style={styles.previewItem} numberOfLines={1}>{row.name}</Text>
                      <Text style={styles.previewPrice}>₹{row.price.toFixed(2)}</Text>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); deleteRow('csv', i); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="close" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {i < arr.length - 1 && <View style={styles.previewDivider} />}
                  </React.Fragment>
                ))}
                {csvRows.length > 3 && (
                  <TouchableOpacity onPress={() => setCsvExpanded(!csvExpanded)}>
                    <Text style={styles.previewMore}>{csvExpanded ? 'Show less' : `+ ${csvRows.length - 3} more`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </TouchableOpacity>

      {/* Import from Photo */}
      <TouchableOpacity
        style={[styles.optionCard, selected === 'photo' && styles.optionCardSelected]}
        onPress={() => setSelected('photo')}
        activeOpacity={0.85}
      >
        <View style={styles.optionRow}>
          <View style={[styles.optionIcon, { backgroundColor: COLORS.vibeEspresso }]}>
            <Icon name="camera-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Import from a photo</Text>
            <Text style={styles.optionDesc}>
              Snap your printed menu — items, categories, and prices are added automatically.
            </Text>
          </View>
          <Icon name="chevron-right" size={22} color={COLORS.muted} />
        </View>

        {selected === 'photo' && (
          <>
            <TouchableOpacity style={styles.chooseFileBtn} onPress={handlePickPhoto} disabled={importingPhoto}>
              {importingPhoto ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <>
                  <Icon name="camera-plus-outline" size={16} color={COLORS.accent} />
                  <Text style={styles.chooseFileText}>{photoRows.length > 0 ? 'Choose a different photo' : 'Choose photo'}</Text>
                </>
              )}
            </TouchableOpacity>

            {photoRows.length > 0 && (
              <View style={styles.previewCard}>
                <Text style={styles.previewLabel}>
                  {photoRows.length} ITEM{photoRows.length === 1 ? '' : 'S'} READY · DOUBLE-CHECK THESE
                </Text>
                {(photoExpanded ? photoRows : photoRows.slice(0, 3)).map((row, i, arr) => (
                  <React.Fragment key={`${row.name}_${i}`}>
                    <TouchableOpacity style={styles.previewRow} onPress={() => openEditRow('photo', i)}>
                      <Text style={styles.previewItem} numberOfLines={1}>{row.name}</Text>
                      <Text style={styles.previewPrice}>₹{row.price.toFixed(2)}</Text>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); deleteRow('photo', i); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="close" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {i < arr.length - 1 && <View style={styles.previewDivider} />}
                  </React.Fragment>
                ))}
                {photoRows.length > 3 && (
                  <TouchableOpacity onPress={() => setPhotoExpanded(!photoExpanded)}>
                    <Text style={styles.previewMore}>{photoExpanded ? 'Show less' : `+ ${photoRows.length - 3} more`}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </TouchableOpacity>

      {/* Scratch */}
      <TouchableOpacity
        style={[styles.optionCard, selected === 'scratch' && styles.optionCardSelected]}
        onPress={() => setSelected('scratch')}
        activeOpacity={0.85}
      >
        <View style={styles.optionRow}>
          <View style={[styles.optionIcon, { backgroundColor: COLORS.inputTint }]}>
            <Icon name="pencil-plus-outline" size={24} color={COLORS.heading} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Start from scratch</Text>
            <Text style={styles.optionDesc}>Add your items manually from the Menu screen, one at a time.</Text>
          </View>
          <Icon name="chevron-right" size={22} color={COLORS.muted} />
        </View>
      </TouchableOpacity>

      <Modal visible={!!editingRow} transparent animationType="fade" onRequestClose={() => setEditingRow(null)}>
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalCard}>
            <Text style={styles.editModalTitle}>Edit Item</Text>
            <TextInput
              style={styles.editModalInput}
              placeholder="Name"
              placeholderTextColor={COLORS.muted}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={styles.editModalInput}
              placeholder="Price"
              placeholderTextColor={COLORS.muted}
              value={editPrice}
              onChangeText={setEditPrice}
              keyboardType="decimal-pad"
            />
            <View style={styles.editModalActions}>
              <TouchableOpacity style={styles.editModalCancelBtn} onPress={() => setEditingRow(null)}>
                <Text style={styles.editModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editModalSaveBtn} onPress={saveEditRow}>
                <Text style={styles.editModalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </OnboardingScaffold>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  headline: {
    fontSize: isDesktopWeb ? 32 : 12,
    fontWeight: '800',
    color: COLORS.heading,
    textAlign: 'center',
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  subtitle: {
    fontSize: isDesktopWeb ? 15 : 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: isDesktopWeb ? 24 : 18,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
  },
  optionCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 18 : 13.5,
    marginBottom: isDesktopWeb ? 16 : 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#4A2C1D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: COLORS.accent,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 14 : 10.5,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: isDesktopWeb ? 18 : 14,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 4 : 3,
    lineHeight: 24,
  },
  optionDesc: {
    fontSize: isDesktopWeb ? 14 : 12,
    color: COLORS.muted,
    lineHeight: 20,
  },
  chooseFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 8 : 6,
    backgroundColor: COLORS.inputTint,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 14 : 10.5,
    marginTop: isDesktopWeb ? 16 : 12,
  },
  chooseFileText: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  previewCard: {
    backgroundColor: COLORS.inputTint,
    borderRadius: 8,
    padding: isDesktopWeb ? 14 : 10.5,
    marginTop: isDesktopWeb ? 12 : 9,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: isDesktopWeb ? 12 : 9,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 12 : 9,
  },
  previewItem: {
    flex: 1,
    fontSize: 12,
    color: COLORS.heading,
  },
  previewPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  previewDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 9,
  },
  previewMore: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 7.5,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  editModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 12,
    padding: 16,
  },
  editModalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.heading, marginBottom: 10 },
  editModalInput: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.heading,
    marginBottom: 10,
  },
  editModalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editModalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 6, backgroundColor: COLORS.inputTint },
  editModalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  editModalSaveBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 6, backgroundColor: COLORS.accent },
  editModalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
