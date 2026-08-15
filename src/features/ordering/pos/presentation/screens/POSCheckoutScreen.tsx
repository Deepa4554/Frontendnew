import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import {
  selectTableForOrder,
  clearSelectedTable,
  clearResumeOrder,
  setPendingOrderType,
} from '../../../../../core/store/tablesSlice';
import { showToast } from '../../../../../core/store/uiSlice';
import {
  useMenuItems,
  useToggleMenuPinned,
} from '../../../../../core/api/hooks/useMenu';
import { useTables } from '../../../../../core/api/hooks/useTables';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import {
  useCreateOrder,
  useFireOrder,
  useOrder,
  useAddOrderItem,
  usePayOrder,
  useBillCharges,
} from '../../../../../core/api/hooks/useOrders';
import {
  useStaff,
  useMyStaffRecord,
} from '../../../../../core/api/hooks/useStaff';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { useCategories } from '../../../../../core/api/hooks/useCategories';
import {
  useOrderNoteSuggestions,
  useUpsertOrderNoteSuggestion,
} from '../../../../../core/api/hooks/useOrderNoteSuggestions';
import { useOfferPreview } from '../../../../../core/api/hooks/useOffers';
import { OfferPreviewLine } from '../../../../../core/api/offersApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import {
  OrderItem as ApiOrderItemLine,
  ApiOrder,
  ordersApi,
} from '../../../../../core/api/ordersApi';
import { PrinterService } from '../../../../../core/printing/PrinterService';
import { getPrinterConfig } from '../../../../../core/printing/printerConfig';
import { buildTaxBreakdown } from '../../../../../core/printing/receiptFormat';
import { buildWhatsAppBillUrl } from '../../../../../core/utils/whatsappShare';
import { getPublicApiBaseUrl } from '../../../../../core/config/env';
import { canManageTables } from '../../../../../core/auth/permissions';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { useKeyboardInsetWeb } from '../../../../../core/utils/useVisualViewportHeight';
import { ScreenContainer } from '../../../../../core/components/ScreenContainer';
import {
  CategoryFilterModal,
  CategoryFilterTrigger,
} from '../../../../../shared/components/molecules/CategoryFilterModal';
import {
  OrderBillActions,
  PaymentSplit,
} from '../../../../../shared/components/billing/OrderBillActions';
import { GuestPhonePrompt } from '../../../../../shared/components/billing/GuestPhonePrompt';
import { CustomerLookupBadge } from '../../../../../shared/components/billing/CustomerLookupBadge';
import {
  PaymentMethodPicker,
  PaymentMethodPickerResult,
} from '../../../../../shared/components/billing/PaymentMethodPicker';
import {
  BillAdjustmentsPanel,
  AdjustmentTile,
  AdjustmentApplyValue,
} from '../../../../../shared/components/billing/BillAdjustmentsPanel';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { VegNonVegBadge } from '../../../../../shared/components/atoms/VegNonVegBadge';
import { Tooltip } from '../../../../../shared/components/atoms/Tooltip';
import { GlobalSearchTrigger } from '../../../../../shared/components/search/GlobalSearchTrigger';
import { MenuItem as ApiMenuItem } from '../../../../../core/api/menuApi';
import menuPlaceholderImage from '../../../../../assets/menu-placeholder.png';
import {
  INPUT_BORDER_WIDTH,
  modalHeadingOverride,
} from '../../../../../shared/design/commonStyles';
import {
  OrderDraft,
  loadDrafts,
  persistDrafts,
  newDraftId,
} from '../../data/orderDrafts';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

interface ReceiptSnapshot {
  id: string;
  orderId: number;
  title: string;
  orderTypeLabel: string;
  items: ApiOrderItemLine[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  tax: number;
  total: number;
  time: string;
  guestPhone?: string;
  /** Cash Sale only — lets the receipt modal offer "Mark as Paid" right there instead of
   * sending the cashier somewhere else to settle it. Other order types are paid from
   * Tables/Token Dashboard once served, not from this modal. */
  isCashSale?: boolean;
  paid?: boolean;
}

interface CartLine {
  id: string;
  menuItemId: number;
  name: string;
  /** Free-text kitchen instruction for this line, e.g. "No onion", "Extra spicy" — the
   * variant/topping selection is tracked structurally below instead (variantId/
   * modifierOptionIds), so this field is purely the note now. */
  modifier: string;
  /** Effective per-unit price — base (or variant) price plus every selected topping's price. */
  price: number;
  qty: number;
  icon: string;
  variantId?: number;
  variantName?: string;
  modifierOptionIds: number[];
  /** Display-only snapshot of the selected toppings' names, e.g. ["Extra Cheese", "Jalapeños"]. */
  modifierNames: string[];
  /** The rate the biller typed for an MRP item (see ApiMenuItem.isOpenPrice), before any
   * topping deltas — `price` above is still the effective per-unit figure. Sent as-is so the
   * server re-derives the line the same way; undefined on every ordinary line. */
  openPrice?: number;
}

/** An MRP line parked while the till asks for its rate — everything the add flow already
 * resolved, minus the money. See addLineToCart. */
interface PendingRateLine {
  item: ApiMenuItem;
  variantId?: number;
  variantName?: string;
  optionIds: number[];
  optionNames: string[];
  /** Just the toppings' contribution. The typed rate replaces the base/variant price and
   * this is added back on top, which is exactly how the server prices it (see
   * OrderBuildingService.ResolveLinePricingAsync). */
  modifierDelta: number;
  note: string;
}

const ORDER_TYPES = [
  { key: 'DINE_IN', label: 'Dine In', icon: 'silverware-fork-knife' },
  { key: 'QSR', label: 'Token', icon: 'ticket-confirmation-outline' },
  { key: 'TAKEAWAY', label: 'Takeaway', icon: 'bag-personal-outline' },
  { key: 'DELIVERY', label: 'Delivery', icon: 'moped-outline' },
  { key: 'CASH', label: 'Cash Sale', icon: 'cash' },
];

// Maps each pill to the Settings → Order Types flag that turns it on/off (see
// OrderTypesSettingsScreen). Kept separate from ORDER_TYPES itself so label/icon
// lookups (receipt, resume banner, ...) keep working even for a since-disabled type.
const ORDER_TYPE_SETTINGS_FIELD: Record<
  string,
  | 'dineInEnabled'
  | 'takeawayEnabled'
  | 'deliveryEnabled'
  | 'qsrEnabled'
  | 'cashEnabled'
> = {
  DINE_IN: 'dineInEnabled',
  TAKEAWAY: 'takeawayEnabled',
  DELIVERY: 'deliveryEnabled',
  QSR: 'qsrEnabled',
  CASH: 'cashEnabled',
};

// Cart starts empty — items are added by tapping the menu grid.
const INITIAL_CART: CartLine[] = [];

/** Adds/removes one note from a comma-separated note string, case-insensitively —
 * lets a couple of quick suggestion chips combine into one note without retyping. */
const toggleNoteToken = (current: string, token: string): string => {
  const parts = current
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const idx = parts.findIndex(p => p.toLowerCase() === token.toLowerCase());
  if (idx >= 0) parts.splice(idx, 1);
  else parts.push(token);
  return parts.join(', ');
};

/** Tap-to-toggle suggestion chips shared by the note-prompt modal and the topping
 * picker's "Special instructions" field — a small generic starter list plus whatever
 * this cafe's own staff has typed before (see OrderNoteSuggestionsController). */
const NoteSuggestionChips = ({
  COLORS,
  styles,
  value,
  onChange,
}: {
  COLORS: ReturnType<typeof useThemeColors>;
  styles: ReturnType<typeof makeStyles>;
  value: string;
  onChange: (next: string) => void;
}) => {
  const { data: suggestions = [] } = useOrderNoteSuggestions();
  if (suggestions.length === 0) return null;
  const selectedTokens = value
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return (
    <>
      <Text style={styles.noteSuggestionCount}>
        {suggestions.length} suggestions
      </Text>
      <View style={styles.noteSuggestionGrid}>
        {suggestions.map(s => {
          const active = selectedTokens.includes(s.text.toLowerCase());
          return (
            <TouchableOpacity
              key={s.text}
              style={[
                styles.noteSuggestionChip,
                active && styles.noteSuggestionChipActive,
              ]}
              onPress={() => onChange(toggleNoteToken(value, s.text))}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.noteSuggestionChipText,
                  active && styles.noteSuggestionChipTextActive,
                ]}
              >
                {s.text}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.noteSuggestionHint}>
        Notes you type get saved to this cafe's list — next order, just tap
        instead of typing.
      </Text>
    </>
  );
};

/** One menu-grid row, memoized so typing in the search box or changing the cart doesn't
 * re-render every row (each row carries an Image — before this, the whole grid re-rendered
 * on every keystroke). All props are referentially stable across parent re-renders: styles
 * is useMemo'd, COLORS is a module-level object, onPress uses the latest-ref pattern, and
 * React Query's structural sharing keeps an unchanged item's identity stable across
 * refetches — so a row re-renders only when its own item's data actually changes.
 * The JSX is exactly the block that previously lived inline in menuAndCategoryPicker. */
const MenuRow = React.memo(
  ({
    item,
    qty,
    onPress,
    onDecrement,
    onTogglePin,
    styles,
    COLORS,
    isDesktopWeb,
    isTablet,
  }: {
    item: ApiMenuItem;
    // Total units of this menu item currently in the cart (summed across every variant/
    // topping/MRP line it produced). 0 → the ADD button; >0 → the −/qty/+ stepper.
    qty: number;
    onPress: (item: ApiMenuItem) => void;
    onDecrement: (item: ApiMenuItem) => void;
    onTogglePin: (item: ApiMenuItem) => void;
    styles: ReturnType<typeof makeStyles>;
    COLORS: ReturnType<typeof useThemeColors>;
    isDesktopWeb: boolean;
    isTablet: boolean;
  }) => {
    // Tablet-and-wider (native tablet, or any tablet/desktop browser) drops the per-item
    // thumbnail on the POS menu list — the images added visual noise and squeezed the row
    // without helping ring items up faster on a till. Phones keep the thumbnail.
    const wide = isTablet || isDesktopWeb;
    return (
      <TouchableOpacity
        style={[
          styles.menuRow,
          isDesktopWeb && styles.menuRowDesktop,
          // The 48% 2-up grid column was tuned for real desktop width — on a
          // tablet-width browser it left too little room for name + subtitle +
          // price + the ADD button, so the row content overflowed the card
          // ("price truncation"/squeeze). Tablet instead gets one full-width row
          // per item, same single-row name/price layout, no width squeeze.
          isTablet && { width: '100%' as const },
          !item.available && styles.menuCardDisabled,
        ]}
        onPress={() => onPress(item)}
        disabled={!item.available}
        activeOpacity={0.7}
      >
        {!wide && (
          <Image
            source={item.image ? { uri: item.image } : menuPlaceholderImage}
            style={[styles.menuImage, isDesktopWeb && styles.menuImageDesktop]}
          />
        )}
        {/* With the image gone on wide layouts these chips have nothing to overlay, so they
        fall back to an inline, vertically-centered chip at the start of the row. */}
        {item.popular && item.available && (
          <View
            style={[
              styles.aiSuggestBadge,
              wide ? styles.menuBadgeInline : styles.menuBadgeOverlay,
            ]}
          >
            <Icon name="star" size={10} color={COLORS.accent} />
            <Text style={styles.aiSuggestText}>POPULAR</Text>
          </View>
        )}
        {!item.available && (
          <View
            style={[
              styles.unavailableBadge,
              wide ? styles.menuBadgeInline : styles.menuBadgeOverlay,
            ]}
          >
            <Text style={styles.unavailableBadgeText}>UNAVAILABLE</Text>
          </View>
        )}

        {isDesktopWeb ? (
          // Desktop web only — name, subtitle, and price share one row instead of
          // stacking across three, so each item takes noticeably less vertical space
          // and more of the menu fits on screen without scrolling. Mobile web and the
          // native app keep the stacked layout below untouched.
          <View style={styles.menuRowInfoDesktop}>
            <VegNonVegBadge
              type={item.vegNonVegType}
              size={12}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.menuNameDesktop} numberOfLines={1}>
              {item.name}
            </Text>
            {/* Always-present flex spacer — without it, rows whose item has no
            subtitle lose their only flexible element and the price collapses
            next to the name instead of staying pinned to the right edge like
            every other row. */}
            <View style={styles.menuSubtitleFillDesktop}>
              {!!item.subtitle && (
                <Text style={styles.menuSubtitleDesktop} numberOfLines={1}>
                  · {item.subtitle}
                </Text>
              )}
            </View>
            <Text style={styles.menuPriceDesktop}>
              {item.variants.length > 0 ? 'from ' : ''}₹
              {(item.variants.length > 0
                ? Math.min(item.price, ...item.variants.map(v => v.price))
                : item.price
              ).toFixed(2)}
            </Text>
          </View>
        ) : (
          <View style={styles.menuRowInfo}>
            <View style={styles.menuNameRow}>
              <VegNonVegBadge
                type={item.vegNonVegType}
                size={12}
                style={{ marginRight: 2.5 }}
              />
              <Text style={styles.menuName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <Text style={styles.menuPrice}>
              {item.variants.length > 0 ? 'from ' : ''}₹
              {(item.variants.length > 0
                ? Math.min(item.price, ...item.variants.map(v => v.price))
                : item.price
              ).toFixed(2)}
            </Text>
            <Text style={styles.menuSubtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>
        )}

        <View style={styles.menuRowAction}>
          {/* Its own tap target inside the row — the row body adds to the cart, so pinning has to
          be something you can hit without ringing the item up by accident. Stays visible when
          unpinned (a faint outline) rather than appearing on hover: on a touch till there is no
          hover, and a control nobody can find is a control nobody uses. */}
          <Tooltip
            label={item.pinned ? 'Unpin item' : 'Pin item'}
            placement="left"
          >
            <TouchableOpacity
              onPress={() => onTogglePin(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
              style={styles.pinBtn}
            >
              <Icon
                name={item.pinned ? 'pin' : 'pin-outline'}
                size={15}
                color={item.pinned ? COLORS.accent : COLORS.divider}
              />
            </TouchableOpacity>
          </Tooltip>
          {qty > 0 ? (
            // Already in the cart — the ADD button becomes an inline stepper so the count is
            // visible and adjustable without opening the cart. − removes one unit (deletes the
            // line at 0), + rings up another (re-runs the same add flow the row body uses, so a
            // variant/topping item re-opens its picker). Both are nested touchables, so tapping
            // them never falls through to the row's own add-on-press.
            <View style={styles.menuQtyStepper}>
              <TouchableOpacity
                onPress={() => onDecrement(item)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 4 }}
                style={styles.menuQtyBtn}
              >
                <Icon name="minus" size={13} color={COLORS.cardAlt} />
              </TouchableOpacity>
              <Text style={styles.menuQtyValue}>{qty}</Text>
              <TouchableOpacity
                onPress={() => onPress(item)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 6 }}
                style={styles.menuQtyBtn}
              >
                <Icon name="plus" size={13} color={COLORS.cardAlt} />
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={[styles.addBtn, !item.available && styles.addBtnDisabled]}
            >
              <Text style={styles.addBtnText}>ADD</Text>
              <Icon name="plus" size={11} color={COLORS.accent} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  },
);

export const POSCheckoutScreen = () => {
  const COLORS = useThemeColors();
  // Memoized so the (very large) StyleSheet isn't re-created on the frequent re-renders
  // this screen goes through (every search keystroke, every cart change) — and so MenuRow's
  // React.memo actually holds: an unstable styles identity would defeat it on every render.
  const styles = useMemo(() => makeStyles(COLORS), [COLORS]);
  const navigation = useNavigation<any>();
  // A persistent side-by-side cart pane needs true desktop width (>=1024) —
  // isWideLayout (>=768) also covers tablet-width browsers, where the sidebar
  // (280px, from withDesktopShell) plus a fixed 380px cart pane leaves the
  // menu column only ~120px wide, wrapping item names/prices one character
  // per line. Tablet instead gets the same stacked mobile layout as a narrow
  // phone screen, just inside the desktop sidebar shell.
  const { isDesktop, isDesktopWeb, isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  // Pushes every bottom-sheet modal below up above the on-screen keyboard on
  // mobile web (see useKeyboardInsetWeb) — the overlay itself always stays
  // full-screen (its backdrop must never be capped smaller, or the area below
  // it goes fully transparent); only its bottom padding grows, so flex-end
  // docks the sheet against the padding instead of the true screen bottom.
  const keyboardInset = useKeyboardInsetWeb();
  const modalOverlayStyle = [
    styles.modalOverlay,
    keyboardInset > 0 && { paddingBottom: keyboardInset },
  ];
  const [orderType, setOrderType] = useState('DINE_IN');
  const [activeCategory, setActiveCategory] = useState('All Items');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  // Desktop-web category tab strip (see desktopCategoryTabs) — the three numbers its
  // ◀ ▶ buttons need to know how far it can still travel in each direction. Tracked in
  // state rather than a ref because the buttons' enabled/disabled look is derived from it.
  const catScrollRef = useRef<ScrollView>(null);
  const [catScroll, setCatScroll] = useState({ x: 0, viewport: 0, content: 0 });
  const catMaxScroll = Math.max(0, catScroll.content - catScroll.viewport);
  // 1px slack — fractional layout widths mean x never lands exactly on catMaxScroll.
  const catCanScrollLeft = catScroll.x > 1;
  const catCanScrollRight = catScroll.x < catMaxScroll - 1;
  const pageCategoryStrip = (direction: -1 | 1) => {
    // Page by most of a viewport, keeping a sliver of the current one on screen so
    // there's a visual anchor for what just moved.
    const step = Math.max(160, catScroll.viewport * 0.8);
    const x = Math.max(
      0,
      Math.min(catScroll.x + direction * step, catMaxScroll),
    );
    catScrollRef.current?.scrollTo({ x, animated: true });
  };
  // Quick in-menu item search — separate from the header's magnify icon, which
  // navigates away to the app-wide Search screen (orders/customers/staff).
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  // Veg Only: hides NonVeg and Eggetarian items from the picker below. Untagged items
  // (vegNonVegType null — never set on that menu item) stay visible either way, since
  // hiding them would be guessing they're non-veg rather than reading an actual claim.
  // ALL shows everything; VEG/NONVEG are mutually exclusive (picking one always
  // replaces the other, never combines) — tapping the already-active one clears
  // back to ALL, same toggle-off feel as the old single Veg switch.
  const [dietFilter, setDietFilter] = useState<'ALL' | 'VEG' | 'NONVEG'>('ALL');
  const [cart, setCart] = useState<CartLine[]>(INITIAL_CART);
  const { data: menuItems = [], isLoading: menuLoading } = useMenuItems();
  const { data: categories = [] } = useCategories();
  const { data: allTables = [] } = useTables();
  const { data: branches = [] } = useBranches();
  const selectedTable = useSelector((s: any) => s.tables.selectedTableForOrder);
  const role = useSelector((s: any) => s.auth.user?.role);
  const activeBranchId = useSelector((s: any) => s.branch.activeBranchId);
  // Resume/append mode: opened from the Tables screen's "Add Items" on an active table.
  // The POS loads that existing open order, shows its already-fired KOTs read-only, and
  // the cart holds ONLY the new items — firing them creates a fresh KOT on the same order.
  const resumeOrderId = useSelector(
    (s: any) => s.tables.resumeOrderId as number | null,
  );
  const resumeMode = resumeOrderId != null;
  const { data: resumeOrder } = useOrder(resumeOrderId ?? null);
  // Set by the Token Dashboard (both its "+" FAB and "Add Item") just before navigating
  // here — consumed once below (see the effect near "dispatch") so POS opens with the
  // Token pill active instead of defaulting to Dine In. See tablesSlice.pendingOrderType.
  const pendingOrderType = useSelector(
    (s: any) => s.tables.pendingOrderType as string | null,
  );
  const addOrderItemMutation = useAddOrderItem();
  const [tablePickerVisible, setTablePickerVisible] = useState(false);
  // Cart + Fire to Kitchen live in a collapsible bottom sheet instead of the end of
  // one long page scroll, so they stay reachable even with a large (100+ item) menu.
  const [cartExpanded, setCartExpanded] = useState(false);
  // Single combined popup (name + mobile + table, one screen) shown by "Fire to
  // Kitchen"/"Hold Order" whenever a dine-in table is still unpicked — replaces the
  // old two-step guest-modal-then-table-picker chain.
  const [quickFireModalVisible, setQuickFireModalVisible] = useState(false);
  // Whether the pending fire/hold flow (the quick-fire popup) should hold the order
  // instead of firing it once table (dine-in) is in place.
  const [pendingHoldOnly, setPendingHoldOnly] = useState(false);
  // Whether that pending fire should also print the physical KOT once the popup's
  // info is filled in — carries the "KOT" vs "KOT & Print" choice through the detour.
  const [pendingAndPrint, setPendingAndPrint] = useState(true);

  // --- Guest details (typed in per order, flows into order title, receipt & CRM) ---
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  // Saved onto the guest's Customer record (not the order) — see BuildOrderAsync's
  // guestAddress param. Optional; mainly useful for delivery orders.
  const [guestAddress, setGuestAddress] = useState('');
  // Guest-chip edit modal — plain name/phone/address editing only, no table, no auto-fire.
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestDraft, setGuestDraft] = useState('');
  const [guestPhoneDraft, setGuestPhoneDraft] = useState('');
  const [guestAddressDraft, setGuestAddressDraft] = useState('');
  const displayGuest = guestName.trim() || 'Walk-in';

  // --- Waiter attribution ("who actually served this order", distinct from whoever's
  // logged into a shared counter POS — see Order.ServedByStaffId's doc comment) ---
  const { data: allStaff = [] } = useStaff();
  const { data: myStaffRecord } = useMyStaffRecord();
  const [waiterStaffId, setWaiterStaffId] = useState<number | null>(null);
  const [waiterModalVisible, setWaiterModalVisible] = useState(false);
  // Default to the logged-in user's own StaffMember record (a waiter taking their
  // own order) — only once, and only if the cashier hasn't already picked someone.
  useEffect(() => {
    if (waiterStaffId === null && myStaffRecord)
      setWaiterStaffId(myStaffRecord.id);
  }, [myStaffRecord, waiterStaffId]);
  const selectedWaiterName =
    allStaff.find(s => s.id === waiterStaffId)?.name ??
    myStaffRecord?.name ??
    null;

  // Table selection is only enforced when the order is actually fired to the
  // kitchen (see fireToKitchen) — browsing POS never traps you in the picker.

  // --- Order discount + Other Charges (set inside the Pay First settle sheet). Discount
  // rides on order creation as discountPct (CreateOrderRequest has no flat-amount discount
  // field, so a ₹ entry gets converted to an equivalent % — see pfHandleTileApply); Service/
  // Packing/Delivery/Tip aren't part of order creation at all (they're "billing-time"
  // charges everywhere else in the app too — see OrdersController.ApplyBillCharges), so these
  // apply via the same bill-charges call OrderBillActions uses, right after the order is
  // created but before it's fired/paid. Billing-time coupon/gift card/loyalty stay off Pay
  // First entirely — those redeem against a specific existing order+customer, which doesn't
  // exist yet at this point in the flow. ---
  const [discountPct, setDiscountPct] = useState(0);
  // A flat ₹ discount, kept separate from the percentage so "₹50 off" stays exactly ₹50 — the
  // two are mutually exclusive (setting one clears the other). This used to be folded into
  // discountPct as amount/subtotal*100, which then drifted as the cart changed; the flat value
  // now rides to the backend as CreateOrderRequest.DiscountAmount and is stored as-is.
  const [discountFlat, setDiscountFlat] = useState(0);
  const [pfServiceChargeAmount, setPfServiceChargeAmount] = useState(0);
  const [pfPackingChargeAmount, setPfPackingChargeAmount] = useState(0);
  const [pfDeliveryChargeAmount, setPfDeliveryChargeAmount] = useState(0);
  const [pfTipAmount, setPfTipAmount] = useState(0);
  const [pfOpenAdjustment, setPfOpenAdjustment] = useState<string | null>(null);

  // --- Pay First settle sheet (pay-before-serve: discount + other charges + payment
  // method + settle + print in one place; creates/fires/pays the order in a single flow). ---
  const [payFirstVisible, setPayFirstVisible] = useState(false);
  // What PaymentMethodPicker currently has picked — same component/state shape as an
  // existing order's Settle Bill panel (OrderBillActions), so Pay First presents the exact
  // same payment-method UI instead of its own bespoke one.
  const [pfPayment, setPfPayment] = useState<PaymentMethodPickerResult>({
    splits: [],
    isPartial: false,
    canSettle: true,
    dueAmount: 0,
    guestName: '',
    guestPhone: '',
  });
  const [pfPickerKey, setPfPickerKey] = useState(0);
  const [settlingMode, setSettlingMode] = useState<
    'settle' | 'print' | 'whatsapp' | null
  >(null);
  // Whether settling also sends the kitchen ticket to the printer. The normal flow offers
  // this as two separate buttons ("KOT" vs "KOT & Print", see fireToKitchen); Pay First
  // pre-sets it here instead so settling stays a single tap either way. Defaults on —
  // the same as the KOT & Print button most counters use.
  const [pfPrintKot, setPfPrintKot] = useState(true);
  // Guest Bill (the pre-payment courtesy copy) prints off the LOCAL cart, so it has its
  // own pending flag rather than sharing settlingMode.
  const [pfPrintingBill, setPfPrintingBill] = useState(false);
  // "Settle & WhatsApp" was tapped with no guest number on the cart — see settlePayFirst.
  const [pfPhonePromptOpen, setPfPhonePromptOpen] = useState(false);
  // Quick-fire popup detour flag: the popup was opened to collect phone/table for the
  // Pay First flow — on completion, reopen the settle sheet instead of firing.
  const [pendingPayFirst, setPendingPayFirst] = useState(false);

  // --- Local drafts ("Save Draft" — park the cart on this device without creating a
  // server order; see orderDrafts.ts for how this differs from Hold Order). ---
  const [drafts, setDrafts] = useState<OrderDraft<CartLine>[]>(() =>
    loadDrafts<CartLine>(),
  );
  const [draftsModalVisible, setDraftsModalVisible] = useState(false);

  // --- Order / receipt ---
  const dispatch = useDispatch();
  // Leaving the POS always exits resume/append mode, so the next time it's opened (e.g. a
  // brand-new order on an empty table) it doesn't silently keep appending to the old order.
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      dispatch(clearResumeOrder());
    });
    return unsub;
  }, [navigation, dispatch]);
  useEffect(() => {
    if (pendingOrderType) {
      setOrderType(pendingOrderType);
      dispatch(setPendingOrderType(null));
    }
  }, [pendingOrderType, dispatch]);
  const { data: settings } = useSettings();
  const taxRatePct = settings?.taxRatePct ?? 8;
  const businessName = settings?.businessName ?? 'PrabandhOS';
  const businessAddress = settings?.address?.trim() || null;
  const receiptFooter = settings?.receiptFooter ?? 'Thank you for your visit!';
  // Owner-configurable (Settings → Order Types) — while settings haven't loaded yet,
  // show every pill rather than flashing an empty row.
  const enabledOrderTypes = useMemo(
    () =>
      ORDER_TYPES.filter(
        t => !settings || settings[ORDER_TYPE_SETTINGS_FIELD[t.key]],
      ),
    [settings],
  );
  // If the currently-selected type gets disabled out from under the cashier (or the
  // default 'DINE_IN' was never enabled at this cafe), fall back to the first one that is.
  // Functional update so this always checks the freshest orderType — plain state reads here
  // raced with the pendingOrderType effect above (both fire on the same mount commit) and
  // could stomp a just-applied 'QSR' pre-selection with a stale 'DINE_IN' check.
  useEffect(() => {
    if (!settings || enabledOrderTypes.length === 0) return;
    setOrderType(prev =>
      enabledOrderTypes.some(t => t.key === prev)
        ? prev
        : enabledOrderTypes[0].key,
    );
  }, [settings, enabledOrderTypes]);
  const createOrderMutation = useCreateOrder();
  const billChargesMutation = useBillCharges();
  const fireOrderMutation = useFireOrder();
  const payOrderMutation = usePayOrder();
  const upsertNoteSuggestion = useUpsertOrderNoteSuggestion();
  // Fire-and-forget: remembers each comma-separated note (typed or picked from chips)
  // individually, so it's independently tappable next time — never blocks the UI.
  const persistNoteTokens = (text: string) => {
    text
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(t => upsertNoteSuggestion.mutate(t));
  };
  const submitting =
    createOrderMutation.isPending ||
    fireOrderMutation.isPending ||
    addOrderItemMutation.isPending;
  // Which of the two fire-adjacent buttons (KOT / KOT & Print) was actually pressed —
  // `submitting` alone can't tell them apart since it's one combined flag across both
  // underlying mutations, so both buttons used to light up together no matter which one
  // was tapped. Cleared the moment `submitting` drops back to false (success or failure —
  // either way there's nothing left in flight).
  const [firingIntent, setFiringIntent] = useState<'kot' | 'kotPrint' | null>(
    null,
  );
  useEffect(() => {
    if (!submitting) setFiringIntent(null);
  }, [submitting]);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null);
  // Live order behind the receipt — the snapshot above is just enough to render the
  // slip instantly after firing; billing/payment reads the real order so it reflects
  // any change made anywhere else (Tables/Token/KDS) while this modal is open.
  const { data: receiptOrder } = useOrder(receipt?.orderId ?? null);

  // Derived from whatever categories actually exist on the menu — no hardcoded
  // list that could drift from the real menu (same reasoning as `zones` on the
  // Tables screen) — in the order the Owner arranged in Manage Categories, which is
  // the whole point of MenuCategory.SortOrder: a drinks-led cafe puts Beverages in
  // front of the strip instead of wherever the alphabet drops it. Anything the
  // categories query hasn't caught up on yet trails alphabetically behind.
  const CATEGORIES = useMemo(() => {
    const ordered = categories.map(c => c.name);
    const known = new Set(ordered);
    const rest = Array.from(new Set(menuItems.map(m => m.category)))
      .filter(c => !known.has(c))
      .sort();
    return ['All Items', ...ordered, ...rest];
  }, [menuItems, categories]);

  /** Where each category sits in the strip, so the All Items grid can be grouped the same
   * way the strip reads — putting Beverages first only for the tabs, while the grid stayed
   * alphabetical, would be half a feature. */
  const categoryRank = useMemo(() => {
    const rank: Record<string, number> = {};
    CATEGORIES.forEach((c, i) => { rank[c] = i; });
    return rank;
  }, [CATEGORIES]);

  const filteredMenu = useMemo(() => {
    const q = menuSearchQuery.trim().toLowerCase();
    // A fully-numeric query is a short code typed in full (e.g. "24") — match it exactly,
    // not as a substring, so "24" doesn't also pull in "124"/"244". Alphabetic codes stay
    // substring-matched so partials like "pan" still work.
    const numericQ = /^\d+$/.test(q);
    const codeMatches = (code: string) => (numericQ ? code === q : code.includes(q));
    const matched = menuItems.filter((m) =>
      (activeCategory === 'All Items' || m.category === activeCategory) &&
      (q === '' ||
        m.name.toLowerCase().includes(q) ||
        codeMatches((m.shortCode ?? '').toLowerCase())) &&
      (dietFilter === 'ALL' ||
        (dietFilter === 'VEG' && (m.vegNonVegType == null || m.vegNonVegType === 'Veg' || m.vegNonVegType === 'Jain')) ||
        (dietFilter === 'NONVEG' && m.vegNonVegType === 'NonVeg')));
    // Pinned items lead every view — the handful a till rings up all day shouldn't have to be
    // found in the alphabetical scroll (see backend MenuItem.Pinned). Applied here rather than in
    // the query because MenuController.List also serves the customer QR menu, which keeps its own
    // plain ordering. `sort` is stable, so within a category everything holds the server's Name order.
    // Beverages come right after the pinned block — they're the highest-frequency ring-up after
    // whatever's pinned, so they shouldn't wait for the alphabetical category scroll either.
    const byPin = (a: (typeof matched)[number], b: (typeof matched)[number]) => {
      const pinDiff = Number(b.pinned) - Number(a.pinned);
      if (pinDiff !== 0) return pinDiff;
      return Number(b.category === 'Beverages') - Number(a.category === 'Beverages');
    };
    // Then the Owner's category order, so All Items reads top-to-bottom in the same
    // sequence as the category strip above it.
    const byCategory = (a: (typeof matched)[number], b: (typeof matched)[number]) =>
      (categoryRank[a.category] ?? Number.MAX_SAFE_INTEGER) - (categoryRank[b.category] ?? Number.MAX_SAFE_INTEGER);
    if (q === '') return [...matched].sort((a, b) => byPin(a, b) || byCategory(a, b));
    // An exact short-code match is almost always what the user meant (e.g. "CAPP"),
    // so float those above even a pinned item — typing a code is a more specific ask than pinning.
    return [...matched].sort((a, b) => {
      const aExact = (a.shortCode ?? '').toLowerCase() === q ? 0 : 1;
      const bExact = (b.shortCode ?? '').toLowerCase() === q ? 0 : 1;
      return aExact - bExact || byPin(a, b) || byCategory(a, b);
    });
  }, [menuItems, activeCategory, menuSearchQuery, dietFilter, categoryRank]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Items': menuItems.length };
    for (const cat of CATEGORIES) {
      if (cat === 'All Items') continue;
      counts[cat] = menuItems.filter(m => m.category === cat).length;
    }
    return counts;
  }, [menuItems, CATEGORIES]);

