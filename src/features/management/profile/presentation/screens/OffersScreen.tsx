import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Switch } from 'react-native';
import { Text, Card, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useOffers, useCreateOffer, useUpdateOffer, useDeleteOffer } from '../../../../../core/api/hooks/useOffers';
import { useCategories } from '../../../../../core/api/hooks/useCategories';
import { useMenuItems } from '../../../../../core/api/hooks/useMenu';
import { Offer, CreateOfferRequest, OfferType, OfferScope, offersApi, OfferPreviewResult } from '../../../../../core/api/offersApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { confirmAlert } from '../../../../../shared/components/ConfirmDialogHost';
import { showToast } from '../../../../../core/store/uiSlice';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { DatePickerModal } from '../../../../../shared/components/atoms/DatePickerModal';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

// A template is a starting point the owner taps, not a separate offer kind — it pre-fills type,
// scope and the sensible defaults so the common promotions are a two-field form. Everything is
// still editable underneath.
type TemplateId = 'bogo' | 'percent' | 'flat' | 'happyhour' | 'combo';

const TEMPLATES: { id: TemplateId; label: string; icon: string; blurb: string }[] = [
  { id: 'bogo', label: 'Buy X Get Y', icon: 'numeric-2-box-multiple-outline', blurb: 'Buy 2 get 1 free, Buy 1 get 1…' },
  { id: 'percent', label: '% Off', icon: 'percent-outline', blurb: '10% off the bill or a category' },
  { id: 'flat', label: '₹ Off', icon: 'cash-minus', blurb: '₹50 off above a minimum bill' },
  { id: 'happyhour', label: 'Happy Hour', icon: 'clock-outline', blurb: '% off within a time window' },
  { id: 'combo', label: 'Combo', icon: 'food-fork-drink', blurb: 'Burger + Fries + Coke for ₹199' },
];

const TYPE_BADGE: Record<OfferType, { label: string; color: string }> = {
  BuyXGetY: { label: 'BOGO', color: '#DC2626' },
  Percentage: { label: '% Off', color: '#059669' },
  Flat: { label: '₹ Off', color: '#0891B2' },
  Combo: { label: 'Combo', color: '#7C3AED' },
};

const DAYS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
];

// Typing "16:00:00" into a box is the kind of thing that gets an offer quietly saved with no
// window at all, so the usual shifts are one tap and the box is only the fallback.
const HAPPY_HOUR_PRESETS = [
  { label: '11 AM – 2 PM', start: '11:00:00', end: '14:00:00' },
  { label: '4 – 7 PM', start: '16:00:00', end: '19:00:00' },
  { label: '7 – 10 PM', start: '19:00:00', end: '22:00:00' },
];

const SCOPE_OPTIONS: { value: OfferScope; label: string; icon: string }[] = [
  { value: 'EntireBill', label: 'Whole bill', icon: 'receipt' },
  { value: 'Category', label: 'A category', icon: 'shape-outline' },
  { value: 'SpecificItems', label: 'Chosen items', icon: 'food-outline' },
];

// Blank draft; a template fills in type/scope on top of this.
const emptyDraft = (): CreateOfferRequest => ({
  title: '',
  type: 'Percentage',
  scope: 'EntireBill',
  menuItemIds: [],
  value: 10,
  maxDiscountAmount: 0,
  buyQty: 1,
  getQty: 1,
  comboPrice: 0,
  minOrderValue: 0,
  maxApplicationsPerBill: 0,
  daysOfWeek: [],
  autoApply: true,
  stackable: false,
});

