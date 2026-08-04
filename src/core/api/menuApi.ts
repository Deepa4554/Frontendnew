import { apiClient } from '../network/api';

export type ProductType = 'Prepared' | 'Independent';

export interface MenuItem {
  id: number;
  name: string;
  category: string;
  price: number;
  icon: string;
  image: string;
  subtitle: string;
  description: string | null;
  available: boolean;
  popular: boolean;
  productType: ProductType;
  linkedInventoryItemId: number | null;
  /** Which kitchen station preps this item — FK to a managed per-tenant Station (see
   * stationsApi), not free text. stationName is a read-only convenience projection. */
  stationId: number;
  stationName: string;
  shortCode?: string | null;
  itemType: 'Recipe' | 'Retail' | 'Service' | 'Combo';
  vegNonVegType?: 'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian' | null;
  /** Which tax slab this item bills at (see taxGroupsApi). Null = the cafe's default tax
   * group, or Cafe Settings' flat rate when there's no default. */
  taxGroupId?: number | null;
  /** Available Half/Full/... price options — eager-loaded on the main list so the ordering
   * grid can show a picker without a fetch per item. Empty when the item has none. */
  variants: Variant[];
  /** Add-on/topping groups (e.g. "Add-ons", "Spice Level") — embedded here so POS can
   * offer selection straight from the main menu list, no extra call per item. */
  modifiers: Modifier[];
}