  // Item-options picker (variant + toppings) — only shown when the item actually has any;
  // a plain item with neither still adds straight to the cart in one tap, unchanged.
  const [optionsItem, setOptionsItem] = useState<ApiMenuItem | null>(null);
  const [optionsVariantId, setOptionsVariantId] = useState<number | undefined>(
    undefined,
  );
  const [optionsSelectedOptionIds, setOptionsSelectedOptionIds] = useState<
    number[]
  >([]);
  // Free-text kitchen instruction, typed (or tapped from a suggestion chip) while the
  // options picker is open — stored straight into the line's `modifier` field alongside
  // the structural variant/topping selection above (see addLineToCart).
  const [optionsNote, setOptionsNote] = useState('');

  // An MRP line waiting on its rate, and the rate being typed for it — see addLineToCart.
  const [rateLine, setRateLine] = useState<PendingRateLine | null>(null);
  const [rateInput, setRateInput] = useState('');

  const insertLineIntoCart = (
    item: ApiMenuItem,
    variantId: number | undefined,
    variantName: string | undefined,
    optionIds: number[],
    optionNames: string[],
    unitPrice: number,
    note: string = '',
    openPrice?: number,
  ) => {
    const sortedIds = [...optionIds].sort((a, b) => a - b);
    // Two MRP lines for the same item at DIFFERENT rates are genuinely different lines (two
    // packs, two printed prices), so the rate joins the identity — otherwise the second one
    // would just bump the first one's qty and be billed at the wrong price.
    const cartId =
      `c_${item.id}_${variantId ?? 'base'}_${sortedIds.join('-')}` +
      (openPrice != null ? `_r${openPrice}` : '');
    setCart(prev => {
      const existing = prev.find(c => c.id === cartId);
      if (existing) {
        return prev.map(c => (c.id === cartId ? { ...c, qty: c.qty + 1 } : c));
      }
      return [
        ...prev,
        {
          id: cartId,
          menuItemId: item.id,
          name: item.name,
          modifier: note.trim(),
          price: unitPrice,
          qty: 1,
          icon: item.icon,
          variantId,
          variantName,
          modifierOptionIds: sortedIds,
          modifierNames: optionNames,
          openPrice,
        },
      ];
    });
    dispatch(
      showToast({
        message: `${item.name} added to order`,
        icon: 'check-circle',
        tone: 'success',
      }),
    );
  };

  const addLineToCart = (
    item: ApiMenuItem,
    variantId: number | undefined,
    variantName: string | undefined,
    optionIds: number[],
    optionNames: string[],
    unitPrice: number,
    note: string = '',
  ) => {
    // An MRP item has no catalog rate to bill at — the till has to ask (see
    // ApiMenuItem.isOpenPrice). Both add paths (one-tap and the options picker) land here, so
    // raising the prompt at this single point covers each of them.
    if (item.isOpenPrice) {
      const catalogBase =
        item.variants.find(v => v.id === variantId)?.price ?? item.price;
      setRateLine({
        item,
        variantId,
        variantName,
        optionIds,
        optionNames,
        modifierDelta: unitPrice - catalogBase,
        note,
      });
      // Pre-fill with the last-known rate so the common "same as last time" case is one tap.
      setRateInput(catalogBase > 0 ? String(catalogBase) : '');
      return;
    }
    insertLineIntoCart(
      item,
      variantId,
      variantName,
      optionIds,
      optionNames,
      unitPrice,
      note,
    );
  };