/** "16:0" / "16:00" / "16:00:00" -> "16:00:00"; blank -> null (meaning all day). */
const normalizeTime = (t?: string | null): string | null => {
  if (!t || !t.trim()) return null;
  const [rawH, rawM] = t.trim().split(':');
  const h = Math.min(23, Math.max(0, parseInt(rawH, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(rawM ?? '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
};

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');

/** The name these fields would generate on their own. Must match what the templates pre-fill. */
const autoTitle = (d: CreateOfferRequest): string =>
  d.type === 'BuyXGetY'
    ? `Buy ${d.buyQty ?? 0} Get ${d.getQty ?? 0}`
    : d.type === 'Combo'
      ? 'Combo Deal'
      : d.type === 'Percentage'
        ? `${d.value ?? 0}% Off`
        : `₹${d.value ?? 0} Off`;

/**
 * Does this name read as one the fields generated, rather than something the owner wrote?
 *
 * Matched by shape and not by equality with the current values on purpose: a name left behind by
 * earlier settings ("Buy 2 Get 1" on an offer since changed to 1+1) is still ours to correct, and
 * that stale name is exactly what the customer would otherwise read on the receipt. Anything
 * outside these shapes — "Happy Hour", "Coffee Dhamaka", "Buy 2 Get 1 — Coffee" — is the owner's
 * wording and is never touched.
 */
const isAutoTitle = (t: string): boolean => {
  const s = t.trim();
  return /^Buy \d+ Get \d+$/.test(s) || /^\d+(\.\d+)?% Off$/.test(s) || /^₹\d+(\.\d+)? Off$/.test(s);
};

// A run-dates window is picked as IST calendar days but compared as UTC instants
// (OfferEngine.IsLive), so "runs until 31 Aug" has to become the last moment of 31 Aug in IST —
// storing plain midnight-UTC would switch the offer off 5.5 hours early on its final day.
const IST_OFFSET_MS = 330 * 60 * 1000;
const istDayStartUtc = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - IST_OFFSET_MS).toISOString();
const istDayEndUtc = (ymd: string) => new Date(Date.parse(`${ymd}T23:59:59Z`) - IST_OFFSET_MS).toISOString();
const utcToIstYmd = (iso?: string | null): string => {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
};
/** "2026-08-31" -> "31 Aug 2026", for a label a cashier reads rather than parses. */
const prettyDate = (ymd: string) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
};

/**
 * The offer in one plain sentence. This is the screen's main safety net: the fields alone let
 * someone save "Buy 2 Get 2" while believing they configured Buy-2-Get-1, and nothing on screen
 * would have contradicted them. Written for a reader who will not decode "getQty".
 */
const plainSummary = (d: CreateOfferRequest, chosenItemNames: string[]): string => {
  // A combo reads as a set-for-a-price, not "X off on Y", so it builds its own opening clause and
  // skips the scope phrasing below.
  const what =
    d.type === 'Combo'
      ? (chosenItemNames.length === 0
          ? `The chosen items sold together for ₹${d.comboPrice || 0}`
          : chosenItemNames.length <= 3
            ? `${chosenItemNames.join(' + ')} sold together for ₹${d.comboPrice || 0}`
            : `${chosenItemNames.length} items sold together for ₹${d.comboPrice || 0}`)
      : d.type === 'BuyXGetY'
        ? `Customer buys ${d.buyQty || 0}, gets ${d.getQty || 0} free`
        : d.type === 'Percentage'
          ? `${d.value || 0}% off`
          : `₹${d.value || 0} off`;

  const where =
    d.type === 'Combo'
      ? ''
      : d.scope === 'Category'
        ? d.categoryName
          ? `on everything in ${d.categoryName}`
          : 'on a category — pick one below'
        : d.scope === 'SpecificItems'
          ? chosenItemNames.length === 0
            ? 'on chosen items — pick some below'
            : chosenItemNames.length === 1
              ? `on ${chosenItemNames[0]}`
              : `on ${chosenItemNames.length} chosen items`
          : 'on the whole bill';

  const parts = [`${what} ${where}`.trim()];
  if ((d.minOrderValue ?? 0) > 0) parts.push(`only when the bill is above ₹${d.minOrderValue}`);
  if (d.startTime && d.endTime) parts.push(`only between ${hhmm(d.startTime)} and ${hhmm(d.endTime)}`);
  if ((d.daysOfWeek ?? []).length > 0) {
    const names = (d.daysOfWeek ?? [])
      .map((n) => DAYS.find((x) => x.n === n)?.label)
      .filter(Boolean)
      .join(', ');
    parts.push(`only on ${names}`);
  }
  if ((d.maxApplicationsPerBill ?? 0) > 0) parts.push(`at most ${d.maxApplicationsPerBill} time(s) per bill`);
  if (d.type === 'Percentage' && (d.maxDiscountAmount ?? 0) > 0) parts.push(`capped at ₹${d.maxDiscountAmount}`);
  const from = utcToIstYmd(d.startsAtUtc);
  const to = utcToIstYmd(d.endsAtUtc);
  if (from && to) parts.push(`running ${prettyDate(from)} to ${prettyDate(to)}`);
  else if (from) parts.push(`starting ${prettyDate(from)}`);
  else if (to) parts.push(`until ${prettyDate(to)}`);
  return `${parts.join(', ')}.`;
};

export const OffersScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();

  const { data: offers, isLoading, isError, refetch } = useOffers(true);
  const { data: categories } = useCategories();
  const { data: menuItems = [] } = useMenuItems();
  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const deleteOffer = useDeleteOffer();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<CreateOfferRequest>(emptyDraft());
  const [preview, setPreview] = useState<OfferPreviewResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [datePickerFor, setDatePickerFor] = useState<'start' | 'end' | null>(null);

  const set = (patch: Partial<CreateOfferRequest>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      // The name is what the customer reads — it lands on the bill and the printed receipt as
      // Order.AppliedOfferTitle. A template pre-fills it ("Buy 2 Get 1") and the quantities are
      // then edited underneath it, which is how an offer ends up named for a deal it no longer
      // gives. Keep it in step for as long as the name is still one of ours by shape; once it has
      // been personalised — or came from a template that names the occasion, like Happy Hour —
      // it is the owner's wording and must not be overwritten.
      if (patch.title === undefined && isAutoTitle(d.title)) next.title = autoTitle(next);
      return next;
    });

  const chosenItemIds = draft.menuItemIds ?? [];
  const chosenItemNames = useMemo(
    () => menuItems.filter((m) => chosenItemIds.includes(m.id)).map((m) => m.name),
    [menuItems, chosenItemIds],
  );

  const startTemplate = (id: TemplateId) => {
    const base = emptyDraft();
    if (id === 'bogo') { base.type = 'BuyXGetY'; base.title = 'Buy 2 Get 1'; base.buyQty = 2; base.getQty = 1; }
    if (id === 'percent') { base.type = 'Percentage'; base.title = '10% Off'; base.value = 10; }
    if (id === 'flat') { base.type = 'Flat'; base.title = '₹50 Off'; base.value = 50; base.minOrderValue = 300; }
    if (id === 'happyhour') { base.type = 'Percentage'; base.title = 'Happy Hour'; base.value = 20; base.startTime = '16:00:00'; base.endTime = '19:00:00'; }
    if (id === 'combo') { base.type = 'Combo'; base.scope = 'SpecificItems'; base.title = 'Combo Deal'; base.comboPrice = 199; }
    setEditingId(null);
    setDraft(base);
    setShowAdvanced(false);
    setEditorOpen(true);
  };

  const startEdit = (o: Offer) => {
    setEditingId(o.id);
    const loaded: CreateOfferRequest = {
      title: o.title, type: o.type, scope: o.scope, categoryName: o.categoryName,
      menuItemIds: o.menuItemIds ?? [], value: o.value, maxDiscountAmount: o.maxDiscountAmount,
      buyQty: o.buyQty, getQty: o.getQty, minOrderValue: o.minOrderValue,
      maxApplicationsPerBill: o.maxApplicationsPerBill, daysOfWeek: o.daysOfWeek,
      startTime: o.startTime, endTime: o.endTime, stackable: o.stackable, autoApply: o.autoApply,
      startsAtUtc: o.startsAtUtc, endsAtUtc: o.endsAtUtc,
    };
    // Correct a generated name that earlier settings left behind, so the editor opens showing
    // the deal this offer actually gives rather than the one it used to. Saving is still the
    // owner's call — nothing is written until they press Save changes.
    if (isAutoTitle(loaded.title)) loaded.title = autoTitle(loaded);
    setDraft(loaded);
    // An offer already carrying a limit or a window must not hide it behind a collapsed
    // section — that is how a setting gets silently kept when the owner meant to change it.
    setShowAdvanced(
      (o.maxApplicationsPerBill ?? 0) > 0 ||
      (o.maxDiscountAmount ?? 0) > 0 ||
      (o.minOrderValue ?? 0) > 0 ||
      !!o.startsAtUtc || !!o.endsAtUtc ||
      !!o.stackable,
    );
    setEditorOpen(true);
  };

  const closeEditor = () => { setEditorOpen(false); setPreview(null); setItemPickerOpen(false); setItemSearch(''); };

  // Live preview: price a representative sample cart against the unsaved draft so the owner
  // sees the effect while typing, instead of saving then punching a test bill. Kept off the
  // render path (its own effect) and rebuilt whenever the fields that change the math change.
  const sampleLines = useMemo(() => {
    const cat = draft.scope === 'Category' ? (draft.categoryName || 'Sample') : 'Sample';
    // A chosen-items offer only fires on those very item ids, so the sample bill has to be
    // built out of them or the preview would always read "no discount".
    const sampleItemId = draft.scope === 'SpecificItems' ? (chosenItemIds[0] ?? 0) : 1;
    if (draft.type === 'BuyXGetY') {
      const units = (draft.buyQty || 1) + (draft.getQty || 1);
      return Array.from({ length: units }).map((_, i) => ({
        lineKey: i, menuItemId: sampleItemId, categoryName: cat, name: 'Sample item', unitPrice: 120, qty: 1,
      }));
    }
    // % / flat: one representative line comfortably above any minimum.
    const base = Math.max(500, (draft.minOrderValue || 0) + 200);
    return [{ lineKey: 0, menuItemId: sampleItemId, categoryName: cat, name: 'Sample item', unitPrice: base, qty: 1 }];
  }, [draft.type, draft.buyQty, draft.getQty, draft.scope, draft.categoryName, draft.minOrderValue, chosenItemIds]);

  useEffect(() => {
    if (!editorOpen) return;
    let cancelled = false;
    offersApi
      .preview({ lines: sampleLines, draft })
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [editorOpen, draft, sampleLines]);

  const save = async () => {
    if (!draft.title.trim()) {
      dispatch(showToast({ message: 'Give this offer a name.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    // Guard the two ways an offer saves cleanly and then never fires — the exact failure the
    // owner reads as "the feature is broken" rather than "I missed a field".
    if (draft.scope === 'Category' && !draft.categoryName) {
      dispatch(showToast({ message: 'Pick which category this offer applies to.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (draft.scope === 'SpecificItems' && chosenItemIds.length === 0) {
      dispatch(showToast({ message: 'Choose at least one item for this offer.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (draft.type === 'BuyXGetY' && ((draft.buyQty ?? 0) < 1 || (draft.getQty ?? 0) < 1)) {
      dispatch(showToast({ message: 'Buy and free quantities must both be at least 1.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    // Half a window is not a window — the server rejects it, so say so here in plain words.
    const start = normalizeTime(draft.startTime);
    const end = normalizeTime(draft.endTime);
    if (!!start !== !!end) {
      dispatch(showToast({ message: 'Set both a start and an end time, or leave both blank.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }

    const payload: CreateOfferRequest = { ...draft, startTime: start, endTime: end };
    try {
      if (editingId) {
        // The editor is the one caller that submits the whole offer, so it is also the only one
        // allowed to say "this window is gone" — a bare null would just be read as "unchanged".
        await updateOffer.mutateAsync({
          id: editingId,
          req: {
            ...payload,
            clearTimeWindow: !start && !end,
            clearRunDates: !draft.startsAtUtc && !draft.endsAtUtc,
          },
        });
      } else {
        await createOffer.mutateAsync(payload);
      }
      dispatch(showToast({ message: editingId ? 'Offer updated.' : 'Offer created.', icon: 'check-circle-outline', tone: 'success' }));
      closeEditor();
    } catch (e) {
      dispatch(showToast({ message: getApiErrorMessage(e), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const toggleActive = async (o: Offer) => {
    try {
      await updateOffer.mutateAsync({ id: o.id, req: { isActive: !o.isActive } });
    } catch (e) {
      dispatch(showToast({ message: getApiErrorMessage(e), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const remove = (o: Offer) => {
    confirmAlert('Delete offer?', `"${o.title}" will stop applying to new bills.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOffer.mutateAsync(o.id);
            dispatch(showToast({ message: 'Offer deleted.', icon: 'check-circle-outline', tone: 'success' }));
          } catch (e) {
            dispatch(showToast({ message: getApiErrorMessage(e), icon: 'alert-circle-outline', tone: 'danger' }));
          }
        },
      },
    ]);
  };

  const toggleDay = (n: number) => {
    const days = draft.daysOfWeek ?? [];
    set({ daysOfWeek: days.includes(n) ? days.filter((d) => d !== n) : [...days, n] });
  };

  const toggleItem = (id: number) => {
    set({ menuItemIds: chosenItemIds.includes(id) ? chosenItemIds.filter((x) => x !== id) : [...chosenItemIds, id] });
  };

  const filteredMenu = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const list = q ? menuItems.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)) : menuItems;
    // Chosen items float to the top so a long menu doesn't hide what is already ticked.
    return [...list].sort((a, b) => {
      const aOn = chosenItemIds.includes(a.id) ? 0 : 1;
      const bOn = chosenItemIds.includes(b.id) ? 0 : 1;
      return aOn - bOn || a.name.localeCompare(b.name);
    });
  }, [menuItems, itemSearch, chosenItemIds]);

  // Bulk select operates on whatever is currently shown, so "search Beverages → Select all"
  // tags all 20 in one tap instead of twenty. With a search typed it acts on those results; with
  // the box empty it's the whole menu.
  const shownIds = useMemo(() => filteredMenu.map((m) => m.id), [filteredMenu]);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => chosenItemIds.includes(id));
  const toggleAllShown = () => {
    if (allShownSelected) set({ menuItemIds: chosenItemIds.filter((id) => !shownIds.includes(id)) });
    else set({ menuItemIds: Array.from(new Set([...chosenItemIds, ...shownIds])) });
  };

  return (
    <View style={[styles.root, { paddingTop: isDesktopWeb ? 0 : insets.top }]}>
      <DesktopPageHeader icon="tag-multiple-outline" title="Offers & Discounts" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>
          Store-wide promotions that apply to every bill automatically — BOGO, happy hours,
          category and bill discounts. Coupons for a specific customer live under CRM.
        </Text>

        <Text style={styles.sectionLabel}>Start a new offer</Text>
        <View style={styles.templateRow}>
          {TEMPLATES.map((t) => (
            <TouchableOpacity key={t.id} style={styles.templateCard} onPress={() => startTemplate(t.id)}>
              <Icon name={t.icon} size={26} color={COLORS.accent} />
              <Text style={styles.templateLabel}>{t.label}</Text>
              <Text style={styles.templateBlurb}>{t.blurb}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Your offers</Text>
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : isError ? (
          <ErrorState message="Couldn't load offers." onRetry={refetch} />
        ) : !offers || offers.length === 0 ? (
          <Text style={styles.empty}>No offers yet. Tap a template above to make your first one.</Text>
        ) : (
          offers.map((o) => {
            const badge = TYPE_BADGE[o.type];
            return (
              <Card key={o.id} style={[styles.offerCard, !o.isActive && styles.offerCardInactive]}>
                <View style={styles.offerRow}>
                  <View style={styles.offerMain}>
                    <View style={styles.offerTitleRow}>
                      <View style={[styles.badge, { backgroundColor: badge.color }]}><Text style={styles.badgeText}>{badge.label}</Text></View>
                      <Text style={styles.offerTitle} numberOfLines={1}>{o.title}</Text>
                    </View>
                    <Text style={styles.offerSub}>{describeOffer(o)}</Text>
                  </View>
                  <Switch value={o.isActive} onValueChange={() => toggleActive(o)} />
                </View>
                <View style={styles.offerActions}>
                  <Button compact onPress={() => startEdit(o)} textColor={COLORS.accent}>Edit</Button>
                  <Button compact onPress={() => remove(o)} textColor={COLORS.dangerAccent}>Delete</Button>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      <Modal visible={editorOpen} animationType="slide" transparent onRequestClose={closeEditor}>
        <View style={[styles.modalBackdrop, isDesktopWeb && styles.modalBackdropDesktop]}>
          <View style={[styles.modalCard, isDesktopWeb && styles.modalCardDesktop]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit offer' : 'New offer'}</Text>
              <TouchableOpacity onPress={closeEditor} style={styles.closeHit}><Icon name="close" size={24} color={COLORS.muted} /></TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {/* The whole offer, in one sentence, above every field it summarises. */}
              <View style={styles.summaryBox}>
                <Icon name="information-outline" size={16} color={COLORS.accent} />
                <Text style={styles.summaryText}>{plainSummary(draft, chosenItemNames)}</Text>
              </View>

              <Field label="Offer name">
                <TextInput style={styles.input} value={draft.title} onChangeText={(v) => set({ title: v })} placeholder="Buy 2 Get 1 — Coffee" placeholderTextColor={COLORS.muted} />
                <Text style={styles.hint}>This is what the customer sees on the bill and the receipt.</Text>
              </Field>

              <SectionHeading icon="tag-outline" text="What does the customer get?" />

              <View style={styles.chipRow}>
                {(['Percentage', 'Flat', 'BuyXGetY'] as OfferType[]).map((t) => (
                  <SelectChip
                    key={t}
                    label={t === 'Percentage' ? '% Off' : t === 'Flat' ? '₹ Off' : 'Buy X Get Y'}
                    selected={draft.type === t}
                    onPress={() => set({ type: t })}
                  />
                ))}
              </View>

              {draft.type === 'BuyXGetY' ? (
                <>
                  <View style={styles.rowTwo}>
                    <Field label="Customer buys" half>
                      <QtyStepper value={draft.buyQty ?? 1} onChange={(v) => set({ buyQty: v })} />
                    </Field>
                    <Field label="Gets free" half>
                      <QtyStepper value={draft.getQty ?? 1} onChange={(v) => set({ getQty: v })} />
                    </Field>
                  </View>
                  <Text style={styles.hint}>
                    Buy {draft.buyQty || 0} + {draft.getQty || 0} free means every {(draft.buyQty || 0) + (draft.getQty || 0)} items
                    on the bill make one set, and the cheapest {draft.getQty || 0} in each set is free.
                  </Text>
                </>
              ) : draft.type === 'Combo' ? (
                <>
                  <Field label="Combo price (₹)">
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={String(draft.comboPrice ?? '')} onChangeText={(v) => set({ comboPrice: parseFloat(v) || 0 })} />
                  </Field>
                  <Text style={styles.hint}>
                    Pick the items that make up the combo below. When all of them are on a bill, they're
                    priced together at ₹{draft.comboPrice || 0} instead of their à-la-carte total.
                  </Text>
                </>
              ) : (
                <Field label={draft.type === 'Percentage' ? 'Percent off (1–100)' : 'Amount off (₹)'}>
                  <TextInput style={styles.input} keyboardType="decimal-pad" value={String(draft.value ?? '')} onChangeText={(v) => set({ value: parseFloat(v) || 0 })} />
                </Field>
              )}

              {/* A combo IS its item set, so it skips the scope picker and always uses the item
                  picker below. Every other type chooses where it lands. */}
              {draft.type === 'Combo' ? (
                <SectionHeading icon="target" text="Which items are in the combo?" />
              ) : (
                <>
                  <SectionHeading icon="target" text="What does it apply to?" />
                  <View style={styles.chipRow}>
                    {SCOPE_OPTIONS.map((s) => (
                      <SelectChip key={s.value} label={s.label} icon={s.icon} selected={draft.scope === s.value} onPress={() => set({ scope: s.value })} />
                    ))}
                  </View>
                </>
              )}

              {draft.scope === 'Category' && (
                <Field label="Pick the category">
                  {(categories ?? []).length === 0 ? (
                    <Text style={styles.hint}>No categories yet — add menu items first.</Text>
                  ) : (
                    <View style={styles.chipRow}>
                      {(categories ?? []).map((c) => (
                        <SelectChip key={c.name} label={c.name} selected={draft.categoryName === c.name} onPress={() => set({ categoryName: c.name })} />
                      ))}
                    </View>
                  )}
                </Field>
              )}

              {draft.scope === 'SpecificItems' && (
                <Field label="Pick the items">
                  <TouchableOpacity style={styles.pickerBtn} onPress={() => setItemPickerOpen(true)}>
                    <Icon name="playlist-plus" size={18} color={COLORS.accent} />
                    <Text style={styles.pickerBtnText}>
                      {chosenItemIds.length === 0 ? 'Choose items' : `${chosenItemIds.length} item${chosenItemIds.length > 1 ? 's' : ''} chosen — tap to change`}
                    </Text>
                    <Icon name="chevron-right" size={20} color={COLORS.muted} />
                  </TouchableOpacity>
                  {chosenItemNames.length > 0 && (
                    <View style={styles.chosenWrap}>
                      {chosenItemNames.map((n) => (
                        <View key={n} style={styles.chosenPill}><Text style={styles.chosenPillText} numberOfLines={1}>{n}</Text></View>
                      ))}
                    </View>
                  )}
                </Field>
              )}

              <SectionHeading icon="calendar-clock" text="When does it run?" />

              <Field label="Days — leave all off for every day">
                <View style={styles.chipRow}>
                  {DAYS.map((d) => (
                    <SelectChip key={d.n} label={d.label} selected={(draft.daysOfWeek ?? []).includes(d.n)} onPress={() => toggleDay(d.n)} compact />
                  ))}
                </View>
              </Field>

              <Field label="Time window — leave blank for all day">
                <View style={styles.chipRow}>
                  {HAPPY_HOUR_PRESETS.map((p) => (
                    <SelectChip
                      key={p.label}
                      label={p.label}
                      selected={draft.startTime === p.start && draft.endTime === p.end}
                      onPress={() =>
                        draft.startTime === p.start && draft.endTime === p.end
                          ? set({ startTime: null, endTime: null })
                          : set({ startTime: p.start, endTime: p.end })
                      }
                    />
                  ))}
                  {(draft.startTime || draft.endTime) && (
                    <SelectChip label="Clear" icon="close" selected={false} onPress={() => set({ startTime: null, endTime: null })} />
                  )}
                </View>
                <View style={[styles.rowTwo, styles.timeRow]}>
                  <TextInput style={[styles.input, styles.half]} value={hhmm(draft.startTime)} onChangeText={(v) => set({ startTime: v || null })} placeholder="From  16:00" placeholderTextColor={COLORS.muted} />
                  <TextInput style={[styles.input, styles.half]} value={hhmm(draft.endTime)} onChangeText={(v) => set({ endTime: v || null })} placeholder="To  19:00" placeholderTextColor={COLORS.muted} />
                </View>
              </Field>

              <TouchableOpacity style={styles.advToggle} onPress={() => setShowAdvanced((s) => !s)}>
                <Icon name={showAdvanced ? 'chevron-down' : 'chevron-right'} size={20} color={COLORS.accent} />
                <Text style={styles.advToggleText}>Limits & conditions{showAdvanced ? '' : ' (optional)'}</Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View style={styles.advBox}>
                  <Field label="Minimum bill (₹) — 0 for none">
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={String(draft.minOrderValue ?? 0)} onChangeText={(v) => set({ minOrderValue: parseFloat(v) || 0 })} />
                  </Field>

                  {draft.type === 'Percentage' && (
                    <Field label="Most it can take off (₹) — 0 for no cap">
                      <TextInput style={styles.input} keyboardType="decimal-pad" value={String(draft.maxDiscountAmount ?? 0)} onChangeText={(v) => set({ maxDiscountAmount: parseFloat(v) || 0 })} />
                    </Field>
                  )}

                  <Field label="Times it may apply per bill — 0 for unlimited">
                    <TextInput style={styles.input} keyboardType="number-pad" value={String(draft.maxApplicationsPerBill ?? 0)} onChangeText={(v) => set({ maxApplicationsPerBill: parseInt(v, 10) || 0 })} />
                    {draft.type === 'BuyXGetY' && (
                      <Text style={styles.hint}>Leave 0 so a big order keeps earning free items. Set 1 to give away only one.</Text>
                    )}
                  </Field>

                  <Field label="Run dates — leave blank to run until you switch it off">
                    <View style={styles.rowTwo}>
                      <TouchableOpacity style={[styles.dateBtn, styles.half]} onPress={() => setDatePickerFor('start')}>
                        <Icon name="calendar-start" size={17} color={COLORS.accent} />
                        <Text style={styles.dateBtnText} numberOfLines={1}>
                          {draft.startsAtUtc ? prettyDate(utcToIstYmd(draft.startsAtUtc)) : 'From'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.dateBtn, styles.half]} onPress={() => setDatePickerFor('end')}>
                        <Icon name="calendar-end" size={17} color={COLORS.accent} />
                        <Text style={styles.dateBtnText} numberOfLines={1}>
                          {draft.endsAtUtc ? prettyDate(utcToIstYmd(draft.endsAtUtc)) : 'Until'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {(draft.startsAtUtc || draft.endsAtUtc) && (
                      <TouchableOpacity onPress={() => set({ startsAtUtc: null, endsAtUtc: null })}>
                        <Text style={styles.clearLink}>Clear run dates</Text>
                      </TouchableOpacity>
                    )}
                  </Field>

                  <View style={styles.switchRow}>
                    <View style={styles.switchTextWrap}>
                      <Text style={styles.switchLabel}>Combine with other offers</Text>
                      <Text style={styles.switchSub}>Off = only the single best offer applies to a bill.</Text>
                    </View>
                    <Switch value={!!draft.stackable} onValueChange={(v) => set({ stackable: v })} />
                  </View>
                </View>
              )}

              {/* Live preview */}
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>Preview on a sample bill</Text>
                {preview && preview.totalDiscount > 0 ? (
                  <>
                    <Text style={styles.previewBig}>−₹{preview.totalDiscount.toFixed(2)} off</Text>
                    {preview.applied.map((a) => (
                      <Text key={a.offerId} style={styles.previewLine}>{a.detail}</Text>
                    ))}
                  </>
                ) : (
                  <Text style={styles.previewMuted}>No discount yet — fill in the fields above.</Text>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button mode="contained" onPress={save} loading={createOffer.isPending || updateOffer.isPending} buttonColor={COLORS.accent}>
                {editingId ? 'Save changes' : 'Create offer'}
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Item picker — its own sheet so a long menu gets the whole screen and a search box,
          rather than being crammed into the editor as another wrapping chip row. */}
      <Modal visible={itemPickerOpen} animationType="slide" transparent onRequestClose={() => setItemPickerOpen(false)}>
        <View style={[styles.modalBackdrop, isDesktopWeb && styles.modalBackdropDesktop]}>
          <View style={[styles.modalCard, isDesktopWeb && styles.modalCardDesktop]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose items</Text>
              <TouchableOpacity onPress={() => setItemPickerOpen(false)} style={styles.closeHit}><Icon name="close" size={24} color={COLORS.muted} /></TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Icon name="magnify" size={18} color={COLORS.muted} />
              <TextInput
                style={styles.searchInput}
                value={itemSearch}
                onChangeText={setItemSearch}
                placeholder="Search item or category"
                placeholderTextColor={COLORS.muted}
              />
              {itemSearch.length > 0 && (
                <TouchableOpacity onPress={() => setItemSearch('')}><Icon name="close-circle" size={18} color={COLORS.muted} /></TouchableOpacity>
              )}
            </View>

            {shownIds.length > 0 && (
              <View style={styles.bulkBar}>
                <Text style={styles.bulkCount}>
                  {itemSearch.trim() ? `${shownIds.length} in results` : `${shownIds.length} items`}
                </Text>
                <TouchableOpacity onPress={toggleAllShown} style={styles.bulkBtn}>
                  <Icon name={allShownSelected ? 'checkbox-multiple-blank-outline' : 'checkbox-multiple-marked-outline'} size={16} color={COLORS.accent} />
                  <Text style={styles.bulkBtnText}>{allShownSelected ? 'Clear all shown' : 'Select all shown'}</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.pickerList}>
              {filteredMenu.length === 0 ? (
                <Text style={styles.empty}>No items match that search.</Text>
              ) : (
                filteredMenu.map((m) => {
                  const on = chosenItemIds.includes(m.id);
                  return (
                    <TouchableOpacity key={m.id} style={[styles.itemRow, on && styles.itemRowOn]} onPress={() => toggleItem(m.id)} activeOpacity={0.7}>
                      {/* A drawn box, not an icon font — the tick has to be visible on web too. */}
                      <View style={[styles.tickBox, on && styles.tickBoxOn]}>
                        {on && <Icon name="check" size={14} color="#FFFFFF" />}
                      </View>
                      <View style={styles.itemTextWrap}>
                        <Text style={[styles.itemName, on && styles.itemNameOn]} numberOfLines={1}>{m.name}</Text>
                        <Text style={styles.itemCat} numberOfLines={1}>{m.category}</Text>
                      </View>
                      <Text style={styles.itemPrice}>₹{m.price}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Text style={styles.pickerCount}>
                {chosenItemIds.length === 0 ? 'Nothing chosen yet' : `${chosenItemIds.length} item${chosenItemIds.length > 1 ? 's' : ''} chosen`}
              </Text>
              <Button mode="contained" onPress={() => setItemPickerOpen(false)} buttonColor={COLORS.accent}>Done</Button>
            </View>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={datePickerFor !== null}
        value={datePickerFor === 'start' ? utcToIstYmd(draft.startsAtUtc) : utcToIstYmd(draft.endsAtUtc)}
        title={datePickerFor === 'start' ? 'Offer runs from' : 'Offer runs until'}
        allowFutureDates
        onCancel={() => setDatePickerFor(null)}
        onConfirm={(ymd) => {
          // Start pins to the first moment of that IST day, end to its last, so both ends of the
          // window include the whole day the owner picked.
          if (datePickerFor === 'start') set({ startsAtUtc: istDayStartUtc(ymd) });
          else set({ endsAtUtc: istDayEndUtc(ymd) });
          setDatePickerFor(null);
        }}
      />
    </View>
  );
};

const describeOffer = (o: Offer): string => {
  const time = o.startTime && o.endTime ? `, ${hhmm(o.startTime)}–${hhmm(o.endTime)}` : '';
  const min = o.minOrderValue > 0 ? `, above ₹${o.minOrderValue}` : '';
  // A combo names its set-price and item count rather than an "X off on scope" phrase.
  if (o.type === 'Combo') {
    return `${(o.menuItemIds ?? []).length} items for ₹${o.comboPrice}${min}${time}`;
  }
  const scope = o.scope === 'EntireBill'
    ? 'whole bill'
    : o.scope === 'Category'
      ? `${o.categoryName} category`
      : `${(o.menuItemIds ?? []).length} chosen item(s)`;
  const base = o.type === 'BuyXGetY' ? `Buy ${o.buyQty} get ${o.getQty} free`
    : o.type === 'Percentage' ? `${o.value}% off` : `₹${o.value} off`;
  return `${base} on ${scope}${min}${time}`;
};

/**
 * Selection chip drawn from scratch rather than react-native-paper's Chip. Paper renders its
 * "selected" tick through its own icon layer, which this app never configured a web font for —
 * so it came out as an empty tofu square that read as a glitch. Colour and a solid fill carry
 * the state here instead, which also survives being looked at from across a counter.
 */
const SelectChip = ({ label, selected, onPress, icon, compact }: {
  label: string; selected: boolean; onPress: () => void; icon?: string; compact?: boolean;
}) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.selChip, compact && styles.selChipCompact, selected && styles.selChipOn]}
    >
      {icon && <Icon name={icon} size={15} color={selected ? '#FFFFFF' : COLORS.muted} />}
      <Text style={[styles.selChipText, selected && styles.selChipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
};

/** Big −/+ buttons instead of a number box: quantities here are 1–3, and typing is what let a
 * "Buy 2 Get 1" get saved as a Get-2. */
const QtyStepper = ({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        <Icon name="minus" size={20} color={value <= min ? COLORS.divider : COLORS.heading} />
      </TouchableOpacity>
      <Text style={styles.stepVal}>{value}</Text>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(value + 1)}>
        <Icon name="plus" size={20} color={COLORS.heading} />
      </TouchableOpacity>
    </View>
  );
};

const SectionHeading = ({ icon, text }: { icon: string; text: string }) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  return (
    <View style={styles.sectionHead}>
      <Icon name={icon} size={16} color={COLORS.accent} />
      <Text style={styles.sectionHeadText}>{text}</Text>
    </View>
  );
};

const Field = ({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  return (
    <View style={[styles.field, half && styles.half]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
};

const makeStyles = (COLORS: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  body: { padding: 16, paddingBottom: 48 },
  intro: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 },
  sectionLabel: { color: COLORS.heading, fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  templateCard: { flexGrow: 1, flexBasis: '45%', backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.divider },
  templateLabel: { color: COLORS.heading, fontWeight: '700', fontSize: 14, marginTop: 8 },
  templateBlurb: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  empty: { color: COLORS.muted, fontSize: 13, paddingVertical: 16, textAlign: 'center' },
  offerCard: { backgroundColor: COLORS.card, marginBottom: 10, padding: 12, borderRadius: 12 },
  offerCardInactive: { opacity: 0.55 },
  offerRow: { flexDirection: 'row', alignItems: 'center' },
  offerMain: { flex: 1, paddingRight: 8 },
  offerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  offerTitle: { color: COLORS.heading, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  offerSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  offerActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' },
  // A bottom sheet is right on a phone, but on a tablet/desktop browser it has to
  // become a centred, width-capped dialog like every other modal in the app.
  modalBackdropDesktop: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCardDesktop: { width: '100%', maxWidth: 560, borderRadius: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  modalTitle: { color: COLORS.heading, fontSize: 17, fontWeight: '700' },
  closeHit: { padding: 4 },
  modalBody: { padding: 16 },
  field: { marginBottom: 14 },
  fieldLabel: { color: COLORS.heading, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.heading, fontSize: 15 },
  rowTwo: { flexDirection: 'row', gap: 10 },
  timeRow: { marginTop: 8 },
  half: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  hint: { color: COLORS.muted, fontSize: 12, marginTop: 6, marginBottom: 8, lineHeight: 17 },

  // Plain-English restatement of the whole draft, pinned above the fields.
  summaryBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.successBg, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  summaryText: { flex: 1, minWidth: 0, color: COLORS.heading, fontSize: 13, fontWeight: '600', lineHeight: 19 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, marginBottom: 10 },
  sectionHeadText: { color: COLORS.heading, fontSize: 14, fontWeight: '700' },

  selChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22,
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.divider,
  },
  selChipCompact: { paddingHorizontal: 11, paddingVertical: 8 },
  selChipOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  selChipText: { color: COLORS.heading, fontSize: 13, fontWeight: '600' },
  selChipTextOn: { color: '#FFFFFF', fontWeight: '800' },

  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider,
  },
  stepBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  stepVal: { color: COLORS.heading, fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center' },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  pickerBtnText: { flex: 1, minWidth: 0, color: COLORS.heading, fontSize: 14, fontWeight: '600' },
  chosenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chosenPill: { backgroundColor: COLORS.successBg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chosenPillText: { color: COLORS.heading, fontSize: 12, fontWeight: '600' },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  dateBtnText: { flex: 1, minWidth: 0, color: COLORS.heading, fontSize: 13, fontWeight: '600' },
  clearLink: { color: COLORS.accent, fontSize: 12, fontWeight: '700', marginTop: 8 },

  advToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, marginTop: 2 },
  advToggleText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  advBox: { borderLeftWidth: 2, borderLeftColor: COLORS.divider, paddingLeft: 12, marginBottom: 6 },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  switchTextWrap: { flex: 1, minWidth: 0 },
  switchLabel: { color: COLORS.heading, fontSize: 14, fontWeight: '600' },
  switchSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.divider,
    paddingHorizontal: 12, marginHorizontal: 16, marginTop: 12,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 10, color: COLORS.heading, fontSize: 15 },
  bulkBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 10 },
  bulkCount: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },
  bulkBtnText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
  pickerList: { padding: 16, paddingTop: 10 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
    backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: 'transparent',
  },
  itemRowOn: { borderColor: COLORS.accent, backgroundColor: COLORS.successBg },
  tickBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  tickBoxOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  itemTextWrap: { flex: 1, minWidth: 0 },
  itemName: { color: COLORS.heading, fontSize: 14, fontWeight: '600' },
  itemNameOn: { fontWeight: '800' },
  itemCat: { color: COLORS.muted, fontSize: 12, marginTop: 1 },
  itemPrice: { color: COLORS.heading, fontSize: 13, fontWeight: '700' },
  pickerCount: { color: COLORS.muted, fontSize: 13, marginBottom: 8, textAlign: 'center' },

  preview: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginTop: 4, borderWidth: 1, borderColor: COLORS.divider },
  previewLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  previewBig: { color: COLORS.success, fontSize: 20, fontWeight: '800' },
  previewLine: { color: COLORS.heading, fontSize: 13, marginTop: 4 },
  previewMuted: { color: COLORS.muted, fontSize: 13 },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: COLORS.divider },
});
