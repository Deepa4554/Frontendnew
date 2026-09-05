import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CloseButton } from '../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Image, Switch, Modal, ActivityIndicator, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { SearchClearButton } from '../../../../shared/components/atoms/SearchClearButton';
import { Tooltip } from '../../../../shared/components/atoms/Tooltip';
import { showToast } from '../../../../core/store/uiSlice';
import { useThemeColors } from '../../../../core/theme/useThemeColors';
import {
  useMenuItems,
  useBestSellers,
  useTodaysBestSeller,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  useDeleteAllMenuItems,
  useToggleMenuAvailability,
  useBulkCreateMenuItems,
  useMenuItemImages,
  useAddMenuItemImage,
  useRemoveMenuItemImage,
  useVariants,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useModifiers,
  useCreateModifier,
  useDeleteModifier,
  useCreateModifierOption,
  useDeleteModifierOption,
} from '../../../../core/api/hooks/useMenu';
import { useStations } from '../../../../core/api/hooks/useStations';
import { useTaxGroups } from '../../../../core/api/hooks/useTaxGroups';
import { useSettings } from '../../../../core/api/hooks/useSettings';
import {
  useCategories,
  useSetCategoryDefaultStation,
  useApplyCategoryStationToItems,
  useCreateCategory,
  useRenameCategory,
  useDeleteCategory,
  useReorderCategories,
} from '../../../../core/api/hooks/useCategories';
import { useBulkImportRecipes } from '../../../../core/api/hooks/useRecipe';
import { MenuItem, CreateMenuItemRequest } from '../../../../core/api/menuApi';
import { Category, CategoryMutationResult } from '../../../../core/api/categoriesApi';
import { RecipeImportRowError } from '../../../../core/api/recipeApi';
import { getApiErrorMessage } from '../../../../core/network/api';
import { ReportExportService } from '../../../../core/utils/reportExport';
import { pickAndParseCsv, normalizeMenuCsvRows } from '../../../../core/utils/csvMenuImport';
import { pickAndParseRecipeSheet, normalizeRecipeImportRows } from '../../../../core/utils/csvRecipeImport';
import { pickImageAsDataUri } from '../../../../core/utils/imagePicker';
import { extractMenuItemsFromPhoto } from '../../../../core/utils/menuPhotoImport';
import { useResponsive } from '../../../../core/utils/useResponsive';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../shared/components/molecules/CategoryFilterModal';
import { SkeletonGrid } from '../../../../shared/components/atoms/Skeleton';
import { LoadingOverlay } from '../../../../shared/components/atoms/LoadingOverlay';
import { VegNonVegBadge } from '../../../../shared/components/atoms/VegNonVegBadge';
import menuPlaceholderImage from '../../../../assets/menu-placeholder.png';

import { modalHeadingOverride } from '../../../../shared/design/commonStyles';
import { DesktopPageHeader } from '../../../../shared/components/desktop/DesktopPageHeader';

const MAX_ITEM_IMAGES = 8;