  const confirmRateLine = () => {
    if (!rateLine) return;
    const rate = parseFloat(rateInput);
    if (!rateInput.trim() || isNaN(rate) || rate <= 0) {
      dispatch(
        showToast({
          message: 'Enter a rate greater than 0.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    const typed = Math.round(rate * 100) / 100;
    insertLineIntoCart(
      rateLine.item,
      rateLine.variantId,
      rateLine.variantName,
      rateLine.optionIds,
      rateLine.optionNames,
      typed + rateLine.modifierDelta,
      rateLine.note,
      typed,
    );
    setRateLine(null);
    setRateInput('');
  };

  const addToCart = (item: ApiMenuItem) => {
    if (!item.available) {
      dispatch(
        showToast({
          message: `${item.name} is currently unavailable`,
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    if (item.variants.length > 0 || item.modifiers.length > 0) {
      setOptionsItem(item);
      setOptionsVariantId(
        item.variants.find(v => v.isDefault)?.id ?? item.variants[0]?.id,
      );
      setOptionsSelectedOptionIds([]);
      setOptionsNote('');
      return;
    }
    addLineToCart(item, undefined, undefined, [], [], item.price);
  };

  // Referentially-stable wrapper around addToCart for MenuRow's React.memo — addToCart
  // itself closes over fresh state every render, so passing it directly would re-render
  // every row on every parent render. The ref always points at the latest closure, so
  // behavior is identical to calling addToCart directly.
  const addToCartRef = useRef(addToCart);
  addToCartRef.current = addToCart;
  const onMenuRowPress = useCallback(
    (item: ApiMenuItem) => addToCartRef.current(item),
    [],
  );

  // Total units of each menu item sitting in the cart, keyed by menuItemId — one item can
  // span several cart lines (variants, toppings, MRP rates), so they're summed. Feeds each
  // MenuRow's qty prop, which switches it between the ADD button and the −/qty/+ stepper.
  const menuItemQty = useMemo(() => {
    const map: Record<number, number> = {};
    for (const line of cart) map[line.menuItemId] = (map[line.menuItemId] ?? 0) + line.qty;
    return map;
  }, [cart]);

  // The stepper's "−": drop one unit of this menu item from the cart. Removes it from the
  // most-recently-added matching line (and deletes that line when it hits 0) — for a plain
  // one-tap item there's only ever the single line, and for a multi-line item this peels
  // back the last thing added, which is the intuitive undo.
  const decrementMenuItem = (item: ApiMenuItem) => {
    setCart((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].menuItemId === item.id) { idx = i; break; }
      }
      if (idx === -1) return prev;
      const line = prev[idx];
      if (line.qty > 1) return prev.map((c, i) => (i === idx ? { ...c, qty: c.qty - 1 } : c));
      return prev.filter((_, i) => i !== idx);
    });
  };
  const decrementMenuItemRef = useRef(decrementMenuItem);
  decrementMenuItemRef.current = decrementMenuItem;
  const onMenuRowDecrement = useCallback((item: ApiMenuItem) => decrementMenuItemRef.current(item), []);

  // Pin/unpin straight from the till — see MenuRow's pin button. Stable identity for the same
  // React.memo reason as onMenuRowPress above; the mutation object itself never changes identity,
  // so this closure has nothing stale to capture.
  const togglePinned = useToggleMenuPinned();
  const togglePinnedRef = useRef(togglePinned);
  togglePinnedRef.current = togglePinned;
  const onMenuRowTogglePin = useCallback((item: ApiMenuItem) => {
    togglePinnedRef.current.mutate(item.id, {
      onError: err =>
        dispatch(
          showToast({
            message: getApiErrorMessage(err, 'Could not update pin'),
            icon: 'alert-circle-outline',
            tone: 'danger',
          }),
        ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmOptionsAdd = () => {
    if (!optionsItem) return;
    if (missingRequiredGroups.length > 0) {
      dispatch(
        showToast({
          message: `Please choose ${missingRequiredGroups
            .map(m => m.name)
            .join(', ')}.`,
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    const variant = optionsItem.variants.find(v => v.id === optionsVariantId);
    // One label per distinct option, prefixed with its count when more than one was picked.
    const names = [...new Set(selectedOptionUnits.map(o => o.id))].map(id => {
      const option = selectedOptionUnits.find(o => o.id === id)!;
      const qty = optionQty(id);
      return qty > 1 ? `${qty}x ${option.name}` : option.name;
    });
    if (optionsNote.trim()) persistNoteTokens(optionsNote);
    addLineToCart(
      optionsItem,
      variant?.id,
      variant?.name,
      [...optionsSelectedOptionIds],
      names,
      optionsUnitPrice,
      optionsNote,
    );
    setOptionsItem(null);
    setOptionsNote('');
  };

  /** How many of one option are picked. A "Quantity" group stores N copies of the same id
   * (see CreateOrderItemRequest.modifierOptionIds); Radio/MultiSelect only ever hold one. */
  const optionQty = (optionId: number) =>
    optionsSelectedOptionIds.filter(id => id === optionId).length;

  const toggleOptionsModifierOption = (
    modifierId: number,
    type: string,
    optionId: number,
  ) => {
    setOptionsSelectedOptionIds(prev => {
      if (type === 'Radio') {
        const item = optionsItem!;
        const modifier = item.modifiers.find(m => m.id === modifierId)!;
        const siblingIds = modifier.options.map(o => o.id);
        return [...prev.filter(id => !siblingIds.includes(id)), optionId];
      }
      // Quantity groups step up one at a time — the row's +/- buttons call
      // changeOptionQty directly, so a plain tap here just seeds the first unit.
      if (type === 'Quantity')
        return prev.includes(optionId) ? prev : [...prev, optionId];
      return prev.includes(optionId)
        ? prev.filter(id => id !== optionId)
        : [...prev, optionId];
    });
  };

  const changeOptionQty = (optionId: number, delta: number) => {
    setOptionsSelectedOptionIds(prev => {
      if (delta > 0) return [...prev, optionId];
      const at = prev.indexOf(optionId);
      return at === -1 ? prev : [...prev.slice(0, at), ...prev.slice(at + 1)];
    });
  };

  /** Required groups with nothing picked — blocks the Add button below. Modifier.isRequired
   * used to be purely decorative on both ends; the backend now rejects these too. */
  const missingRequiredGroups = (optionsItem?.modifiers ?? []).filter(
    m =>
      m.isRequired &&
      !m.options.some(o => optionsSelectedOptionIds.includes(o.id)),
  );

  /** Selected options expanded to one entry per unit, so a 2x line counts twice in the total. */
  const selectedOptionUnits = optionsSelectedOptionIds
    .map(id =>
      optionsItem?.modifiers.flatMap(m => m.options).find(o => o.id === id),
    )
    .filter((o): o is NonNullable<typeof o> => !!o);

  const optionsUnitPrice =
    (optionsItem?.variants.find(v => v.id === optionsVariantId)?.price ??
      optionsItem?.price ??
      0) + selectedOptionUnits.reduce((sum, o) => sum + o.price, 0);

  // Free-text instruction editor for one existing cart line (e.g. "No onion") — the only
  // way to attach/edit one after the item's already in the cart (the picker above lets you
  // type it inline while adding instead, see confirmOptionsAdd).
  const [notePromptLineId, setNotePromptLineId] = useState<string | null>(null);
  const [notePromptItemName, setNotePromptItemName] = useState('');
  const [notePromptText, setNotePromptText] = useState('');
  const openNotePrompt = (line: CartLine) => {
    setNotePromptLineId(line.id);
    setNotePromptItemName(line.name);
    setNotePromptText(line.modifier);
  };
  const saveNotePrompt = () => {
    if (!notePromptLineId) return;
    const text = notePromptText.trim();
    if (text) persistNoteTokens(text);
    setCart(prev =>
      prev.map(c => (c.id === notePromptLineId ? { ...c, modifier: text } : c)),
    );
    setNotePromptLineId(null);
    setNotePromptText('');
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(c => (c.id === id ? { ...c, qty: c.qty + delta } : c))
        .filter(c => c.qty > 0),
    );
  };

  // Direct quantity entry on a cart line. The ± buttons are right for a ±1 correction, but
  // ringing up 12 of something shouldn't cost eleven taps — tapping the number types over it
  // instead. Same affordance the order-detail screens' ItemQtyStepper offers on an order that
  // already exists, so the gesture is the same before and after the order is placed.
  const [qtyEditLineId, setQtyEditLineId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');

  const beginQtyEdit = (line: CartLine) => {
    setQtyDraft(String(line.qty));
    setQtyEditLineId(line.id);
  };

  // Anything unparseable (or a cleared field) leaves the line as it was rather than dropping to
  // 0 — 0 deletes the line above, and a mistyped keystroke must not be able to do that silently.
  const commitQtyEdit = (line: CartLine) => {
    setQtyEditLineId(null);
    const parsed = parseInt(qtyDraft, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed === line.qty) return;
    setCart(prev =>
      prev.map(c => (c.id === line.id ? { ...c, qty: parsed } : c)),
    );
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  // Flat wins and is clamped to the bill; otherwise the percentage drives it. A flat ₹ figure
  // is NOT re-derived from the subtotal, so adding an item can't quietly grow "₹50 off".
  const discountAmount =
    discountFlat > 0
      ? Math.min(discountFlat, subtotal)
      : subtotal * (discountPct / 100);
  const taxable = Math.max(0, subtotal - discountAmount);
  const tax = taxable * (taxRatePct / 100);
  // Other Charges land on top of tax, not themselves taxed — matches the backend's
  // OrderBuildingService.RecomputeTotals (see ApiOrder.serviceChargeAmount's doc comment).
  const total =
    taxable +
    tax +
    pfServiceChargeAmount +
    pfPackingChargeAmount +
    pfDeliveryChargeAmount +
    pfTipAmount;

  // --- Live offer preview ---
  // The totals above are a client-side estimate and deliberately know nothing about Offers:
  // those are priced server-side when the order is created. Without the banner below, the
  // cashier sees full price here and then a mysteriously smaller bill on the table's settle
  // panel. So ask the server what the current cart earns, using the same evaluation it will
  // redo at save time.
  //
  // A cart line carries no category of its own, so map it back through the menu — the server
  // builds the identical lookup before calling OfferEngine.
  const categoryByItemId = useMemo(() => {
    const byId: Record<number, string> = {};
    menuItems.forEach(m => {
      byId[m.id] = m.category;
    });
    return byId;
  }, [menuItems]);

  const offerPreviewLines = useMemo<OfferPreviewLine[]>(
    () =>
      cart.map((line, idx) => ({
        lineKey: idx,
        menuItemId: line.menuItemId,
        categoryName: categoryByItemId[line.menuItemId] ?? null,
        name: line.name,
        unitPrice: line.price,
        qty: line.qty,
      })),
    [cart, categoryByItemId],
  );

  const { data: offerPreview } = useOfferPreview(offerPreviewLines);
  const appliedOffers = offerPreview?.applied ?? [];
  const offerNearMisses = offerPreview?.nearMisses ?? [];
  const showOfferBanner =
    cart.length > 0 && (appliedOffers.length > 0 || offerNearMisses.length > 0);

  // --- Order actions ---
  const clearCart = () => {
    setCart([]);
    setDiscountPct(0);
    setDiscountFlat(0);
    setPfServiceChargeAmount(0);
    setPfPackingChargeAmount(0);
    setPfDeliveryChargeAmount(0);
    setPfTipAmount(0);
    setCartExpanded(false);
  };

  const totalQty = cart.reduce((sum, line) => sum + line.qty, 0);

  // Persists the order in the "Open" state (priced server-side, table occupied) and,
  // unless `holdOnly`, immediately fires it to the kitchen as a second call — from the
  // waiter's perspective still one tap. `holdOnly` skips the fire so the order can be
  // edited and fired later from the Tables screen. Takes the table code as an argument
  // so the picker can submit immediately on selection without a redux round-trip.
  const submitOrder = async (
    tableCode: string | null,
    holdOnly: boolean,
    guestOverride?: { name: string; phone: string },
    andPrint: boolean = true,
  ) => {
    if (createOrderMutation.isPending) return;
    // setGuestName/setGuestPhone are async — a caller that just validated and set
    // them in the same handler (the guest modal's Save button) would otherwise read
    // the pre-update state here and submit with an empty phone. The override lets
    // that caller pass the just-validated values directly instead of racing the render.
    const effectiveGuestName = guestOverride?.name ?? guestName;
    const effectiveGuestPhone = guestOverride?.phone ?? guestPhone;
    // Both QSR and Cash Sale auto-fire inside backend Create — QSR because there's no
    // staff member coming back to press Fire, Cash because there's no kitchen step at
    // all (the backend jumps every line straight to Served too). Neither needs (or
    // supports) a separate Fire call or a Hold step.
    const noFireStep = orderType === 'QSR' || orderType === 'CASH';
    try {
      let order = await createOrderMutation.mutateAsync({
        orderType: orderType as
          | 'DINE_IN'
          | 'TAKEAWAY'
          | 'DELIVERY'
          | 'QSR'
          | 'CASH',
        tableCode: orderType === 'DINE_IN' ? tableCode ?? undefined : undefined,
        guestName: effectiveGuestName.trim() || undefined,
        guestPhone: effectiveGuestPhone.trim() || undefined,
        guestAddress: guestAddress.trim() || undefined,
        items: cart.map(c => ({
          menuItemId: c.menuItemId,
          qty: c.qty,
          modifier: c.modifier || undefined,
          variantId: c.variantId,
          modifierOptionIds: c.modifierOptionIds.length
            ? c.modifierOptionIds
            : undefined,
          openPrice: c.openPrice,
        })),
        discountPct: discountFlat > 0 ? undefined : discountPct || undefined,
        discountAmount: discountFlat > 0 ? discountFlat : undefined,
        branchId: activeBranchId,
        servedByStaffId: waiterStaffId ?? undefined,
      });

      if (holdOnly && !noFireStep) {
        clearCart();
        dispatch(
          showToast({
            message: `Order ${order.number} held — table occupied, fire it from the Tables screen when ready.`,
            icon: 'clock-outline',
            tone: 'success',
          }),
        );
        return;
      }

      // Second step: fire to the kitchen — except QSR/Cash, which the backend already
      // auto-fired inside Create (calling Fire again would 400 "No new items to fire").
      // If firing fails, the order still safely exists as an Open order recoverable
      // from the Tables screen — don't surface a raw error.
      if (!noFireStep) {
        try {
          order = await fireOrderMutation.mutateAsync(order.id);
        } catch {
          clearCart();
          dispatch(
            showToast({
              message: `Order ${order.number} placed but not yet sent to kitchen — fire it from the Tables screen.`,
              icon: 'alert-circle-outline',
              tone: 'warning',
            }),
          );
          return;
        }
      }

      // Cash Sale has no kitchen step at all — nothing to print. Every other type
      // (including QSR/Token, which auto-fires above) prints its kitchen ticket the
      // moment it's fired, but only when the cashier explicitly chose "KOT & Print"
      // (andPrint) — "KOT" alone just sends it to the KDS.
      if (orderType !== 'CASH' && andPrint) autoPrintKot(order);
      // The token number only gets handed to the customer once — right when it's first
      // generated — so this fires on either KOT button (not gated on andPrint like the
      // kitchen ticket above): the customer needs their slip whether or not the kitchen
      // also gets a paper copy.
      if (order.tokenNumber != null)
        autoPrintTokenSlip(order.id, order.tokenNumber);

      clearCart();
      dispatch(
        showToast({
          message:
            orderType === 'CASH'
              ? `${order.number} rung up — ready to bill.`
              : order.tokenNumber != null
              ? `Token #${order.tokenNumber} — sent to the kitchen.`
              : `Order ${order.number} placed — sent to the kitchen.`,
          icon: 'check-circle',
          tone: 'success',
          // A token number has to be read out loud to the customer standing at the counter —
          // the default 1.8s toast is gone before that's realistically possible, especially
          // with no token-slip printer attached. Longer only for this case; every other
          // toast keeps the normal quick-glance duration.
          durationMs: order.tokenNumber != null ? 5000 : undefined,
        }),
      );

      // Cash Sale never shows up on any dashboard (Tables/TokenDashboard/TakeawayDelivery
      // all exclude it — see backend OrdersController.Create), and this receipt popup is
      // the only place it can ever be marked paid (see closeReceipt below) — so it alone
      // still gets it. Every other type already has a dashboard of its own to land on, so
      // skip straight there instead of an extra popup in between — settle/print/WhatsApp
      // happen from that dashboard same as they would for a held/resumed order.
      if (orderType === 'CASH') {
        setReceipt({
          id: order.number,
          orderId: order.id,
          title: order.title,
          orderTypeLabel:
            ORDER_TYPES.find(t => t.key === orderType)?.label ?? '',
          items: order.items,
          subtotal: order.subtotal,
          discountPct: order.discountPct,
          discountAmount: order.discountAmount,
          tax: order.tax,
          total: order.total,
          time: new Date(order.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          guestPhone: effectiveGuestPhone.trim() || undefined,
          isCashSale: true,
          paid: order.paid,
        });
        setReceiptVisible(true);
        return;
      }

      setGuestName('');
      setGuestPhone('');
      setGuestAddress('');
      dispatch(clearSelectedTable());
      if (orderType === 'QSR') navigation.navigate('TokenDashboard');
      else if (orderType === 'TAKEAWAY' || orderType === 'DELIVERY')
        navigation.navigate('TakeawayDelivery');
      else {
        try {
          navigation.navigate('MainTabs', { screen: 'Orders' });
        } catch {
          navigation.navigate('Tables');
        }
      }
    } catch (err) {
      dispatch(
        showToast({
          message: getApiErrorMessage(err, 'Order failed'),
          icon: 'alert-circle-outline',
          tone: 'danger',
        }),
      );
    }
  };

  // Resume/append mode: add the cart's new items to the already-open order, then (unless
  // holdOnly) fire them as a fresh KOT — the existing fired KOTs are never touched. Guest
  // and table already live on the order, so nothing is re-asked. Returns to Orders after.
  const submitAppend = async (andPrint: boolean = true) => {
    if (resumeOrderId == null || addOrderItemMutation.isPending) return;
    try {
      for (const c of cart) {
        await addOrderItemMutation.mutateAsync({
          id: resumeOrderId,
          menuItemId: c.menuItemId,
          qty: c.qty,
          modifier: c.modifier || undefined,
          variantId: c.variantId,
          modifierOptionIds: c.modifierOptionIds.length
            ? c.modifierOptionIds
            : undefined,
          openPrice: c.openPrice,
        });
      }
      // Always fires: appending used to be able to stop here and leave the round unfired, which
      // billed the guest for food the kitchen was never told to make. Fire creates a NEW KOT
      // containing only these just-added items.
      const firedOrder = await fireOrderMutation.mutateAsync(resumeOrderId);
      if (andPrint) autoPrintKot(firedOrder);
      clearCart();
      dispatch(clearSelectedTable()); // exit resume mode
      // A tableless QSR order came from the Token Dashboard's "Add Item" — return there
      // instead of the dine-in Tables screen, which has nothing to show for it.
      const isTokenOrder = resumeOrder?.orderType === 'QSR';
      dispatch(
        showToast({
          message: 'New KOT sent to the kitchen.',
          icon: 'check-circle',
          tone: 'success',
        }),
      );
      if (isTokenOrder) {
        navigation.navigate('TokenDashboard');
      } else {
        try {
          navigation.navigate('MainTabs', { screen: 'Orders' });
        } catch {
          navigation.navigate('Tables');
        }
      }
    } catch (err) {
      dispatch(
        showToast({
          message: getApiErrorMessage(err, 'Could not add items'),
          icon: 'alert-circle-outline',
          tone: 'danger',
        }),
      );
    }
  };

  // Shared validation preamble for both Fire and Hold: guarantees non-empty cart, a valid
  // mandatory phone, and (for dine-in) a table — opening the single combined quick-fire
  // popup when either is missing, then continuing into the given submit action. Returns
  // true if it handled the action by deferring to the popup (caller should stop); false
  // to proceed inline. In resume mode the order already has a table + guest, so only the
  // non-empty-cart check applies. QSR token orders and Cash Sales skip this gate
  // entirely — name/phone are genuinely optional there, not just deferred to a popup.
  const ensureOrderReady = (
    holdOnly: boolean,
    andPrint: boolean = true,
  ): boolean => {
    if (cart.length === 0) {
      dispatch(
        showToast({
          message: 'Add items to the order first.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return true;
    }
    if (resumeMode) return false;
    if (orderType === 'QSR' || orderType === 'CASH') return false;
    if (orderType === 'DINE_IN' && !selectedTable) {
      setGuestDraft(guestName);
      setGuestPhoneDraft(guestPhone);
      setPendingHoldOnly(holdOnly);
      setPendingAndPrint(andPrint);
      setQuickFireModalVisible(true);
      return true;
    }
    return false;
  };

  // andPrint: false = "KOT" (fire only, KDS ticket), true = "KOT & Print" (fire + physical
  // kitchen ticket in one tap) — lets a cashier skip the extra manual Print KOT tap when
  // they already know they want the physical copy.
  const fireToKitchen = (andPrint: boolean) => {
    if (ensureOrderReady(false, andPrint)) return;
    if (resumeMode) {
      submitAppend(andPrint);
      return;
    }
    submitOrder(
      orderType === 'DINE_IN' ? selectedTable : null,
      false,
      undefined,
      andPrint,
    );
  };

  const holdOrder = () => {
    // Fresh orders only — resume mode no longer offers Hold at all (see the header button),
    // because a round appended without a KOT got billed for food nobody made.
    //
    // The backend auto-fires a QSR order inside Create (no one comes back to press
    // Fire) and a Cash Sale has no kitchen step at all — so a fresh order of either
    // type can't be held: pressing Hold used to silently fire it to the kitchen.
    if (orderType === 'QSR' || orderType === 'CASH') {
      dispatch(
        showToast({
          message:
            orderType === 'CASH'
              ? 'Cash sales have no kitchen step to hold — use Save Draft to park the cart instead.'
              : 'Token orders fire to the kitchen immediately — use Save Draft to park the cart instead.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    if (ensureOrderReady(true)) return;
    submitOrder(orderType === 'DINE_IN' ? selectedTable : null, true);
  };

  // --- Draft actions (local-only park/resume — see orderDrafts.ts) ---
  const saveDraft = () => {
    if (cart.length === 0) {
      dispatch(
        showToast({
          message: 'Add items to the order first.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    const draft: OrderDraft<CartLine> = {
      id: newDraftId(),
      savedAt: Date.now(),
      orderType,
      guestName,
      guestPhone,
      discountPct,
      discountFlat,
      cart,
    };
    const next = [draft, ...drafts];
    setDrafts(next);
    persistDrafts(next);
    clearCart();
    setGuestName('');
    setGuestPhone('');
    setGuestAddress('');
    dispatch(
      showToast({
        message: `Draft saved (${draft.cart.length} item${
          draft.cart.length !== 1 ? 's' : ''
        }) — resume it from the Drafts row below the total.`,
        icon: 'content-save-outline',
        tone: 'success',
      }),
    );
  };

  const deleteDraft = (id: string) => {
    const next = drafts.filter(d => d.id !== id);
    setDrafts(next);
    persistDrafts(next);
    if (next.length === 0) setDraftsModalVisible(false);
  };

  const loadDraft = (draft: OrderDraft<CartLine>) => {
    if (cart.length > 0) {
      dispatch(
        showToast({
          message: 'Save or clear the current cart first, then load the draft.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    // Restoring the order type would silently orphan a table that's already claimed
    // this order as Dine In — keep the current type in that case (items still load).
    if (!selectedTable && ORDER_TYPES.some(t => t.key === draft.orderType))
      setOrderType(draft.orderType);
    setCart(draft.cart);
    setGuestName(draft.guestName);
    setGuestPhone(draft.guestPhone);
    setDiscountPct(draft.discountPct);
    setDiscountFlat(draft.discountFlat ?? 0);
    deleteDraft(draft.id);
    setDraftsModalVisible(false);
    dispatch(
      showToast({
        message: 'Draft loaded — continue the order.',
        icon: 'check-circle',
        tone: 'success',
      }),
    );
  };

  // --- Pay First (pay-before-serve): settle sheet over the LOCAL cart. The order
  // doesn't exist on the server until Settle is pressed — it's created, fired, and
  // paid in one go there. Discount must live here (rides on create as discountPct)
  // because the backend's bill-discount endpoint only accepts Served orders.
  const openPayFirst = () => {
    if (cart.length === 0) {
      dispatch(
        showToast({
          message: 'Add items to the order first.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    // Same readiness gate as Fire: dine-in orders need a table — collect it via the
    // quick-fire popup, then come back here.
    if (orderType === 'DINE_IN' && !selectedTable) {
      setGuestDraft(guestName);
      setGuestPhoneDraft(guestPhone);
      setPendingPayFirst(true);
      setQuickFireModalVisible(true);
      return;
    }
    setPfOpenAdjustment(null);
    // Forces PaymentMethodPicker to remount with fresh internal state — same reset
    // openPayFirst always gave the old bespoke split UI on every re-open.
    setPfPickerKey(k => k + 1);
    setPayFirstVisible(true);
  };

  // --- Pay First's Discount + Other Charges tiles — same BillAdjustmentsPanel component
  // OrderBillActions uses, applied to local state instead of a live order's server
  // mutations (see the state declarations above for why Coupon/Gift Card/Loyalty are
  // excluded). Discount only ever rides through as a %, so a ₹ entry here is converted
  // to the equivalent % of subtotal rather than gaining a flat-amount field the backend's
  // order-creation request doesn't have. ---
  const pfTiles: AdjustmentTile[] = [
    {
      key: 'discount',
      label: 'Discount',
      icon: 'tag-outline',
      amount: discountAmount,
      applied: discountPct > 0 || discountFlat > 0,
      kind: 'percentOrFlat',
      removable: true,
    },
    {
      key: 'service',
      label: 'Service Charge',
      icon: 'room-service-outline',
      amount: pfServiceChargeAmount,
      applied: pfServiceChargeAmount > 0,
      kind: 'percentOrFlat',
      allowZero: true,
      removable: true,
      quickToggleValue:
        settings?.serviceChargeDefaultPct != null
          ? { pct: settings.serviceChargeDefaultPct }
          : undefined,
    },
    {
      key: 'packing',
      label: 'Packing Charge',
      icon: 'package-variant-closed',
      amount: pfPackingChargeAmount,
      applied: pfPackingChargeAmount > 0,
      kind: 'flat',
      allowZero: true,
      removable: true,
      quickToggleValue:
        settings?.packingChargeDefaultAmount != null
          ? { amount: settings.packingChargeDefaultAmount }
          : undefined,
    },
    {
      key: 'delivery',
      label: 'Delivery Charge',
      icon: 'moped-outline',
      amount: pfDeliveryChargeAmount,
      applied: pfDeliveryChargeAmount > 0,
      kind: 'flat',
      allowZero: true,
      removable: true,
      quickToggleValue:
        settings?.deliveryChargeDefaultAmount != null
          ? { amount: settings.deliveryChargeDefaultAmount }
          : undefined,
    },
    {
      key: 'tip',
      label: 'Tip',
      icon: 'hand-coin-outline',
      amount: pfTipAmount,
      applied: pfTipAmount > 0,
      kind: 'flat',
      allowZero: true,
      removable: true,
    },
  ];
  const pfHandleTileApply = (key: string, value: AdjustmentApplyValue) => {
    switch (key) {
      case 'discount':
        // Keep a % as a %, and a ₹ as a ₹ — the two are mutually exclusive, so setting one
        // clears the other. No more amount→% conversion (that was the drift bug).
        if (value.pct !== undefined) {
          setDiscountPct(value.pct);
          setDiscountFlat(0);
        } else {
          setDiscountFlat(value.amount ?? 0);
          setDiscountPct(0);
        }
        break;
      case 'service':
        setPfServiceChargeAmount(
          value.pct !== undefined
            ? Math.round(((subtotal * value.pct) / 100) * 100) / 100
            : value.amount!,
        );
        break;
      case 'packing':
        setPfPackingChargeAmount(value.amount!);
        break;
      case 'delivery':
        setPfDeliveryChargeAmount(value.amount!);
        break;
      case 'tip':
        setPfTipAmount(value.amount!);
        break;
    }
    setPfOpenAdjustment(null);
  };
  const pfHandleRemoveAdjustment = (key: string) => {
    switch (key) {
      case 'discount':
        setDiscountPct(0);
        setDiscountFlat(0);
        break;
      case 'service':
        setPfServiceChargeAmount(0);
        break;
      case 'packing':
        setPfPackingChargeAmount(0);
        break;
      case 'delivery':
        setPfDeliveryChargeAmount(0);
        break;
      case 'tip':
        setPfTipAmount(0);
        break;
    }
    if (pfOpenAdjustment === key) setPfOpenAdjustment(null);
  };

  // andThen: what happens in the same tap once the money's taken — nothing, print the
  // customer bill, or send it on WhatsApp. Mirrors OrderBillActions' segmented settle
  // button for an existing order, so the two settle UIs offer the same three actions.
  // phoneOverride: the number just typed into the missing-number prompt. It has to travel as
  // an argument rather than through setGuestPhone alone — this call happens in the same tick
  // the prompt submits, before that state update is visible here.
  const settlePayFirst = async (
    andThen?: 'print' | 'whatsapp',
    phoneOverride?: string,
  ) => {
    if (settlingMode || submitting) return;
    if (!pfPayment.canSettle || pfPayment.splits.length === 0) {
      dispatch(
        showToast({
          message: 'Choose a payment method and amount.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    const effectivePhone = (phoneOverride ?? guestPhone).trim();
    // Checked before the order is created rather than after it's paid — a missing phone
    // should cost the cashier a correction, not an order that's already been rung up and
    // settled with no way to deliver the bill it promised to send. Nothing is saved to a
    // server here (there's no order yet): the number goes into the same guestPhone state
    // that rides along on create, so it lands on the order the normal way.
    if (andThen === 'whatsapp' && !/^\d{10}$/.test(effectivePhone)) {
      setPfPhonePromptOpen(true);
      return;
    }
    // A Cash Sale never shows up anywhere else (Tables/Token Dashboard/KDS all exclude
    // it — see backend OrdersController.Create), so unlike every other order type it
    // has no dashboard to come back to for the rest — it must be paid in full right here.
    if (orderType === 'CASH' && pfPayment.isPartial) {
      dispatch(
        showToast({
          message: 'A Cash Sale must be paid in full.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    setSettlingMode(andThen ?? 'settle');
    try {
      let order = await createOrderMutation.mutateAsync({
        orderType: orderType as
          | 'DINE_IN'
          | 'TAKEAWAY'
          | 'DELIVERY'
          | 'QSR'
          | 'CASH',
        tableCode:
          orderType === 'DINE_IN' ? selectedTable ?? undefined : undefined,
        guestName: guestName.trim() || undefined,
        guestPhone: effectivePhone || undefined,
        guestAddress: guestAddress.trim() || undefined,
        items: cart.map(c => ({
          menuItemId: c.menuItemId,
          qty: c.qty,
          modifier: c.modifier || undefined,
          variantId: c.variantId,
          modifierOptionIds: c.modifierOptionIds.length
            ? c.modifierOptionIds
            : undefined,
          openPrice: c.openPrice,
        })),
        discountPct: discountFlat > 0 ? undefined : discountPct || undefined,
        discountAmount: discountFlat > 0 ? discountFlat : undefined,
        branchId: activeBranchId,
        servedByStaffId: waiterStaffId ?? undefined,
      });
      // Other Charges (Service/Packing/Delivery/Tip) aren't part of order
      // creation — same billing-time bill-charges call OrderBillActions uses for an
      // existing order, just applied immediately after this one's created instead of
      // whenever a cashier later opens its Settle Bill panel. Same "keep going" resilience
      // as the fire step below: the order already exists at this point, so a network blip
      // here shouldn't block taking payment — worst case the charges get added later from
      // Tables/Token Dashboard instead of landing in this one atomic flow.
      if (
        pfServiceChargeAmount > 0 ||
        pfPackingChargeAmount > 0 ||
        pfDeliveryChargeAmount > 0 ||
        pfTipAmount > 0
      ) {
        try {
          order = await billChargesMutation.mutateAsync({
            id: order.id,
            serviceChargeAmount: pfServiceChargeAmount || undefined,
            packingChargeAmount: pfPackingChargeAmount || undefined,
            deliveryChargeAmount: pfDeliveryChargeAmount || undefined,
            tipAmount: pfTipAmount || undefined,
          });
        } catch {
          // Order exists — keep going and take payment for whatever the order actually
          // totals without these charges; they can be added later from Tables/Token Dashboard.
        }
      }
      // QSR auto-fires inside Create and Cash has no kitchen step — everything else
      // still goes to the KDS; pay-first only changes WHEN the money is taken, not
      // whether the kitchen hears about the order.
      if (orderType !== 'QSR' && orderType !== 'CASH') {
        try {
          order = await fireOrderMutation.mutateAsync(order.id);
        } catch {
          // Order exists — keep going and take payment; it can be re-fired from Tables.
        }
      }
      // Physical kitchen ticket for whatever just fired — the same autoPrintKot the normal
      // Fire path runs (see submitOrder), driven by the sheet's Print KOT toggle instead of
      // a separate "KOT & Print" button. QSR is included because Create already fired it;
      // a Cash Sale has no kitchen step at all, so there's nothing to print.
      if (pfPrintKot && orderType !== 'CASH') autoPrintKot(order);
      // A single tender that's paying the full amount (not a deliberate partial) uses the
      // SERVER's total (authoritative pricing) rather than PaymentMethodPicker's `owed`
      // (the local cart total at popup-open time) — a stale menu price then surfaces as
      // the backend's own mismatch error rather than silently over/under-charging. A
      // genuine partial, or a real multi-tender split, is trusted as typed either way —
      // bumping a deliberately-short partial up to the full total would defeat the point
      // of it, and a split's per-tender amounts are exactly what the cashier meant to key in.
      const splits: PaymentSplit[] =
        pfPayment.splits.length === 1 && !pfPayment.isPartial
          ? [{ method: pfPayment.splits[0].method, amount: order.total }]
          : pfPayment.splits;
      // keepOpen: this is an advance against the order, not a final settle — the token/
      // table/takeaway stays open on its dashboard so items can still be added. Amount
      // collected now (order.total as of this instant) is credited; if more gets added
      // later the balance goes positive again on its own, and Close finalizes it once
      // nothing more is coming. Excluded for CASH — a walk-in cash sale has no dashboard
      // to come back to (see TokenDashboard/TableManagement/TakeawayDelivery's activeOnly
      // queries, none of which include CASH), so it must settle for real right here.
      // A Due (udhaar) leg forces the bill closed regardless of order type: the uncollected
      // part has already moved onto the customer's khata, so leaving the order open too would
      // have the same rupees owed in two places (the server rejects the combination outright —
      // see OrdersController.Pay). guestName/guestPhone come from the picker's own compulsory
      // khata fields and are ignored on an ordinary settle.
      order = await payOrderMutation.mutateAsync({
        id: order.id,
        splits,
        allowPartial: pfPayment.isPartial,
        keepOpen: orderType !== 'CASH' && pfPayment.dueAmount <= 0,
        guestName: pfPayment.dueAmount > 0 ? pfPayment.guestName : undefined,
        guestPhone: pfPayment.dueAmount > 0 ? pfPayment.guestPhone : undefined,
      });

      setPayFirstVisible(false);
      clearCart();
      dispatch(
        showToast({
          message:
            order.tokenNumber != null
              ? `Token #${order.tokenNumber} settled — sent to the kitchen.`
              : `Order ${order.number} settled${
                  orderType === 'CASH' ? '.' : ' — sent to the kitchen.'
                }`,
          icon: 'cash-check',
          tone: 'success',
        }),
      );
      // QSR is already fully settled at this point (keepOpen only reopens the balance if
      // more items get added later) and, like the normal Fire-to-kitchen path (submitOrder
      // above), has the Token Dashboard to land on — so skip the receipt popup and go
      // straight there instead of making the cashier close an extra modal first.
      if (orderType === 'QSR') {
        setGuestName('');
        setGuestPhone('');
        setGuestAddress('');
        dispatch(clearSelectedTable());
        navigation.navigate('TokenDashboard');
      } else {
        setReceipt({
          id: order.number,
          orderId: order.id,
          title: order.title,
          orderTypeLabel:
            ORDER_TYPES.find(t => t.key === orderType)?.label ?? '',
          items: order.items,
          subtotal: order.subtotal,
          discountPct: order.discountPct,
          discountAmount: order.discountAmount,
          tax: order.tax,
          total: order.total,
          time: new Date(order.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          guestPhone: effectivePhone || undefined,
          isCashSale: orderType === 'CASH',
          paid: order.paid,
        });
        setReceiptVisible(true);
      }
      if (andThen === 'whatsapp') {
        // The just-settled order is passed explicitly — receiptOrder's query hasn't
        // refetched it yet at this point.
        await sendBillViaWhatsAppFor(order);
      } else if (andThen === 'print') {
        await PrinterService.printReceipt({
          businessName,
          addressLine: businessAddress ?? undefined,
          orderNumber: order.number,
          time: new Date(order.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          title: order.title,
          orderTypeLabel:
            ORDER_TYPES.find(t => t.key === orderType)?.label ?? '',
          guestPhone: order.guestPhone ?? undefined,
          waiterName: selectedWaiterName,
          gstNumber: settings?.gstNumber,
          upiVpa: settings?.upiVpa,
          amountDue: order.balanceDue ?? order.total,
          items: order.items,
          subtotal: order.subtotal,
          discountPct: order.discountPct || undefined,
          discountAmount: order.discountAmount || undefined,
          taxRatePct,
          tax: order.tax,
          total: order.total,
          footer: receiptFooter,
          showAddress: settings?.receiptShowAddress,
          showWaiterName: settings?.receiptShowWaiterName,
          showGuestPhone: settings?.receiptShowGuestPhone,
          showItemNotes: settings?.receiptShowItemNotes,
          showFooter: settings?.receiptShowFooter,
        });
      }
    } catch (err) {
      dispatch(
        showToast({
          message: getApiErrorMessage(err, 'Could not settle the bill'),
          icon: 'alert-circle-outline',
          tone: 'danger',
        }),
      );
    } finally {
      setSettlingMode(null);
    }
  };

  // --- Pay First's Guest Bill: the courtesy copy handed over BEFORE payment ("bill lao"),
  // printed straight off the local cart. No server order exists yet at this point in the
  // flow (see settlePayFirst), so it carries no order number — deliberately marked
  // PROVISIONAL rather than looking like a settled bill. The WhatsApp half of an existing
  // order's Guest Bill row (OrderBillActions) has no equivalent here: that needs a receipt
  // token for a real order (see sendBillViaWhatsAppFor), so it only becomes available once
  // the order is created — offered on the settle button's WhatsApp segment instead. ---
  const printPayFirstGuestBill = async () => {
    if (cart.length === 0) return;
    setPfPrintingBill(true);
    const result = await PrinterService.printReceipt({
      businessName,
      addressLine: businessAddress ?? undefined,
      orderNumber: 'PROVISIONAL',
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      title:
        orderType === 'DINE_IN' && selectedTable
          ? `Table ${selectedTable}`
          : guestName.trim() || 'Guest',
      orderTypeLabel: ORDER_TYPES.find(t => t.key === orderType)?.label ?? '',
      guestPhone: guestPhone.trim() || undefined,
      waiterName: selectedWaiterName,
      gstNumber: settings?.gstNumber,
      upiVpa: settings?.upiVpa,
      // CartLine.price is already per-unit-with-toppings, the same thing the printer
      // multiplies by qty for a server order's line (see buildReceiptLines).
      items: cart.map(c => ({
        name: c.name,
        qty: c.qty,
        price: c.price,
        variantName: c.variantName,
        modifier: c.modifier || undefined,
        selectedModifiers: c.modifierNames.map(name => ({ name, qty: 1 })),
      })),
      subtotal,
      discountPct: discountPct || undefined,
      discountAmount: discountAmount || undefined,
      taxRatePct,
      tax,
      total,
      footer: receiptFooter,
      showAddress: settings?.receiptShowAddress,
      showWaiterName: settings?.receiptShowWaiterName,
      showGuestPhone: settings?.receiptShowGuestPhone,
      showItemNotes: settings?.receiptShowItemNotes,
      showFooter: settings?.receiptShowFooter,
    });
    setPfPrintingBill(false);
    dispatch(
      showToast({
        message: result.message,
        icon: result.ok ? 'printer-check' : 'alert-circle-outline',
        tone: result.ok ? 'success' : 'danger',
      }),
    );
  };

  const finishClosingReceipt = () => {
    setReceiptVisible(false);
    setReceipt(null);
    setGuestName('');
    setGuestPhone('');
    setGuestAddress('');
    dispatch(clearSelectedTable());
    // A freshly-placed Token order came from the Token Dashboard's "+" — return there so
    // the new token shows up immediately, instead of leaving the cashier stuck on POS.
    if (orderType === 'QSR' && !resumeMode)
      navigation.navigate('TokenDashboard');
  };

  const closeReceipt = () => {
    // A Cash Sale never shows up anywhere else (Tables/Token Dashboard/KDS all exclude
    // it — see backend OrdersController.Create) — this receipt is the only place it can
    // ever be marked paid, so closing it unpaid would leave the order stuck forever.
    if (receipt?.isCashSale && !receipt.paid) {
      Alert.alert(
        'Not marked as paid',
        "This cash sale hasn't been marked as paid yet, and won't be reachable from anywhere else once you close this. Close anyway?",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close anyway',
            style: 'destructive',
            onPress: finishClosingReceipt,
          },
        ],
      );
      return;
    }
    finishClosingReceipt();
  };

  const closeTablePicker = () => {
    setTablePickerVisible(false);
  };

  const closeQuickFireModal = () => {
    setQuickFireModalVisible(false);
    setPendingHoldOnly(false);
    setPendingAndPrint(true);
    setPendingPayFirst(false);
    // The popup intercepts the KOT/KOT&Print tap before either mutation ever starts (no
    // table/phone yet), so `submitting` never flips and the effect that normally clears
    // firingIntent off of it never runs — clear it directly here so the button's spinner
    // doesn't keep spinning after the cashier cancels out.
    setFiringIntent(null);
  };

  // Table tapped inside the quick-fire popup: commit name/phone/table and auto-submit —
  // no separate Save tap needed.
  const handleQuickFireTablePick = (tableCode: string) => {
    const trimmedPhone = guestPhoneDraft.trim();
    const trimmedName = guestDraft.trim();
    setGuestName(trimmedName);
    setGuestPhone(trimmedPhone);
    dispatch(selectTableForOrder(tableCode));
    const holdOnly = pendingHoldOnly;
    const andPrint = pendingAndPrint;
    setQuickFireModalVisible(false);
    setPendingHoldOnly(false);
    setPendingAndPrint(true);
    if (pendingPayFirst) {
      // Popup was only collecting phone/table for the Pay First flow — hand back
      // to the settle sheet instead of firing.
      setPendingPayFirst(false);
      setPfPickerKey(k => k + 1);
      setPfOpenAdjustment(null);
      setPayFirstVisible(true);
      return;
    }
    submitOrder(
      tableCode,
      holdOnly,
      { name: trimmedName, phone: trimmedPhone },
      andPrint,
    );
  };

  // Takeaway/Delivery has no table step — this button just commits name/phone (if any)
  // and auto-submits.
  const handleQuickFireSubmit = () => {
    const trimmedPhone = guestPhoneDraft.trim();
    const trimmedName = guestDraft.trim();
    setGuestName(trimmedName);
    setGuestPhone(trimmedPhone);
    const holdOnly = pendingHoldOnly;
    const andPrint = pendingAndPrint;
    setQuickFireModalVisible(false);
    setPendingHoldOnly(false);
    setPendingAndPrint(true);
    if (pendingPayFirst) {
      setPendingPayFirst(false);
      setPfPickerKey(k => k + 1);
      setPfOpenAdjustment(null);
      setPayFirstVisible(true);
      return;
    }
    submitOrder(
      null,
      holdOnly,
      { name: trimmedName, phone: trimmedPhone },
      andPrint,
    );
  };

  // Payment right here in the receipt modal, for every order type — not gated on
  // Served (see OrdersController.Pay). Lets a cashier fire the KOT and take payment
  // on the same screen instead of hopping to Tables/Token Dashboard afterward.
  const handleReceiptMarkPaid = async (
    payments: PaymentSplit[],
    allowPartial?: boolean,
    andThen?: 'print' | 'whatsapp',
    phoneOverride?: string,
    guest?: { name: string; phone: string },
    unfiredItems?: 'keep',
  ) => {
    if (!receipt) return;
    try {
      // guestName/guestPhone are only present on a settle carrying a Due (udhaar) leg — the
      // server needs them to open the customer's khata and rejects the settle without.
      // unfiredItems likewise: only set when the cashier chose to bill a never-fired line
      // anyway, and the server rejects that settle without it (see PayOptions.unfiredItems).
      await payOrderMutation.mutateAsync({
        id: receipt.orderId,
        splits: payments,
        allowPartial,
        guestName: guest?.name,
        guestPhone: guest?.phone,
        unfiredItems,
      });
      dispatch(
        showToast({
          message: 'Bill settled.',
          icon: 'check-circle',
          tone: 'success',
        }),
      );
      // Chained straight off the settle tap (see OrderBillActions' split-button menu) —
      // both read order content that settling never changes, so no need to wait on a
      // refetch first.
      if (andThen === 'print') await printCurrentReceipt();
      else if (andThen === 'whatsapp')
        await sendReceiptViaWhatsApp(phoneOverride);
    } catch (err) {
      dispatch(
        showToast({
          message: getApiErrorMessage(err, 'Could not settle bill'),
          icon: 'alert-circle-outline',
          tone: 'danger',
        }),
      );
    }
  };

  // Auto-prints the kitchen ticket for whatever was just fired (order.currentFireBatch) —
  // no prices, just what to make. Doesn't block placing the order either way, but does
  // surface a toast either way too (success or "no printer set up") — silent failure here
  // just reads as "nothing happened", same as Token Dashboard's manual "Print KOT" toast.
  const autoPrintKot = async (order: ApiOrder) => {
    const batchItems = order.items.filter(
      i => i.fireBatch === order.currentFireBatch && !i.voided,
    );
    if (batchItems.length === 0) return;
    const batch = order.fireBatches.find(
      b => b.batchNumber === order.currentFireBatch,
    );
    // order.title already reads "Takeaway/Delivery – <guest>" once neither tokenNumber
    // nor tableCode applies, so guestName is only added on top for Token/Table — otherwise
    // it'd repeat the same name twice.
    const isTokenOrTable = order.tokenNumber != null || !!order.tableCode;
    const result = await PrinterService.printKot({
      title:
        order.tokenNumber != null
          ? `Token #${order.tokenNumber}`
          : order.tableCode
          ? `Table ${order.tableCode}`
          : order.title,
      kotNumber: batch?.kotNumber || `#${order.currentFireBatch}`,
      time: new Date(batch?.firedAt ?? order.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      guestName: isTokenOrTable ? order.guestName : undefined,
      items: batchItems.map(i => ({
        name: i.name,
        qty: i.qty,
        variantName: i.variantName,
        modifier: i.modifier,
        stationName: i.stationName,
        vegNonVegType: i.vegNonVegType,
        selectedModifiers: i.selectedModifiers,
      })),
    });
    dispatch(
      showToast({
        message: result.ok ? 'KOT sent to kitchen printer.' : result.message,
        icon: result.ok ? 'printer-check' : 'alert-circle-outline',
        tone: result.ok ? 'success' : 'warning',
      }),
    );
  };

  // Auto-prints the customer-facing token slip the instant a token number is generated
  // (see submitOrder). No printer configured at all is a normal, ongoing state for a
  // cashier who's relying on the (now longer) toast instead — not an error worth attempting
  // or warning about on every single token order, and dispatching a toast for it would
  // immediately overwrite the "Token #X — sent to the kitchen" toast (ToastHost only shows
  // one at a time) before it's even had a moment to be read. A printer that IS configured
  // but fails to actually receive the slip is still worth surfacing, same as autoPrintKot.
  const autoPrintTokenSlip = async (orderId: number, tokenNumber: number) => {
    // Best-effort — a tenant with no WhatsApp Business connected (or the connector
    // service simply not running) still gets exactly today's plain slip, no QR, no error
    // surfaced to the cashier. See OrdersController.GetOrCreateWhatsAppTracking. Fetched
    // even with no printer configured, since the on-screen fallback below needs it too.
    let whatsAppDeepLink: string | null = null;
    try {
      whatsAppDeepLink = (await ordersApi.getOrCreateWhatsAppTracking(orderId))
        .whatsAppDeepLink;
    } catch {
      // ignore — falls back to the plain slip below
    }

    // The on-screen copy of this QR lives in the token's own popup on Token Orders (see
    // TokenDashboardScreen's trackQrSection), not in a one-shot modal fired from here — a
    // cashier who dismissed that modal, or who came back to the token a minute later, had
    // no way to show the customer the code again. The fetch above stays either way: the
    // printed slip still needs the deep link (see escpos.ts's GS(k command).
    if (getPrinterConfig().type === 'none') return;

    const result = await PrinterService.printTokenSlip({
      businessName,
      tokenNumber,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      whatsAppDeepLink,
    });
    if (!result.ok) {
      dispatch(
        showToast({
          message: `Token slip: ${result.message}`,
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
    }
  };

  // Manual re-print for the Receipt Modal's "Print KOT" button — a backup for a failed
  // auto-print on fire, or for cash-sale orders that were never auto-printed to begin with.
  const [printingKot, setPrintingKot] = useState(false);
  const handlePrintKotManual = async () => {
    if (!receiptOrder) return;
    const batchItems = receiptOrder.items.filter(
      i => i.fireBatch === receiptOrder.currentFireBatch && !i.voided,
    );
    if (batchItems.length === 0) {
      dispatch(
        showToast({
          message: 'Nothing fired to the kitchen yet.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    setPrintingKot(true);
    await autoPrintKot(receiptOrder);
    setPrintingKot(false);
  };

  // Takes the order explicitly rather than reading receiptOrder, so a just-settled Pay
  // First order can be sent the instant it's paid — its receiptOrder query hasn't refetched
  // by then (see settlePayFirst's 'whatsapp' branch).
  const sendBillViaWhatsAppFor = async (
    src: ApiOrder,
    phoneOverride?: string,
  ) => {
    const guestPhone = phoneOverride ?? src.guestPhone;
    if (!guestPhone) return;
    let receiptUrl: string | undefined;
    try {
      const token = await ordersApi.getReceiptToken(src.id);
      receiptUrl = `${getPublicApiBaseUrl()}/public/receipt/${token}`;
    } catch {
      receiptUrl = undefined;
    }
    const url = buildWhatsAppBillUrl({
      businessName,
      orderNumber: src.number,
      items: src.items,
      subtotal: src.subtotal,
      discountAmount: src.discountAmount || undefined,
      tax: src.tax,
      total: src.total,
      guestPhone,
      receiptUrl,
    });
    if (!url) {
      dispatch(
        showToast({
          message: 'Need a valid 10-digit mobile number to send via WhatsApp.',
          icon: 'alert-circle-outline',
          tone: 'warning',
        }),
      );
      return;
    }
    Linking.openURL(url);
  };

  // Wrapped rather than passed straight through: sendBillViaWhatsAppFor's first argument is
  // the order, and wiring it to a press handler directly would hand it a touch event instead.
  const sendReceiptViaWhatsApp = async (phoneOverride?: string) => {
    if (receiptOrder) await sendBillViaWhatsAppFor(receiptOrder, phoneOverride);
  };

  const [printing, setPrinting] = useState(false);
  const printCurrentReceipt = async () => {
    if (!receipt) return;
    setPrinting(true);
    const result = await PrinterService.printReceipt({
      businessName,
      addressLine: businessAddress ?? undefined,
      orderNumber: receipt.id,
      time: receipt.time,
      title: receipt.title,
      orderTypeLabel: receipt.orderTypeLabel,
      guestPhone: receipt.guestPhone,
      waiterName: selectedWaiterName,
      gstNumber: settings?.gstNumber,
      upiVpa: settings?.upiVpa,
      items: receipt.items,
      subtotal: receipt.subtotal,
      discountPct: receipt.discountPct || undefined,
      discountAmount: receipt.discountAmount || undefined,
      taxRatePct,
      tax: receipt.tax,
      total: receipt.total,
      footer: receiptFooter,
      showAddress: settings?.receiptShowAddress,
      showWaiterName: settings?.receiptShowWaiterName,
      showGuestPhone: settings?.receiptShowGuestPhone,
      showItemNotes: settings?.receiptShowItemNotes,
      showFooter: settings?.receiptShowFooter,
    });
    setPrinting(false);
    dispatch(
      showToast({
        message: result.message,
        icon: result.ok ? 'printer-check' : 'alert-circle-outline',
        tone: result.ok ? 'success' : 'danger',
      }),
    );
  };

  // Shared between the mobile "collapsed bar -> slide-up modal" cart and the
  // desktop persistent side panel — same order details, guest chip, line
  // items, and Split/Discount/Fire actions either way, just different chrome
  // around it depending on how much screen width is available.
  //
  // Split into three pieces (header / items / summary) so both layouts can keep
  // the order header and the Total + KOT buttons pinned while only the line
  // items scroll — a long cart used to push Total/KOT off the bottom of the
  // mobile sheet, so the cashier had to scroll a full order to reach them.
  //
  // A real View rather than a fragment: as a pinned flex child it must keep its own
  // height when the item list overflows, which needs a node to put flexShrink: 0 on.
  const renderCartHeader = () => (
    <View style={styles.cartHeaderBlock}>
      {/* Resume/append mode: existing order's already-fired KOTs, shown read-only. */}
      {resumeMode && resumeOrder && (
        <View style={styles.resumeBanner}>
          <View style={styles.resumeBannerHead}>
            <Icon name="silverware-variant" size={15} color={COLORS.accent} />
            <Text style={styles.resumeBannerTitle}>
              Adding to Order {resumeOrder.number}
              {resumeOrder.tableCode ? ` · Table ${resumeOrder.tableCode}` : ''}
            </Text>
          </View>
          <Text style={styles.resumeBannerSub}>
            Already in the kitchen (read-only). New items below fire as a fresh
            KOT.
          </Text>
          {resumeOrder.fireBatches.map(b => {
            // Cancelled lines aren't "already in the kitchen" — the kitchen was told to
            // stop making them and they're off the bill (see PrintableReceiptItem.voided),
            // so listing them here re-shows an item the till just removed on the table.
            const bItems = resumeOrder.items.filter(
              it => it.fireBatch === b.batchNumber && !it.voided,
            );
            if (bItems.length === 0) return null;
            return (
              <View key={b.batchNumber} style={styles.resumeKot}>
                <Text style={styles.resumeKotLabel}>
                  KOT {b.kotNumber || `#${b.batchNumber}`} · {b.status}
                </Text>
                {bItems.map(it => (
                  <Text key={it.id} style={styles.resumeKotItem}>
                    {it.qty}× {it.name}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.orderHeaderCol}>
        <View style={styles.orderHeaderTopRow}>
          <Text style={styles.orderTitle}>
            {resumeMode ? 'New Items' : 'Current Order'}
          </Text>
          <View style={styles.orderHeaderActions}>
            {/* Fresh orders only. This used to show in resume mode too, labelled "Add" — which
                read as "add another item" directly under an "New Items" heading, while what it
                actually did was attach the round to the order WITHOUT a KOT. Rounds appended that
                way were billed but never made, and pinned the order at New so its table could
                never be freed. Appending now always goes through New KOT / KOT & Print below, so
                anything on an existing order has genuinely reached the kitchen. */}
            {!resumeMode && orderType !== 'QSR' && orderType !== 'CASH' && (
              <TouchableOpacity
                style={styles.holdHeaderBtn}
                onPress={holdOrder}
                disabled={submitting}
              >
                <Icon name="clock-outline" size={14} color={COLORS.heading} />
                <Text style={styles.holdHeaderBtnText}>Hold</Text>
              </TouchableOpacity>
            )}
            <Tooltip label="Clear cart" placement="left">
              <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
                <Icon
                  name="trash-can-outline"
                  size={18}
                  color={COLORS.dangerAccent}
                />
              </TouchableOpacity>
            </Tooltip>
          </View>
        </View>
        <View style={styles.orderSubtitleRow}>
          {resumeMode ? (
            <Text style={styles.orderSubtitleStatic}>
              Table #{resumeOrder?.tableCode ?? selectedTable} ·{' '}
              {resumeOrder?.guestName || 'Guest'}
            </Text>
          ) : (
            <>
              <Text style={styles.orderSubtitleStatic}>
                {orderType === 'DINE_IN'
                  ? `Table #${selectedTable ?? '—'}`
                  : ORDER_TYPES.find(t => t.key === orderType)?.label}{' '}
                ·
              </Text>
              <TouchableOpacity
                style={styles.guestChip}
                onPress={() => {
                  setGuestDraft(guestName);
                  setGuestPhoneDraft(guestPhone);
                  setGuestAddressDraft(guestAddress);
                  setGuestModalVisible(true);
                }}
              >
                <Text
                  style={styles.orderSubtitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Guest: {displayGuest}
                  {guestPhone.trim() ? ` · ${guestPhone.trim()}` : ''}
                </Text>
                <Icon name="pencil-outline" size={13} color={COLORS.accent} />
              </TouchableOpacity>
              {allStaff.length > 0 && (
                <TouchableOpacity
                  style={styles.guestChip}
                  onPress={() => setWaiterModalVisible(true)}
                >
                  <Text
                    style={styles.orderSubtitle}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    · Waiter: {selectedWaiterName ?? 'Select'}
                  </Text>
                  <Icon name="pencil-outline" size={13} color={COLORS.accent} />
                </TouchableOpacity>
              )}
              {orderType === 'DINE_IN' && (
                <TouchableOpacity onPress={() => setTablePickerVisible(true)}>
                  <Text style={styles.changeTableText}>
                    {selectedTable ? 'Change' : 'Select Table'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );

  const renderCartItems = () => (
    <>
      {cart.length === 0 && (
        <View style={styles.emptyCartBox}>
          <Icon name="cart-outline" size={28} color={COLORS.muted} />
          <Text style={styles.emptyCartText}>
            Cart is empty — tap items in the menu above to add them.
          </Text>
        </View>
      )}

      {/* What the cafe's offers are doing to this cart, as it is being built. The applied rows
          are what stops the bill from quietly landing lower than the items add up to; the
          near-miss rows are the upsell the cashier can read out ("one more and the next is
          free"). Priced by the server, so it can't disagree with the order that gets created. */}
      {showOfferBanner && (
        <View style={styles.offerBanner}>
          {appliedOffers.map(o => (
            <View key={o.offerId} style={styles.offerBannerRow}>
              <Icon name="sale" size={15} color={COLORS.success} />
              <Text style={styles.offerBannerText} numberOfLines={2}>
                <Text style={styles.offerBannerTitle}>{o.title}</Text>
                {o.detail ? ` · ${o.detail}` : ''}
              </Text>
              <Text style={styles.offerBannerSave}>
                −₹{o.discountAmount.toFixed(2)}
              </Text>
            </View>
          ))}
          {offerNearMisses.map(n => (
            <View key={`near-${n.offerId}`} style={styles.offerBannerRow}>
              <Icon
                name="lightbulb-on-outline"
                size={15}
                color={COLORS.warning}
              />
              <Text style={styles.offerBannerNudge} numberOfLines={2}>
                {n.nudge}
              </Text>
            </View>
          ))}
        </View>
      )}

      {cart.map(line => (
        <View key={line.id} style={styles.cartRow}>
          <View style={styles.cartIconBox}>
            <Icon name={line.icon} size={20} color={COLORS.heading} />
          </View>
          <View style={styles.cartInfo}>
            <Text
              style={styles.cartName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {line.name}
              {line.variantName ? ` (${line.variantName})` : ''}
            </Text>
            {line.modifierNames.length > 0 && (
              <Text style={styles.cartModifier} numberOfLines={1}>
                {line.modifierNames.join(', ')}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.cartNoteRow,
                !!line.modifier && styles.cartNoteRowActive,
              ]}
              onPress={() => openNotePrompt(line)}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 8 }}
            >
              {!line.modifier && (
                <Icon name="plus" size={11} color={COLORS.muted} />
              )}
              <Text
                style={[
                  styles.cartNoteText,
                  !line.modifier && styles.cartNoteTextEmpty,
                ]}
                numberOfLines={1}
              >
                {line.modifier || 'Note'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => updateQty(line.id, -1)}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            {qtyEditLineId === line.id ? (
              <TextInput
                style={[styles.stepperValue, styles.stepperValueInput]}
                value={qtyDraft}
                onChangeText={setQtyDraft}
                onBlur={() => commitQtyEdit(line)}
                onSubmitEditing={() => commitQtyEdit(line)}
                keyboardType="number-pad"
                selectTextOnFocus
                autoFocus
                maxLength={3}
              />
            ) : (
              <TouchableOpacity
                onPress={() => beginQtyEdit(line)}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={styles.stepperValue}>{line.qty}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => updateQty(line.id, 1)}
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cartPrice}>
            ₹{(line.price * line.qty).toFixed(2)}
          </Text>
        </View>
      ))}
    </>
  );

  const renderCartSummary = () => (
    <>
      <View style={styles.summaryBox}>
        {/* Subtotal/tax breakdown intentionally lives on the bill (settle sheet /
            receipt), not here — the POS cart just shows what the customer owes. */}
        {discountAmount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: COLORS.success }]}>
              Discount{discountPct > 0 ? ` (${discountPct}%)` : ''}
            </Text>
            <Text style={[styles.summaryValue, { color: COLORS.success }]}>
              −₹{discountAmount.toFixed(2)}
            </Text>
          </View>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₹{total.toFixed(2)}</Text>
        </View>

        {!resumeMode && (
          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.payFirstBtn]}
              onPress={openPayFirst}
              disabled={submitting}
            >
              <Icon name="cash-fast" size={16} color="#FFFFFF" />
              <Text style={[styles.secondaryBtnText, styles.payFirstBtnText]}>
                Pay First
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={saveDraft}
              disabled={submitting}
            >
              <Icon
                name="content-save-outline"
                size={16}
                color={COLORS.heading}
              />
              <Text style={styles.secondaryBtnText}>Save Draft</Text>
            </TouchableOpacity>
          </View>
        )}

        {!resumeMode && drafts.length > 0 && (
          <TouchableOpacity
            style={styles.draftsRow}
            onPress={() => setDraftsModalVisible(true)}
          >
            <Icon name="file-clock-outline" size={15} color={COLORS.accent} />
            <Text style={styles.draftsRowText}>
              {drafts.length} saved draft{drafts.length !== 1 ? 's' : ''} — tap
              to resume
            </Text>
            <Icon name="chevron-right" size={16} color={COLORS.accent} />
          </TouchableOpacity>
        )}

        {orderType === 'CASH' ? null : (
          // Two explicit taps instead of one — "KOT" sends it to the KDS only, "KOT &
          // Print" also fires the physical kitchen ticket, so printing never needs a
          // second trip to the receipt modal's manual Print KOT button. Each shows its
          // own spinner via firingIntent — both used to spin together off the shared
          // `submitting` flag no matter which one was actually tapped.
          <View style={styles.fireRow}>
            <TouchableOpacity
              style={[styles.kotBtn, submitting && { opacity: 0.7 }]}
              onPress={() => {
                setFiringIntent('kot');
                fireToKitchen(false);
              }}
              disabled={submitting}
            >
              {firingIntent === 'kot' ? (
                <ActivityIndicator size="small" color={COLORS.heading} />
              ) : (
                <Icon name="chef-hat" size={17} color={COLORS.heading} />
              )}
              <Text style={styles.kotBtnText}>
                {resumeMode ? 'New KOT' : 'KOT'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kotPrintBtn, submitting && { opacity: 0.7 }]}
              onPress={() => {
                setFiringIntent('kotPrint');
                fireToKitchen(true);
              }}
              disabled={submitting}
            >
              {firingIntent === 'kotPrint' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="printer" size={17} color="#FFFFFF" />
              )}
              <Text style={styles.kotPrintBtnText}>KOT & Print</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );

  // Veg/Non-Veg chips — mutually exclusive (see dietFilter), and identical on both
  // layouts, so the two search-row branches below share this one node instead of
  // keeping two copies of it in sync.
  const dietToggles = (
    <View style={styles.dietToggleGroup}>
      <TouchableOpacity
        style={[
          styles.vegOnlyToggle,
          dietFilter === 'VEG' && styles.vegOnlyToggleActive,
        ]}
        onPress={() => setDietFilter(f => (f === 'VEG' ? 'ALL' : 'VEG'))}
        activeOpacity={0.7}
      >
        <VegNonVegBadge type="Veg" size={11} />
        <Text
          style={[
            styles.vegOnlyText,
            dietFilter === 'VEG' && styles.vegOnlyTextActive,
          ]}
          numberOfLines={1}
        >
          Veg
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.vegOnlyToggle,
          dietFilter === 'NONVEG' && styles.nonVegToggleActive,
        ]}
        onPress={() => setDietFilter(f => (f === 'NONVEG' ? 'ALL' : 'NONVEG'))}
        activeOpacity={0.7}
      >
        <VegNonVegBadge type="NonVeg" size={11} />
        <Text
          style={[
            styles.vegOnlyText,
            dietFilter === 'NONVEG' && styles.nonVegTextActive,
          ]}
          numberOfLines={1}
        >
          Non-Veg
        </Text>
      </TouchableOpacity>
    </View>
  );

  const menuAndCategoryPicker = (
    <>
      {/* Horizontally scrollable — 5 pills (Dine In/Takeaway/Delivery/Token/Cash Sale) no
          longer fit a single row on a phone-width screen without this; a plain View here
          just clips whatever doesn't fit instead of letting you reach it. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.orderTypeRow}
      >
        {/* Arriving here from a table (Tables screen's "New Order") pre-selects Dine In,
              same as arriving from Token Dashboard pre-selects QSR — but every type stays
              pickable, not just the one it arrived with. Switching away from Dine In while
              a table's selected clears that table (see below) instead of silently leaving
              it claimed by an order that's no longer Dine In. */}
        {enabledOrderTypes.map(type => {
          const active = type.key === orderType;
          return (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.orderTypePill,
                active && styles.orderTypePillActive,
              ]}
              onPress={() => {
                if (type.key !== 'DINE_IN' && selectedTable)
                  dispatch(clearSelectedTable());
                setOrderType(type.key);
              }}
            >
              <Icon
                name={type.icon}
                size={15}
                color={active ? '#FFFFFF' : COLORS.muted}
              />
              <Text
                style={[
                  styles.orderTypeText,
                  active && styles.orderTypeTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Mobile/tablet: horizontally scrollable — Search/Category keep their own
            natural width instead of getting squeezed to make room for the Veg/Non-Veg
            chips; scroll to reach whatever doesn't fit instead. Desktop web: the category
            filter has moved up into the page header (see DesktopPageHeader's `center`
            below), which was otherwise a mostly empty band next to the "POS" title — so
            Search takes the width that freed up, with Veg/Non-Veg still sat right beside
            it rather than a header's width away from the items they filter. */}
      {isDesktopWeb ? (
        <View style={styles.menuSearchRowDesktop}>
          <View
            style={[
              styles.menuSearchInputWrap,
              styles.menuSearchInputWrapDesktop,
            ]}
          >
            <Icon name="magnify" size={16} color={COLORS.muted} />
            <TextInput
              style={styles.menuSearchInput}
              placeholder="Search items…"
              placeholderTextColor={COLORS.placeholder}
              value={menuSearchQuery}
              onChangeText={setMenuSearchQuery}
              returnKeyType="search"
            />
            {!!menuSearchQuery && (
              <Tooltip label="Clear search" placement="bottom">
                <TouchableOpacity
                  onPress={() => setMenuSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="close-circle" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              </Tooltip>
            )}
          </View>
          {dietToggles}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.menuSearchScroll}
          contentContainerStyle={styles.menuSearchRow}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.menuSearchInputWrap}>
            <Icon name="magnify" size={16} color={COLORS.muted} />
            <TextInput
              style={styles.menuSearchInput}
              placeholder="Search items…"
              placeholderTextColor={COLORS.placeholder}
              value={menuSearchQuery}
              onChangeText={setMenuSearchQuery}
              returnKeyType="search"
            />
            {!!menuSearchQuery && (
              <Tooltip label="Clear search" placement="bottom">
                <TouchableOpacity
                  onPress={() => setMenuSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="close-circle" size={16} color={COLORS.muted} />
                </TouchableOpacity>
              </Tooltip>
            )}
          </View>
          <CategoryFilterTrigger
            label={`${activeCategory} · ${categoryCounts[activeCategory] ?? 0}`}
            onPress={() => setCategoryPickerVisible(true)}
            style={{
              width: 115,
              height: 32,
              marginHorizontal: 0,
              marginBottom: 0,
              paddingVertical: 0,
              maxWidth: undefined,
            }}
          />
          {dietToggles}
        </ScrollView>
      )}
      <CategoryFilterModal
        visible={categoryPickerVisible}
        onClose={() => setCategoryPickerVisible(false)}
        title="Menu Categories"
        categories={CATEGORIES}
        activeCategory={activeCategory}
        counts={categoryCounts}
        onSelect={setActiveCategory}
      />

      <View style={[styles.menuList, isDesktopWeb && styles.menuListDesktop]}>
        {menuLoading ? (
          <SkeletonList rows={6} avatarShape="square" />
        ) : filteredMenu.length === 0 ? (
          <Text style={styles.menuEmptyText}>
            {menuSearchQuery.trim()
              ? `No items match "${menuSearchQuery.trim()}".`
              : 'No items in this category.'}
          </Text>
        ) : (
          filteredMenu.map(item => (
            <MenuRow
              key={item.id}
              item={item}
              qty={menuItemQty[item.id] ?? 0}
              onPress={onMenuRowPress}
              onDecrement={onMenuRowDecrement}
              onTogglePin={onMenuRowTogglePin}
              styles={styles}
              COLORS={COLORS}
              isDesktopWeb={isDesktopWeb}
              isTablet={isTablet}
            />
          ))
        )}
      </View>
    </>
  );

  // Desktop web only — the band next to the "POS" title used to sit empty, so the
  // category filter lives there as a real tab strip instead of a dropdown trigger
  // buried in the search row: every category is one click away, and the ones that
  // don't fit are reachable by scrolling the strip sideways.
  //
  // The ◀ ▶ buttons flank the scroll area rather than floating over it, so the strip
  // ends at a deliberate edge: a menu with a dozen-plus categories used to run straight
  // into the window edge and slice the last label mid-word, which read as a rendering
  // bug rather than "there's more this way".
  const desktopCategoryTabs = (
    <View style={styles.catTabStrip}>
      <TouchableOpacity
        style={[styles.catArrow, !catCanScrollLeft && styles.catArrowDisabled]}
        onPress={() => pageCategoryStrip(-1)}
        disabled={!catCanScrollLeft}
        activeOpacity={0.7}
      >
        <Icon
          name="chevron-left"
          size={18}
          color={catCanScrollLeft ? COLORS.heading : COLORS.placeholder}
        />
      </TouchableOpacity>
      <ScrollView
        ref={catScrollRef}
        horizontal
        // Left visible, unlike the other horizontal strips on this screen — those sit
        // above a scrollable list that hints at the gesture, this one is a lone row in
        // the header where a hidden bar gave no sign the far categories exist at all.
        // Slimmed to 6px by a #pos-category-tabs rule in public/index.html.
        nativeID="pos-category-tabs"
        showsHorizontalScrollIndicator
        scrollEventThrottle={16}
        onScroll={e => {
          const x = e.nativeEvent.contentOffset.x;
          setCatScroll(s => (Math.abs(s.x - x) < 1 ? s : { ...s, x }));
        }}
        onLayout={e => {
          const viewport = e.nativeEvent.layout.width;
          setCatScroll(s => (s.viewport === viewport ? s : { ...s, viewport }));
        }}
        onContentSizeChange={contentWidth =>
          setCatScroll(s =>
            s.content === contentWidth ? s : { ...s, content: contentWidth },
          )
        }
        style={styles.catTabScroll}
        contentContainerStyle={styles.catTabRow}
        keyboardShouldPersistTaps="handled"
      >
        {CATEGORIES.map(cat => {
          const active = cat === activeCategory;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.catTab, active && styles.catTabActive]}
              onPress={() => setActiveCategory(cat)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.catTabText, active && styles.catTabTextActive]}
                numberOfLines={1}
              >
                {/* Only the active tab carries its count — showing one on every tab made the
                  strip read as a wall of numbers and pushed half the categories off-screen. */}
                {active ? `${cat} · ${categoryCounts[cat] ?? 0}` : cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity
        style={[styles.catArrow, !catCanScrollRight && styles.catArrowDisabled]}
        onPress={() => pageCategoryStrip(1)}
        disabled={!catCanScrollRight}
        activeOpacity={0.7}
      >
        <Icon
          name="chevron-right"
          size={18}
          color={catCanScrollRight ? COLORS.heading : COLORS.placeholder}
        />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <DesktopPageHeader
        icon="cash-register"
        title="POS"
        center={desktopCategoryTabs}
      />
      {/* On mobile/native this doubles as the app's brand bar; on desktop web the shell
          sidebar already shows the cafe name and its topbar owns search, so that variant
          is replaced by the shared page header above. */}
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.brandTitle} numberOfLines={1}>
            {settings?.businessName ?? 'PrabandhOS'}
          </Text>
          <GlobalSearchTrigger navigation={navigation} />
        </View>
      )}

      {activeBranchId !== null && (
        <TouchableOpacity
          style={styles.branchPill}
          onPress={() => navigation.navigate('Branches')}
          activeOpacity={0.7}
        >
          <Icon name="storefront" size={13} color={COLORS.accent} />
          <Text style={styles.branchPillText}>
            {branches.find((b: any) => b.id === activeBranchId)?.name ??
              'Branch'}
          </Text>
          <Icon name="chevron-right" size={14} color={COLORS.muted} />
        </TouchableOpacity>
      )}

      {isDesktop ? (
        // Desktop/tablet: cart is a persistent side panel, always visible —
        // no reason to hide it behind a collapsed bar + modal when there's
        // this much horizontal room.
        <ScreenContainer
          maxWidth={1400}
          style={[styles.wideBody, isDesktopWeb && styles.wideBodyDesktopWeb]}
        >
          <ScrollView
            style={styles.wideMenuPane}
            showsVerticalScrollIndicator={false}
          >
            {menuAndCategoryPicker}
          </ScrollView>
          <View
            style={[
              styles.wideCartPane,
              isDesktopWeb && styles.wideCartPaneDesktopWeb,
            ]}
          >
            {/* Pinned above the scroll area for the same reason as the summary below:
                the order's table/guest/waiter is what the cashier checks against while
                scrolling a long cart. */}
            {renderCartHeader()}
            <ScrollView
              style={styles.wideCartScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              {renderCartItems()}
            </ScrollView>
            {/* Pinned outside the scroll area so Subtotal/Total/Fire-to-Kitchen are
                always reachable without scrolling down a long cart. */}
            {renderCartSummary()}
          </View>
        </ScreenContainer>
      ) : (
        <>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {menuAndCategoryPicker}
          </ScrollView>

          {/* ---------- Collapsed cart bar — always reachable, no matter how long the menu is ---------- */}
          {cart.length > 0 && (
            <View style={styles.cartBar}>
              <TouchableOpacity
                style={styles.cartBarInfo}
                onPress={() => setCartExpanded(true)}
                activeOpacity={0.8}
              >
                <View style={styles.cartBarBadge}>
                  <Text style={styles.cartBarBadgeText}>{totalQty}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartBarLabel}>
                    {totalQty} item{totalQty !== 1 ? 's' : ''} · ₹
                    {total.toFixed(2)}
                  </Text>
                  <Text style={styles.cartBarHint}>Tap to view order</Text>
                </View>
                <Icon name="chevron-up" size={20} color={COLORS.muted} />
              </TouchableOpacity>
              {/* Fresh orders only — same reasoning as the order-header Hold button above. */}
              {!resumeMode && orderType !== 'QSR' && orderType !== 'CASH' && (
                <TouchableOpacity
                  style={[
                    styles.cartBarHoldBtn,
                    submitting && { opacity: 0.7 },
                  ]}
                  onPress={holdOrder}
                  disabled={submitting}
                >
                  <Icon name="clock-outline" size={16} color={COLORS.heading} />
                  <Text style={styles.cartBarHoldBtnText}>Hold</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.cartBarFireBtn, submitting && { opacity: 0.7 }]}
                onPress={() => fireToKitchen(true)}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name="chef-hat" size={17} color="#FFFFFF" />
                )}
                <Text style={styles.cartBarFireBtnText}>
                  {resumeMode ? 'Fire KOT' : 'Fire'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ---------- Expanded cart sheet — full order details, guest info, split/discount, Fire to Kitchen ---------- */}
          <Modal visible={cartExpanded} transparent animationType={isDesktopWeb ? 'fade' : 'slide'} onRequestClose={() => setCartExpanded(false)}>
            <View style={isDesktopWeb ? styles.optionsOverlayDesktop : styles.cartSheetOverlay}>
              {!isDesktopWeb && (
                <TouchableOpacity style={styles.cartSheetBackdrop} activeOpacity={1} onPress={() => setCartExpanded(false)} />
              )}
              {/* Header and summary sit outside the ScrollView so only the line items
                  move: on a full order the Total and the KOT buttons used to scroll off
                  the bottom of the sheet, and the cashier had to swipe past every line
                  to fire the order. */}
              <View style={isDesktopWeb ? [styles.optionsSheetDesktop, styles.payFirstSheetDesktop] : styles.cartSheet}>
                {!isDesktopWeb && <View style={styles.cartSheetHandle} />}
                {renderCartHeader()}
                <ScrollView
                  style={styles.cartSheetScroll}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {renderCartItems()}
                </ScrollView>
                {/* Bottom inset added here, not on the scroll's contentContainer — the
                    footer is now the node actually sitting against the gesture bar. */}
                <View
                  style={[
                    styles.cartSheetFooter,
                    { paddingBottom: insets.bottom },
                  ]}
                >
                  {renderCartSummary()}
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}

      {/* ---------- Rate prompt for an MRP item ---------- */}
      {/* Raised by addLineToCart instead of adding the line, since an MRP item carries no
          catalog rate to bill at. The typed rate is final — the server bills it tax-inclusive
          so the line's total lands exactly on it (see OrderItem.PriceIncludesTax). */}
      <Modal
        visible={!!rateLine}
        transparent
        animationType="fade"
        onRequestClose={() => setRateLine(null)}
      >
        {/* Laptop/wider: a centered, narrow card (it only holds one field) instead of
            the full-bleed bottom sheet. */}
        <View
          style={
            isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle
          }
        >
          <View
            style={
              isDesktopWeb
                ? [styles.optionsSheetDesktop, styles.rateSheetDesktop]
                : styles.modalSheet
            }
          >
            <View
              style={[
                styles.modalHeader,
                isDesktopWeb && styles.optionsHeaderDesktop,
              ]}
            >
              <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                <Text
                  style={[
                    styles.modalTitle,
                    modalHeadingOverride(styles.modalTitle.fontSize),
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Rate for {rateLine?.item.name}
                  {rateLine?.variantName ? ` (${rateLine.variantName})` : ''}
                </Text>
                <Text style={styles.notePromptSubtitle}>
                  Sold at MRP — enter the rate printed on the pack
                </Text>
              </View>
              <CloseButton onPress={() => setRateLine(null)} size={22} />
            </View>
            <View style={styles.noteInputWrap}>
              <TextInput
                style={[
                  styles.modifierNoteInput,
                  isDesktopWeb && styles.rateInputDesktop,
                ]}
                placeholder="0.00"
                placeholderTextColor={COLORS.placeholder}
                value={rateInput}
                onChangeText={setRateInput}
                keyboardType="decimal-pad"
                onSubmitEditing={confirmRateLine}
                autoFocus
                selectTextOnFocus
              />
            </View>
            <TouchableOpacity
              style={[
                styles.confirmSplitBtn,
                isDesktopWeb && styles.optionsAddBtnDesktop,
              ]}
              onPress={confirmRateLine}
            >
              <Icon name="check" size={18} color="#FFFFFF" />
              <Text
                style={[
                  styles.confirmSplitText,
                  isDesktopWeb && styles.optionsAddTextDesktop,
                ]}
              >
                Add to order
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------- Note editor for one existing cart line ---------- */}
      <Modal visible={!!notePromptLineId} transparent animationType="fade" onRequestClose={() => setNotePromptLineId(null)}>
        <View style={isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle}>
          <View style={isDesktopWeb ? styles.optionsSheetDesktop : styles.modalSheet}>
            <View style={[styles.modalHeader, isDesktopWeb && styles.optionsHeaderDesktop]}>
              <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                <Text
                  style={[
                    styles.modalTitle,
                    modalHeadingOverride(styles.modalTitle.fontSize),
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Note for {notePromptItemName}
                </Text>
                <Text style={styles.notePromptSubtitle}>
                  Pick from the list, or type your own
                </Text>
              </View>
              <CloseButton
                onPress={() => setNotePromptLineId(null)}
                size={22}
              />
            </View>
            <View style={styles.noteInputWrap}>
              <TextInput
                style={styles.modifierNoteInput}
                placeholder="Type to search or add a note…"
                placeholderTextColor={COLORS.placeholder}
                value={notePromptText}
                onChangeText={setNotePromptText}
                autoFocus
              />
            </View>
            <ScrollView
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={false}
            >
              <NoteSuggestionChips
                COLORS={COLORS}
                styles={styles}
                value={notePromptText}
                onChange={setNotePromptText}
              />
            </ScrollView>
            <TouchableOpacity
              style={styles.confirmSplitBtn}
              onPress={saveNotePrompt}
            >
              <Icon name="check" size={18} color="#FFFFFF" />
              <Text style={styles.confirmSplitText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------- Pay First / Settle Bill Sheet ---------- */}
      {/* Full bill (subtotal, discount, tax) + discount editing + payment method +
          settle/print, all over the LOCAL cart — the order is created, fired, and
          paid in one go when Settle is pressed (see settlePayFirst). */}
      <Modal
        visible={payFirstVisible}
        transparent
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={() => setPayFirstVisible(false)}
      >
        {/* Laptop/wider: a centered, width-capped card (a bit larger than the other POS
            modals) instead of the full-bleed bottom sheet. */}
        <View
          style={
            isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle
          }
        >
          <View
            style={
              isDesktopWeb
                ? [styles.optionsSheetDesktop, styles.payFirstSheetDesktop]
                : styles.modalSheet
            }
          >
            {!isDesktopWeb && <View style={styles.modalHandle} />}

            <View
              style={[
                styles.modalHeader,
                isDesktopWeb && styles.optionsHeaderDesktop,
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  modalHeadingOverride(styles.modalTitle.fontSize),
                ]}
              >
                Settle Bill
              </Text>
              <CloseButton
                onPress={() => setPayFirstVisible(false)}
                size={22}
              />
            </View>

            {/* Laptop/wider: grow with the viewport (leaving room for the header + settle
                footer) so a normal bill shows with no scroll; phones keep the 460px cap. */}
            <ScrollView
              style={
                isDesktopWeb
                  ? { maxHeight: Dimensions.get('window').height * 0.7 }
                  : { maxHeight: 460 }
              }
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pfBillBox}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>
                    ₹{subtotal.toFixed(2)}
                  </Text>
                </View>
                {discountAmount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text
                      style={[styles.summaryLabel, { color: COLORS.success }]}
                    >
                      Discount ({discountPct}%)
                    </Text>
                    <Text
                      style={[styles.summaryValue, { color: COLORS.success }]}
                    >
                      −₹{discountAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text
                    style={styles.summaryLabel}
                  >{`Tax (${taxRatePct}%)`}</Text>
                  <Text style={styles.summaryValue}>₹{tax.toFixed(2)}</Text>
                </View>
                {pfServiceChargeAmount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Service Charge</Text>
                    <Text style={styles.summaryValue}>
                      ₹{pfServiceChargeAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
                {pfPackingChargeAmount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Packing Charge</Text>
                    <Text style={styles.summaryValue}>
                      ₹{pfPackingChargeAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
                {pfDeliveryChargeAmount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Delivery Charge</Text>
                    <Text style={styles.summaryValue}>
                      ₹{pfDeliveryChargeAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
                {pfTipAmount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tip</Text>
                    <Text style={styles.summaryValue}>
                      ₹{pfTipAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>₹{total.toFixed(2)}</Text>
                </View>
              </View>

              {/* Same tile grid + editor OrderBillActions uses for an existing order's
                  Discount/Service/Packing/Delivery/Tip/Round Off — applied to local state
                  here instead of a live order's server mutations (see the state
                  declarations above for why Coupon/Gift Card/Loyalty aren't offered). */}
              <BillAdjustmentsPanel
                tiles={pfTiles}
                openKey={pfOpenAdjustment}
                onToggle={key =>
                  setPfOpenAdjustment(cur => (cur === key ? null : key))
                }
                onApply={pfHandleTileApply}
                onRemove={pfHandleRemoveAdjustment}
                onWarn={message =>
                  dispatch(
                    showToast({
                      message,
                      icon: 'alert-circle-outline',
                      tone: 'warning',
                    }),
                  )
                }
              />

              {/* Same picker an existing order's Settle Bill panel uses (OrderBillActions) —
                  Pay First settles a local cart instead of a server order, but the
                  payment-method UI itself is identical everywhere it appears. Keyed so
                  openPayFirst forces a clean reset on every re-open. */}
              <PaymentMethodPicker
                key={pfPickerKey}
                owed={total}
                guestName={guestDraft || guestName}
                guestPhone={guestPhoneDraft || guestPhone}
                onChange={setPfPayment}
              />

              {/* Kitchen-ticket choice, pre-set instead of costing its own button on the
                  settle row below — this is what keeps settling a single tap while still
                  covering both of the normal flow's "KOT" / "KOT & Print" paths. A Cash
                  Sale never reaches a kitchen, so it isn't offered one. */}
              {orderType !== 'CASH' && (
                <TouchableOpacity
                  style={styles.pfKotToggle}
                  onPress={() => setPfPrintKot(on => !on)}
                  activeOpacity={0.75}
                >
                  <Icon
                    name={
                      pfPrintKot ? 'checkbox-marked' : 'checkbox-blank-outline'
                    }
                    size={20}
                    color={pfPrintKot ? COLORS.accent : COLORS.muted}
                  />
                  <Text style={styles.pfKotToggleText}>
                    Print KOT when settling
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Guest Bill = the copy handed over before paying; the segmented Settle button
                = take the money, optionally printing/WhatsApping the final bill in the same
                tap. Same shape as an existing order's OrderBillActions footer. */}
            <View style={styles.pfActionsRow}>
              <TouchableOpacity
                style={[
                  styles.pfGuestBillBtn,
                  pfPrintingBill && { opacity: 0.6 },
                ]}
                onPress={printPayFirstGuestBill}
                disabled={pfPrintingBill}
                accessibilityLabel="Print guest bill before payment"
              >
                {pfPrintingBill ? (
                  <ActivityIndicator size="small" color={COLORS.heading} />
                ) : (
                  <Icon
                    name="printer-outline"
                    size={16}
                    color={COLORS.heading}
                  />
                )}
                <Text style={styles.pfGuestBillBtnText}>Print Bill</Text>
              </TouchableOpacity>

              <View style={styles.pfSettleGroup}>
                <TouchableOpacity
                  style={[
                    styles.pfSettleBtn,
                    (!!settlingMode || !pfPayment.canSettle) && {
                      opacity: 0.6,
                    },
                  ]}
                  onPress={() => settlePayFirst()}
                  disabled={!!settlingMode || !pfPayment.canSettle}
                >
                  {settlingMode === 'settle' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Icon name="cash-check" size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.pfSettleBtnText}>
                    {pfPayment.isPartial ? 'Collect Partial' : 'Settle Bill'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.pfSettleSeg,
                    (!!settlingMode || !pfPayment.canSettle) && {
                      opacity: 0.6,
                    },
                  ]}
                  onPress={() => settlePayFirst('print')}
                  disabled={!!settlingMode || !pfPayment.canSettle}
                  accessibilityLabel="Settle & Print"
                >
                  {settlingMode === 'print' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Icon name="printer-outline" size={17} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.pfSettleSeg,
                    (!!settlingMode || !pfPayment.canSettle) && {
                      opacity: 0.6,
                    },
                  ]}
                  onPress={() => settlePayFirst('whatsapp')}
                  disabled={!!settlingMode || !pfPayment.canSettle}
                  accessibilityLabel="Settle & send via WhatsApp"
                >
                  {settlingMode === 'whatsapp' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Icon name="whatsapp" size={17} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Nothing to save against yet — the order doesn't exist until Settle runs — so
                the number goes into the cart's own guestPhone and rides along on create. */}
            <GuestPhonePrompt
              visible={pfPhonePromptOpen}
              initialPhone={guestPhone}
              onCancel={() => setPfPhonePromptOpen(false)}
              onSubmit={phone => {
                setGuestPhone(phone);
                setPfPhonePromptOpen(false);
                settlePayFirst('whatsapp', phone);
              }}
              hint="No number on the order yet. Add one to settle and send the bill on WhatsApp."
            />
          </View>
        </View>
      </Modal>

      {/* ---------- Saved Drafts Modal ---------- */}
      <Modal
        visible={draftsModalVisible}
        transparent
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={() => setDraftsModalVisible(false)}
      >
        <View style={isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle}>
          <View style={isDesktopWeb ? styles.optionsSheetDesktop : styles.modalSheet}>
            {!isDesktopWeb && <View style={styles.modalHandle} />}
            <View style={[styles.modalHeader, isDesktopWeb && styles.optionsHeaderDesktop]}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Saved Drafts</Text>
              <CloseButton onPress={() => setDraftsModalVisible(false)} size={22} />
            </View>
            <Text style={styles.draftsModalHint}>
              Drafts live only on this device — no order is created and no table
              is occupied until you load one and fire it.
            </Text>
            <ScrollView
              style={{ maxHeight: 360 }}
              showsVerticalScrollIndicator={false}
            >
              {drafts.map(d => {
                const draftQty = d.cart.reduce((sum, l) => sum + l.qty, 0);
                const draftSubtotal = d.cart.reduce(
                  (sum, l) => sum + l.price * l.qty,
                  0,
                );
                const typeLabel =
                  ORDER_TYPES.find(t => t.key === d.orderType)?.label ??
                  d.orderType;
                return (
                  <View key={d.id} style={styles.draftCard}>
                    <TouchableOpacity
                      style={styles.draftCardBody}
                      onPress={() => loadDraft(d)}
                    >
                      <Text style={styles.draftCardTitle} numberOfLines={1}>
                        {d.guestName.trim() || 'Walk-in'} · {typeLabel}
                      </Text>
                      <Text style={styles.draftCardSub} numberOfLines={1}>
                        {draftQty} item{draftQty !== 1 ? 's' : ''} · ₹
                        {draftSubtotal.toFixed(2)} ·{' '}
                        {new Date(d.savedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <Text style={styles.draftCardItems} numberOfLines={1}>
                        {d.cart.map(l => `${l.qty}× ${l.name}`).join(', ')}
                      </Text>
                    </TouchableOpacity>
                    <Tooltip label="Delete draft" placement="left">
                      <TouchableOpacity
                        style={styles.draftDeleteBtn}
                        onPress={() => deleteDraft(d.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon
                          name="trash-can-outline"
                          size={18}
                          color={COLORS.dangerAccent}
                        />
                      </TouchableOpacity>
                    </Tooltip>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Waiter Picker Modal ---------- */}
      <Modal
        visible={waiterModalVisible}
        transparent
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={() => setWaiterModalVisible(false)}
      >
        <View style={isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle}>
          <View style={isDesktopWeb ? styles.optionsSheetDesktop : styles.modalSheet}>
            {!isDesktopWeb && <View style={styles.modalHandle} />}
            <View style={[styles.modalHeader, isDesktopWeb && styles.optionsHeaderDesktop]}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Who's serving this order?</Text>
              <CloseButton onPress={() => setWaiterModalVisible(false)} size={22} />
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {allStaff.map(s => {
                const active = s.id === waiterStaffId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.waiterRow, active && styles.waiterRowActive]}
                    onPress={() => {
                      setWaiterStaffId(s.id);
                      setWaiterModalVisible(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.waiterRowName}>{s.name}</Text>
                      <Text style={styles.waiterRowRole}>{s.role}</Text>
                    </View>
                    {active && (
                      <Icon
                        name="check-circle"
                        size={20}
                        color={COLORS.accent}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---------- Item Options Modal (Half/Full variant + toppings) ---------- */}
      {/* Laptop/wider: a centered, width-capped card (like the receipt modal) instead of
          the full-bleed bottom sheet phones use — the sheet spanning the whole width and
          hugging the bottom edge looked oversized on desktop. */}
      <Modal
        visible={!!optionsItem}
        transparent
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={() => {
          setOptionsItem(null);
          setOptionsNote('');
        }}
      >
        <View
          style={
            isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle
          }
        >
          <View
            style={
              isDesktopWeb ? styles.optionsSheetDesktop : styles.modalSheet
            }
          >
            {!isDesktopWeb && <View style={styles.modalHandle} />}
            <View
              style={[
                styles.modalHeader,
                isDesktopWeb && styles.optionsHeaderDesktop,
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 0,
                  marginRight: 6,
                }}
              >
                <VegNonVegBadge
                  type={optionsItem?.vegNonVegType}
                  size={13}
                  style={{ marginRight: 3 }}
                />
                <Text
                  style={[
                    styles.modalTitle,
                    modalHeadingOverride(styles.modalTitle.fontSize),
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {optionsItem?.name}
                </Text>
              </View>
              <CloseButton
                onPress={() => {
                  setOptionsItem(null);
                  setOptionsNote('');
                }}
                size={22}
              />
            </View>

            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
            >
              {optionsItem && optionsItem.variants.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.optionsGroupTitle}>Size</Text>
                  {/* On laptop/wider screens the size choices render as a 2-up card grid
                      (bigger tap targets, price aligned right); phones keep the compact
                      stacked radio rows. */}
                  <View
                    style={isDesktopWeb ? styles.optionsSizeGrid : undefined}
                  >
                    {optionsItem.variants.map(v => {
                      const active = v.id === optionsVariantId;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={
                            isDesktopWeb
                              ? [
                                  styles.optionSizeCard,
                                  active && styles.optionSizeCardActive,
                                ]
                              : styles.optionRow
                          }
                          onPress={() => setOptionsVariantId(v.id)}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.radioOuter,
                              active && styles.radioOuterActive,
                            ]}
                          >
                            {active && <View style={styles.radioInner} />}
                          </View>
                          <Text style={styles.optionRowLabel}>{v.name}</Text>
                          <Text
                            style={[
                              styles.optionRowPrice,
                              isDesktopWeb && styles.optionSizeCardPrice,
                            ]}
                          >
                            ₹{v.price.toFixed(2)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {optionsItem?.modifiers.map(m => {
                const groupMissing = missingRequiredGroups.some(
                  g => g.id === m.id,
                );
                return (
                  <View key={m.id} style={{ marginBottom: 8 }}>
                    <Text
                      style={[
                        styles.optionsGroupTitle,
                        groupMissing && styles.optionsGroupTitleMissing,
                      ]}
                    >
                      {m.name}
                      {m.isRequired ? ' (required)' : ''}
                    </Text>
                    {m.options.map(o => {
                      const qty = optionQty(o.id);
                      const active = qty > 0;
                      const isRadio = m.type === 'Radio';
                      const isQuantity = m.type === 'Quantity';
                      return (
                        <TouchableOpacity
                          key={o.id}
                          style={styles.optionRow}
                          onPress={() =>
                            toggleOptionsModifierOption(m.id, m.type, o.id)
                          }
                        >
                          {isQuantity ? (
                            <View
                              style={[
                                styles.checkboxBox,
                                active && styles.checkboxBoxActive,
                              ]}
                            >
                              {active && (
                                <Text style={styles.optionQtyBadge}>{qty}</Text>
                              )}
                            </View>
                          ) : isRadio ? (
                            <View
                              style={[
                                styles.radioOuter,
                                active && styles.radioOuterActive,
                              ]}
                            >
                              {active && <View style={styles.radioInner} />}
                            </View>
                          ) : (
                            <View
                              style={[
                                styles.checkboxBox,
                                active && styles.checkboxBoxActive,
                              ]}
                            >
                              {active && (
                                <Icon name="check" size={13} color="#FFFFFF" />
                              )}
                            </View>
                          )}
                          <Text style={styles.optionRowLabel}>{o.name}</Text>
                          {isQuantity && active && (
                            <View style={styles.optionStepper}>
                              <TouchableOpacity
                                style={styles.optionStepperBtn}
                                onPress={() => changeOptionQty(o.id, -1)}
                              >
                                <Icon
                                  name="minus"
                                  size={13}
                                  color={COLORS.heading}
                                />
                              </TouchableOpacity>
                              <Text style={styles.optionStepperQty}>{qty}</Text>
                              <TouchableOpacity
                                style={styles.optionStepperBtn}
                                onPress={() => changeOptionQty(o.id, 1)}
                              >
                                <Icon
                                  name="plus"
                                  size={13}
                                  color={COLORS.heading}
                                />
                              </TouchableOpacity>
                            </View>
                          )}
                          <Text style={styles.optionRowPrice}>
                            {o.price === 0 ? 'Free' : `+₹${o.price.toFixed(2)}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}

              <Text style={styles.optionsGroupTitle}>
                Note (optional) — pick from the list, or type your own
              </Text>
              <View style={styles.noteInputWrap}>
                <TextInput
                  style={styles.modifierNoteInput}
                  placeholder="Type to search or add a note…"
                  placeholderTextColor={COLORS.placeholder}
                  value={optionsNote}
                  onChangeText={setOptionsNote}
                />
              </View>
              <NoteSuggestionChips
                COLORS={COLORS}
                styles={styles}
                value={optionsNote}
                onChange={setOptionsNote}
              />
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.confirmSplitBtn,
                isDesktopWeb && styles.optionsAddBtnDesktop,
                missingRequiredGroups.length > 0 &&
                  styles.confirmSplitBtnDisabled,
              ]}
              onPress={confirmOptionsAdd}
              disabled={missingRequiredGroups.length > 0}
            >
              <Icon name="cart-plus" size={18} color="#FFFFFF" />
              <Text
                style={[
                  styles.confirmSplitText,
                  isDesktopWeb && styles.optionsAddTextDesktop,
                ]}
              >
                {missingRequiredGroups.length > 0
                  ? `Choose ${missingRequiredGroups
                      .map(m => m.name)
                      .join(', ')}`
                  : `Add — ₹${optionsUnitPrice.toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------- Receipt Slip Modal ---------- */}
      {/* Bill/payment is available here for every order type (not just Cash Sale) and
          any time (not gated on Served) — fire the KOT and settle the bill on one
          screen. Full page on mobile, centered card on desktop web. */}
      <Modal
        visible={receiptVisible}
        transparent={isDesktopWeb}
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={closeReceipt}
      >
        <View
          style={isDesktopWeb ? styles.receiptOverlay : styles.receiptFullPage}
        >
          <View
            style={
              isDesktopWeb
                ? styles.receiptSheet
                : [styles.receiptFullPageInner, { paddingTop: insets.top + 12 }]
            }
          >
            <View style={styles.receiptHeaderRow}>
              <View style={styles.sentBadge}>
                <Icon name="check-circle" size={16} color={COLORS.success} />
                <Text style={styles.sentBadgeText}>
                  {receipt?.isCashSale
                    ? 'Ready to Bill'
                    : 'Sent to Kitchen (KDS)'}
                </Text>
              </View>
              <CloseButton onPress={closeReceipt} size={22} />
            </View>

            {/* A fixed maxHeight (not flex:1) is what actually makes this scroll on desktop
                web — its ancestor (receiptSheet) is only height-capped via `maxHeight`
                (not `height`), so flex:1 doesn't get a determinate size to shrink into.
                Mobile's receiptFullPageInner is a true flex-stretched full screen, so the
                ScrollView just fills it there, same as before. */}
            {receipt && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={[
                  styles.receiptScroll,
                  // Grow with the viewport instead of a fixed 560px cap, so a normal-length
                  // bill shows fully with no scroll on a laptop; only an unusually long one
                  // (many items) still scrolls, bounded by the sheet's own maxHeight.
                  isDesktopWeb && {
                    flex: undefined,
                    maxHeight: Dimensions.get('window').height * 0.82,
                  },
                ]}
              >
                <View style={styles.slip}>
                  <Text style={styles.slipBrand}>{businessName}</Text>
                  {!!businessAddress && (
                    <Text style={styles.slipAddr}>{businessAddress}</Text>
                  )}
                  <View style={styles.slipDash} />

                  <View style={styles.slipMetaRow}>
                    <Text style={styles.slipMeta}>Order {receipt.id}</Text>
                    <Text style={styles.slipMeta}>{receipt.time}</Text>
                  </View>
                  <View style={styles.slipMetaRow}>
                    <Text style={styles.slipMeta}>{receipt.title}</Text>
                    <Text style={styles.slipMeta}>
                      {receipt.orderTypeLabel}
                    </Text>
                  </View>
                  {!!receipt.guestPhone && (
                    <View style={styles.slipMetaRow}>
                      <Text style={styles.slipMeta}>Mobile</Text>
                      <Text style={styles.slipMeta}>{receipt.guestPhone}</Text>
                    </View>
                  )}
                  <View style={styles.slipDash} />

                  {/* Cancelled lines are off the bill — see the same filter on BillingScreen's
                      slip and PrintableReceiptItem.voided. This preview is meant to match the
                      slip that prints, so it has to drop them too. */}
                  {receipt.items.filter((i) => !i.voided).map((item, idx) => (
                    <View key={idx} style={styles.slipItemBlock}>
                      <View style={styles.slipItemRow}>
                        <View
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          {/* Not nested inside the Text below — RN can't render a View
                              (what VegNonVegBadge is) as inline text content. */}
                          {!!item.vegNonVegType && (
                            <VegNonVegBadge
                              type={item.vegNonVegType}
                              size={11}
                              style={{ marginRight: 4 }}
                            />
                          )}
                          <Text style={styles.slipItemName}>
                            {item.qty}× {item.name}
                            {item.variantName ? ` (${item.variantName})` : ''}
                          </Text>
                        </View>
                        <Text style={styles.slipItemPrice}>
                          ₹{(item.price * item.qty).toFixed(2)}
                        </Text>
                      </View>
                      {/* Same order as the printed bill (buildReceiptLines): add-ons first,
                          then the free-text note — no amount beside them, since the line
                          price above already includes every selected option. */}
                      {item.selectedModifiers?.map(m => (
                        <Text
                          key={m.modifierOptionId}
                          style={styles.slipItemMod}
                        >
                          + {m.qty > 1 ? `${m.qty}x ` : ''}
                          {m.name}
                        </Text>
                      ))}
                      {!!item.modifier && (
                        <Text style={styles.slipItemMod}>{item.modifier}</Text>
                      )}
                    </View>
                  ))}

                  <View style={styles.slipDash} />
                  <View style={styles.slipTotalRow}>
                    <Text style={styles.slipTotalLabel}>Subtotal</Text>
                    <Text style={styles.slipTotalVal}>
                      ₹{receipt.subtotal.toFixed(2)}
                    </Text>
                  </View>
                  {receipt.discountAmount > 0 && (
                    <View style={styles.slipTotalRow}>
                      <Text style={styles.slipTotalLabel}>
                        Discount
                        {receipt.discountPct > 0
                          ? ` (${receipt.discountPct}%)`
                          : ''}
                      </Text>
                      <Text style={styles.slipTotalVal}>
                        −₹{receipt.discountAmount.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  {/* One row per slab when the bill mixes rates, matching the printed
                      bill (buildReceiptLines); a single-rate order keeps one Tax row. */}
                  {(() => {
                    const slabs = buildTaxBreakdown(receipt.items, taxRatePct);
                    if (slabs.length > 1) {
                      return slabs.map(slab => (
                        <View key={slab.ratePct} style={styles.slipTotalRow}>
                          <Text style={styles.slipTotalLabel}>{`Tax ${
                            slab.ratePct
                          }% on ₹${slab.taxableAmount.toFixed(2)}`}</Text>
                          <Text style={styles.slipTotalVal}>
                            ₹{slab.taxAmount.toFixed(2)}
                          </Text>
                        </View>
                      ));
                    }
                    return (
                      <View style={styles.slipTotalRow}>
                        <Text style={styles.slipTotalLabel}>{`Tax (${
                          slabs[0]?.ratePct ?? taxRatePct
                        }%)`}</Text>
                        <Text style={styles.slipTotalVal}>
                          ₹{receipt.tax.toFixed(2)}
                        </Text>
                      </View>
                    );
                  })()}
                  <View style={styles.slipTotalRow}>
                    <Text style={styles.slipGrandLabel}>TOTAL</Text>
                    <Text style={styles.slipGrandVal}>
                      ₹{receipt.total.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.slipDash} />
                  <Text style={styles.slipThanks}>{receiptFooter}</Text>
                </View>

                {/* Payment now scrolls with the slip above rather than staying pinned below
                    it — with discount/charges/loyalty adjustments added, this panel can grow
                    taller than the screen, and a fixed pin made the Settle button
                    unreachable. */}
                {receiptOrder ? (
                  <View style={{ marginTop: 8 }}>
                    {!receipt.isCashSale && (
                      <TouchableOpacity
                        style={styles.printKotBtn}
                        onPress={handlePrintKotManual}
                        disabled={printingKot}
                      >
                        {printingKot ? (
                          <ActivityIndicator
                            size="small"
                            color={COLORS.heading}
                          />
                        ) : (
                          <Icon
                            name="receipt"
                            size={16}
                            color={COLORS.heading}
                          />
                        )}
                        <Text style={styles.printKotBtnText}>Print KOT</Text>
                      </TouchableOpacity>
                    )}
                    <OrderBillActions
                      key={receiptOrder.id}
                      order={receiptOrder}
                      taxLabel={`Tax (${taxRatePct}%)`}
                      payingPending={payOrderMutation.isPending}
                      printingPending={printing}
                      hideBreakdown
                      onMarkPaid={handleReceiptMarkPaid}
                      onPrintBill={printCurrentReceipt}
                      onSendWhatsApp={sendReceiptViaWhatsApp}
                    />
                  </View>
                ) : (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.accent}
                    style={{ marginVertical: 16 }}
                  />
                )}
              </ScrollView>
            )}

            <View style={styles.receiptActions}>
              <TouchableOpacity
                style={styles.receiptPrimary}
                onPress={closeReceipt}
              >
                <Icon name="plus" size={18} color="#FFFFFF" />
                <Text style={styles.receiptPrimaryText}>New Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Table Picker (required before Dine In ordering) ---------- */}
      <Modal
        visible={tablePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={closeTablePicker}
      >
        <View
          style={
            isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle
          }
        >
          <View
            style={
              isDesktopWeb ? styles.optionsSheetDesktop : styles.modalSheet
            }
          >
            <View style={styles.modalHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  modalHeadingOverride(styles.modalTitle.fontSize),
                ]}
              >
                Select a Table
              </Text>
              <CloseButton onPress={closeTablePicker} size={22} />
            </View>
            <Text style={styles.tablePickerSubtitle}>
              Choose which table this order is for.
            </Text>

            {allTables.length === 0 ? (
              <View style={styles.noTablesBox}>
                <Icon name="table-furniture" size={26} color={COLORS.muted} />
                <Text style={styles.noTablesText}>No tables set up yet.</Text>
                {canManageTables(role) ? (
                  <>
                    <Text style={styles.noTablesHint}>
                      Add your cafe's tables before taking Dine In orders.
                    </Text>
                    <TouchableOpacity
                      style={styles.noTablesBtn}
                      onPress={() => {
                        closeTablePicker();
                        navigation.navigate('Tables');
                      }}
                    >
                      <Icon name="plus" size={15} color="#FFFFFF" />
                      <Text style={styles.noTablesBtnText}>Add a Table</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.noTablesHint}>
                    Ask an Owner or Manager to add tables first.
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.tablePickerGrid}>
                {allTables.map(t => {
                  // Occupancy is computed live by the backend from unpaid
                  // orders — no client-side derivation needed.
                  const effectivelyOccupied = t.status !== 'empty';
                  const disabled =
                    effectivelyOccupied && t.code !== selectedTable;
                  const active = t.code === selectedTable;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      disabled={disabled}
                      style={[
                        styles.tablePickerChip,
                        active && styles.tablePickerChipActive,
                        disabled && styles.tablePickerChipDisabled,
                      ]}
                      onPress={() => {
                        dispatch(selectTableForOrder(t.code));
                        setTablePickerVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.tablePickerChipText,
                          active && styles.tablePickerChipTextActive,
                        ]}
                      >
                        {t.code}
                      </Text>
                      <Text
                        style={[
                          styles.tablePickerChipSub,
                          active && styles.tablePickerChipTextActive,
                        ]}
                      >
                        {effectivelyOccupied ? 'occupied' : `${t.seats} seats`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={closeTablePicker}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ---------- Guest name (chip edit — no table, no auto-fire) ---------- */}
      <Modal
        visible={guestModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGuestModalVisible(false)}
      >
        <View
          style={
            isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle
          }
        >
          <View
            style={
              isDesktopWeb ? styles.optionsSheetDesktop : styles.modalSheet
            }
          >
            <View style={styles.modalHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  modalHeadingOverride(styles.modalTitle.fontSize),
                ]}
              >
                Guest Details
              </Text>
              <CloseButton
                onPress={() => setGuestModalVisible(false)}
                size={22}
              />
            </View>

            <Text style={styles.guestFieldLabel}>Name</Text>
            <View style={styles.guestInputWrap}>
              <TextInput
                style={styles.guestInput}
                placeholder="e.g. Sarah"
                placeholderTextColor={COLORS.placeholder}
                value={guestDraft}
                onChangeText={setGuestDraft}
                autoFocus
              />
            </View>
            <Text style={styles.guestFieldLabel}>Mobile number</Text>
            <View style={styles.guestInputWrap}>
              <TextInput
                style={styles.guestInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.placeholder}
                value={guestPhoneDraft}
                onChangeText={text =>
                  setGuestPhoneDraft(text.replace(/[^0-9]/g, '').slice(0, 10))
                }
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
            <CustomerLookupBadge phone={guestPhoneDraft} />
            <Text style={styles.guestFieldLabel}>Address</Text>
            <View style={styles.guestInputWrap}>
              <TextInput
                style={styles.guestInput}
                placeholder="e.g. 12 MG Road, Indiranagar"
                placeholderTextColor={COLORS.placeholder}
                value={guestAddressDraft}
                onChangeText={setGuestAddressDraft}
              />
            </View>
            <View style={styles.guestModalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { flex: 1 }]}
                onPress={() => setGuestModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.guestSaveBtn}
                onPress={() => {
                  setGuestName(guestDraft.trim());
                  setGuestPhone(guestPhoneDraft.trim());
                  setGuestAddress(guestAddressDraft.trim());
                  setGuestModalVisible(false);
                }}
              >
                <Text style={styles.guestSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Quick Fire popup: name + mobile + table, one screen, auto-fires ---------- */}
      <Modal
        visible={quickFireModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeQuickFireModal}
      >
        {/* Laptop/wider: centered, width-capped card like the other POS modals, instead of
            the full-bleed bottom sheet. */}
        <View
          style={
            isDesktopWeb ? styles.optionsOverlayDesktop : modalOverlayStyle
          }
        >
          <View
            style={
              isDesktopWeb
                ? [styles.optionsSheetDesktop, styles.quickFireSheetDesktop]
                : styles.modalSheet
            }
          >
            <View
              style={[
                styles.modalHeader,
                isDesktopWeb && styles.optionsHeaderDesktop,
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  modalHeadingOverride(styles.modalTitle.fontSize),
                ]}
              >
                Fire to Kitchen
              </Text>
              <CloseButton onPress={closeQuickFireModal} size={22} />
            </View>

            <View style={styles.quickFireFieldsRow}>
              <View style={styles.quickFireField}>
                <Text style={styles.guestFieldLabel}>Name</Text>
                <View style={styles.guestInputWrap}>
                  <TextInput
                    style={styles.guestInput}
                    placeholder="e.g. Sarah"
                    placeholderTextColor={COLORS.placeholder}
                    value={guestDraft}
                    onChangeText={setGuestDraft}
                    autoFocus
                  />
                </View>
              </View>
              <View style={styles.quickFireField}>
                <Text style={styles.guestFieldLabel}>Mobile number</Text>
                <View style={styles.guestInputWrap}>
                  <TextInput
                    style={styles.guestInput}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={COLORS.placeholder}
                    value={guestPhoneDraft}
                    onChangeText={text =>
                      setGuestPhoneDraft(
                        text.replace(/[^0-9]/g, '').slice(0, 10),
                      )
                    }
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
                <CustomerLookupBadge phone={guestPhoneDraft} />
              </View>
            </View>

            {orderType === 'DINE_IN' ? (
              <>
                <Text style={styles.tablePickerSubtitle}>
                  Select a table to fire the order.
                </Text>

                <ScrollView
                  style={{ maxHeight: 280 }}
                  showsVerticalScrollIndicator={false}
                >
                  {allTables.length === 0 ? (
                    <View style={styles.noTablesBox}>
                      <Icon
                        name="table-furniture"
                        size={26}
                        color={COLORS.muted}
                      />
                      <Text style={styles.noTablesText}>
                        No tables set up yet.
                      </Text>
                      {canManageTables(role) ? (
                        <>
                          <Text style={styles.noTablesHint}>
                            Add your cafe's tables before taking Dine In orders.
                          </Text>
                          <TouchableOpacity
                            style={styles.noTablesBtn}
                            onPress={() => {
                              closeQuickFireModal();
                              navigation.navigate('Tables');
                            }}
                          >
                            <Icon name="plus" size={15} color="#FFFFFF" />
                            <Text style={styles.noTablesBtnText}>
                              Add a Table
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={styles.noTablesHint}>
                          Ask an Owner or Manager to add tables first.
                        </Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.tablePickerGrid}>
                      {allTables.map(t => {
                        const effectivelyOccupied = t.status !== 'empty';
                        const disabled =
                          effectivelyOccupied && t.code !== selectedTable;
                        const active = t.code === selectedTable;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            disabled={disabled}
                            style={[
                              styles.tablePickerChip,
                              active && styles.tablePickerChipActive,
                              disabled && styles.tablePickerChipDisabled,
                            ]}
                            onPress={() => handleQuickFireTablePick(t.code)}
                          >
                            <Text
                              style={[
                                styles.tablePickerChipText,
                                active && styles.tablePickerChipTextActive,
                              ]}
                            >
                              {t.code}
                            </Text>
                            <Text
                              style={[
                                styles.tablePickerChipSub,
                                active && styles.tablePickerChipTextActive,
                              ]}
                            >
                              {effectivelyOccupied
                                ? 'occupied'
                                : `${t.seats} seats`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
                {/* No Cancel button — the header X already dismisses this modal, so a
                    separate Cancel would just be a redundant second way to do the same thing. */}
              </>
            ) : (
              <View style={styles.guestModalActions}>
                {/* No Cancel here either (header X dismisses); the primary action takes the row. */}
                <TouchableOpacity
                  style={styles.guestSaveBtn}
                  onPress={handleQuickFireSubmit}
                >
                  <Text style={styles.guestSaveText}>
                    {pendingPayFirst
                      ? 'Continue to Payment'
                      : pendingHoldOnly
                      ? 'Hold Order'
                      : 'Fire to Kitchen'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 9,
    },
    branchPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2.5,
      alignSelf: 'flex-start',
      marginLeft: 10,
      marginBottom: 6,
      backgroundColor: COLORS.aiCardBg,
      borderRadius: 12,
      paddingHorizontal: 5,
      paddingVertical: 2.5,
    },
    branchPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.accent,
    },
    // Desktop/tablet two-pane layout: scrollable menu on the left, cart
    // permanently visible on the right instead of hidden behind a modal.
    wideBody: {
      flex: 1,
      flexDirection: 'row',
    },
    // The desktop-web shell (withDesktopShell) hides this screen's own mobile
    // header (see the !isDesktopWeb check above) since its sidebar/topbar already
    // cover that — but that left nothing giving the order-type pills and "Current
    // Order" any breathing room below the shell's topbar. This puts it back.
    wideBodyDesktopWeb: {
      paddingTop: 16,
    },
    wideMenuPane: {
      flex: 1,
    },
    wideCartPane: {
      // 25% narrower than the original 380px cart pane (per design request).
      width: 285,
      flexDirection: 'column',
      borderLeftWidth: 1,
      borderLeftColor: COLORS.divider,
      backgroundColor: COLORS.background,
    },
    // Desktop web only — a laptop/PC browser has width to spare that a tablet doesn't,
    // and 285 was tight enough there that item names wrapped against their qty/price.
    // Tablets keep the narrower pane: the menu grid beside it needs the room more.
    wideCartPaneDesktopWeb: {
      width: 315,
    },
    wideCartScroll: {
      flex: 1,
    },
    brandTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: COLORS.heading,
    },
    orderTypeRow: {
      flexDirection: 'row',
      paddingHorizontal: 10,
      gap: 4,
      marginBottom: 7,
    },
    orderTypePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: COLORS.cardAlt,
    },
    orderTypePillActive: {
      backgroundColor: COLORS.button,
    },
    orderTypeText: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.muted,
    },
    orderTypeTextActive: {
      color: '#FFFFFF',
    },
    // A horizontal ScrollView's own outer box clips its cross-axis (vertical) overflow
    // on web — without an explicit height a hair taller than the 32px+border content,
    // that clipping shaves a pixel or two off the search box's top border.
    menuSearchScroll: {
      height: 40,
      marginBottom: 4,
    },
    menuSearchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    menuSearchInputWrap: {
      // Narrow enough that Veg/Non-Veg land inside (or just at the edge of) a phone's
      // first screenful of this scrollable row — was 190, which pushed both chips
      // fully off-screen and needed a real scroll just to reach Veg.
      width: 140,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: COLORS.cardAlt,
      borderWidth: INPUT_BORDER_WIDTH,
      borderColor: COLORS.inputBorder,
      borderRadius: 8,
      paddingHorizontal: 8,
      height: 32,
    },
    // Desktop web row isn't a horizontal scroller (see menuSearchRowDesktop below),
    // so search flex-grows to fill the spare width instead of a fixed guess.
    menuSearchRowDesktop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 6,
      paddingVertical: 4,
      marginBottom: 4,
    },
    menuSearchInputWrapDesktop: {
      width: undefined,
      flexGrow: 2,
      flexBasis: 0,
      minWidth: 220,
    },
    // Desktop-web category tab strip, rendered into DesktopPageHeader's center slot:
    // [◀][ scrollable pills ][▶].
    // flex-start, not center: the scroll area below is taller than the arrows because it
    // reserves a strip for its scrollbar, and centering against that total made the
    // arrows sit lower than the pills they scroll.
    catTabStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 2,
    },
    // A horizontal ScrollView on web draws its scrollbar INSIDE its own box, eating that
    // much off the bottom of the content area. So the height is the 30px pill + the 6px
    // bar + 10px of slack: at a snugger 38 the bar was clipping the pills' top and bottom
    // borders, which read as the tabs being sliced rather than as breathing room.
    // minWidth:0 lets it shrink past its content so the ▶ button stays on screen.
    catTabScroll: {
      height: 46,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    // Height matches the scroll area MINUS its scrollbar strip, so the chevrons line up
    // with the pills rather than with the bar underneath them.
    catArrow: {
      width: 22,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      flexShrink: 0,
    },
    catArrowDisabled: {
      opacity: 0.35,
    },
    catTabRow: {
      flexDirection: 'row',
      alignItems: 'center',
      // Roomier than the 4px the other pill rows use — this strip carries a dozen-plus
      // similar-looking labels in one line, and at a tighter gap they read as one
      // continuous band of text rather than separate, tappable categories.
      gap: 8,
      paddingRight: 4,
    },
    catTab: {
      height: 30,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: INPUT_BORDER_WIDTH,
      borderColor: COLORS.inputBorder,
      backgroundColor: COLORS.cardAlt,
    },
    catTabActive: {
      backgroundColor: COLORS.button,
      borderColor: COLORS.button,
    },
    // Not COLORS.muted like the other pill rows — a dozen low-contrast labels in a row
    // was the bulk of why the strip read as an unscannable blur.
    catTabText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: COLORS.heading,
    },
    catTabTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    menuSearchInput: {
      flex: 1,
      minWidth: 0,
      fontSize: 16,
      color: COLORS.heading,
      padding: 0,
    },
    // Veg/Non-Veg chips — mutually exclusive (see dietFilter), each using the same
    // VegNonVegBadge mark as the per-item badges below, so it reads as the same visual
    // language rather than a separate control. Fixed width (not flex) since Search +
    // Category already share the row and these only need to fit their own short label.
    dietToggleGroup: { flexDirection: 'row', gap: 4 },
    vegOnlyToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 32,
      paddingHorizontal: 7,
      borderRadius: 8,
      borderWidth: INPUT_BORDER_WIDTH,
      borderColor: COLORS.inputBorder,
      backgroundColor: COLORS.cardAlt,
    },
    vegOnlyToggleActive: {
      borderColor: '#0B8043',
      backgroundColor: '#0B804318',
    },
    nonVegToggleActive: {
      borderColor: '#B71C1C',
      backgroundColor: '#B71C1C18',
    },
    vegOnlyText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
    vegOnlyTextActive: { color: '#0B8043' },
    nonVegTextActive: { color: '#B71C1C' },
    menuList: {
      paddingHorizontal: 10,
      marginBottom: 12,
    },
    // Desktop web only — two items per row instead of one full-width row, so the
    // spare horizontal space on a laptop/PC screen doesn't sit empty.
    menuListDesktop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    menuEmptyText: {
      fontSize: 13,
      color: COLORS.muted,
      textAlign: 'center',
      paddingVertical: 15,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
      gap: 10,
    },
    // Desktop web only — the plain bottom-border divider only reads correctly in a
    // single full-width column, so a 2-up grid cell gets an all-round border/card
    // look instead (same treatment KDSScreen uses for its desktop grid cards).
    menuRowDesktop: {
      width: '48%',
      minHeight: 40,
      paddingVertical: 6,
      borderBottomWidth: 0,
      borderWidth: INPUT_BORDER_WIDTH,
      borderColor: COLORS.divider,
      borderRadius: 8,
      paddingHorizontal: 8,
      backgroundColor: COLORS.cardAlt,
    },
    menuCardDisabled: {
      opacity: 0.5,
    },
    menuImage: {
      width: 56,
      height: 56,
      borderRadius: 10,
    },
    menuImageDesktop: {
      width: 30,
      height: 30,
      borderRadius: 7,
    },
    menuImagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.background,
    },
    menuBadgeOverlay: {
      position: 'absolute',
      top: 4,
      left: 4,
      marginBottom: 0,
      zIndex: 1,
    },
    // Inline variant used on tablet-and-wider, where there's no image to overlay: the chip
    // sits in the row flow, vertically centered, overriding the badge's stacked-layout
    // alignSelf/marginBottom.
    menuBadgeInline: {
      alignSelf: 'center',
      marginBottom: 0,
    },
    unavailableBadge: {
      alignSelf: 'flex-start',
      backgroundColor: COLORS.dangerBg,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 6,
      marginBottom: 2.5,
    },
    unavailableBadgeText: {
      fontSize: 8,
      fontWeight: '700',
      color: COLORS.dangerAccent,
    },
    aiSuggestBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 1.5,
      backgroundColor: COLORS.aiCardBg,
      alignSelf: 'flex-start',
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 6,
      marginBottom: 2.5,
    },
    aiSuggestText: {
      fontSize: 8,
      fontWeight: '700',
      color: COLORS.accent,
    },
    menuRowInfo: {
      flex: 1,
    },
    menuNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    menuPrice: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
      marginTop: 0.5,
    },
    menuName: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.heading,
      flexShrink: 1,
    },
    menuSubtitle: {
      fontSize: 11,
      color: COLORS.muted,
      marginTop: 1,
    },
    // Desktop-web-only single-row variant of the three styles above (see isDesktopWeb branch).
    menuRowInfoDesktop: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    menuNameDesktop: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.heading,
      flexShrink: 0,
      maxWidth: '55%',
    },
    menuSubtitleFillDesktop: {
      flex: 1,
      minWidth: 0,
    },
    menuSubtitleDesktop: {
      fontSize: 11,
      color: COLORS.muted,
    },
    menuPriceDesktop: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
      marginLeft: 10,
      flexShrink: 0,
    },
    // Row rather than a stack, so the pin sits BESIDE the ADD button instead of adding a second
    // line of height to every row in the grid. Widened just enough to take the pin.
    menuRowAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      width: 88,
    },
    pinBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 18,
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0.5,
      borderWidth: 1.5,
      borderColor: COLORS.accent,
      borderRadius: 6,
      paddingVertical: 2.5,
      paddingHorizontal: 3,
      backgroundColor: COLORS.cardAlt,
      // flex, not width:'100%' — it now shares the row above with the pin button.
      flex: 1,
    },
    addBtnDisabled: {
      borderColor: COLORS.inputBorder,
    },
    addBtnText: {
      fontSize: 11,
      fontWeight: '800',
      color: COLORS.accent,
      letterSpacing: 0.2,
    },
    // Replaces the ADD button in-place once the item is in the cart — same footprint (flex:1,
    // shares the action row with the pin), filled accent so an "in the order" item reads at a
    // glance against the outlined ADD buttons around it.
    menuQtyStepper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 6,
      backgroundColor: COLORS.accent,
      paddingVertical: 1,
      paddingHorizontal: 2,
    },
    menuQtyBtn: {
      width: 22,
      paddingVertical: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuQtyValue: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.cardAlt,
      minWidth: 16,
      textAlign: 'center',
    },
    resumeBanner: {
      marginHorizontal: 10,
      marginBottom: 6,
      backgroundColor: COLORS.cardAlt,
      borderRadius: 8,
      padding: 6,
      borderLeftWidth: 3,
      borderLeftColor: COLORS.accent,
    },
    resumeBannerHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    resumeBannerTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: COLORS.heading,
      flexShrink: 1,
    },
    resumeBannerSub: {
      fontSize: 11,
      color: COLORS.muted,
      marginTop: 1,
      marginBottom: 4,
    },
    resumeKot: { marginTop: 3 },
    resumeKotLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: COLORS.accent,
      letterSpacing: 0.2,
    },
    resumeKotItem: {
      fontSize: 12,
      color: COLORS.muted,
      marginLeft: 4,
      marginTop: 0.5,
    },
    orderHeaderCol: {
      paddingHorizontal: 10,
      marginBottom: 6,
    },
    orderHeaderTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    orderHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    orderTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: COLORS.heading,
    },
    orderSubtitle: {
      fontSize: 12,
      color: COLORS.muted,
      marginTop: 1,
      flexShrink: 1,
    },
    orderSubtitleStatic: {
      fontSize: 12,
      color: COLORS.muted,
      marginTop: 1,
      flexShrink: 0,
    },
    orderSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    changeTableText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.accent,
      marginTop: 1,
      flexShrink: 0,
    },
    guestChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      flexShrink: 1,
      minWidth: 0,
    },
    emptyCartBox: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: COLORS.cardAlt,
      borderRadius: 8,
      marginHorizontal: 8,
      paddingVertical: 14,
      paddingHorizontal: 10,
      marginBottom: 7,
    },
    emptyCartText: {
      fontSize: 13,
      color: COLORS.muted,
      textAlign: 'center',
    },
    // Live offer banner — sits between the cart header and the lines, tinted so it reads as
    // money saved rather than another cart row. Same horizontal inset as emptyCartBox above.
    offerBanner: {
      gap: 5,
      backgroundColor: COLORS.successBg,
      borderRadius: 8,
      marginHorizontal: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 7,
    },
    offerBannerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    offerBannerText: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: COLORS.heading,
    },
    offerBannerTitle: {
      fontWeight: '700',
    },
    offerBannerSave: {
      fontSize: 12.5,
      fontWeight: '800',
      color: COLORS.success,
    },
    offerBannerNudge: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: COLORS.muted,
    },
    clearBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.dangerBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    holdHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: COLORS.background,
      borderRadius: 14,
      paddingHorizontal: 9,
      paddingVertical: 5,
      marginRight: 5,
    },
    holdHeaderBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
    },
    draftsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: COLORS.aiCardBg,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 5,
      marginBottom: 5,
    },
    draftsRowText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.accent,
    },
    draftsModalHint: {
      fontSize: 12,
      color: COLORS.muted,
      marginBottom: 6,
    },
    draftCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.cardAlt,
      borderRadius: 8,
      padding: 7,
      marginBottom: 5,
      gap: 5,
    },
    draftCardBody: {
      flex: 1,
      minWidth: 0,
    },
    draftCardTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
    },
    draftCardSub: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.muted,
      marginTop: 1,
    },
    draftCardItems: {
      fontSize: 12,
      color: COLORS.muted,
      marginTop: 2,
    },
    draftDeleteBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: COLORS.dangerBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    payFirstBtn: {
      backgroundColor: COLORS.button,
    },
    payFirstBtnText: {
      color: '#FFFFFF',
    },
    pfBillBox: {
      backgroundColor: COLORS.cardAlt,
      borderRadius: 8,
      padding: 10,
      gap: 5,
      marginBottom: 8,
    },
    pfActionsRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
    },
    // Pre-payment courtesy copy — light/bordered so it reads as the secondary action next
    // to the settle cluster, same split OrderBillActions uses for its own Guest Bill button.
    pfGuestBillBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 6,
      paddingVertical: 10,
      backgroundColor: COLORS.cardAlt,
      borderWidth: 1,
      borderColor: COLORS.divider,
    },
    pfGuestBillBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
    },
    // Settle Bill + its two "Settle & …" icon segments as one continuous cluster — mirrors
    // OrderBillActions' payBtnGroup so both settle UIs look and behave the same.
    pfSettleGroup: {
      flex: 1.5,
      flexDirection: 'row',
      borderRadius: 6,
      overflow: 'hidden',
    },
    pfSettleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 10,
      backgroundColor: COLORS.button,
    },
    pfSettleBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    pfSettleSeg: {
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.button,
      borderLeftWidth: 1,
      borderLeftColor: 'rgba(255,255,255,0.28)',
    },
    pfKotToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      marginTop: 2,
    },
    pfKotToggleText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: COLORS.heading,
    },
    cartRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.cardAlt,
      marginHorizontal: 8,
      borderRadius: 8,
      padding: 4.5,
      marginBottom: 3.5,
      gap: 4,
    },
    cartIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: COLORS.aiCardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cartInfo: {
      flex: 1,
      minWidth: 0,
    },
    cartName: {
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.heading,
    },
    cartModifier: {
      fontSize: 11,
      color: COLORS.muted,
      marginTop: 0.5,
    },
    cartNoteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      marginTop: 3,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: COLORS.inputBorder,
      borderRadius: 999,
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      maxWidth: '100%',
    },
    cartNoteRowActive: {
      borderStyle: 'solid',
      borderColor: COLORS.accent,
      backgroundColor: `${COLORS.accent}15`,
    },
    cartNoteText: {
      fontSize: 11,
      fontWeight: '600',
      color: COLORS.accent,
      flexShrink: 1,
    },
    cartNoteTextEmpty: {
      color: COLORS.muted,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.background,
      borderRadius: 8,
      paddingHorizontal: 2,
    },
    stepperBtn: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: COLORS.heading,
    },
    stepperValue: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.heading,
      minWidth: 18,
      textAlign: 'center',
    },
    // Overrides only what the field needs on top of stepperValue, so the typed number sits exactly
    // where the static one did. fontSize 16: anything smaller makes mobile Safari zoom the whole
    // page in the moment this takes focus.
    stepperValueInput: {
      fontSize: 16,
      minWidth: 32,
      paddingVertical: 0,
      paddingHorizontal: 2,
    },
    cartPrice: {
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.heading,
      minWidth: 50,
      textAlign: 'right',
    },
    summaryBox: {
      backgroundColor: COLORS.cardAlt,
      marginHorizontal: 8,
      marginBottom: 7,
      borderRadius: 8,
      padding: 7,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 3,
    },
    summaryLabel: {
      fontSize: 13,
      color: COLORS.muted,
    },
    summaryValue: {
      fontSize: 13,
      color: COLORS.heading,
      fontWeight: '600',
    },
    divider: {
      height: 1,
      backgroundColor: COLORS.divider,
      marginVertical: 3,
    },
    totalLabel: {
      fontSize: 18,
      fontWeight: 'bold',
      color: COLORS.heading,
    },
    totalValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: COLORS.accent,
    },
    secondaryRow: {
      flexDirection: 'row',
      gap: 4,
      marginTop: 5,
      marginBottom: 5,
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      backgroundColor: COLORS.background,
      borderRadius: 6,
      paddingVertical: 5,
    },
    secondaryBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
    },
    secondaryBtnActive: {
      backgroundColor: COLORS.button,
    },
    secondaryBtnTextActive: {
      color: '#FFFFFF',
    },
    splitSummaryBox: {
      backgroundColor: COLORS.background,
      borderRadius: 8,
      padding: 6,
      marginTop: 6,
    },
    splitSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginBottom: 4,
    },
    splitSummaryTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.accent,
    },
    splitSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 1.5,
    },
    splitSummaryPerson: {
      fontSize: 13,
      color: COLORS.muted,
    },
    splitSummaryAmount: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.heading,
    },
    // --- Split Modal ---
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(43, 24, 16, 0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: COLORS.background,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      paddingHorizontal: 8,
      paddingTop: 5,
      paddingBottom: 10,
      maxHeight: '85%',
      overflow: 'hidden',
    },
    modalHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: COLORS.divider,
      marginBottom: 5,
    },
    // Item Options modal, laptop/wider: a centered floating card rather than a bottom sheet.
    optionsOverlayDesktop: {
      flex: 1,
      backgroundColor: 'rgba(43, 24, 16, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    optionsSheetDesktop: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '90%',
      backgroundColor: COLORS.background,
      borderRadius: 16,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 16,
      overflow: 'hidden',
    },
    // Fire-to-Kitchen card is a touch wider — it holds the 3-up table grid.
    quickFireSheetDesktop: {
      maxWidth: 720,
    },
    // Settle Bill card is a bit larger — it packs the full bill + adjustments + payment.
    payFirstSheetDesktop: {
      maxWidth: 640,
    },
    // MRP rate prompt is a single field — a narrower card reads as a prompt, not a panel.
    rateSheetDesktop: {
      maxWidth: 420,
    },
    // Matched to the desktop card's taller Add button so the field doesn't look cramped.
    rateInputDesktop: {
      height: 52,
      fontSize: 16,
      paddingHorizontal: 16,
    },
    // A little more breathing room + a divider under the header on the desktop card.
    optionsHeaderDesktop: {
      paddingBottom: 12,
      marginBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    modalTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: COLORS.heading,
    },
    modalTotalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.card,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 7,
      marginBottom: 8,
    },
    modalTotalLabel: {
      fontSize: 12,
      color: COLORS.muted,
      fontWeight: '600',
    },
    modalTotalValue: {
      fontSize: 22,
      fontWeight: '800',
      color: COLORS.heading,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 5,
      marginBottom: 8,
    },
    modeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      backgroundColor: COLORS.card,
      borderRadius: 6,
      paddingVertical: 6,
    },
    modeBtnActive: {
      backgroundColor: COLORS.button,
    },
    modeText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.muted,
    },
    modeTextActive: {
      color: '#FFFFFF',
    },
    waysRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 9,
    },
    waysLabel: {
      fontSize: 12,
      color: COLORS.muted,
      fontWeight: '600',
    },
    waysStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: COLORS.card,
      borderRadius: 8,
      paddingHorizontal: 5,
      paddingVertical: 3,
    },
    waysBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: COLORS.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    waysBtnText: {
      fontSize: 20,
      fontWeight: '700',
      color: COLORS.heading,
      lineHeight: 22,
    },
    waysValue: {
      fontSize: 18,
      fontWeight: '800',
      color: COLORS.heading,
      minWidth: 20,
      textAlign: 'center',
    },
    splitList: {
      maxHeight: 300,
      marginBottom: 7,
    },
    assignHint: {
      fontSize: 12,
      color: COLORS.muted,
      fontStyle: 'italic',
      marginBottom: 5,
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 5,
    },
    personAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: COLORS.aiCardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personAvatarSm: {
      width: 30,
      height: 30,
      borderRadius: 15,
    },
    personAvatarText: {
      fontSize: 14,
      fontWeight: '800',
      color: COLORS.heading,
    },
    personName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: COLORS.heading,
    },
    personTaxNote: {
      fontSize: 11,
      fontWeight: '400',
      color: COLORS.muted,
    },
    personAmount: {
      fontSize: 16,
      fontWeight: '800',
      color: COLORS.accent,
    },
    assignRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: COLORS.card,
      borderRadius: 8,
      padding: 5,
      marginBottom: 4,
    },
    assignInfo: {
      flex: 1,
    },
    assignName: {
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.heading,
    },
    assignSub: {
      fontSize: 12,
      color: COLORS.muted,
      marginTop: 1,
    },
    assignPrice: {
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.heading,
    },
    perPersonDivider: {
      height: 1,
      backgroundColor: COLORS.divider,
      marginVertical: 6,
    },
    confirmSplitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: COLORS.button,
      borderRadius: 6,
      paddingVertical: 7.5,
    },
    confirmSplitBtnDisabled: {
      opacity: 0.5,
    },
    // Desktop card's Add button: taller, more rounded, gap above it from the note chips.
    optionsAddBtnDesktop: {
      marginTop: 16,
      borderRadius: 12,
      paddingVertical: 14,
      gap: 8,
    },
    optionsAddTextDesktop: {
      fontSize: 15,
    },
    confirmSplitText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    // --- Add-on / Topping Picker ---
    modifierGroupBlock: {
      marginBottom: 8,
    },
    modifierGroupTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.heading,
      marginBottom: 4,
    },
    modifierGroupHint: {
      fontSize: 11,
      fontWeight: '400',
      color: COLORS.muted,
    },
    modifierOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    modifierOptionLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      color: COLORS.heading,
    },
    modifierOptionPriceText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.accent,
    },
    noteInputWrap: { borderRadius: 999, marginBottom: 6 },
    modifierNoteInput: {
      backgroundColor: COLORS.card,
      borderRadius: 999,
      borderWidth: INPUT_BORDER_WIDTH,
      borderColor: COLORS.inputBorder,
      paddingHorizontal: 8,
      height: 46,
      fontSize: 12,
      color: COLORS.heading,
    },
    notePromptSubtitle: {
      fontSize: 12,
      color: COLORS.muted,
      marginTop: 1,
    },
    noteSuggestionCount: {
      fontSize: 11,
      fontWeight: '700',
      color: COLORS.muted,
      marginBottom: 4,
    },
    noteSuggestionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    noteSuggestionChip: {
      borderWidth: 1,
      borderColor: COLORS.inputBorder,
      backgroundColor: COLORS.card,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 4.5,
    },
    noteSuggestionChipActive: {
      backgroundColor: COLORS.button,
      borderColor: COLORS.button,
    },
    noteSuggestionChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
    },
    noteSuggestionChipTextActive: {
      color: '#FFFFFF',
    },
    noteSuggestionHint: {
      fontSize: 11,
      color: COLORS.muted,
      marginTop: 7,
      lineHeight: 16,
    },
    // --- Discount Modal ---
    discountHint: {
      fontSize: 13,
      color: COLORS.muted,
      marginBottom: 7,
    },
    couponRow: {
      flexDirection: 'row',
      gap: 5,
      marginBottom: 4,
    },
    couponInput: {
      flex: 1,
      backgroundColor: COLORS.card,
      borderRadius: 8,
      paddingHorizontal: 7,
      height: 46,
      fontSize: 12,
      color: COLORS.heading,
    },
    couponApplyBtn: {
      minWidth: 76,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.button,
      borderRadius: 6,
      paddingHorizontal: 8,
    },
    couponApplyText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    couponClearBtn: {
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.dangerBg,
      borderRadius: 6,
    },
    couponSuccessText: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.success,
      marginBottom: 7,
    },
    couponErrorText: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.dangerAccent,
      marginBottom: 7,
    },
    optionsGroupTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.muted,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    /** A required group with nothing picked — points at what's blocking the Add button. */
    optionsGroupTitleMissing: {
      color: COLORS.danger,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      gap: 5,
    },
    optionRowLabel: {
      flex: 1,
      fontSize: 13,
      color: COLORS.heading,
      fontWeight: '600',
    },
    optionRowPrice: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.muted,
    },
    // Laptop/wider size picker: two option cards per row (Half | Full), matching the
    // menu grid's 2-up card language instead of the compact stacked rows phones use.
    optionsSizeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 2,
    },
    optionSizeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: 140,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: COLORS.divider,
      backgroundColor: COLORS.cardAlt,
    },
    // Selected size card = soft cream fill + warm orange border (matching the reference),
    // NOT the desktop theme's solid orange pillActiveBg, which filled the whole card.
    optionSizeCardActive: {
      borderColor: '#E08A3C',
      backgroundColor: '#FCEFDF',
    },
    optionSizeCardPrice: {
      fontSize: 14,
      color: COLORS.heading,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: COLORS.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterActive: {
      borderColor: COLORS.accent,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: COLORS.accent,
    },
    checkboxBox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: COLORS.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxBoxActive: {
      backgroundColor: COLORS.accent,
      borderColor: COLORS.accent,
    },
    // Quantity-type modifier rows: the count sits inside the checkbox, with a stepper
    // alongside the label so "2x Extra Cheese" takes one tap rather than re-picking.
    optionQtyBadge: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    optionStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginRight: 8,
    },
    optionStepperBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionStepperQty: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.heading,
      minWidth: 14,
      textAlign: 'center',
    },
    discountPreview: {
      backgroundColor: COLORS.successBg,
      borderRadius: 8,
      padding: 7,
      marginBottom: 9,
    },
    discountPreviewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 1.5,
    },
    discountPreviewLabel: {
      fontSize: 14,
      color: COLORS.heading,
      fontWeight: '600',
    },
    discountPreviewSave: {
      fontSize: 15,
      fontWeight: '700',
      color: COLORS.success,
    },
    discountPreviewTotal: {
      fontSize: 18,
      fontWeight: '800',
      color: COLORS.heading,
    },
    fireRow: { flexDirection: 'row', gap: 6 },
    kotBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: COLORS.background,
      borderRadius: 6,
      paddingVertical: 6,
    },
    kotBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
    kotPrintBtn: {
      flex: 1.3,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: COLORS.button,
      borderRadius: 6,
      paddingVertical: 6,
    },
    kotPrintBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
    // --- Collapsed cart bar (fixed footer, replaces the old end-of-page cart section) ---
    cartBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: COLORS.cardAlt,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: COLORS.divider,
    },
    cartBarInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    cartBarBadge: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: COLORS.button,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cartBarBadgeText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    cartBarLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.heading,
    },
    cartBarHint: {
      fontSize: 11,
      color: COLORS.muted,
      marginTop: 0.5,
    },
    cartBarHoldBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: COLORS.cardAlt,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 5.5,
    },
    cartBarHoldBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
    },
    cartBarFireBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: COLORS.button,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 5.5,
    },
    cartBarFireBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    // --- Expanded cart bottom sheet ---
    cartSheetOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    cartSheetBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(43, 24, 16, 0.45)',
    },
    cartSheet: {
      maxHeight: '88%',
      backgroundColor: COLORS.background,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      paddingTop: 5,
    },
    cartSheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: COLORS.divider,
      marginBottom: 6,
      flexShrink: 0,
    },
    // minHeight: 0 so this actually shrinks against the pinned header/footer once the
    // sheet hits its maxHeight — without it the list keeps its full content height and
    // pushes the footer out of view again (same fix as receiptScroll).
    cartSheetScroll: { flex: 1, minHeight: 0 },
    // The pinned Total + KOT bar. Divider so it reads as a footer sitting over the
    // list rather than the last row that happened to stop scrolling.
    cartSheetFooter: {
      flexShrink: 0,
      paddingTop: 7,
      borderTopWidth: 1,
      borderTopColor: COLORS.divider,
      backgroundColor: COLORS.background,
    },
    // Pinned order header (title, Hold, clear, table/guest/waiter row).
    cartHeaderBlock: { flexShrink: 0 },
    // --- Receipt slip ---
    receiptOverlay: {
      flex: 1,
      backgroundColor: 'rgba(43, 24, 16, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
    },
    // maxHeight caps the card so receiptScroll's flex:1 below has a bounded height to
    // actually scroll within — without it, billing adjustments (discount/charges/loyalty)
    // can grow this past the viewport with no way to reach the Settle button.
    receiptSheet: {
      width: '100%',
      maxWidth: 760,
      maxHeight: '94%',
      backgroundColor: COLORS.background,
      borderRadius: 12,
      padding: 9,
    },
    // Receipt/bill modal on mobile: full page, not a centered popup.
    receiptFullPage: { flex: 1, backgroundColor: COLORS.background },
    receiptFullPageInner: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
    receiptScroll: { flex: 1, minHeight: 0 },
    receiptScrollDesktop: { flex: undefined, maxHeight: 560 },
    printKotBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center',
      paddingVertical: 10,
    },
    printKotBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
    receiptHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 7,
    },
    sentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: COLORS.successBg,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 20,
    },
    sentBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.success,
    },
    slip: {
      backgroundColor: COLORS.cardAlt,
      borderRadius: 8,
      padding: 9,
    },
    slipBrand: {
      fontSize: 20,
      fontWeight: '800',
      color: COLORS.heading,
      textAlign: 'center',
      letterSpacing: 1,
    },
    slipAddr: {
      fontSize: 11,
      color: COLORS.muted,
      textAlign: 'center',
      marginTop: 1,
    },
    slipDash: {
      borderBottomWidth: 1,
      borderStyle: 'dashed',
      borderColor: COLORS.divider,
      marginVertical: 6,
    },
    slipMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    slipMeta: {
      fontSize: 12,
      color: COLORS.muted,
      fontWeight: '600',
    },
    slipItemBlock: {
      marginBottom: 4,
    },
    slipItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    slipItemName: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.heading,
      flex: 1,
    },
    slipItemPrice: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.heading,
    },
    slipItemMod: {
      fontSize: 12,
      fontStyle: 'italic',
      color: COLORS.muted,
      marginTop: 0.5,
    },
    slipTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 1,
    },
    slipTotalLabel: {
      fontSize: 12,
      color: COLORS.muted,
    },
    slipTotalVal: {
      fontSize: 12,
      fontWeight: '600',
      color: COLORS.heading,
    },
    slipGrandLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.heading,
      marginTop: 2,
    },
    slipGrandVal: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.accent,
      marginTop: 2,
    },
    slipSplitTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.accent,
      marginBottom: 3,
    },
    slipThanks: {
      fontSize: 12,
      fontStyle: 'italic',
      color: COLORS.muted,
      textAlign: 'center',
    },
    receiptActions: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
    },
    receiptPrimary: {
      flex: 1.4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: COLORS.button,
      borderRadius: 8,
      paddingVertical: 7,
    },
    receiptPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    tablePickerSubtitle: {
      fontSize: 12,
      color: COLORS.muted,
      marginBottom: 9,
    },
    waiterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 2,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.divider,
    },
    waiterRowActive: {
      backgroundColor: COLORS.cardAlt,
      borderRadius: 8,
      paddingHorizontal: 6,
    },
    waiterRowName: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
    waiterRowRole: { fontSize: 12, color: COLORS.muted, marginTop: 1 },
    tablePickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 4,
    },
    noTablesBox: {
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 6,
      gap: 3,
      marginBottom: 4,
    },
    noTablesText: {
      fontSize: 14,
      fontWeight: '700',
      color: COLORS.heading,
      marginTop: 3,
    },
    noTablesHint: {
      fontSize: 12,
      color: COLORS.muted,
      textAlign: 'center',
      marginBottom: 4,
    },
    noTablesBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: COLORS.button,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    noTablesBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    tablePickerChip: {
      width: '30%',
      flexGrow: 1,
      alignItems: 'center',
      backgroundColor: COLORS.card,
      borderRadius: 14,
      paddingVertical: 8,
      borderWidth: 2,
      borderColor: COLORS.divider,
    },
    tablePickerChipActive: {
      backgroundColor: COLORS.button,
      borderColor: COLORS.button,
    },
    tablePickerChipDisabled: {
      backgroundColor: COLORS.cardAlt,
      borderColor: 'transparent',
      opacity: 0.65,
    },
    tablePickerChipText: {
      fontSize: 18,
      fontWeight: '800',
      color: COLORS.heading,
    },
    tablePickerChipSub: {
      fontSize: 11,
      color: COLORS.muted,
      marginTop: 1,
    },
    tablePickerChipTextActive: {
      color: '#FFFFFF',
    },
    modalCancelBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.card,
      borderRadius: 6,
      paddingVertical: 7,
      marginTop: 6,
    },
    modalCancelText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.heading,
    },
    guestFieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.muted,
      marginTop: 7,
    },
    guestInputWrap: {
      width: '100%',
      // box-shadow (the focus ring, see index.html) follows this wrapper's own
      // border-radius, not guestInput's — without matching it here the ring sits
      // square around the input's rounded corners.
      borderRadius: 8,
      // Spacing from the label above lives here, not on guestInput — this
      // wrapper sizes itself to its content, so a margin on the input inside it
      // would make the wrapper taller than the input's own border box, leaving
      // a gap between the input's top edge and the focus ring drawn on the wrapper.
      marginTop: 4,
    },
    guestInput: {
      width: '100%',
      backgroundColor: COLORS.card,
      borderWidth: INPUT_BORDER_WIDTH,
      borderColor: COLORS.inputBorder,
      borderRadius: 8,
      paddingHorizontal: 7,
      height: 34,
      fontSize: 12,
      color: COLORS.heading,
    },
    guestModalActions: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 9,
    },
    quickFireFieldsRow: {
      flexDirection: 'row',
      gap: 5,
    },
    quickFireField: {
      flex: 1,
    },
    guestSaveBtn: {
      flex: 1.3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.button,
      borderRadius: 6,
      paddingVertical: 10,
      marginTop: 6,
    },
    guestSaveText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
