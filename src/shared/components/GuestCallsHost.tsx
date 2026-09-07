import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGuestCalls, useAcknowledgeGuestCall } from '../../core/api/hooks/useGuestCalls';
import { GuestCall } from '../../core/api/guestCallsApi';
import { showToast } from '../../core/store/uiSlice';
import { getApiErrorMessage } from '../../core/network/api';
import { WarmColors as COLORS } from '../design/warmTheme';
import { NonBlockingOverlay } from './NonBlockingOverlay';
import { useResponsive } from '../../core/utils/useResponsive';
import { alertChime } from '../../core/notifications/alertChime';
import { ElapsedTimer } from './atoms/ElapsedTimer';
import { CloseButton } from './atoms/CloseButton';

/**
 * How often the chime repeats while a guest is still waiting.
 *
 * Shorter than the pending-order reminder's twenty seconds, on purpose: an unconfirmed order is
 * food not yet started, but a raised hand is a person sitting in the room looking at the staff.
 * Fifteen seconds is roughly the walk from the till to the far table.
 */
const CALL_REMINDER_MS = 15000;

const KIND_META: Record<GuestCall['kind'], { icon: string; label: string; colour: string }> = {
  Bill: { icon: 'receipt', label: 'Wants the bill', colour: COLORS.accent },
  Waiter: { icon: 'hand-wave', label: 'Calling a waiter', colour: COLORS.warning },
};

/**
 * The floor-wide "a guest is asking for you" alert — mounted once at the navigator level, beside
 * PendingOrdersHost and for the same reason: whoever is nearest should see it whatever screen
 * they happen to be on, and a request answered on one device has to go quiet on all of them.
 *
 * Modelled closely on PendingOrdersHost (chime on arrival, a pill that stays up while anything
 * is outstanding, a reminder chime until it's cleared) because staff should not have to learn
 * two different alert languages for two things that both mean "go and do something now".
 *
 * Where it deliberately differs: this lists every call at once instead of dealing them out one
 * at a time. Confirming orders is a queue worked front to back, but three tables with their
 * hands up is a floor to read — who has waited longest, and who is on the way there anyway.
 */
export const GuestCallsHost = () => {
  const { isDesktopWeb } = useResponsive();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(isDesktopWeb);
  const { data: calls = [] } = useGuestCalls();
  const acknowledge = useAcknowledgeGuestCall();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Which calls this device has already announced. Without it every poll would re-chime the
  // same standing call — the reminder below is what handles "still waiting", not this.
  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    const currentIds = new Set(calls.map((c) => c.id));
    const fresh = calls.filter((c) => !seenIds.current.has(c.id));
    seenIds.current = currentIds;
    if (fresh.length === 0) return;

    // One chime and one toast for the batch — several tables ringing at once is one event to
    // the person at the till, and overlapping chimes just sound like a fault.
    alertChime.play();
    dispatch(
      showToast({
        message:
          fresh.length === 1
            ? `${fresh[0].label} — ${KIND_META[fresh[0].kind].label.toLowerCase()}`
            : `${fresh.length} tables are asking for you`,
        icon: 'bell-ring-outline',
        tone: 'warning',
      }),
    );
  }, [calls, dispatch]);

  // Keyed on "is anyone waiting", not on how many — keying on the count would restart the
  // timer every time a call was answered, re-chiming at staff for the work they are already
  // doing. Silent while the sheet is open: whoever opened it is looking at this right now.
  const hasCalls = calls.length > 0;
  useEffect(() => {
    if (!hasCalls || open) return;
    const timer = setInterval(() => alertChime.play(), CALL_REMINDER_MS);
    return () => clearInterval(timer);
  }, [hasCalls, open]);

  const handleAcknowledge = async (call: GuestCall) => {
    setBusyId(call.id);
    try {
      await acknowledge.mutateAsync(call.id);
    } catch (err) {
      dispatch(showToast({
        message: getApiErrorMessage(err, 'Could not clear this request'),
        icon: 'alert-circle-outline',
        tone: 'danger',
      }));
    } finally {
      setBusyId(null);
    }
  };

  if (!hasCalls) return null;

  return (
    <NonBlockingOverlay visible zIndex={99000}>
      {open ? (
        <View style={[styles.sheetWrap, { paddingTop: insets.top + 40 }]} pointerEvents="box-none">
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Icon name="bell-ring" size={18} color={COLORS.accent} />
              <Text style={styles.sheetTitle}>
                {calls.length} {calls.length === 1 ? 'guest is' : 'guests are'} asking for you
              </Text>
              <CloseButton onPress={() => setOpen(false)} size={18} />
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {calls.map((call) => {
                const meta = KIND_META[call.kind];
                return (
                  <View key={call.id} style={styles.callRow}>
                    <Icon name={meta.icon} size={20} color={meta.colour} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.callLabel} numberOfLines={1}>{call.label}</Text>
                      <Text style={styles.callKind}>{meta.label}</Text>
                    </View>
                    {/* How long they have been waiting is the whole basis for choosing who to
                        go to first, so it sits on the row rather than behind a tap. */}
                    <ElapsedTimer since={call.createdAt} style={styles.callWaiting} />
                    <TouchableOpacity
                      style={styles.gotItBtn}
                      onPress={() => handleAcknowledge(call)}
                      disabled={busyId === call.id}
                    >
                      {busyId === call.id
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : <Text style={styles.gotItText}>On it</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : (
        <View style={[styles.pillWrap, { paddingTop: insets.top + 40 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.pill} onPress={() => setOpen(true)} activeOpacity={0.85}>
            <Icon name="bell-ring" size={16} color="#FFFFFF" />
            <Text style={styles.pillText}>
              {calls.length === 1 ? `${calls[0].label} — ${KIND_META[calls[0].kind].label.toLowerCase()}` : `${calls.length} guests asking for you`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </NonBlockingOverlay>
  );
};

const makeStyles = (isDesktopWeb: boolean) => StyleSheet.create({
  // Below ToastHost's 99999 so the toast still lands on top of the pill, above everything else.
  pillWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: COLORS.accent, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 10, maxWidth: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 8,
  },
  pillText: { color: '#FFFFFF', fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', flexShrink: 1 },
  sheetWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 },
  sheet: {
    width: '100%', maxWidth: 460, backgroundColor: COLORS.background, borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 12,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sheetTitle: { flex: 1, fontSize: isDesktopWeb ? 15 : 13, fontWeight: '800', color: COLORS.heading },
  callRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  callLabel: { fontSize: isDesktopWeb ? 14 : 13, fontWeight: '800', color: COLORS.heading },
  callKind: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  callWaiting: { fontSize: 12, fontWeight: '700', color: COLORS.muted, fontVariant: ['tabular-nums'] },
  gotItBtn: {
    backgroundColor: COLORS.heading, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 7, minWidth: 54, alignItems: 'center',
  },
  gotItText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