// ========== VARIANTS SECTION ==========
const VariantsSection = ({ menuItemId }: { menuItemId: number }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const { data: variants = [], isLoading } = useVariants(menuItemId);
  const createVariant = useCreateVariant();
  const deleteVariant = useDeleteVariant();

  const [showAddVariant, setShowAddVariant] = useState(false);
  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState('');

  const handleAddVariant = async () => {
    if (!variantName.trim() || !variantPrice.trim()) {
      dispatch(showToast({ message: 'Name and price required', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const parsedPrice = parseFloat(variantPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      dispatch(showToast({ message: 'Enter a valid price greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createVariant.mutateAsync({
        menuItemId,
        req: { name: variantName.trim(), price: parsedPrice },
      });
      setShowAddVariant(false);
      setVariantName('');
      setVariantPrice('');
    } catch (err) {
      dispatch(showToast({ message: 'Failed to add variant', icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDeleteVariant = (variantId: number, name: string) => {
    confirmAlert('Delete variant', `Remove "${name}"? Existing orders keep their own price snapshot — this only affects future orders.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVariant.mutateAsync({ menuItemId, variantId });
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete variant'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  return (
    <View>
      {isLoading ? (
        <ActivityIndicator color={COLORS.accent} />
      ) : (
        <>
          {variants.map((v) => (
            <View key={v.id} style={styles.variantRow}>
              <View>
                <Text style={styles.variantName}>{v.name}</Text>
                <Text style={styles.variantPrice}>₹{v.price.toFixed(2)}</Text>
              </View>
              <View style={styles.variantBadges}>
                {v.isDefault && <View style={styles.badgeDefault}><Text style={styles.badgeText}>Default</Text></View>}
                {!v.isAvailable && <View style={styles.badgeUnavailable}><Text style={styles.badgeText}>86'd</Text></View>}
                <Tooltip label="Delete variant" placement="left">
                  <TouchableOpacity onPress={() => handleDeleteVariant(v.id, v.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
                  </TouchableOpacity>
                </Tooltip>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addVariantBtn} onPress={() => setShowAddVariant(!showAddVariant)}>
            <Icon name="plus" size={14} color={COLORS.accent} />
            <Text style={styles.addVariantText}>Add Variant</Text>
          </TouchableOpacity>
          {showAddVariant && (
            <View style={styles.variantForm}>
              <View style={styles.formInputWrap}>
                <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Name (e.g. Half)" placeholderTextColor={COLORS.placeholder} value={variantName} onChangeText={setVariantName} />
              </View>
              <View style={styles.formInputWrap}>
                <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Price" placeholderTextColor={COLORS.placeholder} value={variantPrice} onChangeText={(t) => setVariantPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
              </View>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddVariant} disabled={createVariant.isPending}>
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const MODIFIER_TYPES: { value: 'Radio' | 'MultiSelect' | 'Quantity'; label: string }[] = [
  { value: 'MultiSelect', label: 'Pick any (Add-ons)' },
  { value: 'Radio', label: 'Pick one (e.g. Spice)' },
  { value: 'Quantity', label: 'Quantity' },
];

// ========== MODIFIERS SECTION (Toppings / Add-ons / Spice level) ==========
const ModifiersSection = ({ menuItemId }: { menuItemId: number }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const { data: modifiers = [], isLoading } = useModifiers(menuItemId);
  const createModifier = useCreateModifier();
  const deleteModifier = useDeleteModifier();
  const createOption = useCreateModifierOption();
  const deleteOption = useDeleteModifierOption();

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'Radio' | 'MultiSelect' | 'Quantity'>('MultiSelect');
  const [groupRequired, setGroupRequired] = useState(false);

  // Which modifier group's "add option" mini-form is open, and its draft fields.
  const [addingOptionFor, setAddingOptionFor] = useState<number | null>(null);
  const [optionName, setOptionName] = useState('');
  const [optionPrice, setOptionPrice] = useState('');

  const handleAddGroup = async () => {
    if (!groupName.trim()) {
      dispatch(showToast({ message: 'Name required', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createModifier.mutateAsync({ menuItemId, name: groupName.trim(), type: groupType, isRequired: groupRequired });
      setShowAddGroup(false);
      setGroupName('');
      setGroupType('MultiSelect');
      setGroupRequired(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add group'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDeleteGroup = (modifierId: number, name: string) => {
    confirmAlert('Delete topping group', `Remove "${name}" and all its options? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteModifier.mutateAsync({ menuItemId, modifierId });
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete group'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  const handleAddOption = async (modifierId: number) => {
    if (!optionName.trim()) {
      dispatch(showToast({ message: 'Name required', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createOption.mutateAsync({ menuItemId, modifierId, name: optionName.trim(), price: parseFloat(optionPrice) || 0 });
      setAddingOptionFor(null);
      setOptionName('');
      setOptionPrice('');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add option'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDeleteOption = (modifierId: number, optionId: number) => {
    deleteOption.mutate({ menuItemId, modifierId, optionId });
  };

  return (
    <View>
      {isLoading ? (
        <ActivityIndicator color={COLORS.accent} />
      ) : (
        <>
          {modifiers.map((m) => (
            <View key={m.id} style={styles.modifierGroupCard}>
              <View style={styles.modifierGroupHeader}>
                <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                  <Text style={styles.variantName} numberOfLines={1} ellipsizeMode="tail">{m.name}</Text>
                  <Text style={styles.modifierGroupType}>{MODIFIER_TYPES.find((t) => t.value === m.type)?.label ?? m.type}{m.isRequired ? ' · Required' : ''}</Text>
                </View>
                <Tooltip label="Delete group" placement="left">
                  <TouchableOpacity onPress={() => handleDeleteGroup(m.id, m.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
                  </TouchableOpacity>
                </Tooltip>
              </View>

              {m.options.map((o) => (
                <View key={o.id} style={styles.modifierOptionRow}>
                  <Text style={styles.modifierOptionName} numberOfLines={1} ellipsizeMode="tail">{o.name}</Text>
                  <View style={styles.modifierOptionRight}>
                    <Text style={styles.variantPrice}>
                      {o.price > 0 ? `+₹${o.price.toFixed(2)}` : o.price < 0 ? `−₹${Math.abs(o.price).toFixed(2)}` : 'Free'}
                    </Text>
                    <Tooltip label="Remove option" placement="left">
                      <TouchableOpacity onPress={() => handleDeleteOption(m.id, o.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Icon name="close" size={14} color={COLORS.muted} />
                      </TouchableOpacity>
                    </Tooltip>
                  </View>
                </View>
              ))}

              {addingOptionFor === m.id ? (
                <View style={styles.variantForm}>
                  <View style={styles.formInputWrap}>
                    <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Option name (e.g. Extra Cheese)" placeholderTextColor={COLORS.placeholder} value={optionName} onChangeText={setOptionName} />
                  </View>
                  <View style={styles.formInputWrap}>
                    <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Price adjustment (e.g. 20, or 0 for free)" placeholderTextColor={COLORS.placeholder} value={optionPrice} onChangeText={setOptionPrice} keyboardType="decimal-pad" />
                  </View>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={() => handleAddOption(m.id)} disabled={createOption.isPending}>
                    <Text style={styles.modalSaveText}>Add Option</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.addVariantBtn} onPress={() => { setAddingOptionFor(m.id); setOptionName(''); setOptionPrice(''); }}>
                  <Icon name="plus" size={12} color={COLORS.accent} />
                  <Text style={styles.addVariantText}>Add Option</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addVariantBtn} onPress={() => setShowAddGroup(!showAddGroup)}>
            <Icon name="plus" size={14} color={COLORS.accent} />
            <Text style={styles.addVariantText}>Add Topping Group</Text>
          </TouchableOpacity>
          {showAddGroup && (
            <View style={styles.variantForm}>
              <View style={styles.formInputWrap}>
                <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Group name (e.g. Toppings, Spice Level)" placeholderTextColor={COLORS.placeholder} value={groupName} onChangeText={setGroupName} />
              </View>
              <View style={styles.categoryPickerRow}>
                {MODIFIER_TYPES.map((t) => (
                  <TouchableOpacity key={t.value} style={[styles.categoryPill, groupType === t.value && styles.categoryPillActive]} onPress={() => setGroupType(t.value)}>
                    <Text style={[styles.categoryText, groupType === t.value && styles.categoryTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={styles.variantName}>Required</Text>
                <Switch value={groupRequired} onValueChange={setGroupRequired} />
              </View>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddGroup} disabled={createModifier.isPending}>
                <Text style={styles.modalSaveText}>Add Group</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
};

type DraftVariant = { name: string; price: string };
type DraftModifierGroup = {
  name: string;
  type: 'Radio' | 'MultiSelect' | 'Quantity';
  isRequired: boolean;
  options: { name: string; price: string }[];
};

// ========== DRAFT VARIANTS SECTION (Add Item modal — no menu item id yet, so this
// holds edits in local state instead of calling the variants API directly) ==========
const DraftVariantsSection = ({ variants, onChange }: { variants: DraftVariant[]; onChange: (variants: DraftVariant[]) => void }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();

  const [showAddVariant, setShowAddVariant] = useState(false);
  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState('');

  const handleAddVariant = () => {
    if (!variantName.trim() || !variantPrice.trim()) {
      dispatch(showToast({ message: 'Name and price required', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    onChange([...variants, { name: variantName.trim(), price: variantPrice.trim() }]);
    setShowAddVariant(false);
    setVariantName('');
    setVariantPrice('');
  };

  const handleRemoveVariant = (index: number) => onChange(variants.filter((_, i) => i !== index));

  return (
    <View>
      {variants.map((v, i) => (
        <View key={i} style={styles.variantRow}>
          <View>
            <Text style={styles.variantName}>{v.name}</Text>
            <Text style={styles.variantPrice}>₹{(parseFloat(v.price) || 0).toFixed(2)}</Text>
          </View>
          <Tooltip label="Remove variant" placement="left">
            <TouchableOpacity onPress={() => handleRemoveVariant(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
            </TouchableOpacity>
          </Tooltip>
        </View>
      ))}
      <TouchableOpacity style={styles.addVariantBtn} onPress={() => setShowAddVariant(!showAddVariant)}>
        <Icon name="plus" size={14} color={COLORS.accent} />
        <Text style={styles.addVariantText}>Add Variant</Text>
      </TouchableOpacity>
      {showAddVariant && (
        <View style={styles.variantForm}>
          <View style={styles.formInputWrap}>
            <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Name (e.g. Half)" placeholderTextColor={COLORS.placeholder} value={variantName} onChangeText={setVariantName} />
          </View>
          <View style={styles.formInputWrap}>
            <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Price" placeholderTextColor={COLORS.placeholder} value={variantPrice} onChangeText={(t) => setVariantPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
          </View>
          <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddVariant}>
            <Text style={styles.modalSaveText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ========== DRAFT MODIFIERS SECTION (Add Item modal equivalent of ModifiersSection) ==========
const DraftModifiersSection = ({ groups, onChange }: { groups: DraftModifierGroup[]; onChange: (groups: DraftModifierGroup[]) => void }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'Radio' | 'MultiSelect' | 'Quantity'>('MultiSelect');
  const [groupRequired, setGroupRequired] = useState(false);

  const [addingOptionFor, setAddingOptionFor] = useState<number | null>(null);
  const [optionName, setOptionName] = useState('');
  const [optionPrice, setOptionPrice] = useState('');

  const handleAddGroup = () => {
    if (!groupName.trim()) {
      dispatch(showToast({ message: 'Name required', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    onChange([...groups, { name: groupName.trim(), type: groupType, isRequired: groupRequired, options: [] }]);
    setShowAddGroup(false);
    setGroupName('');
    setGroupType('MultiSelect');
    setGroupRequired(false);
  };

  const handleRemoveGroup = (index: number) => onChange(groups.filter((_, i) => i !== index));

  const handleAddOption = (groupIndex: number) => {
    if (!optionName.trim()) {
      dispatch(showToast({ message: 'Name required', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    onChange(groups.map((g, i) => (i === groupIndex ? { ...g, options: [...g.options, { name: optionName.trim(), price: optionPrice.trim() }] } : g)));
    setAddingOptionFor(null);
    setOptionName('');
    setOptionPrice('');
  };

  const handleRemoveOption = (groupIndex: number, optionIndex: number) =>
    onChange(groups.map((g, i) => (i === groupIndex ? { ...g, options: g.options.filter((_, oi) => oi !== optionIndex) } : g)));

  return (
    <View>
      {groups.map((g, gi) => (
        <View key={gi} style={styles.modifierGroupCard}>
          <View style={styles.modifierGroupHeader}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
              <Text style={styles.variantName} numberOfLines={1} ellipsizeMode="tail">{g.name}</Text>
              <Text style={styles.modifierGroupType}>{MODIFIER_TYPES.find((t) => t.value === g.type)?.label ?? g.type}{g.isRequired ? ' · Required' : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => handleRemoveGroup(gi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
            </TouchableOpacity>
          </View>

          {g.options.map((o, oi) => (
            <View key={oi} style={styles.modifierOptionRow}>
              <Text style={styles.modifierOptionName} numberOfLines={1} ellipsizeMode="tail">{o.name}</Text>
              <View style={styles.modifierOptionRight}>
                <Text style={styles.variantPrice}>{(parseFloat(o.price) || 0) > 0 ? `+₹${parseFloat(o.price).toFixed(2)}` : 'Free'}</Text>
                <TouchableOpacity onPress={() => handleRemoveOption(gi, oi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="close" size={14} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {addingOptionFor === gi ? (
            <View style={styles.variantForm}>
              <View style={styles.formInputWrap}>
                <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Option name (e.g. Extra Cheese)" placeholderTextColor={COLORS.placeholder} value={optionName} onChangeText={setOptionName} />
              </View>
              <View style={styles.formInputWrap}>
                <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Price adjustment (e.g. 20, or 0 for free)" placeholderTextColor={COLORS.placeholder} value={optionPrice} onChangeText={(t) => setOptionPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
              </View>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={() => handleAddOption(gi)}>
                <Text style={styles.modalSaveText}>Add Option</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addVariantBtn} onPress={() => { setAddingOptionFor(gi); setOptionName(''); setOptionPrice(''); }}>
              <Icon name="plus" size={12} color={COLORS.accent} />
              <Text style={styles.addVariantText}>Add Option</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <TouchableOpacity style={styles.addVariantBtn} onPress={() => setShowAddGroup(!showAddGroup)}>
        <Icon name="plus" size={14} color={COLORS.accent} />
        <Text style={styles.addVariantText}>Add Topping Group</Text>
      </TouchableOpacity>
      {showAddGroup && (
        <View style={styles.variantForm}>
          <View style={styles.formInputWrap}>
            <TextInput style={[styles.formInput, styles.formInputNoMargin]} placeholder="Group name (e.g. Toppings, Spice Level)" placeholderTextColor={COLORS.placeholder} value={groupName} onChangeText={setGroupName} />
          </View>
          <View style={styles.categoryPickerRow}>
            {MODIFIER_TYPES.map((t) => (
              <TouchableOpacity key={t.value} style={[styles.categoryPill, groupType === t.value && styles.categoryPillActive]} onPress={() => setGroupType(t.value)}>
                <Text style={[styles.categoryText, groupType === t.value && styles.categoryTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.variantName}>Required</Text>
            <Switch value={groupRequired} onValueChange={setGroupRequired} />
          </View>
          <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddGroup}>
            <Text style={styles.modalSaveText}>Add Group</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

/** Extra photo gallery for one menu item (plating shot, ingredients close-up, etc.) —
 * separate from the item's single cover Image field. Lives inside the Edit Item modal. */
const MenuItemImageGallery = ({ menuItemId }: { menuItemId: number }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const { data: images = [], isLoading } = useMenuItemImages(menuItemId);
  const addImage = useAddMenuItemImage();
  const removeImage = useRemoveMenuItemImage();
  const [uploading, setUploading] = useState(false);

  const handleAddPhoto = async () => {
    if (images.length >= MAX_ITEM_IMAGES) {
      dispatch(showToast({ message: `An item can have at most ${MAX_ITEM_IMAGES} photos — remove one first.`, icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    setUploading(true);
    try {
      const dataUri = await pickImageAsDataUri({ crop: true });
      if (!dataUri) return; // user closed the file dialog, or the crop step, without choosing anything
      await addImage.mutateAsync({ menuItemId, dataUri });
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : getApiErrorMessage(err, 'Could not add photo'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (imageId: number) => {
    removeImage.mutate({ menuItemId, imageId });
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>Photos ({images.length}/{MAX_ITEM_IMAGES})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
        {isLoading ? (
          <ActivityIndicator size="small" color={COLORS.accent} style={{ marginVertical: 20, marginLeft: 4 }} />
        ) : (
          images.map((img) => (
            <View key={img.id} style={styles.photoThumbWrap}>
              <Image source={{ uri: img.dataUri }} style={styles.photoThumb} />
              <TouchableOpacity
                style={styles.photoRemoveBtn}
                onPress={() => handleRemovePhoto(img.id)}
                disabled={removeImage.isPending}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Icon name="close" size={12} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity style={styles.photoAddBtn} onPress={handleAddPhoto} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Icon name="camera-plus-outline" size={22} color={COLORS.accent} />}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};
// One menu-grid card. React.memo'd and given referentially-stable props (memoized `styles`,
// ref-backed callbacks) so the whole grid skips re-render while the user types — in the search
// box, or in the Add/Edit modal that sits above this still-mounted grid. React Query's
// structural sharing keeps an unchanged item's identity stable across refetches, so a card
// re-renders only when its own item's data actually changes. Same pattern as POSCheckout's MenuRow.
const MenuCard = React.memo(({ item, cardWidthPct, styles, COLORS, onEditPrice, onEdit, onOpenRecipe, onToggleAvailable, onToggleSpecial }: {
  item: MenuItem;
  cardWidthPct: '48%' | '31%' | '23%';
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
  onEditPrice: (item: MenuItem) => void;
  onEdit: (item: MenuItem) => void;
  onOpenRecipe: (item: MenuItem) => void;
  onToggleAvailable: (item: MenuItem) => void;
  onToggleSpecial: (item: MenuItem) => void;
}) => (
  <View style={[styles.itemCard, { width: cardWidthPct }, !item.available && styles.itemCardDisabled]}>
    {item.popular && item.available && (
      <View style={styles.aiSuggestBadge}>
        <Icon name="star" size={10} color={COLORS.accent} />
        <Text style={styles.aiSuggestText}>SPECIAL</Text>
      </View>
    )}
    {!item.available && (
      <View style={styles.unavailableBadge}>
        <Text style={styles.unavailableBadgeText}>UNAVAILABLE</Text>
      </View>
    )}

    <View style={styles.menuIconRow}>
      <Image source={item.image ? { uri: item.image } : menuPlaceholderImage} style={styles.menuThumb} />
      <TouchableOpacity onPress={() => onEditPrice(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={styles.menuPrice}>₹{item.price.toFixed(2)}</Text>
      </TouchableOpacity>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <VegNonVegBadge type={item.vegNonVegType} size={11} />
      <Text style={styles.menuName} numberOfLines={1}>{item.name}</Text>
    </View>
    <View style={styles.menuMetaRow}>
      <Text style={styles.menuSubtitle} numberOfLines={1}>{item.category}</Text>
      {!!item.shortCode && (
        <View style={styles.shortCodeBadge}>
          <Text style={styles.shortCodeBadgeText}>{item.shortCode}</Text>
        </View>
      )}
    </View>

    <View style={styles.itemIconsRow}>
      {/* One tap marks the cafe's special — the flag behind it (MenuItem.popular) already
          drove this badge and the QR page's Best Sellers fallback, it simply had no way to be
          set from anywhere in the app. Filled star = on, outline = off. */}
      <TouchableOpacity
        onPress={() => onToggleSpecial(item)}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel={item.popular ? `Remove ${item.name} from specials` : `Mark ${item.name} as special`}
      >
        <Icon name={item.popular ? 'star' : 'star-outline'} size={15} color={item.popular ? COLORS.accent : COLORS.muted} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onEdit(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Icon name="pencil-outline" size={14} color={COLORS.accent} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onOpenRecipe(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Icon name="chef-hat" size={14} color={COLORS.accent} />
      </TouchableOpacity>
      <Switch
        value={item.available}
        onValueChange={() => onToggleAvailable(item)}
        trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
        thumbColor="#FFFFFF"
        style={styles.cardSwitch}
      />
    </View>
  </View>
));

export const MenuScreen = ({ navigation }: any) => {
  const COLORS = useThemeColors();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { screenSize, isDesktopWeb } = useResponsive();
  // Memoized so the large StyleSheet isn't rebuilt on every keystroke re-render, and so
  // MenuCard's React.memo actually holds — an unstable `styles` identity would defeat it.
  const styles = useMemo(() => makeStyles(COLORS, isDesktopWeb), [COLORS, isDesktopWeb]);
  // Same breakpoints as the POS Checkout menu grid, so this screen's cards match it exactly.
  const cardWidthPct = screenSize === 'mobile' ? '48%' : screenSize === 'tablet' ? '31%' : '23%';
  const { data: items = [], isLoading: menuLoading } = useMenuItems();
  const { data: categories = [] } = useCategories();
  // Union of the categories items actually sit in and the ones the server knows about —
  // no hardcoded list that could drift from reality (same reasoning as `zones` on Tables).
  // The server side of that union is what makes a category created empty from Manage
  // Categories pickable: with nothing in it yet, the items alone don't know it exists.
  //
  // Order follows the server's list (the Owner's arrangement, see MenuCategory.SortOrder);
  // anything the server hasn't caught up on yet trails alphabetically behind it.
  const CATEGORIES = useMemo(() => {
    const ordered = categories.map((c) => c.name);
    const known = new Set(ordered);
    const rest = Array.from(new Set(items.map((i) => i.category))).filter((c) => !known.has(c)).sort();
    return ['All', ...ordered, ...rest];
  }, [items, categories]);
  const ADD_ITEM_CATEGORIES = useMemo(() => CATEGORIES.filter((c) => c !== 'All'), [CATEGORIES]);
  const { data: bestSellers = [] } = useBestSellers();
  const { data: todaysBestSellers = [] } = useTodaysBestSeller();
  const { data: stations = [] } = useStations();
  const activeStations = useMemo(() => stations.filter((s) => s.active), [stations]);
  const { data: taxGroups = [] } = useTaxGroups();
  // Shown on the "Default" pill so the picker states the rate an unassigned item actually
  // bills at, rather than just saying "Default".
  const defaultTaxGroup = useMemo(() => taxGroups.find((t) => t.isDefault), [taxGroups]);
  const { data: settings } = useSettings();
  const setCategoryDefaultStation = useSetCategoryDefaultStation();
  const applyCategoryStationToItems = useApplyCategoryStationToItems();
  const createCategory = useCreateCategory();
  const renameCategory = useRenameCategory();
  const deleteCategory = useDeleteCategory();
  const reorderCategories = useReorderCategories();
  const createMenuItem = useCreateMenuItem();
  const updateMenuItem = useUpdateMenuItem();
  const deleteMenuItem = useDeleteMenuItem();
  const deleteAllMenuItems = useDeleteAllMenuItems();
  const toggleAvailability = useToggleMenuAvailability();
  const bulkCreate = useBulkCreateMenuItems();
  const bulkImportRecipes = useBulkImportRecipes();
  const createDraftVariant = useCreateVariant();
  const createDraftModifierGroup = useCreateModifier();
  const createDraftModifierOption = useCreateModifierOption();
  const [activeCategory, setActiveCategory] = useState('All');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  // Manage Categories row state. Only one row can be mid-edit at a time — starting a
  // rename cancels a pending delete and vice versa — so these are single values rather
  // than per-row maps. null on the drafts means "that inline editor is closed".
  const [addCategoryDraft, setAddCategoryDraft] = useState<string | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [deleteMoveTo, setDeleteMoveTo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [priceEditor, setPriceEditor] = useState<MenuItem | null>(null);
  const [draftPrice, setDraftPrice] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importingPhoto, setImportingPhoto] = useState(false);
  const [importingRecipes, setImportingRecipes] = useState(false);
  const [recipeImportErrors, setRecipeImportErrors] = useState<RecipeImportRowError[] | null>(null);

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editShortCode, setEditShortCode] = useState('');
  const [editStationId, setEditStationId] = useState<number | null>(null);
  const [editItemType, setEditItemType] = useState<'Recipe' | 'Retail' | 'Service' | 'Combo'>('Recipe');
  // null = "no slab of its own", which bills at the cafe's default tax group (or the flat
  // Cafe Settings rate when there is none). Sent as 0 to clear — see UpdateMenuItemRequest.
  const [editTaxGroupId, setEditTaxGroupId] = useState<number | null>(null);
  const [editHsnCode, setEditHsnCode] = useState('');
  const [editVegNonVeg, setEditVegNonVeg] = useState<'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian' | null>(null);
  // MRP item — the till asks for the rate when this is added to an order, and bills it
  // tax-inclusive. The Price field below stays the last-known rate (what the grid shows and
  // what the rate prompt pre-fills). See MenuItem.isOpenPrice.
  const [editIsOpenPrice, setEditIsOpenPrice] = useState(false);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState(ADD_ITEM_CATEGORIES[0]);
  const [newPrice, setNewPrice] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newProductType, setNewProductType] = useState<'Prepared' | 'Independent'>('Prepared');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newShortCode, setNewShortCode] = useState('');
  const [newStationId, setNewStationId] = useState<number | null>(null);
  // Whether the user has manually picked a station in this add-flow yet — while false,
  // switching Category auto-prefills the station from that category's configured
  // default (see CategoriesController); a manual pick always wins from then on.
  const [stationTouched, setStationTouched] = useState(false);
  const [newItemType, setNewItemType] = useState<'Recipe' | 'Retail' | 'Service' | 'Combo'>('Recipe');
  const [newVegNonVeg, setNewVegNonVeg] = useState<'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian' | null>(null);
  const [newIsOpenPrice, setNewIsOpenPrice] = useState(false);
  const [uploadingNewImage, setUploadingNewImage] = useState(false);
  // Draft variants/toppings for the Add flow: kept as plain local state (rather than
  // API calls like the Edit modal's VariantsSection/ModifiersSection use) because
  // there's no menu item id to attach them to until saveNewItem creates one — they're
  // posted to the API right after that create call succeeds.
  const [newVariants, setNewVariants] = useState<DraftVariant[]>([]);
  const [newModifierGroups, setNewModifierGroups] = useState<DraftModifierGroup[]>([]);

  /** The tenant's existing spelling of a category name, or undefined. Case-insensitive so
   * "rolls" resolves to "Rolls" — the same rule the server enforces, checked here first so
   * a merge can be spelled out to the user before anything is written. */
  const existingCategoryMatch = (name: string) =>
    ADD_ITEM_CATEGORIES.find((c) => c.toLowerCase() === name.trim().toLowerCase());

  const openCategoryManager = () => {
    setAddCategoryDraft(null);
    setRenamingCategory(null);
    setRenameDraft('');
    setDeletingCategory(null);
    setDeleteMoveTo(null);
    setCategoryManagerVisible(true);
  };

  /** Rename and delete both shuffle items and offers around behind a single tap, so the
   * toast states what actually moved rather than a bare "Saved". */
  const mutationSummary = (lead: string, res: CategoryMutationResult) => {
    const parts = [lead];
    if (res.movedItemCount > 0) parts.push(`${res.movedItemCount} item${res.movedItemCount === 1 ? '' : 's'} moved`);
    if (res.updatedOfferCount > 0) parts.push(`${res.updatedOfferCount} offer${res.updatedOfferCount === 1 ? '' : 's'} updated`);
    return parts.join(' · ');
  };

  /** Moves one category a single place up or down and persists the whole resulting order.
   * The server is sent every category, not just the two that swapped, because a menu that
   * has never been arranged has no stored positions at all — this first move is what pins
   * the rest of the order down as the alphabetical one the user is looking at. */
  const moveCategory = async (name: string, direction: -1 | 1) => {
    const order = categories.map((c) => c.name);
    const from = order.indexOf(name);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, ...order.splice(from, 1));
    try {
      await reorderCategories.mutateAsync(order);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not reorder categories'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const submitNewCategory = async () => {
    const typed = (addCategoryDraft ?? '').trim();
    if (!typed) {
      dispatch(showToast({ message: 'Type a category name first.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const existing = existingCategoryMatch(typed);
    if (existing) {
      dispatch(showToast({ message: `"${existing}" already exists.`, icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createCategory.mutateAsync(typed);
      setAddCategoryDraft(null);
      dispatch(showToast({ message: `"${typed}" added — it's empty until you put an item in it.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add the category'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  /** Every place a category name is held in local state has to follow the rename/delete,
   * or it silently points at a name the menu no longer has: the grid filter would show an
   * empty menu, and an item modal left open behind this one would re-create the old
   * category on save. `to` is null when the name is simply gone. */
  const repointCategoryState = (from: string, to: string | null) => {
    setActiveCategory((prev) => (prev === from ? to ?? 'All' : prev));
    setNewCategory((prev) => (prev === from ? to ?? ADD_ITEM_CATEGORIES.find((c) => c !== from) ?? '' : prev));
    setEditCategory((prev) => (prev === from ? to ?? '' : prev));
  };

  const runRename = async (from: string, to: string) => {
    try {
      const res = await renameCategory.mutateAsync({ name: from, newName: to });
      repointCategoryState(from, res.name);
      setRenamingCategory(null);
      dispatch(showToast({
        message: mutationSummary(res.mergedInto ? `Merged into "${res.name}"` : `Renamed to "${res.name}"`, res),
        icon: 'check-circle',
        tone: 'success',
      }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not rename the category'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const submitRename = (itemCount: number) => {
    if (!renamingCategory) return;
    const typed = renameDraft.trim();
    if (!typed) {
      dispatch(showToast({ message: 'Type a category name first.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (typed === renamingCategory) {
      setRenamingCategory(null);
      return;
    }
    const clash = existingCategoryMatch(typed);
    // A pure change of casing ("rolls" -> "Rolls") matches itself here, and is a rename of
    // the same category rather than a merge into another one — don't warn about that.
    if (clash && clash.toLowerCase() !== renamingCategory.toLowerCase()) {
      confirmAlert(
        'Merge categories?',
        `"${clash}" already exists. Its items and the ${itemCount} in "${renamingCategory}" will be merged into one category, and any offer scoped to either one will apply to the whole lot. This can't be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', style: 'destructive', onPress: () => runRename(renamingCategory, typed) },
        ],
      );
      return;
    }
    runRename(renamingCategory, typed);
  };

  const runDelete = async (name: string, moveTo?: string) => {
    try {
      const res = await deleteCategory.mutateAsync({ name, moveTo });
      repointCategoryState(name, moveTo ?? null);
      setDeletingCategory(null);
      setDeleteMoveTo(null);
      dispatch(showToast({ message: mutationSummary(`"${name}" deleted`, res), icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete the category'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const startDelete = (cat: Category) => {
    setRenamingCategory(null);
    // Nothing to rehome, so no "move items to" step to make them sit through.
    if (cat.itemCount === 0) {
      confirmAlert('Delete category', `Remove "${cat.name}"? Nothing is in it.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runDelete(cat.name) },
      ]);
      return;
    }
    setDeletingCategory(cat.name);
    setDeleteMoveTo(null);
  };

  const confirmDeleteWithMove = (cat: Category) => {
    if (!deleteMoveTo) {
      dispatch(showToast({ message: 'Choose where these items should go.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    confirmAlert(
      'Delete category',
      `"${cat.name}"'s ${cat.itemCount} item${cat.itemCount === 1 ? '' : 's'} will move to "${deleteMoveTo}", and any offer scoped to "${cat.name}" will follow them. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runDelete(cat.name, deleteMoveTo) },
      ],
    );
  };

  const pickCoverImage = async (setter: (dataUri: string) => void, setUploading: (b: boolean) => void) => {
    setUploading(true);
    try {
      const dataUri = await pickImageAsDataUri({ crop: true });
      if (!dataUri) return; // user closed the file dialog, or the crop step, without choosing anything
      setter(dataUri);
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : 'Could not upload photo', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setUploading(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const q = search.toLowerCase();
      // A fully-numeric query is a full short code (e.g. "24") — match it exactly so it
      // doesn't also hit "124"/"244". Alphabetic codes stay substring-matched.
      const numericQ = /^\d+$/.test(q);
      const code = (item.shortCode ?? '').toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        (numericQ ? code === q : code.includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [items, activeCategory, search]);

  const [exportingMenu, setExportingMenu] = useState<'pdf' | 'excel' | null>(null);

  /**
   * The whole menu as a working list, split into the items that still need a photo and the
   * ones that already have one — because the reason to take this list out of the app is
   * almost always to go and get those photos made.
   *
   * Exports every item, not `filteredItems`: the category chips and search box are for
   * working on screen, and a file called "Menu Items" that quietly held only one category
   * would be worse than no export. Images themselves are deliberately not included — they are
   * base64 data URIs running to tens of KB each and would bloat the file for no use.
   */
  const handleExportMenu = async (format: 'pdf' | 'excel') => {
    setExportingMenu(format);
    try {
      if (items.length === 0) {
        dispatch(showToast({ message: 'No menu items to export yet.', icon: 'information-outline', tone: 'warning' }));
        return;
      }
      const columns = [
        { key: 'name', label: 'Item' },
        { key: 'category', label: 'Category' },
        { key: 'price', label: 'Price', align: 'right' as const, format: (v: unknown) => `₹${Number(v).toFixed(2)}` },
        { key: 'subtitle', label: 'Description' },
        { key: 'available', label: 'Available' },
      ];
      const toRow = (m: MenuItem) => ({
        name: m.name,
        category: m.category,
        price: m.price,
        subtitle: m.subtitle ?? '',
        available: m.available ? 'Yes' : 'No',
      });
      const needsPhoto = items.filter((m) => !m.image);
      const hasPhoto = items.filter((m) => !!m.image);
      const def = {
        title: 'Menu Items',
        businessName: settings?.businessName ?? 'CafePOS',
        dateRangeLabel: `${items.length} items · ${needsPhoto.length} still need a photo`,
        sections: [
          { title: `Photo needed (${needsPhoto.length})`, columns, rows: needsPhoto.map(toRow) },
          { title: `Already has a photo (${hasPhoto.length})`, columns, rows: hasPhoto.map(toRow) },
        ],
      };
      if (format === 'pdf') await ReportExportService.exportToPDF(def);
      else await ReportExportService.exportToExcel(def);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not build the menu export'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setExportingMenu(null);
    }
  };

  /**
   * The same filtered items, but broken into category blocks so "All" reads as a menu rather
   * than one long undifferentiated grid — which is what made finding an item to edit hard.
   *
   * Category order follows CATEGORIES (the cafe's own saved order, see the categories memo),
   * not first-appearance, so the screen matches the order everything else prints in. A single
   * selected category yields one unlabelled block, so nothing changes in that view.
   */
  const groupedItems = useMemo(() => {
    if (activeCategory !== 'All') {
      return filteredItems.length ? [{ category: activeCategory, items: filteredItems, showHeading: false }] : [];
    }
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of filteredItems) {
      const bucket = byCategory.get(item.category);
      if (bucket) bucket.push(item);
      else byCategory.set(item.category, [item]);
    }
    const ordered = CATEGORIES.filter((c) => c !== 'All' && byCategory.has(c));
    // Anything sitting in a category the chip row doesn't know about would otherwise vanish
    // from "All" entirely — worse than showing it under its own heading at the end.
    const orphans = [...byCategory.keys()].filter((c) => !ordered.includes(c));
    return [...ordered, ...orphans].map((category) => ({
      category,
      items: byCategory.get(category)!,
      showHeading: true,
    }));
  }, [filteredItems, activeCategory, CATEGORIES]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length };
    for (const cat of CATEGORIES) {
      if (cat === 'All') continue;
      counts[cat] = items.filter((item) => item.category === cat).length;
    }
    return counts;
  }, [items]);

  const openPriceEditor = (item: MenuItem) => {
    setPriceEditor(item);
    setDraftPrice(item.price);
  };

  const savePrice = async () => {
    if (!priceEditor) return;
    if (draftPrice <= 0) {
      dispatch(showToast({ message: 'Price must be greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await updateMenuItem.mutateAsync({ id: priceEditor.id, req: { price: draftPrice } });
      setPriceEditor(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update price'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditPrice(String(item.price));
    setEditSubtitle(item.subtitle);
    setEditDescription(item.description ?? '');
    setEditImage(item.image || null);
    setEditShortCode(item.shortCode ?? '');
    setEditStationId(item.stationId);
    setEditItemType(item.itemType);
    setEditVegNonVeg(item.vegNonVegType ?? null);
    setEditTaxGroupId(item.taxGroupId ?? null);
    setEditHsnCode(item.hsnCode ?? '');
    setEditIsOpenPrice(item.isOpenPrice);
  };

  // Referentially-stable card callbacks so MenuCard's React.memo holds. Each parent re-render
  // (every search keystroke, every Add/Edit-modal keystroke) would otherwise hand all cards
  // fresh function props and re-render the whole grid. Refs always point at the latest closure,
  // so behaviour is identical to calling the handlers directly. See POSCheckoutScreen's MenuRow.
  const openPriceEditorRef = useRef(openPriceEditor);
  openPriceEditorRef.current = openPriceEditor;
  const onCardEditPrice = useCallback((item: MenuItem) => openPriceEditorRef.current(item), []);

  const openEditModalRef = useRef(openEditModal);
  openEditModalRef.current = openEditModal;
  const onCardEdit = useCallback((item: MenuItem) => openEditModalRef.current(item), []);

  const toggleAvailabilityRef = useRef(toggleAvailability);
  toggleAvailabilityRef.current = toggleAvailability;
  const onCardToggleAvailable = useCallback((item: MenuItem) => toggleAvailabilityRef.current.mutate(item.id), []);

  // Via a ref for the same reason onCardToggleAvailable uses one: MenuCard is React.memo'd,
  // and a callback identity that changed on every render would defeat that for every card.
  const updateMenuItemRef = useRef(updateMenuItem);
  updateMenuItemRef.current = updateMenuItem;
  const onCardToggleSpecial = useCallback((item: MenuItem) => {
    updateMenuItemRef.current.mutate(
      { id: item.id, req: { popular: !item.popular } },
      {
        onError: (err) =>
          dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update the special'), icon: 'alert-circle-outline', tone: 'danger' })),
      },
    );
  }, [dispatch]);

  const onCardOpenRecipe = useCallback((item: MenuItem) => navigation.navigate('RecipeBuilder', { menuItemId: item.id }), [navigation]);

  const saveEditedItem = async () => {
    if (!editingItem) return;
    const price = parseFloat(editPrice);
    if (!editName.trim()) {
      dispatch(showToast({ message: 'Give the item a name before saving.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    // MRP items bill at the rate typed at the till, so their menu price is only the
    // prompt's pre-fill default — allow saving one without a price (falls back to 0).
    // Non-MRP items still need a real price greater than 0.
    if (!editIsOpenPrice && (!editPrice.trim() || isNaN(price) || price <= 0)) {
      dispatch(showToast({ message: 'Enter a price greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const safePrice = isNaN(price) || price < 0 ? 0 : price;
    try {
      await updateMenuItem.mutateAsync({
        id: editingItem.id,
        req: {
          name: editName.trim(),
          category: editCategory.trim() || editingItem.category,
          price: safePrice,
          subtitle: editSubtitle.trim(),
          description: editDescription.trim() || undefined,
          image: editImage ?? '',
          shortCode: editShortCode.trim() || null,
          stationId: editStationId ?? undefined,
          itemType: editItemType,
          vegNonVegType: editVegNonVeg,
          // 0 clears it back to the cafe default — undefined would mean "leave unchanged".
          taxGroupId: editTaxGroupId ?? 0,
          // Empty string clears the override back to the cafe default (see UpdateMenuItemRequest).
          hsnCode: editHsnCode.trim(),
          isOpenPrice: editIsOpenPrice,
        },
      });
      setEditingItem(null);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save changes'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const confirmDeleteItem = () => {
    if (!editingItem) return;
    confirmAlert('Delete item', `Remove "${editingItem.name}" from the menu? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMenuItem.mutateAsync(editingItem.id);
            setEditingItem(null);
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete item'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  // Wipes the whole menu — past orders keep their own name/price snapshot and aren't
  // affected (see MenuController.DeleteAll), but this is otherwise unrecoverable, so the
  // item count is spelled out in the warning rather than a generic "are you sure?".
  const confirmDeleteAllItems = () => {
    if (items.length === 0) return;
    confirmAlert('Delete entire menu', `Remove all ${items.length} menu item${items.length === 1 ? '' : 's'}? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAllMenuItems.mutateAsync();
            dispatch(showToast({ message: 'Menu cleared.', icon: 'check-circle', tone: 'success' }));
          } catch (err) {
            dispatch(showToast({ message: getApiErrorMessage(err, 'Could not delete the menu'), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  // A category's configured default station (if any), else this cafe's first active
  // station — the same fallback openAddModal always used before categories existed.
  const stationForCategory = (category: string) =>
    categories.find((c) => c.name === category)?.defaultStationId ?? activeStations[0]?.id ?? null;

  const openAddModal = () => {
    const initialCategory = ADD_ITEM_CATEGORIES[0];
    setNewName('');
    setNewCategory(initialCategory);
    setNewPrice('');
    setNewSubtitle('');
    setNewDescription('');
    setNewProductType('Prepared');
    setNewImage(null);
    setNewShortCode('');
    setNewStationId(stationForCategory(initialCategory));
    setStationTouched(false);
    setNewItemType('Recipe');
    setNewVegNonVeg(null);
    setNewIsOpenPrice(false);
    setNewVariants([]);
    setNewModifierGroups([]);
    setAddModalVisible(true);
  };

  const saveNewItem = async () => {
    const price = parseFloat(newPrice);
    if (!newName.trim()) {
      dispatch(showToast({ message: 'Give the item a name before saving.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    // MRP items bill at the rate typed at the till, so their menu price is only the
    // prompt's pre-fill default — allow saving one without a price (falls back to 0).
    // Non-MRP items still need a real price greater than 0.
    if (!newIsOpenPrice && (!newPrice.trim() || isNaN(price) || price <= 0)) {
      dispatch(showToast({ message: 'Enter a price greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    // Reachable on a brand-new menu: with no items there are no category pills to
    // preselect, so Manage Categories is the only way to fill this in.
    if (!newCategory?.trim()) {
      dispatch(showToast({ message: 'Pick a category, or add a new one.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    const safePrice = isNaN(price) || price < 0 ? 0 : price;
    try {
      const created = await createMenuItem.mutateAsync({
        name: newName.trim(),
        category: newCategory,
        price: safePrice,
        subtitle: newSubtitle.trim() || undefined,
        description: newDescription.trim() || undefined,
        productType: newProductType,
        image: newImage ?? undefined,
        shortCode: newShortCode.trim() || null,
        stationId: newStationId ?? undefined,
        itemType: newItemType,
        vegNonVegType: newVegNonVeg,
        isOpenPrice: newIsOpenPrice,
      });

      // Persist any draft variants/toppings now that the item has an id. Best-effort:
      // one failing shouldn't block the rest, since the item itself already saved —
      // the user can always finish up from the Edit modal we jump into below.
      let draftSaveFailed = false;
      for (const v of newVariants) {
        const variantPrice = parseFloat(v.price);
        if (!v.name.trim() || isNaN(variantPrice)) continue;
        try {
          await createDraftVariant.mutateAsync({ menuItemId: created.id, req: { name: v.name.trim(), price: variantPrice } });
        } catch {
          draftSaveFailed = true;
        }
      }
      for (const g of newModifierGroups) {
        if (!g.name.trim()) continue;
        try {
          const savedGroup = await createDraftModifierGroup.mutateAsync({ menuItemId: created.id, name: g.name.trim(), type: g.type, isRequired: g.isRequired });
          for (const o of g.options) {
            if (!o.name.trim()) continue;
            try {
              await createDraftModifierOption.mutateAsync({ menuItemId: created.id, modifierId: savedGroup.id, name: o.name.trim(), price: parseFloat(o.price) || 0 });
            } catch {
              draftSaveFailed = true;
            }
          }
        } catch {
          draftSaveFailed = true;
        }
      }
      if (draftSaveFailed) {
        dispatch(showToast({ message: 'Item saved, but a variant or topping failed to save — check Edit to retry.', icon: 'alert-circle-outline', tone: 'warning' }));
      }

      setAddModalVisible(false);
      setNewVariants([]);
      setNewModifierGroups([]);
      // Straight into the edit modal rather than the RecipeBuilder screen: the image
      // gallery still needs a saved item's id (each photo uploads via its own API
      // call), so it only exists here. The Recipe builder is still one tap away too.
      openEditModal(created);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not add item'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleImportCsv = async () => {
    setImporting(true);
    try {
      const picked = await pickAndParseCsv();
      if (!picked) return; // user closed the file dialog without choosing anything
      const parsed = normalizeMenuCsvRows(picked.rows);
      if (parsed.length === 0) {
        dispatch(showToast({ message: 'The CSV needs at least a name and price column, with a positive price on each row.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      const result = await bulkCreate.mutateAsync(parsed);
      dispatch(showToast({
        message: result.skippedCount > 0
          ? `Added ${result.createdCount} items. Skipped ${result.skippedCount} row(s) with a missing name or invalid price.`
          : `Added ${result.createdCount} items.`,
        icon: 'check-circle',
        tone: 'success',
      }));
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : getApiErrorMessage(err, 'Could not import CSV'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setImporting(false);
    }
  };

  const handleImportPhoto = async () => {
    setImportingPhoto(true);
    try {
      // Uncropped — this needs the whole menu page to find every item on it;
      // forcing the usual square crop (see the other two photo pickers on this
      // screen) would cut items off a landscape/portrait page before OCR sees them.
      const dataUri = await pickImageAsDataUri({ crop: false });
      if (!dataUri) return; // user closed the file dialog without choosing anything

      const extracted = await extractMenuItemsFromPhoto(dataUri);

      if (extracted.length === 0) {
        dispatch(showToast({ message: "Couldn't find any menu items in that photo. Try a clearer, well-lit shot.", icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }

      const result = await bulkCreate.mutateAsync(extracted);
      const base = result.skippedCount > 0
        ? `Added ${result.createdCount} items from the photo. Skipped ${result.skippedCount} that looked incomplete.`
        : `Added ${result.createdCount} items from the photo.`;
      dispatch(showToast({
        message: `${base} (Scanned on-device — double-check these.)`,
        icon: 'check-circle',
        tone: 'success',
      }));
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : getApiErrorMessage(err, 'Could not read that photo'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setImportingPhoto(false);
    }
  };

  /** Bulk-wires Recipe + Inventory from a CSV/Excel file — the menu items themselves must
   * already exist (this only links ingredients to them), so it lives here next to the menu
   * item import rather than on the Inventory screen. See csvRecipeImport.ts for the columns. */
  const handleImportRecipeSheet = async () => {
    setImportingRecipes(true);
    try {
      const picked = await pickAndParseRecipeSheet();
      if (!picked) return; // user closed the file dialog without choosing anything
      const parsed = normalizeRecipeImportRows(picked.rows);
      if (parsed.length === 0) {
        dispatch(showToast({
          message: 'No usable rows found. Columns needed: MenuItemName, IngredientName, QuantityPerServing, Unit.',
          icon: 'alert-circle-outline', tone: 'warning',
        }));
        return;
      }
      const result = await bulkImportRecipes.mutateAsync(parsed);
      dispatch(showToast({
        message: `Updated ${result.menuItemsUpdated} recipe(s).`
          + (result.ingredientsCreated > 0 ? ` Added ${result.ingredientsCreated} new ingredient(s) to Inventory — set their stock and rate there.` : '')
          + (result.rowsWithErrors > 0 ? ` ${result.rowsWithErrors} row(s) had errors.` : ''),
        icon: result.rowsWithErrors > 0 ? 'alert-circle-outline' : 'check-circle',
        tone: result.rowsWithErrors > 0 ? 'warning' : 'success',
      }));
      if (result.errors.length > 0) setRecipeImportErrors(result.errors);
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : getApiErrorMessage(err, 'Could not import that file'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setImportingRecipes(false);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader
        icon="food"
        title="Menu"
        right={(
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={confirmDeleteAllItems}
            disabled={deleteAllMenuItems.isPending || items.length === 0}
            accessibilityLabel="Delete entire menu"
          >
            {deleteAllMenuItems.isPending ? (
              <ActivityIndicator size="small" color={COLORS.dangerAccent} />
            ) : (
              <Icon name="trash-can-outline" size={20} color={items.length === 0 ? COLORS.muted : COLORS.dangerAccent} />
            )}
          </TouchableOpacity>
        )}
      />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              // A brand-new account lands here directly after onboarding's menu-import
              // step (see postOnboardingIntent) — Menu is the stack's root screen in that
              // case, so there's nothing behind it to go back to; goBack() would silently
              // no-op. Fall back to Home instead of leaving the button dead.
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate('MainTabs');
            }}
          >
            <Icon name="arrow-left" size={20} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="food" size={22} color={COLORS.accent} />
          <Text style={styles.brandTitle} numberOfLines={1}>Menu</Text>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={confirmDeleteAllItems}
            disabled={deleteAllMenuItems.isPending || items.length === 0}
            accessibilityLabel="Delete entire menu"
          >
            {deleteAllMenuItems.isPending ? (
              <ActivityIndicator size="small" color={COLORS.dangerAccent} />
            ) : (
              <Icon name="trash-can-outline" size={20} color={items.length === 0 ? COLORS.muted : COLORS.dangerAccent} />
            )}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <TouchableOpacity style={styles.importBanner} onPress={handleImportCsv} disabled={importing} activeOpacity={0.85}>
          <View style={styles.importBannerIcon}>
            {importing ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Icon name="file-upload-outline" size={20} color={COLORS.accent} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.importBannerTitle}>Import your menu from a CSV file</Text>
            <Text style={styles.importBannerDesc}>Columns: name, category, price, subtitle, description</Text>
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.muted} />
        </TouchableOpacity>

        <View style={styles.importBanner}>
          <View style={styles.importBannerIcon}>
            <Icon name="tray-arrow-down" size={20} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.importBannerTitle}>Export the menu list</Text>
            <Text style={styles.importBannerDesc}>
              Every item with its category, price and description — the items still missing a photo listed first, so you can hand that list straight to whoever is making them.
            </Text>
          </View>
          {(['excel', 'pdf'] as const).map((format) => (
            <TouchableOpacity
              key={format}
              style={styles.menuExportBtn}
              disabled={exportingMenu !== null}
              onPress={() => handleExportMenu(format)}
            >
              {exportingMenu === format ? (
                <ActivityIndicator size="small" color={COLORS.heading} />
              ) : (
                <Icon name={format === 'excel' ? 'file-excel-outline' : 'file-pdf-box'} size={15} color={COLORS.heading} />
              )}
              <Text style={styles.menuExportBtnText}>{format === 'excel' ? 'Excel' : 'PDF'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.importBanner} onPress={handleImportRecipeSheet} disabled={importingRecipes} activeOpacity={0.85}>
          <View style={styles.importBannerIcon}>
            {importingRecipes ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Icon name="chef-hat" size={20} color={COLORS.accent} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.importBannerTitle}>Import recipes from Excel/CSV</Text>
            <Text style={styles.importBannerDesc}>Columns: MenuItemName, IngredientName, QuantityPerServing, Unit. Menu items must already exist; new ingredients are added to Inventory for you to price.</Text>
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.muted} />
        </TouchableOpacity>

        {Platform.OS === 'web' && (
          // OCR (Tesseract.js) needs a browser Worker + WebAssembly environment
          // that Hermes/React Native doesn't provide — web/desktop only.
          <TouchableOpacity style={styles.importBanner} onPress={handleImportPhoto} disabled={importingPhoto} activeOpacity={0.85}>
            <View style={styles.importBannerIcon}>
              {importingPhoto ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <Icon name="camera-outline" size={20} color={COLORS.accent} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.importBannerTitle}>Import your menu from a photo</Text>
              <Text style={styles.importBannerDesc}>Snap your printed menu — items and categories are added automatically</Text>
            </View>
            <Icon name="chevron-right" size={20} color={COLORS.muted} />
          </TouchableOpacity>
        )}

        {todaysBestSellers.length > 0 && (
          <>
            <View style={styles.bestSellersHeader}>
              <Icon name="fire" size={16} color={COLORS.accent} />
              <Text style={styles.bestSellersTitle}>Today's Best Sellers</Text>
              <Text style={styles.bestSellersSubtitle}>Since midnight</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bestSellersRow}>
              {todaysBestSellers.map((item) => (
                <View key={item.id} style={styles.bestSellerCard}>
                  <Image source={menuPlaceholderImage} style={styles.bestSellerImage} />
                  <Text style={styles.bestSellerName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.bestSellerFooter}>
                    <Text style={styles.bestSellerPrice}>₹{item.price.toFixed(2)}</Text>
                    {item.unitsSold > 0 && (
                      <View style={styles.bestSellerBadge}>
                        <Text style={styles.bestSellerBadgeText}>{item.unitsSold} sold</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {bestSellers.length > 0 && (
          <>
            <View style={styles.bestSellersHeader}>
              <Icon name="fire" size={16} color={COLORS.accent} />
              <Text style={styles.bestSellersTitle}>Best Sellers</Text>
              <Text style={styles.bestSellersSubtitle}>Last 30 days</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bestSellersRow}>
              {bestSellers.map((item) => (
                <View key={item.id} style={styles.bestSellerCard}>
                  <Image source={menuPlaceholderImage} style={styles.bestSellerImage} />
                  <Text style={styles.bestSellerName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.bestSellerFooter}>
                    <Text style={styles.bestSellerPrice}>₹{item.price.toFixed(2)}</Text>
                    {item.unitsSold > 0 && (
                      <View style={styles.bestSellerBadge}>
                        <Text style={styles.bestSellerBadgeText}>{item.unitsSold} sold</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        <View style={styles.searchWrapper}>
          <TextInput
            style={[styles.searchInput, { paddingRight: 24 }]}
            placeholder="Search menu items..."
            placeholderTextColor={COLORS.placeholder}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && <SearchClearButton onPress={() => setSearch('')} />}
        </View>

        <View style={styles.categoryRowWithManage}>
          <CategoryFilterTrigger
            label={`${activeCategory} · ${categoryCounts[activeCategory] ?? 0}`}
            onPress={() => setCategoryPickerVisible(true)}
          />
          <TouchableOpacity
            style={styles.manageCategoriesBtn}
            onPress={openCategoryManager}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Manage categories"
          >
            <Icon name="cog-outline" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        </View>
        <CategoryFilterModal
          visible={categoryPickerVisible}
          onClose={() => setCategoryPickerVisible(false)}
          title="Menu Categories"
          categories={CATEGORIES}
          activeCategory={activeCategory}
          counts={categoryCounts}
          onSelect={setActiveCategory}
        />

        {menuLoading && <SkeletonGrid items={6} columns={2} style={{ paddingHorizontal: 16 }} />}

        {!menuLoading && groupedItems.map((group) => (
          <View key={group.category}>
            {/* Only under "All" — inside a single category the heading would just repeat the
                chip already selected above the list. */}
            {group.showHeading && (
              <View style={styles.groupHeaderRow}>
                <Text style={styles.groupHeaderText}>{group.category}</Text>
                <Text style={styles.groupHeaderCount}>{group.items.length}</Text>
              </View>
            )}
            <View style={styles.grid}>
              {group.items.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  cardWidthPct={cardWidthPct}
                  styles={styles}
                  COLORS={COLORS}
                  onEditPrice={onCardEditPrice}
                  onEdit={onCardEdit}
                  onOpenRecipe={onCardOpenRecipe}
                  onToggleAvailable={onCardToggleAvailable}
                  onToggleSpecial={onCardToggleSpecial}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ---------- Add Item Modal ---------- */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Add Menu Item</Text>
              <CloseButton onPress={() => setAddModalVisible(false)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>Fill in the details — it goes live on POS immediately.</Text>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Name</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. Caramel Macchiato"
                  placeholderTextColor={COLORS.placeholder}
                  value={newName}
                  onChangeText={setNewName}
                />
              </View>

              <Text style={styles.fieldLabel}>Photo (optional)</Text>
              <TouchableOpacity
                style={styles.coverPhotoPicker}
                activeOpacity={0.8}
                onPress={() => pickCoverImage(setNewImage, setUploadingNewImage)}
                disabled={uploadingNewImage}
              >
                {newImage ? (
                  <Image source={{ uri: newImage }} style={styles.coverPhotoPreview} />
                ) : uploadingNewImage ? (
                  <ActivityIndicator size="small" color={COLORS.accent} />
                ) : (
                  <>
                    <Icon name="camera-plus-outline" size={22} color={COLORS.muted} />
                    <Text style={styles.coverPhotoPickerText}>Tap to add a photo</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Category</Text>
                <TouchableOpacity onPress={() => openCategoryManager()}>
                  <Text style={styles.manageCategoriesLink}>Manage categories</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.categoryPickerRow}>
                {ADD_ITEM_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryPill, newCategory === cat && styles.categoryPillActive]}
                    onPress={() => {
                      setNewCategory(cat);
                      // Prefill the station from this category's default unless the
                      // user has already deliberately picked one this add-flow.
                      if (!stationTouched) setNewStationId(stationForCategory(cat));
                    }}
                  >
                    <Text style={[styles.categoryText, newCategory === cat && styles.categoryTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Product Type</Text>
              <View style={styles.categoryPickerRow}>
                <TouchableOpacity
                  style={[styles.categoryPill, newProductType === 'Prepared' && styles.categoryPillActive]}
                  onPress={() => setNewProductType('Prepared')}
                >
                  <Text style={[styles.categoryText, newProductType === 'Prepared' && styles.categoryTextActive]}>Prepared (recipe)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.categoryPill, newProductType === 'Independent' && styles.categoryPillActive]}
                  onPress={() => setNewProductType('Independent')}
                >
                  <Text style={[styles.categoryText, newProductType === 'Independent' && styles.categoryTextActive]}>Independent (own stock)</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Price (₹)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. 5.00"
                  placeholderTextColor={COLORS.placeholder}
                  value={newPrice}
                  onChangeText={(t) => setNewPrice(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                />
              </View>

              <Text style={styles.fieldLabel}>Subtitle (optional)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. Rich & Creamy"
                  placeholderTextColor={COLORS.placeholder}
                  value={newSubtitle}
                  onChangeText={setNewSubtitle}
                />
              </View>

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formTextarea, styles.formInputNoMargin]}
                  placeholder="Short description shown to guests"
                  placeholderTextColor={COLORS.placeholder}
                  value={newDescription}
                  onChangeText={setNewDescription}
                  multiline
                />
              </View>

              <Text style={styles.fieldLabel}>Short Code (optional, max 5 chars)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. CAPP"
                  placeholderTextColor={COLORS.placeholder}
                  value={newShortCode}
                  onChangeText={(t) => setNewShortCode(t.toUpperCase().slice(0, 5))}
                  maxLength={5}
                />
              </View>

              <Text style={styles.fieldLabel}>Kitchen Station</Text>
              <View style={styles.categoryPickerRow}>
                {activeStations.length === 0 ? (
                  <Text style={styles.emptyStationsHint}>
                    No stations set up yet — add one from Cafe Settings → Kitchen Stations. New items default to "Kitchen".
                  </Text>
                ) : (
                  activeStations.map((station) => (
                    <TouchableOpacity
                      key={station.id}
                      style={[styles.categoryPill, newStationId === station.id && styles.categoryPillActive]}
                      onPress={() => { setNewStationId(station.id); setStationTouched(true); }}
                    >
                      <Text style={[styles.categoryText, newStationId === station.id && styles.categoryTextActive]}>{station.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <Text style={styles.fieldLabel}>Item Type</Text>
              <View style={styles.categoryPickerRow}>
                {(['Recipe', 'Retail', 'Service', 'Combo'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.categoryPill, newItemType === type && styles.categoryPillActive]}
                    onPress={() => setNewItemType(type)}
                  >
                    <Text style={[styles.categoryText, newItemType === type && styles.categoryTextActive]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Veg/Non-veg (optional)</Text>
              <View style={styles.categoryPickerRow}>
                {([null, 'Veg', 'NonVeg', 'Jain', 'Eggetarian'] as const).map((type) => (
                  <TouchableOpacity
                    key={type || 'none'}
                    style={[styles.categoryPill, newVegNonVeg === type && styles.categoryPillActive]}
                    onPress={() => setNewVegNonVeg(type)}
                  >
                    <Text style={[styles.categoryText, newVegNonVeg === type && styles.categoryTextActive]}>
                      {type || 'None'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.openPriceRow}>
                <Text style={styles.fieldLabel}>Sold at MRP</Text>
                <Switch value={newIsOpenPrice} onValueChange={setNewIsOpenPrice} />
              </View>
              <Text style={styles.emptyStationsHint}>
                {newIsOpenPrice
                  ? 'The till will ask for this item’s rate each time it’s added, and treat that rate as final — tax is taken out of it, never added on top. The Price above is only the default the prompt starts with. Not orderable from the customer QR menu.'
                  : 'Turn on for packaged goods (soft drinks, water, chips) whose printed rate changes between packs.'}
              </Text>

              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.heading, marginTop: 10, marginBottom: 6 }}>Variants (Half/Full)</Text>
              <DraftVariantsSection variants={newVariants} onChange={setNewVariants} />

              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.heading, marginTop: 10, marginBottom: 6 }}>Toppings & Add-ons</Text>
              <DraftModifiersSection groups={newModifierGroups} onChange={setNewModifierGroups} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={saveNewItem} disabled={createMenuItem.isPending}>
                  <Icon name="check" size={14} color="#FFFFFF" />
                  <Text style={styles.modalSaveText}>Add Item</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Edit Item Modal ---------- */}
      <Modal visible={!!editingItem} transparent animationType="fade" onRequestClose={() => setEditingItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Edit Menu Item</Text>
              <CloseButton onPress={() => setEditingItem(null)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>Update details or remove this item from the menu.</Text>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Name</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. Caramel Macchiato"
                  placeholderTextColor={COLORS.placeholder}
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>

              <Text style={styles.fieldLabel}>Photo</Text>
              <TouchableOpacity
                style={styles.coverPhotoPicker}
                activeOpacity={0.8}
                onPress={() => pickCoverImage(setEditImage, setUploadingEditImage)}
                disabled={uploadingEditImage}
              >
                {editImage ? (
                  <Image source={{ uri: editImage }} style={styles.coverPhotoPreview} />
                ) : uploadingEditImage ? (
                  <ActivityIndicator size="small" color={COLORS.accent} />
                ) : (
                  <>
                    <Icon name="camera-plus-outline" size={22} color={COLORS.muted} />
                    <Text style={styles.coverPhotoPickerText}>Tap to add a photo</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Category</Text>
                <TouchableOpacity onPress={() => openCategoryManager()}>
                  <Text style={styles.manageCategoriesLink}>Manage categories</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.categoryPickerRow}>
                {ADD_ITEM_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryPill, editCategory === cat && styles.categoryPillActive]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text style={[styles.categoryText, editCategory === cat && styles.categoryTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Price (₹)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. 5.00"
                  placeholderTextColor={COLORS.placeholder}
                  value={editPrice}
                  onChangeText={(t) => setEditPrice(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                />
              </View>

              <Text style={styles.fieldLabel}>Subtitle (optional)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. Rich & Creamy"
                  placeholderTextColor={COLORS.placeholder}
                  value={editSubtitle}
                  onChangeText={setEditSubtitle}
                />
              </View>

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formTextarea, styles.formInputNoMargin]}
                  placeholder="Short description shown to guests"
                  placeholderTextColor={COLORS.placeholder}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                />
              </View>

              <Text style={styles.fieldLabel}>Short Code (optional, max 5 chars)</Text>
              <View style={styles.formInputWrap}>
                <TextInput
                  style={[styles.formInput, styles.formInputNoMargin]}
                  placeholder="e.g. CAPP"
                  placeholderTextColor={COLORS.placeholder}
                  value={editShortCode}
                  onChangeText={(t) => setEditShortCode(t.toUpperCase().slice(0, 5))}
                  maxLength={5}
                />
              </View>

              <Text style={styles.fieldLabel}>Kitchen Station</Text>
              <View style={styles.categoryPickerRow}>
                {activeStations.length === 0 ? (
                  <Text style={styles.emptyStationsHint}>
                    No stations set up yet — add one from Cafe Settings → Kitchen Stations.
                  </Text>
                ) : (
                  activeStations.map((station) => (
                    <TouchableOpacity
                      key={station.id}
                      style={[styles.categoryPill, editStationId === station.id && styles.categoryPillActive]}
                      onPress={() => setEditStationId(station.id)}
                    >
                      <Text style={[styles.categoryText, editStationId === station.id && styles.categoryTextActive]}>{station.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <Text style={styles.fieldLabel}>Tax Slab</Text>
              <View style={styles.categoryPickerRow}>
                {/* "Default" isn't a slab of its own — it leaves taxGroupId null so the
                    item follows whichever group is flagged default (or Cafe Settings'
                    flat rate if none is). */}
                <TouchableOpacity
                  style={[styles.categoryPill, editTaxGroupId === null && styles.categoryPillActive]}
                  onPress={() => setEditTaxGroupId(null)}
                >
                  <Text style={[styles.categoryText, editTaxGroupId === null && styles.categoryTextActive]}>
                    Default{defaultTaxGroup ? ` (${defaultTaxGroup.ratePct}%)` : settings ? ` (${settings.taxRatePct}%)` : ''}
                  </Text>
                </TouchableOpacity>
                {taxGroups.map((group) => (
                  <TouchableOpacity
                    key={group.id}
                    style={[styles.categoryPill, editTaxGroupId === group.id && styles.categoryPillActive]}
                    onPress={() => setEditTaxGroupId(group.id)}
                  >
                    <Text style={[styles.categoryText, editTaxGroupId === group.id && styles.categoryTextActive]}>{group.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {taxGroups.length === 0 && (
                <Text style={styles.emptyStationsHint}>
                  No tax slabs set up yet — add them from Cafe Settings → Tax Slabs to bill different GST rates.
                </Text>
              )}

              {/* Only worth showing once the cafe actually prints HSN codes — until a default is
                  set, no bill carries one and a per-item override would go nowhere. */}
              {settings?.defaultHsnCode && (
                <>
                  <Text style={styles.fieldLabel}>HSN / SAC Code</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editHsnCode}
                    onChangeText={setEditHsnCode}
                    placeholder={`Default (${settings.defaultHsnCode})`}
                    placeholderTextColor={COLORS.placeholder}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.emptyStationsHint}>
                    Leave blank to use the cafe's default. Set one only for packaged goods that carry their
                    own HSN. Changing it never restates an invoice already issued.
                  </Text>
                </>
              )}

              <Text style={styles.fieldLabel}>Item Type</Text>
              <View style={styles.categoryPickerRow}>
                {(['Recipe', 'Retail', 'Service', 'Combo'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.categoryPill, editItemType === type && styles.categoryPillActive]}
                    onPress={() => setEditItemType(type)}
                  >
                    <Text style={[styles.categoryText, editItemType === type && styles.categoryTextActive]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Veg/Non-veg (optional)</Text>
              <View style={styles.categoryPickerRow}>
                {([null, 'Veg', 'NonVeg', 'Jain', 'Eggetarian'] as const).map((type) => (
                  <TouchableOpacity
                    key={type || 'none'}
                    style={[styles.categoryPill, editVegNonVeg === type && styles.categoryPillActive]}
                    onPress={() => setEditVegNonVeg(type)}
                  >
                    <Text style={[styles.categoryText, editVegNonVeg === type && styles.categoryTextActive]}>
                      {type || 'None'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.openPriceRow}>
                <Text style={styles.fieldLabel}>Sold at MRP</Text>
                <Switch value={editIsOpenPrice} onValueChange={setEditIsOpenPrice} />
              </View>
              <Text style={styles.emptyStationsHint}>
                {editIsOpenPrice
                  ? 'The till will ask for this item’s rate each time it’s added, and treat that rate as final — tax is taken out of it, never added on top. The Price above is only the default the prompt starts with. Not orderable from the customer QR menu.'
                  : 'Turn on for packaged goods (soft drinks, water, chips) whose printed rate changes between packs.'}
              </Text>

              {editingItem && <MenuItemImageGallery menuItemId={editingItem.id} />}

              {editingItem && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.heading, marginTop: 10, marginBottom: 6 }}>Variants (Half/Full)</Text>
                  <VariantsSection menuItemId={editingItem.id} />
                </>
              )}

              {editingItem && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.heading, marginTop: 10, marginBottom: 6 }}>Toppings & Add-ons</Text>
                  <ModifiersSection menuItemId={editingItem.id} />
                </>
              )}

              {editingItem && (
                <TouchableOpacity
                  style={styles.recipeLinkBtn}
                  onPress={() => navigation.navigate('RecipeBuilder', { menuItemId: editingItem.id })}
                >
                  <Icon name="chef-hat" size={16} color={COLORS.accent} />
                  <Text style={styles.recipeLinkText}>Edit Recipe / Ingredients</Text>
                  <Icon name="chevron-right" size={14} color={COLORS.muted} />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.deleteItemBtn} onPress={confirmDeleteItem} disabled={deleteMenuItem.isPending}>
                <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
                <Text style={styles.deleteItemText}>Delete Item</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingItem(null)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEditedItem} disabled={updateMenuItem.isPending}>
                  <Icon name="check" size={14} color="#FFFFFF" />
                  <Text style={styles.modalSaveText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Price Editor Modal ---------- */}
      <Modal visible={!!priceEditor} transparent animationType="fade" onRequestClose={() => setPriceEditor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>{priceEditor?.name}</Text>
              <CloseButton onPress={() => setPriceEditor(null)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>Adjust price — updates instantly on POS</Text>

            <View style={styles.priceStepperRow}>
              <TouchableOpacity style={styles.priceStepBtn} onPress={() => setDraftPrice((p) => Math.max(0, p - 0.25))}>
                <Text style={styles.priceStepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.priceStepValue}>₹{draftPrice.toFixed(2)}</Text>
              <TouchableOpacity style={styles.priceStepBtn} onPress={() => setDraftPrice((p) => p + 0.25)}>
                <Text style={styles.priceStepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPriceEditor(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={savePrice}>
                <Icon name="check" size={14} color="#FFFFFF" />
                <Text style={styles.modalSaveText}>Save Price</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Manage Categories Modal ---------- */}
      <Modal visible={categoryManagerVisible} transparent animationType="fade" onRequestClose={() => setCategoryManagerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Manage Categories</Text>
              <CloseButton onPress={() => setCategoryManagerVisible(false)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>
              Add, rename, reorder or delete categories. The order here is the order they appear in on POS. A category's default station is what its new items prefill to — existing items only change if you tap "Apply to existing items."
            </Text>

            <ScrollView style={styles.modalFieldsScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {addCategoryDraft === null ? (
                <TouchableOpacity
                  style={[styles.categoryPill, styles.newCategoryPill, styles.addCategoryBtn]}
                  onPress={() => setAddCategoryDraft('')}
                >
                  <Icon name="plus" size={12} color={COLORS.accent} />
                  <Text style={[styles.categoryText, styles.newCategoryPillText]}>Add category</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.newCategoryRow}>
                  <View style={[styles.formInputWrap, styles.newCategoryInputWrap]}>
                    <TextInput
                      style={[styles.formInput, styles.formInputNoMargin]}
                      placeholder="e.g. Rolls"
                      placeholderTextColor={COLORS.placeholder}
                      value={addCategoryDraft}
                      onChangeText={setAddCategoryDraft}
                      onSubmitEditing={submitNewCategory}
                      returnKeyType="done"
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity style={styles.newCategoryActionBtn} onPress={submitNewCategory} disabled={createCategory.isPending}>
                    <Text style={styles.newCategoryAddText}>Add</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.newCategoryActionBtn} onPress={() => setAddCategoryDraft(null)}>
                    <Text style={styles.newCategoryCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}

              {categories.length === 0 && (
                <Text style={styles.emptyStationsHint}>No categories yet — add one above, then put items in it from Add Item.</Text>
              )}

              {categories.map((cat, index) => (
                <View key={cat.name} style={styles.categoryManagerRow}>
                  {renamingCategory === cat.name ? (
                    <View style={styles.newCategoryRow}>
                      <View style={[styles.formInputWrap, styles.newCategoryInputWrap]}>
                        <TextInput
                          style={[styles.formInput, styles.formInputNoMargin]}
                          placeholder="New name"
                          placeholderTextColor={COLORS.placeholder}
                          value={renameDraft}
                          onChangeText={setRenameDraft}
                          onSubmitEditing={() => submitRename(cat.itemCount)}
                          returnKeyType="done"
                          autoFocus
                        />
                      </View>
                      <TouchableOpacity style={styles.newCategoryActionBtn} onPress={() => submitRename(cat.itemCount)} disabled={renameCategory.isPending}>
                        <Text style={styles.newCategoryAddText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.newCategoryActionBtn} onPress={() => setRenamingCategory(null)}>
                        <Text style={styles.newCategoryCancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.categoryManagerHeaderRow}>
                      <Text style={[styles.categoryManagerName, styles.categoryManagerNameFlex]} numberOfLines={1}>
                        {cat.name} · {cat.itemCount} item{cat.itemCount === 1 ? '' : 's'}
                      </Text>
                      <TouchableOpacity
                        style={styles.categoryManagerIconBtn}
                        onPress={() => moveCategory(cat.name, -1)}
                        disabled={index === 0 || reorderCategories.isPending}
                        accessibilityLabel={`Move ${cat.name} up`}
                      >
                        <Icon name="chevron-up" size={18} color={index === 0 ? COLORS.inputBorder : COLORS.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.categoryManagerIconBtn}
                        onPress={() => moveCategory(cat.name, 1)}
                        disabled={index === categories.length - 1 || reorderCategories.isPending}
                        accessibilityLabel={`Move ${cat.name} down`}
                      >
                        <Icon name="chevron-down" size={18} color={index === categories.length - 1 ? COLORS.inputBorder : COLORS.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.categoryManagerIconBtn}
                        onPress={() => {
                          setDeletingCategory(null);
                          setRenamingCategory(cat.name);
                          setRenameDraft(cat.name);
                        }}
                        accessibilityLabel={`Rename ${cat.name}`}
                      >
                        <Icon name="pencil-outline" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.categoryManagerIconBtn}
                        onPress={() => startDelete(cat)}
                        accessibilityLabel={`Delete ${cat.name}`}
                      >
                        <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Only reached when the category still has items — an empty one is
                      confirmed and deleted outright from startDelete. */}
                  {deletingCategory === cat.name && (
                    <View style={styles.deleteMoveBlock}>
                      <Text style={styles.emptyStationsHint}>
                        Move its {cat.itemCount} item{cat.itemCount === 1 ? '' : 's'} to:
                      </Text>
                      <View style={styles.categoryPickerRow}>
                        {ADD_ITEM_CATEGORIES.filter((c) => c !== cat.name).map((other) => (
                          <TouchableOpacity
                            key={other}
                            style={[styles.categoryPill, deleteMoveTo === other && styles.categoryPillActive]}
                            onPress={() => setDeleteMoveTo(other)}
                          >
                            <Text style={[styles.categoryText, deleteMoveTo === other && styles.categoryTextActive]}>{other}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {ADD_ITEM_CATEGORIES.filter((c) => c !== cat.name).length === 0 ? (
                        <Text style={styles.emptyStationsHint}>
                          This is the only category left, so there's nowhere to move its items — add another one first.
                        </Text>
                      ) : (
                        <View style={styles.newCategoryRow}>
                          <TouchableOpacity style={styles.newCategoryActionBtn} onPress={() => confirmDeleteWithMove(cat)} disabled={deleteCategory.isPending}>
                            <Text style={styles.deleteConfirmText}>Delete category</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.newCategoryActionBtn} onPress={() => { setDeletingCategory(null); setDeleteMoveTo(null); }}>
                            <Text style={styles.newCategoryCancelText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {activeStations.length === 0 ? (
                    <Text style={styles.emptyStationsHint}>
                      No stations set up yet — add one from Cafe Settings → Kitchen Stations to route this category's items.
                    </Text>
                  ) : (
                    <View style={styles.categoryPickerRow}>
                      {activeStations.map((station) => (
                        <TouchableOpacity
                          key={station.id}
                          style={[styles.categoryPill, cat.defaultStationId === station.id && styles.categoryPillActive]}
                          onPress={() => setCategoryDefaultStation.mutate({ name: cat.name, stationId: station.id })}
                        >
                          <Text style={[styles.categoryText, cat.defaultStationId === station.id && styles.categoryTextActive]}>{station.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {cat.defaultStationId != null && cat.itemCount > 0 && (
                    <TouchableOpacity
                      style={styles.applyToItemsBtn}
                      onPress={() => confirmAlert(
                        'Apply to existing items?',
                        `This sets every item currently in "${cat.name}" to the ${cat.defaultStationName} station, overwriting any individual station picks already made. Continue?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Apply',
                            onPress: () => applyCategoryStationToItems.mutate({ name: cat.name, stationId: cat.defaultStationId! }),
                          },
                        ],
                      )}
                    >
                      <Text style={styles.applyToItemsBtnText}>Apply to existing items</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCategoryManagerVisible(false)}>
              <Text style={styles.modalCancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------- Recipe/Inventory Import — Row Errors ---------- */}
      <Modal visible={recipeImportErrors !== null} transparent animationType="fade" onRequestClose={() => setRecipeImportErrors(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Import row errors</Text>
              <CloseButton onPress={() => setRecipeImportErrors(null)} size={18} />
            </View>
            <Text style={styles.modalSubtitle}>
              These rows were skipped. Fix them in the file and re-import — everything else already went through.
            </Text>
            <ScrollView style={styles.modalFieldsScroll} showsVerticalScrollIndicator={false}>
              {(recipeImportErrors ?? []).map((e, idx) => (
                <View key={idx} style={styles.importErrorRow}>
                  <Text style={styles.importErrorRowNumber}>Row {e.rowNumber}</Text>
                  <Text style={styles.importErrorText}>
                    <Text style={{ fontWeight: '600' }}>{e.menuItemName}</Text>
                    {e.ingredientName ? ` / ${e.ingredientName}` : ''} — {e.reason}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <LoadingOverlay visible={toggleAvailability.isPending} message="Updating availability…" />
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: isDesktopWeb ? 11 : 12,
    paddingTop: isDesktopWeb ? 9 : 9,
    paddingBottom: isDesktopWeb ? 9 : 9,
  },
  brandTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    flex: 1,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    backgroundColor: COLORS.aiCardBg,
    marginHorizontal: isDesktopWeb ? 11 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 11 : 12,
  },
  importBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.heading,
  },
  importBannerDesc: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 2 : 1.5,
  },
  bestSellersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 4.5,
    paddingHorizontal: isDesktopWeb ? 11 : 12,
    marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  bestSellersTitle: {
    fontSize: isDesktopWeb ? 15 : 14,
    fontWeight: '800',
    color: COLORS.heading,
  },
  bestSellersSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginLeft: isDesktopWeb ? 3 : 3,
  },
  bestSellersRow: {
    paddingHorizontal: isDesktopWeb ? 11 : 12,
    gap: isDesktopWeb ? 9 : 9,
    paddingBottom: isDesktopWeb ? 4 : 3,
    marginBottom: isDesktopWeb ? 12 : 13.5,
  },
  bestSellerCard: {
    width: 130,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    overflow: 'hidden',
    paddingBottom: isDesktopWeb ? 7 : 7.5,
  },
  bestSellerImage: {
    width: '100%',
    height: 90,
  },
  bestSellerName: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginTop: isDesktopWeb ? 6 : 6,
    marginHorizontal: isDesktopWeb ? 7 : 7.5,
  },
  bestSellerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: isDesktopWeb ? 5 : 4.5,
    marginHorizontal: isDesktopWeb ? 7 : 7.5,
  },
  bestSellerPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  bestSellerBadge: {
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 5 : 4.5,
    paddingVertical: isDesktopWeb ? 2 : 1.5,
  },
  bestSellerBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.heading,
  },
  searchWrapper: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 11 : 12,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: 46,
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 8 : 10.5,
  },
  searchInput: {
    fontSize: 16,
    color: COLORS.heading,
  },
  categoryPill: {
    paddingHorizontal: isDesktopWeb ? 9 : 9,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
    borderRadius: 20,
    backgroundColor: COLORS.cardAlt,
  },
  categoryPillActive: {
    backgroundColor: COLORS.button,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: isDesktopWeb ? 11 : 12,
    gap: isDesktopWeb ? 6 : 6,
  },
  menuExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.card,
    marginLeft: 6,
  },
  menuExportBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: isDesktopWeb ? 11 : 12,
    marginTop: 14,
    marginBottom: 7,
  },
  groupHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  groupHeaderCount: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  // Mirrors POSCheckoutScreen's menuCard exactly (same bg/radius/padding), plus a
  // thumbnail image and a row of admin controls (edit/recipe/availability) that the
  // read-only POS card doesn't need.
  itemCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 7 : 6.75,
  },
  itemCardDisabled: {
    opacity: 0.5,
  },
  unavailableBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: isDesktopWeb ? 5 : 4.5,
    paddingVertical: isDesktopWeb ? 2 : 1.5,
    borderRadius: 6,
    marginBottom: isDesktopWeb ? 4 : 3.75,
  },
  unavailableBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.dangerAccent,
  },
  aiSuggestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 3 : 2.25,
    backgroundColor: COLORS.aiCardBg,
    alignSelf: 'flex-start',
    paddingHorizontal: isDesktopWeb ? 5 : 4.5,
    paddingVertical: isDesktopWeb ? 2 : 1.5,
    borderRadius: 6,
    marginBottom: isDesktopWeb ? 4 : 3.75,
  },
  aiSuggestText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.accent,
  },
  menuIconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 5 : 4.5,
  },
  menuThumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  menuPrice: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  menuName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 1 : 0.75,
  },
  menuSubtitle: {
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 5 : 4.5,
  },
  menuMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: isDesktopWeb ? 3 : 3,
  },
  shortCodeBadge: {
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 4,
    paddingHorizontal: isDesktopWeb ? 4 : 3.75,
    paddingVertical: isDesktopWeb ? 1 : 0.75,
    marginBottom: isDesktopWeb ? 5 : 4.5,
  },
  shortCodeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: COLORS.accent,
  },
  itemIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 7 : 7.5,
  },
  cardSwitch: {
    transform: [{ scaleX: 0.55 }, { scaleY: 0.55 }],
    marginLeft: isDesktopWeb ? -2 : -1.5,
  },
  recipeLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.aiCardBg,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 9 : 9,
    marginTop: isDesktopWeb ? 6 : 6,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  recipeLinkText: {
    flex: 1,
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 17 : 18,
  },
  modalSheet: {
    width: '100%',
    // Every other modalSheet in the app caps this on desktop web — missing here is why
    // the modal (and everything in it, e.g. the "Add Topping Group" input) stretched
    // edge-to-edge on a wide browser window instead of staying a sensible form width.
    maxWidth: isDesktopWeb ? 560 : undefined,
    maxHeight: '85%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 11 : 12,
    overflow: 'hidden',
  },
  modalFieldsScroll: {
    flexGrow: 0,
  },
  photoStrip: {
    marginBottom: isDesktopWeb ? 11 : 12,
  },
  coverPhotoPicker: {
    height: 120,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 11 : 12,
    overflow: 'hidden',
  },
  coverPhotoPreview: {
    width: '100%',
    height: '100%',
  },
  coverPhotoPickerText: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 5 : 4.5,
  },
  photoThumbWrap: {
    position: 'relative',
    marginRight: isDesktopWeb ? 7 : 7.5,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: COLORS.cardAlt,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.dangerAccent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  photoAddBtn: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    borderWidth: 1,
    borderColor: COLORS.dangerAccent,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 9 : 9,
    marginTop: isDesktopWeb ? 6 : 6,
    marginBottom: isDesktopWeb ? 11 : 12,
  },
  deleteItemText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.dangerAccent,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: isDesktopWeb ? 6 : 6,
  },
  modalTitle: {
    fontSize: isDesktopWeb ? 16 : 14,
    fontWeight: '800',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 3 : 3,
    flexShrink: 1,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  importErrorRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  importErrorRowNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.dangerAccent,
    marginBottom: 2,
  },
  importErrorText: {
    fontSize: 12,
    color: COLORS.heading,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    marginBottom: isDesktopWeb ? 3 : 3,
    marginTop: isDesktopWeb ? 3 : 3,
  },
  formInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 10,
    paddingVertical: isDesktopWeb ? 6 : undefined,
    height: isDesktopWeb ? undefined : 34,
    fontSize: 12,
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  // The ring-anchor wrapper around every formInput below — web's global focus-ring CSS
  // (see public/index.html) ring the input's DIRECT parent div, on the assumption that
  // div's box exactly matches the visible input. A plain `{ borderRadius: 8 }}` wrapper
  // doesn't carry formInput's own marginBottom, but as a flex container its auto-height
  // still counts that child margin — making the wrapper 6-8px taller than the input
  // itself, so the ring visibly poked out past the bottom edge. Moving the same spacing
  // onto the wrapper's own (external) margin instead, and cancelling it back out on the
  // input via formInputNoMargin, keeps the wrapper's box sized exactly to the input.
  formInputWrap: {
    borderRadius: 8,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  formInputNoMargin: {
    marginBottom: 0,
  },
  formTextarea: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  categoryPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isDesktopWeb ? 5 : 4.5,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  // Outlined rather than filled, so it reads as an action next to the solid category
  // pills instead of looking like one more category you could pick.
  newCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  newCategoryPillText: {
    color: COLORS.accent,
  },
  addCategoryBtn: {
    alignSelf: 'flex-start',
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageCategoriesLink: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  categoryManagerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 4.5,
  },
  categoryManagerNameFlex: {
    flex: 1,
    marginBottom: 0,
  },
  categoryManagerIconBtn: {
    padding: isDesktopWeb ? 5 : 4.5,
  },
  deleteMoveBlock: {
    marginTop: isDesktopWeb ? 6 : 6,
    marginBottom: isDesktopWeb ? 3 : 3,
  },
  deleteConfirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dangerAccent,
  },
  newCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 5 : 4.5,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  newCategoryInputWrap: {
    flex: 1,
    marginBottom: 0,
  },
  newCategoryActionBtn: {
    paddingHorizontal: isDesktopWeb ? 7 : 7.5,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
  },
  newCategoryAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
  newCategoryCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  emptyStationsHint: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 17,
  },
  openPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  categoryRowWithManage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
  },
  manageCategoriesBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryManagerRow: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    paddingBottom: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  categoryManagerName: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  applyToItemsBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: isDesktopWeb ? 7 : 7.5,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
  },
  applyToItemsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  priceStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 15 : 16.5,
    marginBottom: isDesktopWeb ? 15 : 16.5,
  },
  priceStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceStepBtnText: {
    fontSize: isDesktopWeb ? 24 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  priceStepValue: {
    fontSize: isDesktopWeb ? 28 : 12,
    fontWeight: '800',
    color: COLORS.accent,
    minWidth: 110,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 9 : 9,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
  },
  modalCancelText: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  modalSaveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 10 : 10.5,
  },
  modalSaveText: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Variants
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  variantName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  variantPrice: {
    fontSize: 12,
    color: COLORS.accent,
    marginTop: 1.5,
  },
  variantBadges: {
    flexDirection: 'row',
    gap: 4.5,
  },
  badgeDefault: {
    backgroundColor: COLORS.pillActiveBg,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeUnavailable: {
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.accent,
  },
  addVariantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 9,
    marginBottom: 9,
  },
  addVariantText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  variantForm: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: 9,
    gap: 6,
    marginBottom: 9,
  },

  // Modifiers (Add-ons / toppings)
  modifierGroupCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: 9,
    marginBottom: 6,
  },
  modifierGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  modifierGroupType: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1.5,
  },
  modifierOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4.5,
    borderTopWidth: 1,
    borderTopColor: COLORS.inputBorder,
  },
  modifierOptionName: {
    fontSize: 12,
    color: COLORS.heading,
    flex: 1,
    minWidth: 0,
  },
  modifierOptionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7.5,
  },
});
