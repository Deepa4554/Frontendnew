import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { useSupportTickets, useCreateSupportTicket } from '../../../../../core/api/hooks/useSupport';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const TOP_ARTICLES = [
  { id: 'a1', title: 'Connecting your first printer', icon: 'file-document-outline' },
  { id: 'a2', title: 'End of day reporting guide', icon: 'chart-box-outline' },
  { id: 'a3', title: 'How to use Offline Mode', icon: 'wifi-off' },
  { id: 'a4', title: 'Recovering owner passwords', icon: 'shield-lock-outline' },
];

export const HelpCenterScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  // Browse by Category is commented out below (cards aren't wired to a destination yet) —
  // CATEGORIES stays commented too so it doesn't trip an unused-var lint error.
  // const CATEGORIES = [
  //   { id: 'hardware', title: 'Setting up Hardware', desc: 'Printers, terminals, and scanners.', icon: 'printer', iconBg: COLORS.vibeCrema, iconColor: '#FFFFFF' },
  //   { id: 'menu', title: 'Managing Menu', desc: 'Updating items, prices, and modifiers.', icon: 'silverware-fork-knife', iconBg: COLORS.heading, iconColor: '#FFFFFF' },
  //   { id: 'billing', title: 'Billing & Subscription', desc: 'Invoices, payment methods, plans.', icon: 'credit-card-outline', iconBg: COLORS.proTipBg, iconColor: COLORS.heading },
  //   { id: 'staff', title: 'Staff & Payroll', desc: 'Manage roles, permissions, and tips.', icon: 'account-group-outline', iconBg: COLORS.chipBg, iconColor: COLORS.heading },
  // ];
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [ticketModalVisible, setTicketModalVisible] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');

  const { data: tickets = [], isLoading: ticketsLoading } = useSupportTickets();
  const createTicket = useCreateSupportTicket();

  const submitTicket = async () => {
    if (!subjectDraft.trim() || !messageDraft.trim()) {
      dispatch(showToast({ message: 'Enter both a subject and a message before sending.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      const ticket = await createTicket.mutateAsync({ subject: subjectDraft.trim(), message: messageDraft.trim() });
      setTicketModalVisible(false);
      setSubjectDraft('');
      setMessageDraft('');
      navigation?.navigate?.('SupportTicket', { id: ticket.id });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not send'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="lifebuoy" title="Help Center" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="lifebuoy" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>Help Center</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      

        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={20} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search for guides, hardware, or billing..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {/* Browse by Category — commented out for now, cards aren't wired to a destination yet.
        <Text style={styles.sectionLabel}>BROWSE BY CATEGORY</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity key={cat.id} style={styles.catCard} activeOpacity={0.85}>
              <View style={[styles.catIcon, { backgroundColor: cat.iconBg }]}>
                <Icon name={cat.icon} size={22} color={cat.iconColor} />
              </View>
              <Text style={styles.catTitle}>{cat.title}</Text>
              <Text style={styles.catDesc}>{cat.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
        */}

        <Text style={styles.sectionLabel}>TOP ARTICLES</Text>
        <View style={styles.articleCard}>
          {TOP_ARTICLES.map((a, i) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.articleRow, i !== TOP_ARTICLES.length - 1 && styles.articleDivider]}
              onPress={() => navigation?.navigate?.('HelpArticle', { title: a.title })}
            >
              <Icon name={a.icon} size={20} color={COLORS.accent} />
              <Text style={styles.articleTitle}>{a.title}</Text>
              <Icon name="chevron-right" size={20} color={COLORS.muted} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>Still need help?</Text>
          <Text style={styles.supportSub}>
            Raise a ticket and the PrabandhOS team will get back to you right here.
          </Text>
          <TouchableOpacity style={styles.supportBtn} onPress={() => setTicketModalVisible(true)}>
            <Icon name="chat-outline" size={16} color="#FFFFFF" />
            <Text style={styles.supportBtnText}>Raise a Ticket</Text>
          </TouchableOpacity>
        </View>

        {(ticketsLoading || tickets.length > 0) && (
          <>
            <Text style={styles.sectionLabel}>MY TICKETS</Text>
            <View style={styles.articleCard}>
              {ticketsLoading ? (
                <SkeletonList rows={3} style={{ paddingVertical: 8 }} />
              ) : (
                tickets.map((t, i) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.ticketRow, i !== tickets.length - 1 && styles.articleDivider]}
                    onPress={() => navigation?.navigate?.('SupportTicket', { id: t.id })}
                  >
                    <Icon name={t.status === 'RESOLVED' ? 'check-circle-outline' : 'message-alert-outline'} size={20} color={t.status === 'RESOLVED' ? COLORS.success : COLORS.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.articleTitle} numberOfLines={1}>{t.subject}</Text>
                      <Text style={styles.ticketMeta}>{t.messageCount} message{t.messageCount === 1 ? '' : 's'} · {t.status === 'RESOLVED' ? 'Resolved' : 'Open'}</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={COLORS.muted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}

        <Text style={styles.versionText}>
          PrabandhOS Help Center Version 2.4.0 · Updated today at 08:30 AM
        </Text>
      </ScrollView>

      <Modal visible={ticketModalVisible} transparent animationType="fade" onRequestClose={() => setTicketModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>Raise a Ticket</Text>
              <TouchableOpacity onPress={() => setTicketModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={styles.modalInput}
                placeholder="Subject"
                placeholderTextColor={COLORS.placeholder}
                value={subjectDraft}
                onChangeText={setSubjectDraft}
              />
            </View>
            <View style={{ borderRadius: 12 }}>
              <TextInput
                style={[styles.modalInput, styles.modalTextarea]}
                placeholder="Describe the issue..."
                placeholderTextColor={COLORS.placeholder}
                value={messageDraft}
                onChangeText={setMessageDraft}
                multiline
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setTicketModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={submitTicket} disabled={createTicket.isPending}>
                {createTicket.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.modalSaveText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 9 : 9,
    paddingBottom: isDesktopWeb ? 9 : 9,
    gap: isDesktopWeb ? 7.5 : 7.5,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  h1: {
    fontSize: isDesktopWeb ? 24 : 12,
    fontWeight: 'bold',
    color: COLORS.heading,
    textAlign: 'center',
    marginTop: isDesktopWeb ? 6 : 6,
  },
  h1Sub: {
    fontSize: isDesktopWeb ? 14 : 12,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: isDesktopWeb ? 4.5 : 4.5,
    marginBottom: isDesktopWeb ? 13.5 : 13.5,
    paddingHorizontal: isDesktopWeb ? 18 : 18,
    lineHeight: 20,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    paddingHorizontal: isDesktopWeb ? 10.5 : 10.5,
    height: 50,
    marginBottom: isDesktopWeb ? 18 : 18,
  },
  searchInputWrap: {
    flex: 1,
  },
  searchInput: {
    width: '100%',
    fontSize: 16,
    color: COLORS.heading,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 18 : 18,
  },
  catCard: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  catTitle: {
    fontSize: isDesktopWeb ? 15 : 14,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 3 : 3,
  },
  catDesc: {
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 16,
  },
  articleCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 18 : 18,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
  },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 9 : 9,
  },
  articleDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  articleTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.heading,
  },
  supportCard: {
    backgroundColor: COLORS.heading,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 15 : 15,
    marginBottom: isDesktopWeb ? 15 : 15,
  },
  supportTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  supportSub: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: isDesktopWeb ? 13.5 : 13.5,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: isDesktopWeb ? 9.75 : 9.75,
  },
  supportBtnText: {
    fontSize: isDesktopWeb ? 14 : 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  versionText: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: isDesktopWeb ? 18 : 18,
    lineHeight: 16,
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 9 : 9,
    paddingVertical: isDesktopWeb ? 10.5 : 10.5,
  },
  ticketMeta: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: isDesktopWeb ? 1.5 : 1.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 24, 16, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: isDesktopWeb ? 18 : 18,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: isDesktopWeb ? 12 : 12,
    overflow: 'hidden',
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
    marginBottom: isDesktopWeb ? 6 : 6,
    flexShrink: 1,
  },
  modalInput: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: isDesktopWeb ? 9 : 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: isDesktopWeb ? 7.5 : 10,
    paddingVertical: isDesktopWeb ? 6 : 8,
    fontSize: isDesktopWeb ? 16 : 12,
    color: COLORS.heading,
    marginBottom: 6,
  },
  modalTextarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 6,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7.5,
    borderRadius: 6,
    backgroundColor: COLORS.cardAlt,
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.heading,
  },
  modalSaveBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7.5,
    borderRadius: 6,
    backgroundColor: COLORS.button,
  },
  modalSaveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
