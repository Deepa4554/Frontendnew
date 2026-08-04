import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { useResponsive } from '../../../core/utils/useResponsive';
import { modalHeadingOverride } from '../../design/commonStyles';
import { istToday, istDatePlusDays } from '../../../core/utils/istDate';

export type RangePreset = 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'custom';

/** Matches the shape every report hook's params already take (days OR from/to). */
export interface DateRangeValue {
  days?: number;
  from?: string;
  to?: string;
}

export const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '15d', label: 'Last 15 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: 'custom', label: 'Custom Range' },
];

const isValidIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalIso = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const rangeForPreset = (preset: RangePreset, customFrom: string, customTo: string): DateRangeValue => {
  // Both presets resolve against the cafe's clock, not UTC and not the device's — the API
  // reads from/to as IST calendar days, so "Today" before 5:30 AM IST would otherwise ask
  // for yesterday and report a day that hasn't finished as if it were empty.
  if (preset === 'today') {
    const iso = istToday();
    return { from: iso, to: iso };
  }
  if (preset === 'yesterday') {
    const iso = istDatePlusDays(-1);
    return { from: iso, to: iso };
  }
  if (preset === '7d') return { days: 7 };
  if (preset === '15d') return { days: 15 };
  if (preset === '30d') return { days: 30 };
  return { from: isValidIsoDate(customFrom) ? customFrom.trim() : undefined, to: isValidIsoDate(customTo) ? customTo.trim() : undefined };
};

export const rangeLabelFor = (preset: RangePreset, customFrom: string, customTo: string): string => {
  if (preset === 'custom') return customFrom && customTo ? `${customFrom} → ${customTo}` : 'Custom Range';
  return PRESETS.find((p) => p.key === preset)?.label ?? 'Last 7 Days';
};

/** Tap-to-pick month calendar for the custom range fields — extracted verbatim from
 * DashboardScreen, which had no date-picker dependency and found typing YYYY-MM-DD by
 * hand error-prone. */
