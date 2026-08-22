import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { WarmColors as COLORS } from '../../../../shared/design/warmTheme';
import { showToast } from '../../../../core/store/uiSlice';
import {
  useSuperAdminTickets,
  useSuperAdminTicket,
  useSuperAdminReplyToTicket,
  useSuperAdminSetTicketStatus,
} from '../../../../core/api/hooks/useSupport';
import { getApiErrorMessage } from '../../../../core/network/api';
import { SkeletonList } from '../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../core/utils/useResponsive';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

const TicketThread = ({ id, onClose }: { id: number; onClose: () => void }) => {
  const dispatch = useDispatch();
  const { data: ticket, isLoading } = useSuperAdminTicket(id);
  const reply = useSuperAdminReplyToTicket(id);
  const setStatus = useSuperAdminSetTicketStatus(id);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      await reply.mutateAsync(body);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not send reply'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const toggleResolved = async () => {
    if (!ticket) return;
    try {
      await setStatus.mutateAsync(ticket.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED');
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update status'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.threadSheet}>
        <View style={styles.threadHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={18} color={COLORS.heading} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 5 }}>
            <Text style={styles.threadTitle} numberOfLines={1}>{ticket?.subject ?? 'Ticket'}</Text>
            <Text style={styles.threadSub}>{ticket?.tenantName} · {ticket?.createdByName}</Text>
          </View>
          {!!ticket && (
            <TouchableOpacity
              style={[styles.resolveBtn, ticket.status === 'RESOLVED' && styles.reopenBtn]}
              onPress={toggleResolved}
              disabled={setStatus.isPending}
            >
              <Text style={styles.resolveBtnText}>{ticket.status === 'RESOLVED' ? 'Reopen' : 'Resolve'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading || !ticket ? (
          <SkeletonList rows={4} avatar={false} style={{ padding: 8 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.thread} showsVerticalScrollIndicator={false}>
            {ticket.messages.map((m) => (
              <View key={m.id} style={[styles.bubbleRow, m.fromAdmin && styles.bubbleRowMine]}>
                <View style={[styles.bubble, m.fromAdmin ? styles.bubbleMine : styles.bubbleCafe]}>
                  {!m.fromAdmin && <Text style={styles.bubbleSender}>{m.senderName}</Text>}
                  <Text style={[styles.bubbleText, m.fromAdmin && styles.bubbleTextMine]}>{m.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <View style={[styles.composerWrapper, focused && styles.composerWrapperFocused]}>
            <TextInput
              style={[styles.composerInput, webNoOutline]}
              placeholder="Reply to this cafe..."
              placeholderTextColor={COLORS.placeholder}
              value={draft}
              onChangeText={setDraft}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              multiline
            />
          </View>
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={reply.isPending || !draft.trim()}>
            <Icon name="send" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export const SupportTicketsScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const insets = useSafeAreaInsets();
  const { data: tickets = [], isLoading, isError, refetch } = useSuperAdminTickets();
  const [openId, setOpenId] = useState<number | null>(null);
  const openCount = tickets.filter((t) => t.status === 'OPEN').length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Icon name="lifebuoy" size={20} color={COLORS.superAdmin} />
        <Text style={styles.headerTitle}>Support Tickets</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>Cafe Support Inbox</Text>
          <Text style={styles.subtitle}>Every ticket raised from a cafe's Help Center, across every tenant.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{openCount}</Text>
          <Text style={styles.summaryLabel}>Open Tickets</Text>
        </View>

        {isError && tickets.length === 0 ? (
          <ErrorState
            title="Couldn't load support tickets"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {isLoading && <SkeletonList rows={6} style={{ paddingHorizontal: 8, marginTop: 2 }} />}
            {!isLoading && tickets.length === 0 && <Text style={styles.emptyText}>No tickets raised yet.</Text>}

            {tickets.map((t) => (
              <TouchableOpacity key={t.id} style={styles.ticketCard} onPress={() => setOpenId(t.id)}>
                <View style={styles.ticketTopRow}>
                  <Text style={styles.tenantName} numberOfLines={1}>{t.tenantName}</Text>
                  <View style={[styles.statusPill, { backgroundColor: t.status === 'RESOLVED' ? COLORS.successBg : COLORS.warningBg }]}>
                    <Text style={[styles.statusPillText, { color: t.status === 'RESOLVED' ? COLORS.success : COLORS.warning }]}>{t.status}</Text>
                  </View>
                </View>
                <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                <Text style={styles.ticketMeta}>{t.createdByName} · {t.messageCount} message{t.messageCount === 1 ? '' : 's'} · {new Date(t.updatedAt).toLocaleString()}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={openId !== null} animationType="slide" onRequestClose={() => setOpenId(null)}>
        {openId !== null && <TicketThread id={openId} onClose={() => setOpenId(null)} />}
      </Modal>
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 3, paddingHorizontal: isDesktopWeb ? 8 : 6, paddingTop: isDesktopWeb ? 6 : 4.5, paddingBottom: isDesktopWeb ? 6 : 4.5 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.superAdmin, flex: 1 },
  titleBox: { paddingHorizontal: isDesktopWeb ? 8 : 6, marginBottom: isDesktopWeb ? 8 : 6 },
  title: { fontSize: isDesktopWeb ? 22 : 14, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 2.25 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  summaryCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 8 : 6, borderRadius: 8, padding: isDesktopWeb ? 9 : 6.75, marginBottom: isDesktopWeb ? 8 : 6, alignItems: 'center' },
  summaryValue: { fontSize: isDesktopWeb ? 32 : 12, fontWeight: 'bold', color: COLORS.superAdmin },
  summaryLabel: { fontSize: 12, color: COLORS.muted },
  emptyText: { textAlign: 'center', color: COLORS.muted, marginTop: isDesktopWeb ? 10 : 7.5 },
  ticketCard: { backgroundColor: COLORS.cardAlt, marginHorizontal: isDesktopWeb ? 8 : 6, borderRadius: 8, padding: isDesktopWeb ? 8 : 6, marginBottom: isDesktopWeb ? 7 : 5.25 },
  ticketTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isDesktopWeb ? 3 : 2.25, gap: isDesktopWeb ? 4 : 3 },
  tenantName: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.muted, flexShrink: 1 },
  statusPill: { paddingHorizontal: isDesktopWeb ? 5 : 3.75, paddingVertical: isDesktopWeb ? 2 : 1.5, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  ticketSubject: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 2 : 1.5 },
  ticketMeta: { fontSize: 12, color: COLORS.muted },

  modalOverlay: { flex: 1, backgroundColor: COLORS.background },
  threadSheet: { flex: 1 },
  threadHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 8 : 6, paddingTop: isDesktopWeb ? 6 : 4.5, paddingBottom: isDesktopWeb ? 5 : 3.75 },
  threadTitle: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  threadSub: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 1 : 0.75 },
  resolveBtn: { backgroundColor: COLORS.superAdmin, paddingHorizontal: isDesktopWeb ? 6 : 4.5, paddingVertical: isDesktopWeb ? 4 : 3, borderRadius: 6 },
  reopenBtn: { backgroundColor: COLORS.muted },
  resolveBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  thread: { padding: isDesktopWeb ? 8 : 6, paddingBottom: isDesktopWeb ? 10 : 7.5, gap: isDesktopWeb ? 4 : 3 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 8, paddingHorizontal: isDesktopWeb ? 6 : 4.5, paddingVertical: isDesktopWeb ? 4 : 3 },
  bubbleCafe: { backgroundColor: COLORS.cardAlt, borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: COLORS.superAdmin, borderTopRightRadius: 4 },
  bubbleSender: { fontSize: 11, fontWeight: '700', color: COLORS.accent, marginBottom: isDesktopWeb ? 1.5 : 1.13 },
  bubbleText: { fontSize: 12, color: COLORS.heading, lineHeight: 16 },
  bubbleTextMine: { color: '#FFFFFF' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: isDesktopWeb ? 4 : 3,
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    paddingTop: isDesktopWeb ? 5 : 3.75,
    paddingBottom: isDesktopWeb ? 8 : 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  composerWrapper: {
    flex: 1,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 3.75,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    maxHeight: 100,
  },
  composerWrapperFocused: { borderColor: COLORS.superAdmin, borderWidth: 2 },
  composerInput: { fontSize: 16, color: COLORS.heading, minHeight: 20 },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.superAdmin,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
