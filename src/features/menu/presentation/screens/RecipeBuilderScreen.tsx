import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { showToast } from '../../../../core/store/uiSlice';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import { useMenuItems, useUpdateMenuItem } from '../../../../core/api/hooks/useMenu';
import { useInventory } from '../../../../core/api/hooks/useInventory';
import { useRecipe, useUpsertRecipe } from '../../../../core/api/hooks/useRecipe';
import { ProductType } from '../../../../core/api/menuApi';
import { getApiErrorMessage } from '../../../../core/network/api';
import { SkeletonText } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

interface DraftRow {
  key: string;
  inventoryItemId: number | null;
  quantity: string;
  unit: string;
}

const emptyRow = (): DraftRow => ({ key: `${Date.now()}-${Math.random()}`, inventoryItemId: null, quantity: '', unit: '' });

// Mirrors CafePosApi/Infrastructure/UnitConverter.cs — weight/volume/count families only,
// never converts across families. Kept local (not a shared unit) so this screen can show a
// live cost estimate on every keystroke without an extra request; the server is still the
// source of truth (see useRecipeCost below for the saved recipe's real cost).
type UnitFamily = 'weight' | 'volume' | 'count';
const unitFamily = (unit: string): UnitFamily | null => {
  switch (unit.trim().toLowerCase()) {
    case 'gm': case 'g': case 'kg': return 'weight';
    case 'ml': case 'litre': case 'liter': case 'l': return 'volume';
    case 'pcs': case 'pc': case 'unit': case 'units': return 'count';
    default: return null;
  }
};
const baseFactor = (unit: string): number => {
  switch (unit.trim().toLowerCase()) {
    case 'gm': case 'g': case 'ml': return 1;
    case 'kg': case 'litre': case 'liter': case 'l': return 1000;
    default: return 1;
  }
};
const convertUnits = (qty: number, fromUnit: string, toUnit: string): number | null => {
  const famA = unitFamily(fromUnit);
  const famB = unitFamily(toUnit);
  if (!famA || famA !== famB) return null;
  return (qty * baseFactor(fromUnit)) / baseFactor(toUnit);
};

