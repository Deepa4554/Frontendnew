import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloseButton } from './CloseButton';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { modalHeadingOverride } from '../../design/commonStyles';
import { useResponsive } from '../../../core/utils/useResponsive';

/** Canonical wire format for every time this picker reads or writes: "hh:mm AM/PM". */
export const TIME_12H_RE = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTE_STEP = 5;
const PERIODS = ['AM', 'PM'] as const;

const ROW_HEIGHT = 32;
const VISIBLE_ROWS = 5;
const COLUMN_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

export interface ParsedTime {
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
}

/** "7:05 pm" → { hour: 7, minute: 5, period: 'PM' }. Null when it isn't a valid 12h time. */
export const parseTime12h = (value: string): ParsedTime | null => {
  const m = /^\s*(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)\s*$/i.exec(value ?? '');
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]), period: m[3].toUpperCase() as 'AM' | 'PM' };
};

export const formatTime12h = ({ hour, minute, period }: ParsedTime) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;

interface Props {
  visible: boolean;
  /** Current value in "hh:mm AM/PM" — anything unparseable falls back to 09:00 AM. */
  value: string;
  title?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

/**
 * Three-column time picker (hour / minute / AM-PM) in a modal sheet.
 *
 * Deliberately not @react-native-community/datetimepicker: that package has no web
 * implementation and this app ships a react-native-web build, so the native picker
 * would break the web bundle. Plain Views also let it inherit app theming.
 */
export const TimePickerModal: React.FC<Props> = ({ visible, value, title = 'Select Time', onCancel, onConfirm }) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);

  const parsed = useMemo(() => parseTime12h(value) ?? { hour: 9, minute: 0, period: 'AM' as const }, [value]);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.period);

  // An off-step minute (e.g. an 07:23 saved before this picker existed) still needs a
  // row to land on, otherwise opening the picker would silently round the value.
  const minutes = useMemo(() => {
    const steps = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
    return steps.includes(parsed.minute) ? steps : [...steps, parsed.minute].sort((a, b) => a - b);
  }, [parsed.minute]);

  const hourRef = useRef<ScrollView>(null);
  const minuteRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setPeriod(parsed.period);
    // Layout isn't measured on the first frame the modal mounts, so the scroll has to
    // wait a tick or it lands at the top instead of on the current value.
    const t = setTimeout(() => {
      hourRef.current?.scrollTo({ y: Math.max(0, HOURS.indexOf(parsed.hour) - 2) * ROW_HEIGHT, animated: false });
      minuteRef.current?.scrollTo({ y: Math.max(0, minutes.indexOf(parsed.minute) - 2) * ROW_HEIGHT, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, [visible, parsed, minutes]);

  const renderColumn = (
    label: string,
    items: number[],
    selected: number,
    onSelect: (n: number) => void,
    ref: React.RefObject<ScrollView | null>,
  ) => (
    <View style={styles.columnWrap}>
      <Text style={styles.columnLabel} numberOfLines={1}>{label}</Text>
      {/* Height lives on the ScrollView itself, not on a stretched parent: the row
          centres its children, so without an explicit height these grew to their full
          content height and spilled out over the rest of the sheet. */}
      <ScrollView
        ref={ref}
        style={styles.column}
        contentContainerStyle={styles.columnContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((n) => {
          const active = n === selected;
          return (
            <TouchableOpacity key={n} style={[styles.cell, active && styles.cellActive]} onPress={() => onSelect(n)}>
              <Text style={[styles.cellText, active && styles.cellTextActive]}>{String(n).padStart(2, '0')}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, modalHeadingOverride(16)]} numberOfLines={1}>{title}</Text>
            <CloseButton onPress={onCancel} size={18} />
          </View>

          <View style={styles.preview}>
            <Icon name="clock-outline" size={14} color={COLORS.accent} />
            <Text style={styles.previewText}>{formatTime12h({ hour, minute, period })}</Text>
          </View>

          <View style={styles.columns}>
            {renderColumn('HOUR', HOURS, hour, setHour, hourRef)}
            {renderColumn('MIN', minutes, minute, setMinute, minuteRef)}
            <View style={[styles.columnWrap, styles.periodWrap]}>
              <Text style={styles.columnLabel} numberOfLines={1}>AM/PM</Text>
              <View style={styles.periodColumn}>
                {PERIODS.map((p) => {
                  const active = p === period;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.periodCell, active && styles.periodCellActive]}
                      onPress={() => setPeriod(p)}
                    >
                      <Text style={[styles.cellText, active && styles.cellTextActive]} numberOfLines={1}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => onConfirm(formatTime12h({ hour, minute, period }))}>
              <Icon name="check" size={14} color="#FFFFFF" />
              <Text style={styles.saveText}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Nothing here goes above 12px — this screen's type ceiling.
const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(43,24,16,0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 22 : 16.5 },
  sheet: { width: '100%', maxWidth: 340, backgroundColor: COLORS.background, borderRadius: 12, paddingHorizontal: isDesktopWeb ? 14 : 10.5, paddingBottom: isDesktopWeb ? 14 : 10.5, paddingTop: isDesktopWeb ? 6 : 4.5, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 8 : 6, gap: isDesktopWeb ? 8 : 6 },
  title: { fontSize: 12, fontWeight: '800', color: COLORS.heading, flex: 1, flexShrink: 1 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 4.5,
    backgroundColor: COLORS.proTipBg,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 8 : 6,
    marginBottom: isDesktopWeb ? 10 : 7.5,
  },
  previewText: { fontSize: 12, fontWeight: '800', color: COLORS.accent, letterSpacing: 1.5 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: isDesktopWeb ? 6 : 4.5 },
  // Fixed width rather than flex:1 — two digits at 12px need nowhere near half the
  // sheet, and the columns stay centred instead of stretching to fill it.
  columnWrap: { width: 56, minWidth: 0 },
  columnLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: isDesktopWeb ? 5 : 3.75,
  },
  column: {
    height: COLUMN_HEIGHT,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 8,
  },
  columnContent: { paddingVertical: isDesktopWeb ? 3 : 2.25 },
  cell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 6, marginHorizontal: isDesktopWeb ? 3 : 2.25 },
  cellActive: { backgroundColor: COLORS.button },
  cellText: { fontSize: 12, fontWeight: '600', color: COLORS.heading },
  cellTextActive: { color: '#FFFFFF', fontWeight: '800' },
  // No `flex: 0` here — in RN that also sets flexBasis: 0%, which beats the width and
  // collapsed this column to nothing. Plain width is what actually sizes it.
  periodWrap: { width: 56 },
  // Two options against a five-row list: centre them so the gap reads as deliberate
  // rather than leaving them stranded at the top.
  periodColumn: { height: COLUMN_HEIGHT, justifyContent: 'center', gap: isDesktopWeb ? 8 : 6 },
  periodCell: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  periodCellActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  actions: { flexDirection: 'row', gap: isDesktopWeb ? 8 : 6, marginTop: isDesktopWeb ? 12 : 9 },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 6, paddingVertical: isDesktopWeb ? 10 : 7.5 },
  cancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  saveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4.5,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 7.5,
  },
  saveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
