import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useSupportTicket, useAddSupportMessage } from '../../../../../core/api/hooks/useSupport';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined;

export const SupportTicketScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const ticketId: number = route.params?.id;
  const { data: ticket, isLoading, isError, refetch } = useSupportTicket(ticketId);
  const addMessage = useAddSupportMessage(ticketId);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      await addMessage.mutateAsync(body);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not send message'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="lifebuoy" title={ticket?.subject ?? 'Support Ticket'} onBack={() => navigation.goBack()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{ticket?.subject ?? 'Support Ticket'}</Text>
            {!!ticket && (
              <View style={[styles.statusPill, ticket.status === 'RESOLVED' ? styles.statusResolved : styles.statusOpen]}>
                <Text style={[styles.statusText, ticket.status === 'RESOLVED' ? styles.statusTextResolved : styles.statusTextOpen]}>
                  {ticket.status === 'RESOLVED' ? 'Resolved' : 'Open'}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {isError && !ticket ? (
        <ErrorState
          title="Couldn't load ticket"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading || !ticket ? (
        <View style={styles.thread}>
          <SkeletonList rows={5} avatar={false} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.thread} showsVerticalScrollIndicator={false}>
          {ticket.messages.map((m) => (
            <View key={m.id} style={[styles.bubbleRow, !m.fromAdmin && styles.bubbleRowMine]}>
              <View style={[styles.bubble, m.fromAdmin ? styles.bubbleAdmin : styles.bubbleMine]}>
                {m.fromAdmin && <Text style={styles.bubbleSender}>{m.senderName}</Text>}
                <Text style={[styles.bubbleText, !m.fromAdmin && styles.bubbleTextMine]}>{m.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.composerWrapper, focused && styles.composerWrapperFocused]}>
          <TextInput
            style={[styles.composerInput, webNoOutline]}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.placeholder}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            multiline
          />
        </View>
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={addMessage.isPending || !draft.trim()}>
          <Icon name="send" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingBottom: isDesktopWeb ? 9 : 9,
  },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 1.5 : 1.5, marginTop: isDesktopWeb ? 2 : 2.25 },
  statusOpen: { backgroundColor: COLORS.warningBg },
  statusResolved: { backgroundColor: COLORS.successBg },
  statusText: { fontSize: 10, fontWeight: '700' },
  statusTextOpen: { color: COLORS.warning },
  statusTextResolved: { color: COLORS.success },
  thread: { padding: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 18 : 18, gap: isDesktopWeb ? 7 : 7.5 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 8, paddingHorizontal: isDesktopWeb ? 10 : 10.5, paddingVertical: isDesktopWeb ? 7 : 7.5 },
  bubbleAdmin: { backgroundColor: COLORS.cardAlt, borderTopLeftRadius: 4 },
  bubbleMine: { backgroundColor: COLORS.accent, borderTopRightRadius: 4 },
  bubbleSender: { fontSize: 11, fontWeight: '700', color: COLORS.accent, marginBottom: isDesktopWeb ? 2 : 2.25 },
  bubbleText: { fontSize: isDesktopWeb ? 14 : 12, color: COLORS.heading, lineHeight: 19 },
  bubbleTextMine: { color: '#FFFFFF' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 7 : 7.5,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.background,
  },
  composerWrapper: {
    flex: 1,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    paddingVertical: isDesktopWeb ? 7 : 7.5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    maxHeight: 100,
  },
  composerWrapperFocused: { borderColor: COLORS.accent, borderWidth: 2 },
  composerInput: { fontSize: 16, color: COLORS.heading, minHeight: 20 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