const CalendarGrid = ({ selected, onSelect, styles, COLORS }: {
  selected: string;
  onSelect: (iso: string) => void;
  styles: ReturnType<typeof makeStyles>;
  COLORS: ReturnType<typeof useThemeColors>;
}) => {
  const base = isValidIsoDate(selected) ? new Date(`${selected.trim()}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());

  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Which cell gets the "today" ring — the cafe's today, so it agrees with what the Today
  // preset above actually fetches rather than drifting on a device set to another timezone.
  const todayIso = istToday();

  const goMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  return (
    <View style={styles.calendarBox}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={() => goMonth(-1)} style={styles.calendarNavBtn}>
          <Icon name="chevron-left" size={16} color={COLORS.heading} />
        </TouchableOpacity>
        <Text style={styles.calendarMonthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={() => goMonth(1)} style={styles.calendarNavBtn}>
          <Icon name="chevron-right" size={16} color={COLORS.heading} />
        </TouchableOpacity>
      </View>
      <View style={styles.calendarWeekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.calendarWeekday}>{d}</Text>
        ))}
      </View>
      <View style={styles.calendarDaysWrap}>
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <View key={`pad-${i}`} style={styles.calendarDayCell} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const iso = toLocalIso(viewYear, viewMonth, i + 1);
          const isSelected = iso === selected;
          const isToday = iso === todayIso;
          return (
            <TouchableOpacity key={iso} style={styles.calendarDayCell} onPress={() => onSelect(iso)}>
              <View style={[styles.calendarDayInner, isSelected && styles.calendarDaySelected, !isSelected && isToday && styles.calendarDayToday]}>
                <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>{i + 1}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

interface DateRangeFilterProps {
  preset: RangePreset;
  customFrom: string;
  customTo: string;
  onChange: (preset: RangePreset, customFrom: string, customTo: string) => void;
}

/** A pill button showing the current selection; tapping opens a modal with the same
 * preset list + custom calendar every report screen needs — extracted from
 * DashboardScreen so Variance/Stock/Purchase/Revenue/Profit/Sales/Tax-GST/Expense
 * reports share one date-range UI instead of each hand-rolling their own. */
export const DateRangeFilter = ({ preset, customFrom, customTo, onChange }: DateRangeFilterProps) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const [visible, setVisible] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [activePicker, setActivePicker] = useState<'from' | 'to' | null>(null);

  const label = rangeLabelFor(preset, customFrom, customTo);

  const open = () => {
    setDraftFrom(customFrom);
    setDraftTo(customTo);
    setActivePicker(null);
    setVisible(true);
  };

  const applyCustomRange = () => {
    if (!isValidIsoDate(draftFrom) || !isValidIsoDate(draftTo) || draftFrom > draftTo) return;
    onChange('custom', draftFrom.trim(), draftTo.trim());
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={open} activeOpacity={0.8}>
        <Icon name="calendar-range" size={16} color={COLORS.heading} />
        <Text style={styles.triggerText}>{label}</Text>
        <Icon name="chevron-down" size={16} color={COLORS.muted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Select a Date Range</Text>
              <TouchableOpacity onPress={() => setVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            {PRESETS.filter((p) => p.key !== 'custom').map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.presetRow, preset === p.key && styles.presetRowActive]}
                onPress={() => {
                  onChange(p.key, customFrom, customTo);
                  setVisible(false);
                }}
              >
                <Text style={[styles.presetRowText, preset === p.key && styles.presetRowTextActive]}>{p.label}</Text>
                {preset === p.key && <Icon name="check" size={14} color="#FFFFFF" />}
              </TouchableOpacity>
            ))}

            <Text style={styles.customRangeLabel}>Or pick a custom range</Text>
            <View style={styles.customRangeRow}>
              <TouchableOpacity
                style={[styles.dateField, activePicker === 'from' && styles.dateFieldActive]}
                onPress={() => setActivePicker(activePicker === 'from' ? null : 'from')}
              >
                <Icon name="calendar-month-outline" size={18} color={COLORS.accent} />
                <View>
                  <Text style={styles.dateFieldLabel}>FROM</Text>
                  <Text style={styles.dateFieldValue}>{draftFrom || 'Select date'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateField, activePicker === 'to' && styles.dateFieldActive]}
                onPress={() => setActivePicker(activePicker === 'to' ? null : 'to')}
              >
                <Icon name="calendar-month-outline" size={18} color={COLORS.accent} />
                <View>
                  <Text style={styles.dateFieldLabel}>TO</Text>
                  <Text style={styles.dateFieldValue}>{draftTo || 'Select date'}</Text>
                </View>
              </TouchableOpacity>
            </View>
            {activePicker && (
              <CalendarGrid
                key={activePicker}
                selected={activePicker === 'from' ? draftFrom : draftTo}
                onSelect={(iso) => {
                  if (activePicker === 'from') {
                    setDraftFrom(iso);
                    setActivePicker('to');
                  } else {
                    setDraftTo(iso);
                    setActivePicker(null);
                  }
                }}
                styles={styles}
                COLORS={COLORS}
              />
            )}
            <TouchableOpacity style={styles.applyRangeBtn} onPress={applyCustomRange}>
              <Icon name="check" size={14} color="#FFFFFF" />
              <Text style={styles.applyRangeBtnText}>Apply Custom Range</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: isDesktopWeb ? 6 : 4.5,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 12 : 9,
    paddingVertical: isDesktopWeb ? 9 : 6.75,
  },
  triggerText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 10 : 7.5,
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 10 : 7.5,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 8 : 6,
  },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: 'bold', color: COLORS.heading },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 7 : 5.25,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
    marginBottom: isDesktopWeb ? 4 : 3,
  },
  presetRowActive: { backgroundColor: COLORS.button },
  presetRowText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  presetRowTextActive: { color: '#FFFFFF' },
  customRangeLabel: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 5 : 3.75, marginBottom: isDesktopWeb ? 4 : 3 },
  customRangeRow: { flexDirection: 'row', gap: isDesktopWeb ? 5 : 3.75, marginBottom: isDesktopWeb ? 7 : 5.25 },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 4.5,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    paddingVertical: isDesktopWeb ? 6 : 4.5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateFieldActive: { borderColor: COLORS.accent },
  dateFieldLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  dateFieldValue: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  calendarBox: { backgroundColor: COLORS.cardAlt, borderRadius: 10, padding: isDesktopWeb ? 8 : 6, marginBottom: isDesktopWeb ? 7 : 5.25 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: isDesktopWeb ? 4 : 3 },
  calendarNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  calendarMonthLabel: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  calendarWeekRow: { flexDirection: 'row', marginBottom: isDesktopWeb ? 2 : 1.5 },
  calendarWeekday: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: COLORS.muted },
  calendarDaysWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDayCell: { width: '14.28%', alignItems: 'center', paddingVertical: isDesktopWeb ? 2 : 1.5 },
  calendarDayInner: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  calendarDaySelected: { backgroundColor: COLORS.button },
  calendarDayToday: { borderWidth: 1, borderColor: COLORS.accent },
  calendarDayText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  calendarDayTextSelected: { color: '#FFFFFF' },
  applyRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 3 : 2.25,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 7 : 5.25,
  },
  applyRangeBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
