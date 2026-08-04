import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Image, Switch, Modal, ActivityIndicator, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { confirmAlert } from '../../../../shared/components/ConfirmDialogHost';
import { SearchClearButton } from '../../../../shared/components/atoms/SearchClearButton';
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
import { useCategories, useSetCategoryDefaultStation, useApplyCategoryStationToItems } from '../../../../core/api/hooks/useCategories';
import { useBulkImportRecipes } from '../../../../core/api/hooks/useRecipe';
import { MenuItem, CreateMenuItemRequest } from '../../../../core/api/menuApi';
import { RecipeImportRowError } from '../../../../core/api/recipeApi';
import { getApiErrorMessage } from '../../../../core/network/api';
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
                <TouchableOpacity onPress={() => handleDeleteVariant(v.id, v.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
                </TouchableOpacity>
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
                <TouchableOpacity onPress={() => handleDeleteGroup(m.id, m.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
                </TouchableOpacity>
              </View>

              {m.options.map((o) => (
                <View key={o.id} style={styles.modifierOptionRow}>
                  <Text style={styles.modifierOptionName} numberOfLines={1} ellipsizeMode="tail">{o.name}</Text>
                  <View style={styles.modifierOptionRight}>
                    <Text style={styles.variantPrice}>
                      {o.price > 0 ? `+₹${o.price.toFixed(2)}` : o.price < 0 ? `−₹${Math.abs(o.price).toFixed(2)}` : 'Free'}
                    </Text>
                    <TouchableOpacity onPress={() => handleDeleteOption(m.id, o.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="close" size={14} color={COLORS.muted} />
                    </TouchableOpacity>
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
          <TouchableOpacity onPress={() => handleRemoveVariant(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="trash-can-outline" size={16} color={COLORS.dangerAccent} />
          </TouchableOpacity>
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
export const MenuScreen = ({ navigation }: any) => {
  const COLORS = useThemeColors();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { screenSize, isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  // Same breakpoints as the POS Checkout menu grid, so this screen's cards match it exactly.
  const cardWidthPct = screenSize === 'mobile' ? '48%' : screenSize === 'tablet' ? '31%' : '23%';
  const { data: items = [], isLoading: menuLoading } = useMenuItems();
  // Derived from whatever categories actually exist on the menu — no hardcoded
  // list that could drift from reality (same reasoning as `zones` on Tables).
  const CATEGORIES = useMemo(
    () => ['All', ...Array.from(new Set(items.map((i) => i.category))).sort()],
    [items],
  );
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
  const { data: categories = [] } = useCategories();
  const setCategoryDefaultStation = useSetCategoryDefaultStation();
  const applyCategoryStationToItems = useApplyCategoryStationToItems();
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
  const [editVegNonVeg, setEditVegNonVeg] = useState<'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian' | null>(null);
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
  const [uploadingNewImage, setUploadingNewImage] = useState(false);
  // Draft variants/toppings for the Add flow: kept as plain local state (rather than
  // API calls like the Edit modal's VariantsSection/ModifiersSection use) because
  // there's no menu item id to attach them to until saveNewItem creates one — they're
  // posted to the API right after that create call succeeds.
  const [newVariants, setNewVariants] = useState<DraftVariant[]>([]);
  const [newModifierGroups, setNewModifierGroups] = useState<DraftModifierGroup[]>([]);

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
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        (item.shortCode ?? '').toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [items, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length };
    for (const cat of CATEGORIES) {
      if (cat === 'All') continue;
      counts[cat] = items.filter((item) => item.category === cat).length;
    }
    return counts;
  }, [items]);

  const toggleAvailable = (id: number) => {
    toggleAvailability.mutate(id);
  };

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
  };

  const saveEditedItem = async () => {
    if (!editingItem) return;
    const price = parseFloat(editPrice);
    if (!editName.trim()) {
      dispatch(showToast({ message: 'Give the item a name before saving.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (!editPrice.trim() || isNaN(price) || price <= 0) {
      dispatch(showToast({ message: 'Enter a price greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await updateMenuItem.mutateAsync({
        id: editingItem.id,
        req: {
          name: editName.trim(),
          category: editCategory.trim() || editingItem.category,
          price,
          subtitle: editSubtitle.trim(),
          description: editDescription.trim() || undefined,
          image: editImage ?? '',
          shortCode: editShortCode.trim() || null,
          stationId: editStationId ?? undefined,
          itemType: editItemType,
          vegNonVegType: editVegNonVeg,
          // 0 clears it back to the cafe default — undefined would mean "leave unchanged".
          taxGroupId: editTaxGroupId ?? 0,
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
    if (!newPrice.trim() || isNaN(price) || price <= 0) {
      dispatch(showToast({ message: 'Enter a price greater than 0.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      const created = await createMenuItem.mutateAsync({
        name: newName.trim(),
        category: newCategory,
        price,
        subtitle: newSubtitle.trim() || undefined,
        description: newDescription.trim() || undefined,
        productType: newProductType,
        image: newImage ?? undefined,
        shortCode: newShortCode.trim() || null,
        stationId: newStationId ?? undefined,
        itemType: newItemType,
        vegNonVegType: newVegNonVeg,
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
            onPress={() => setCategoryManagerVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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

        <View style={styles.grid}>
          {!menuLoading && filteredItems.map((item) => (
            <View key={item.id} style={[styles.itemCard, { width: cardWidthPct }, !item.available && styles.itemCardDisabled]}>
              {item.popular && item.available && (
                <View style={styles.aiSuggestBadge}>
                  <Icon name="star" size={10} color={COLORS.accent} />
                  <Text style={styles.aiSuggestText}>POPULAR</Text>
                </View>
              )}
              {!item.available && (
                <View style={styles.unavailableBadge}>
                  <Text style={styles.unavailableBadgeText}>UNAVAILABLE</Text>
                </View>
              )}

              <View style={styles.menuIconRow}>
                <Image source={item.image ? { uri: item.image } : menuPlaceholderImage} style={styles.menuThumb} />
                <TouchableOpacity onPress={() => openPriceEditor(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
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
                <TouchableOpacity onPress={() => openEditModal(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Icon name="pencil-outline" size={14} color={COLORS.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('RecipeBuilder', { menuItemId: item.id })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Icon name="chef-hat" size={14} color={COLORS.accent} />
                </TouchableOpacity>
                <Switch
                  value={item.available}
                  onValueChange={() => toggleAvailable(item.id)}
                  trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
                  thumbColor="#FFFFFF"
                  style={styles.cardSwitch}
                />
              </View>
            </View>
          ))}
        </View>
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
              <TouchableOpacity onPress={() => setAddModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
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

              <Text style={styles.fieldLabel}>Category</Text>
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
              <TouchableOpacity onPress={() => setEditingItem(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
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

              <Text style={styles.fieldLabel}>Category</Text>
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
              <TouchableOpacity onPress={() => setPriceEditor(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
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

      {/* ---------- Category Default Stations Modal ---------- */}
      <Modal visible={categoryManagerVisible} transparent animationType="fade" onRequestClose={() => setCategoryManagerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Category Default Stations</Text>
              <TouchableOpacity onPress={() => setCategoryManagerVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              New items in a category prefill to its default station. Existing items only change if you tap "Apply to existing items."
            </Text>

            <ScrollView style={styles.modalFieldsScroll} showsVerticalScrollIndicator={false}>
              {activeStations.length === 0 ? (
                <Text style={styles.emptyStationsHint}>
                  No stations set up yet — add one from Cafe Settings → Kitchen Stations first.
                </Text>
              ) : (
                categories.map((cat) => (
                  <View key={cat.name} style={styles.categoryManagerRow}>
                    <Text style={styles.categoryManagerName}>{cat.name} · {cat.itemCount} item{cat.itemCount === 1 ? '' : 's'}</Text>
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
                    {cat.defaultStationId != null && (
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
                ))
              )}
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
              <TouchableOpacity onPress={() => setRecipeImportErrors(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
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
  emptyStationsHint: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 17,
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
