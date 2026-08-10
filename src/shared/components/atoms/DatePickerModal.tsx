import React, { useEffect, useMemo, useState } from 'react';
import { CloseButton } from './CloseButton';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { modalHeadingOverride } from '../../design/commonStyles';

export const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => n.toString().padStart(2, '0');

export const formatDateISO = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Strict yyyy-MM-dd check — rejects calendar-invalid dates (2026-02-30, 2026-13-01) that
 * the shape check alone lets through, since JS Date silently rolls those over instead of
 * erroring. Use this to validate anything this picker produced or a user typed; the picker
 * itself only ever emits `formatDateISO`, so screens must not expect any other format. */
export const isValidDateISO = (value: string): boolean => {
  const m = (value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d);
};

export const parseDateISO = (value: string): Date | null => {
  if (!DATE_ISO_RE.test(value ?? '')) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

interface Props {
  visible: boolean;
  value: string;
  title?: string;
  allowFutureDates?: boolean;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export const DatePickerModal: React.FC<Props> = ({ visible, value, title = 'Select Date', allowFutureDates = false, onCancel, onConfirm }) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parsed = useMemo(() => parseDateISO(value) ?? today, [value]);
  const [selectedDate, setSelectedDate] = useState(parsed);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedDate(parseDateISO(value) ?? today);
    }
  }, [visible, value]);

  const currentMonth = useMemo(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), [selectedDate]);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days: (number | null)[] = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const previousMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  };

  const selectDay = (day: number) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    newDate.setHours(0, 0, 0, 0);
    if (!isDayDisabled(day)) {
      setSelectedDate(newDate);
    }
  };

  const isToday = (day: number) => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return d.getTime() === today.getTime();
  };

  // Expiry-style pickers (allowFutureDates) look forward from today, so anything already
  // past is invalid there. Other pickers (e.g. date of birth) look backward, so future
  // dates are what's invalid. Today itself is always selectable either way.
  const isDayDisabled = (day: number) => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return allowFutureDates ? d < today : d > today;
  };

  const isSelected = (day: number) => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return d.getTime() === selectedDate.getTime();
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, modalHeadingOverride(16)]} numberOfLines={1}>{title}</Text>
            <CloseButton onPress={onCancel} size={18} />
          </View>

          <View style={styles.preview}>
            <Icon name="calendar-outline" size={14} color={COLORS.accent} />
            <Text style={styles.previewText}>{formatDateISO(selectedDate)}</Text>
          </View>

          {!showMonthYearPicker ? (
            <View style={styles.monthNavigator}>
              <TouchableOpacity onPress={previousMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="chevron-left" size={20} color={COLORS.heading} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowMonthYearPicker(true)}>
                <Text style={styles.monthName}>{monthName}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="chevron-right" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.monthYearPicker}>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear() - 1, selectedDate.getMonth(), 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="chevron-left" size={20} color={COLORS.heading} />
              </TouchableOpacity>
              <Text style={styles.monthName}>{selectedDate.getFullYear()}</Text>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear() + 1, selectedDate.getMonth(), 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="chevron-right" size={20} color={COLORS.heading} />
              </TouchableOpacity>
            </View>
          )}

          {showMonthYearPicker && (
            <ScrollView style={styles.monthGrid} scrollEnabled showsVerticalScrollIndicator={false}>
              <View style={styles.monthGridRow}>
                {['Jan', 'Feb', 'Mar', 'Apr'].map((month, idx) => (
                  <TouchableOpacity
                    key={month}
                    style={[styles.monthBtn, selectedDate.getMonth() === idx && styles.monthBtnSelected]}
                    onPress={() => {
                      setSelectedDate(new Date(selectedDate.getFullYear(), idx, 1));
                      setShowMonthYearPicker(false);
                    }}
                  >
                    <Text style={[styles.monthBtnText, selectedDate.getMonth() === idx && styles.monthBtnTextSelected]}>{month}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.monthGridRow}>
                {['May', 'Jun', 'Jul', 'Aug'].map((month, idx) => (
                  <TouchableOpacity
                    key={month}
                    style={[styles.monthBtn, selectedDate.getMonth() === (idx + 4) && styles.monthBtnSelected]}
                    onPress={() => {
                      setSelectedDate(new Date(selectedDate.getFullYear(), idx + 4, 1));
                      setShowMonthYearPicker(false);
                    }}
                  >
                    <Text style={[styles.monthBtnText, selectedDate.getMonth() === (idx + 4) && styles.monthBtnTextSelected]}>{month}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.monthGridRow}>
                {['Sep', 'Oct', 'Nov', 'Dec'].map((month, idx) => (
                  <TouchableOpacity
                    key={month}
                    style={[styles.monthBtn, selectedDate.getMonth() === (idx + 8) && styles.monthBtnSelected]}
                    onPress={() => {
                      setSelectedDate(new Date(selectedDate.getFullYear(), idx + 8, 1));
                      setShowMonthYearPicker(false);
                    }}
                  >
                    <Text style={[styles.monthBtnText, selectedDate.getMonth() === (idx + 8) && styles.monthBtnTextSelected]}>{month}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          <View style={styles.dayNamesRow}>
            {dayNames.map((name) => (
              <View key={name} style={styles.dayNameCell}>
                <Text style={styles.dayNameText}>{name}</Text>
              </View>
            ))}
          </View>

          <View style={styles.calendar}>
            {Array.from({ length: Math.ceil(days.length / 7) }).map((_, weekIdx) => (
              <View key={weekIdx} style={styles.weekRow}>
                {days.slice(weekIdx * 7, (weekIdx + 1) * 7).map((day, dayIdx) => (
                  <View key={`${weekIdx}-${dayIdx}`} style={styles.dayCell}>
                    {day === null ? (
                      <View />
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.dayBtn,
                          isDayDisabled(day) && styles.dayBtnDisabled,
                          isToday(day) && styles.dayBtnToday,
                          isSelected(day) && styles.dayBtnSelected,
                        ]}
                        onPress={() => selectDay(day)}
                        disabled={isDayDisabled(day)}
                      >
                        <Text
                          style={[
                            styles.dayBtnText,
                            isDayDisabled(day) && styles.dayBtnTextDisabled,
                            isSelected(day) && styles.dayBtnTextSelected,
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => onConfirm(formatDateISO(selectedDate))}>
              <Icon name="check" size={14} color="#FFFFFF" />
              <Text style={styles.saveText}>Set Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(43,24,16,0.5)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  sheet: { width: '100%', maxWidth: 340, backgroundColor: COLORS.background, borderRadius: 12, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 6, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  title: { fontSize: 12, fontWeight: '800', color: COLORS.heading, flex: 1, flexShrink: 1 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.proTipBg,
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 10,
  },
  previewText: { fontSize: 12, fontWeight: '800', color: COLORS.accent, letterSpacing: 1.5 },
  monthNavigator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  monthName: { fontSize: 13, fontWeight: '700', color: COLORS.heading, textAlign: 'center', flex: 1 },
  dayNamesRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 2, marginBottom: 6 },
  dayNameCell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 28 },
  dayNameText: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  calendar: { marginBottom: 10 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 2, marginBottom: 4 },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 36 },
  dayBtn: { width: '100%', height: '100%', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cardAlt },
  dayBtnDisabled: { opacity: 0.4 },
  dayBtnToday: { borderWidth: 1.5, borderColor: COLORS.accent },
  dayBtnSelected: { backgroundColor: COLORS.button },
  dayBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  dayBtnTextDisabled: { color: COLORS.muted },
  dayBtnTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 6, paddingVertical: 10 },
  cancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  saveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 10,
  },
  saveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  monthYearPicker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  monthGrid: { maxHeight: 150, marginBottom: 10 },
  monthGridRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 6 },
  monthBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: COLORS.inputBorder },
  monthBtnSelected: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  monthBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.heading },
  monthBtnTextSelected: { color: '#FFFFFF', fontWeight: '800' },
});