export const RecipeBuilderScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const menuItemId: number | undefined = route?.params?.menuItemId;
  const { data: menuItems = [], isError: menuItemsError, refetch: refetchMenuItems } = useMenuItems();
  const { data: inventory = [] } = useInventory();
  const { data: recipe, isLoading: recipeLoading } = useRecipe(menuItemId ?? null);
  const updateMenuItem = useUpdateMenuItem();
  const upsertRecipe = useUpsertRecipe();

  const menuItem = menuItems.find((m) => m.id === menuItemId);

  const [productType, setProductType] = useState<ProductType>('Prepared');
  const [linkedInventoryItemId, setLinkedInventoryItemId] = useState<number | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const [pickerRowKey, setPickerRowKey] = useState<string | null>(null);
  const [linkedPickerOpen, setLinkedPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !menuItem) return;
    setProductType(menuItem.productType);
    setLinkedInventoryItemId(menuItem.linkedInventoryItemId);
    if (recipe && recipe.items.length > 0) {
      setRows(recipe.items.map((i) => ({ key: `${i.inventoryItemId}`, inventoryItemId: i.inventoryItemId, quantity: String(i.quantity), unit: i.unit })));
    }
    // Wait for the recipe query to settle (success or 404-error) before marking hydrated,
    // so a Prepared item's saved recipe isn't overwritten by the still-loading default.
    if (!recipeLoading) setHydrated(true);
  }, [menuItem, recipe, recipeLoading, hydrated]);

  if (menuItemsError && menuItems.length === 0) {
    return (
      <View style={styles.container}>
        <DesktopPageHeader icon="chef-hat" title="Recipe Builder" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Couldn't load menu item"
          message="Check your connection and try again."
          onRetry={() => refetchMenuItems()}
        />
      </View>
    );
  }

  if (!menuItem) {
    return (
      <View style={styles.container}>
        <DesktopPageHeader icon="chef-hat" title="Recipe Builder" onBack={() => navigation.goBack()} />
        <View style={{ padding: 16 }}>
          <SkeletonText width="50%" lineHeight={20} style={{ marginBottom: 8 }} />
          <SkeletonText width="80%" lineHeight={12} style={{ marginBottom: 24 }} />
          <SkeletonText lines={2} lineHeight={44} gap={10} style={{ marginBottom: 24 }} />
          <SkeletonText lines={3} lineHeight={44} gap={10} />
        </View>
      </View>
    );
  }

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (key: string) => setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  const updateRow = (key: string, patch: Partial<DraftRow>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const pickIngredientForRow = (rowKey: string, inventoryItemId: number) => {
    const ing = inventory.find((i) => i.id === inventoryItemId);
    updateRow(rowKey, { inventoryItemId, unit: ing?.unit ?? '' });
    setPickerRowKey(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (productType === 'Independent') {
        if (!linkedInventoryItemId) {
          dispatch(showToast({ message: 'Select which inventory item this item sells directly from.', icon: 'alert-circle-outline', tone: 'warning' }));
          return;
        }
        await updateMenuItem.mutateAsync({ id: menuItem.id, req: { productType: 'Independent', linkedInventoryItemId } });
      } else {
        const validRows = rows.filter((r) => r.inventoryItemId !== null && r.quantity.trim() !== '');
        if (validRows.length === 0) {
          dispatch(showToast({ message: 'A recipe needs at least one ingredient with a quantity.', icon: 'alert-circle-outline', tone: 'warning' }));
          return;
        }
        for (const r of validRows) {
          const qty = parseFloat(r.quantity);
          if (isNaN(qty) || qty <= 0) {
            dispatch(showToast({ message: 'Every ingredient needs a quantity greater than zero.', icon: 'alert-circle-outline', tone: 'warning' }));
            return;
          }
        }
        await updateMenuItem.mutateAsync({ id: menuItem.id, req: { productType: 'Prepared' } });
        await upsertRecipe.mutateAsync({
          menuItemId: menuItem.id,
          items: validRows.map((r) => ({ inventoryItemId: r.inventoryItemId as number, quantity: parseFloat(r.quantity), unit: r.unit.trim() })),
        });
      }

      dispatch(showToast({ message: `Recipe updated for ${menuItem.name}.`, icon: 'check-circle', tone: 'success' }));
      navigation.goBack();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save recipe'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setSaving(false);
    }
  };

  const linkedItem = inventory.find((i) => i.id === linkedInventoryItemId);

  // Live estimate from the draft rows — instant feedback while editing, no request.
  let liveIngredientCost = 0;
  let liveCostIncomplete = false;
  for (const row of rows) {
    const ing = inventory.find((i) => i.id === row.inventoryItemId);
    const qty = parseFloat(row.quantity);
    if (!ing || isNaN(qty) || qty <= 0) continue;
    const converted = convertUnits(qty, row.unit || ing.unit, ing.unit);
    if (converted === null) { liveCostIncomplete = true; continue; }
    liveIngredientCost += converted * ing.unitCost;
  }
  const liveFoodCostPct = menuItem.price > 0 ? (liveIngredientCost / menuItem.price) * 100 : 0;
  const foodCostColor = liveFoodCostPct > 35 ? COLORS.dangerAccent : liveFoodCostPct > 28 ? COLORS.warning : COLORS.success;

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="chef-hat" title="Recipe Builder" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: isDesktopWeb ? 12 : 12, paddingBottom: 40 }}>
        <Text style={styles.title}>{menuItem.name}</Text>
        {!isDesktopWeb && <Text style={styles.subtitle}>Define how this item consumes ingredient stock on every sale.</Text>}

        <Text style={styles.fieldLabel}>Product Type</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.togglePill, productType === 'Prepared' && styles.togglePillActive]}
            onPress={() => setProductType('Prepared')}
          >
            <Text style={[styles.toggleText, productType === 'Prepared' && styles.toggleTextActive]}>Prepared (uses a recipe)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.togglePill, productType === 'Independent' && styles.togglePillActive]}
            onPress={() => setProductType('Independent')}
          >
            <Text style={[styles.toggleText, productType === 'Independent' && styles.toggleTextActive]}>Independent (sells from its own stock)</Text>
          </TouchableOpacity>
        </View>

        {productType === 'Independent' ? (
          <>
            <Text style={styles.fieldLabel}>Linked inventory item</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setLinkedPickerOpen(true)}>
              <Text style={styles.pickerBtnText}>{linkedItem ? `${linkedItem.name} (${linkedItem.unit})` : 'Select an inventory item...'}</Text>
              <Icon name="chevron-down" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.fieldLabel}>Ingredients</Text>
              <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
                <Icon name="plus" size={14} color={COLORS.accent} />
                <Text style={styles.addRowText}>Add ingredient</Text>
              </TouchableOpacity>
            </View>

            {rows.map((row) => {
              const ing = inventory.find((i) => i.id === row.inventoryItemId);
              return (
                <View key={row.key} style={styles.ingredientRow}>
                  <TouchableOpacity style={styles.ingredientPickerBtn} onPress={() => setPickerRowKey(row.key)}>
                    <Text style={styles.ingredientPickerText} numberOfLines={1}>
                      {ing ? ing.name : 'Select ingredient...'}
                    </Text>
                    <Icon name="chevron-down" size={16} color={COLORS.muted} />
                  </TouchableOpacity>
                  <View style={{ borderRadius: 8, flex: 1 }}>
                    <TextInput
                      style={styles.qtyInput}
                      placeholder="Qty"
                      placeholderTextColor={COLORS.placeholder}
                      keyboardType="decimal-pad"
                      value={row.quantity}
                      onChangeText={(t) => updateRow(row.key, { quantity: t.replace(/[^0-9.]/g, '') })}
                    />
                  </View>
                  <View style={{ borderRadius: 8 }}>
                    <TextInput
                      style={styles.unitInput}
                      placeholder="unit"
                      placeholderTextColor={COLORS.placeholder}
                      value={row.unit}
                      onChangeText={(t) => updateRow(row.key, { unit: t })}
                    />
                  </View>
                  <TouchableOpacity onPress={() => removeRow(row.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close-circle-outline" size={20} color={COLORS.dangerAccent} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        {productType === 'Prepared' && liveIngredientCost > 0 && (
          <View style={styles.costCard}>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Ingredient cost</Text>
              <Text style={styles.costValue}>₹{liveIngredientCost.toFixed(2)}</Text>
            </View>
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Menu price</Text>
              <Text style={styles.costValue}>₹{menuItem.price.toFixed(2)}</Text>
            </View>
            <View style={[styles.costRow, { marginTop: 4 }]}>
              <Text style={styles.foodCostLabel}>Food cost %</Text>
              <Text style={[styles.foodCostValue, { color: foodCostColor }]}>{liveFoodCostPct.toFixed(1)}%</Text>
            </View>
            <Text style={styles.costHint}>
              {liveCostIncomplete
                ? 'Some rows use a unit that can\'t be converted yet — cost may be incomplete.'
                : 'Healthy range is 28-35%. Estimated live from the rows above — save to update the real number.'}
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : (
            <>
              <Icon name="check" size={16} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Save Recipe</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Ingredient picker for a recipe row */}
      <Modal visible={pickerRowKey !== null} transparent animationType="fade" onRequestClose={() => setPickerRowKey(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={[styles.pickerTitle, modalHeadingOverride(styles.pickerTitle.fontSize)]}>Select Ingredient</Text>
              <TouchableOpacity onPress={() => setPickerRowKey(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {inventory.map((i) => (
                <TouchableOpacity key={i.id} style={styles.pickerRow} onPress={() => pickerRowKey && pickIngredientForRow(pickerRowKey, i.id)}>
                  <Text style={styles.pickerRowText}>{i.name}</Text>
                  <Text style={styles.pickerRowSub}>{i.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setPickerRowKey(null)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Linked-inventory picker for an Independent item */}
      <Modal visible={linkedPickerOpen} transparent animationType="fade" onRequestClose={() => setLinkedPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={[styles.pickerTitle, modalHeadingOverride(styles.pickerTitle.fontSize)]}>Select Inventory Item</Text>
              <TouchableOpacity onPress={() => setLinkedPickerOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {inventory.map((i) => (
                <TouchableOpacity key={i.id} style={styles.pickerRow} onPress={() => { setLinkedInventoryItemId(i.id); setLinkedPickerOpen(false); }}>
                  <Text style={styles.pickerRowText}>{i.name}</Text>
                  <Text style={styles.pickerRowSub}>{i.unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setLinkedPickerOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Type scale, input metrics and modal chrome below are deliberately the same tokens
  // as InventoryScreen's (fieldLabel 12/700, fieldInput 34h/12, modalSheet, reasonPill)
  // so the Recipe Builder reads as part of the same inventory flow it feeds.
  title: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 3 },
  subtitle: { fontSize: 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 12 : 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4 : 4.5 },
  toggleRow: { gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 12 : 12 },
  togglePill: { backgroundColor: COLORS.cardAlt, borderRadius: 20, paddingVertical: isDesktopWeb ? 6 : 6, paddingHorizontal: isDesktopWeb ? 10 : 10.5 },
  togglePillActive: { backgroundColor: COLORS.button },
  toggleText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  toggleTextActive: { color: '#FFFFFF' },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.cardAlt, borderRadius: 8,
    paddingHorizontal: 10, height: 34, marginBottom: isDesktopWeb ? 12 : 12,
  },
  pickerBtnText: { fontSize: 12, color: COLORS.heading },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 9 : 9 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 3 : 3 },
  addRowText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 6 : 6 },
  ingredientPickerBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.cardAlt, borderRadius: 8,
    paddingHorizontal: 10, height: 34,
  },
  ingredientPickerText: { fontSize: 12, color: COLORS.heading, flexShrink: 1 },
  qtyInput: {
    flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8,
    paddingHorizontal: 10, height: 34, fontSize: 12, color: COLORS.heading,
  },
  unitInput: {
    width: 60, backgroundColor: COLORS.cardAlt, borderRadius: 8,
    paddingHorizontal: 10, height: 34, fontSize: 12, color: COLORS.heading,
  },
  costCard: {
    backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 10 : 10.5, marginTop: isDesktopWeb ? 12 : 12,
  },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 3 : 3 },
  costLabel: { fontSize: 12, color: COLORS.muted },
  costValue: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  foodCostLabel: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  foodCostValue: { fontSize: isDesktopWeb ? 22 : 12, fontWeight: 'bold' },
  costHint: { fontSize: 10, color: COLORS.muted, marginTop: isDesktopWeb ? 4 : 4.5, lineHeight: 14 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: isDesktopWeb ? 7 : 7.5, marginTop: isDesktopWeb ? 9 : 9,
  },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 17 : 18 },
  pickerSheet: { width: '100%', backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, maxHeight: '85%', overflow: 'hidden' },
  pickerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 6 : 6 },
  pickerTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, flexShrink: 1 },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  pickerRowText: { fontSize: 12, color: COLORS.heading },
  pickerRowSub: { fontSize: 12, color: COLORS.muted },
  pickerCancelBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderRadius: 6, paddingVertical: isDesktopWeb ? 7 : 7.5, marginTop: isDesktopWeb ? 9 : 9,
  },
  pickerCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
});