export interface Variant {
  id: number;
  menuItemId: number;
  name: string;
  price: number;
  isAvailable: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface ModifierOption {
  id: number;
  modifierId: number;
  name: string;
  price: number;
  sortOrder: number;
}

export interface Modifier {
  id: number;
  menuItemId: number;
  name: string;
  type: string;
  isRequired: boolean;
  sortOrder: number;
  options: ModifierOption[];
}

export interface ChannelVisibility {
  dineIn: boolean;
  takeaway: boolean;
  qrOrdering: boolean;
  delivery: boolean;
}

export interface MenuSchedule {
  id: number;
  menuItemId?: number;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface PriceChangeLog {
  id: number;
  menuItemId: number;
  variantId?: number;
  oldPrice: number;
  newPrice: number;
  reason?: string;
  effectiveFrom: string;
  changedByName: string;
  changedAt: string;
}

export interface CreateMenuItemRequest {
  name: string;
  category: string;
  price: number;
  icon?: string;
  image?: string;
  subtitle?: string;
  description?: string;
  productType?: ProductType;
  linkedInventoryItemId?: number;
  stationId?: number;
  shortCode?: string | null;
  itemType?: string;
  vegNonVegType?: string | null;
  taxGroupId?: number | null;
}

export interface UpdateMenuItemRequest {
  name?: string;
  category?: string;
  price?: number;
  available?: boolean;
  subtitle?: string;
  image?: string;
  description?: string;
  popular?: boolean;
  productType?: ProductType;
  linkedInventoryItemId?: number;
  stationId?: number;
  shortCode?: string | null;
  itemType?: string;
  vegNonVegType?: string | null;
  /** Pass 0 to clear the item back to the cafe default — an omitted value means "leave
   * unchanged", like every other field on this PATCH, so it can't also mean "clear". */
  taxGroupId?: number | null;
}

export interface CreateVariantRequest {
  name: string;
  price: number;
  isDefault?: boolean;
}

export interface UpdateVariantRequest {
  name?: string;
  price?: number;
  isAvailable?: boolean;
  isDefault?: boolean;
}

export interface CreateModifierRequest {
  name: string;
  type?: string;
  isRequired?: boolean;
}

export interface UpdateModifierRequest {
  name?: string;
  type?: string;
  isRequired?: boolean;
}

export interface CreateModifierOptionRequest {
  name: string;
  price?: number;
}

export interface UpdateModifierOptionRequest {
  name?: string;
  price?: number;
}

export interface SetChannelVisibilityRequest {
  dineIn: boolean;
  takeaway: boolean;
  qrOrdering: boolean;
  delivery: boolean;
}

export interface CreateMenuScheduleRequest {
  daysOfWeek?: string[];
  startTime: string;
  endTime: string;
}

export interface LogPriceChangeRequest {
  oldPrice: number;
  newPrice: number;
  variantId?: number;
  reason?: string;
  effectiveFrom?: string;
}

export interface BestSeller extends MenuItem {
  unitsSold: number;
}

export interface BulkImportResult {
  createdCount: number;
  skippedCount: number;
}

export interface MenuItemImage {
  id: number;
  dataUri: string;
  sortOrder: number;
}

export const menuApi = {
  // Basic menu operations
  list: () => apiClient.get<MenuItem[]>('/menu-items').then((r) => r.data),
  bestSellers: (period: 'month' | 'today' = 'month') =>
    apiClient.get<BestSeller[]>('/menu-items/best-sellers', { params: { period } }).then((r) => r.data),
  create: (req: CreateMenuItemRequest) => apiClient.post<MenuItem>('/menu-items', req).then((r) => r.data),
  bulkCreate: (items: CreateMenuItemRequest[]) =>
    apiClient.post<BulkImportResult>('/menu-items/bulk', items).then((r) => r.data),
  /** Server-side AI parse of a photographed menu (Claude, falling back to Google Vision +
   * Groq — see MenuPhotoAiService.cs). Can return an empty array if every AI tier is
   * unconfigured/failed — see menuPhotoImport.ts for what the caller should do then. */
  importPhotoAi: (imageDataUri: string) =>
    apiClient.post<CreateMenuItemRequest[]>('/menu-items/import-photo', { imageDataUri }).then((r) => r.data),
  /** Categorizes text already OCR'd on-device (Tesseract.js) via Groq — the tier that
   * doesn't need Google Cloud billing set up. See menuPhotoImport.ts. */
  categorizeMenuText: (ocrText: string) =>
    apiClient.post<CreateMenuItemRequest[]>('/menu-items/categorize-text', { ocrText }).then((r) => r.data),
  update: (id: number, req: UpdateMenuItemRequest) => apiClient.patch<MenuItem>(`/menu-items/${id}`, req).then((r) => r.data),
  toggleAvailability: (id: number) => apiClient.patch<MenuItem>(`/menu-items/${id}/toggle-availability`).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/menu-items/${id}`).then((r) => r.data),
  /** Wipes the entire menu — past orders are untouched (see MenuController.DeleteAll). */
  removeAll: () => apiClient.delete<void>('/menu-items').then((r) => r.data),

  // Images
  listImages: (id: number) => apiClient.get<MenuItemImage[]>(`/menu-items/${id}/images`).then((r) => r.data),
  addImage: (id: number, dataUri: string) =>
    apiClient.post<MenuItemImage>(`/menu-items/${id}/images`, { dataUri }).then((r) => r.data),
  removeImage: (id: number, imageId: number) =>
    apiClient.delete<void>(`/menu-items/${id}/images/${imageId}`).then((r) => r.data),

  // Variants (Half/Full)
  createVariant: (menuItemId: number, req: CreateVariantRequest) =>
    apiClient.post<Variant>(`/menu-items/${menuItemId}/variants`, req).then((r) => r.data),
  listVariants: (menuItemId: number) =>
    apiClient.get<Variant[]>(`/menu-items/${menuItemId}/variants`).then((r) => r.data),
  getVariant: (menuItemId: number, variantId: number) =>
    apiClient.get<Variant>(`/menu-items/${menuItemId}/variants/${variantId}`).then((r) => r.data),
  updateVariant: (menuItemId: number, variantId: number, req: UpdateVariantRequest) =>
    apiClient.patch<Variant>(`/menu-items/${menuItemId}/variants/${variantId}`, req).then((r) => r.data),
  deleteVariant: (menuItemId: number, variantId: number) =>
    apiClient.delete<void>(`/menu-items/${menuItemId}/variants/${variantId}`).then((r) => r.data),

  // Modifiers (Spice, Add-ons)
  createModifier: (menuItemId: number, req: CreateModifierRequest) =>
    apiClient.post<Modifier>(`/menu-items/${menuItemId}/modifiers`, req).then((r) => r.data),
  listModifiers: (menuItemId: number) =>
    apiClient.get<Modifier[]>(`/menu-items/${menuItemId}/modifiers`).then((r) => r.data),
  updateModifier: (menuItemId: number, modifierId: number, req: UpdateModifierRequest) =>
    apiClient.patch<Modifier>(`/menu-items/${menuItemId}/modifiers/${modifierId}`, req).then((r) => r.data),
  deleteModifier: (menuItemId: number, modifierId: number) =>
    apiClient.delete<void>(`/menu-items/${menuItemId}/modifiers/${modifierId}`).then((r) => r.data),
  createModifierOption: (menuItemId: number, modifierId: number, req: CreateModifierOptionRequest) =>
    apiClient.post<ModifierOption>(`/menu-items/${menuItemId}/modifiers/${modifierId}/options`, req).then((r) => r.data),
  listModifierOptions: (menuItemId: number, modifierId: number) =>
    apiClient.get<ModifierOption[]>(`/menu-items/${menuItemId}/modifiers/${modifierId}/options`).then((r) => r.data),
  updateModifierOption: (menuItemId: number, modifierId: number, optionId: number, req: UpdateModifierOptionRequest) =>
    apiClient.patch<ModifierOption>(`/menu-items/${menuItemId}/modifiers/${modifierId}/options/${optionId}`, req).then((r) => r.data),
  deleteModifierOption: (menuItemId: number, modifierId: number, optionId: number) =>
    apiClient.delete<void>(`/menu-items/${menuItemId}/modifiers/${modifierId}/options/${optionId}`).then((r) => r.data),

  // Channel Visibility
  setChannelVisibility: (menuItemId: number, req: SetChannelVisibilityRequest) =>
    apiClient.put<void>(`/menu-items/${menuItemId}/channels`, req).then((r) => r.data),
  getChannelVisibility: (menuItemId: number) =>
    apiClient.get<ChannelVisibility>(`/menu-items/${menuItemId}/channels`).then((r) => r.data),

  // Menu Scheduling
  createSchedule: (menuItemId: number, req: CreateMenuScheduleRequest) =>
    apiClient.post<MenuSchedule>(`/menu-items/${menuItemId}/schedule`, req).then((r) => r.data),
  getSchedules: (menuItemId: number) =>
    apiClient.get<MenuSchedule[]>(`/menu-items/${menuItemId}/schedule`).then((r) => r.data),
  deleteSchedule: (menuItemId: number, scheduleId: number) =>
    apiClient.delete<void>(`/menu-items/${menuItemId}/schedule/${scheduleId}`).then((r) => r.data),

  // Price Change Logging
  logPriceChange: (menuItemId: number, req: LogPriceChangeRequest) =>
    apiClient.post<PriceChangeLog>(`/menu-items/${menuItemId}/price-change`, req).then((r) => r.data),
  getPriceHistory: (menuItemId: number) =>
    apiClient.get<PriceChangeLog[]>(`/menu-items/${menuItemId}/price-history`).then((r) => r.data),
};
