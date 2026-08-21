import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useDispatch, useSelector } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { INPUT_BORDER_WIDTH, RADIUS, modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import {
  useApprovals,
  useApproveRequest,
  useRejectRequest,
  useEscalateRequest,
} from '../../../../../core/api/hooks/useApprovals';
import { ApiApproval, ApprovalStatus, ApprovalType } from '../../../../../core/api/approvalsApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { StatusBadge, EmptyState, ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const TYPE_ICONS: Record<ApprovalType, string> = {
  REFUND: 'cash-refund',
  DISCOUNT: 'tag',
  EXPENSE: 'wallet-outline',
  SALARY: 'currency-inr',
  INVENTORY_ADJUSTMENT: 'package-variant-closed',
  STOCK_TRANSFER: 'truck-delivery',
  LEAVE: 'calendar-clock',
};

const StatusBadgeStatus: Record<ApprovalStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  ESCALATED: 'neutral',
};

const ApprovalCard: React.FC<{
  item: ApiApproval;
  currentUserId: number | null;
  COLORS: ReturnType<typeof useThemeColors>;
  onRequestNotes: (id: number, kind: 'APPROVE' | 'REJECT') => void;
}> = ({ item, currentUserId, COLORS, onRequestNotes }) => {
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const escalate = useEscalateRequest();
  const dispatch = useDispatch();

  const handleEscalate = async () => {
    try {
      await escalate.mutateAsync(item.id);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not escalate'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const requesterLabel = item.requestedById === currentUserId ? 'You' : `Staff #${item.requestedById}`;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Icon name={TYPE_ICONS[item.type]} size={18} color={COLORS.accent} />
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <StatusBadge status={StatusBadgeStatus[item.status]} label={item.status} />
      </View>

      <Text style={styles.desc}>{item.description}</Text>

      {item.amount != null && (
        <Text style={styles.amount}>
          {item.currency} {item.amount.toLocaleString()}
        </Text>
      )}

      <View style={styles.meta}>
        <Text style={styles.metaText}>By: {requesterLabel}</Text>
        <Text style={styles.metaText}>Level {item.level} Approval</Text>
      </View>

      {!!item.notes && (
        <Text style={styles.notesText}>Note: {item.notes}</Text>
      )}

      {(item.status === 'PENDING' || item.status === 'ESCALATED') && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.escalateBtn} onPress={handleEscalate} disabled={escalate.isPending}>
            <Text style={styles.escalateText}>Escalate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => onRequestNotes(item.id, 'REJECT')}>
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.approveBtn} onPress={() => onRequestNotes(item.id, 'APPROVE')}>
            <Text style={styles.approveText}>Approve</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export const ApprovalWorkflowScreen: React.FC = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ApprovalStatus | 'ALL'>('ALL');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const { data: requests = [], isLoading, isError, refetch } = useApprovals(filter === 'ALL' ? undefined : { status: filter });
  const { data: allRequestsForCounts = [] } = useApprovals();
  const currentUserIdStr = useSelector((s: any) => s.auth.user?.id);
  const currentUserId = currentUserIdStr ? Number(currentUserIdStr) : null;
  const approve = useApproveRequest();
  const reject = useRejectRequest();

  const [notesTarget, setNotesTarget] = useState<{ id: number; kind: 'APPROVE' | 'REJECT' } | null>(null);
  const [notes, setNotes] = useState('');

  const filters: (ApprovalStatus | 'ALL')[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'ESCALATED'];
  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const countFor = (f: ApprovalStatus | 'ALL') =>
    f === 'ALL' ? allRequestsForCounts.length : allRequestsForCounts.filter((r) => r.status === f).length;
  const filterCounts = filters.reduce<Record<string, number>>((acc, f) => {
    acc[f] = countFor(f);
    return acc;
  }, {});

  const closeNotes = () => {
    setNotesTarget(null);
    setNotes('');
  };

  const confirmNotes = async () => {
    if (!notesTarget) return;
    try {
      if (notesTarget.kind === 'APPROVE') {
        await approve.mutateAsync({ id: notesTarget.id, notes });
      } else {
        await reject.mutateAsync({ id: notesTarget.id, notes });
      }
      closeNotes();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="check-decagram-outline" title="Approvals" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Icon name="check-decagram" size={22} color={COLORS.accent} />
          <Text style={styles.headerTitle}>
            {`Approvals${pendingCount > 0 ? ` · ${pendingCount} Pending` : ''}`}
          </Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <CategoryFilterTrigger
        label={`${filter} · ${countFor(filter)}`}
        onPress={() => setCategoryPickerVisible(true)}
      />
      <CategoryFilterModal
        visible={categoryPickerVisible}
        onClose={() => setCategoryPickerVisible(false)}
        title="Filter by Status"
        categories={filters}
        activeCategory={filter}
        counts={filterCounts}
        onSelect={(label) => setFilter(label as ApprovalStatus | 'ALL')}
      />

      {isError && requests.length === 0 ? (
        <ErrorState
          title="Couldn't load approvals"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <View style={{ padding: 12 }}>
          <SkeletonList rows={5} />
        </View>
      ) : requests.length === 0 ? (
        <EmptyState icon="check-circle-outline" title="No approvals here" />
      ) : (
        <FlashList
          data={requests}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ApprovalCard
              item={item}
              currentUserId={currentUserId}
              COLORS={COLORS}
              onRequestNotes={(id, kind) => setNotesTarget({ id, kind })}
            />
          )}
          contentContainerStyle={{ padding: 12 }}
        />
      )}

      <Modal visible={!!notesTarget} transparent animationType="fade" onRequestClose={closeNotes}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>
                {notesTarget?.kind === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
              </Text>
              <CloseButton onPress={closeNotes} size={18} />
            </View>
            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <View style={{ borderRadius: RADIUS.card }}>
              <TextInput
                style={styles.modalInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add a note…"
                placeholderTextColor={COLORS.placeholder}
                multiline
                numberOfLines={3}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeNotes}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, notesTarget?.kind === 'REJECT' && styles.modalConfirmBtnDanger]}
                onPress={confirmNotes}
                disabled={approve.isPending || reject.isPending}
              >
                {approve.isPending || reject.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>{notesTarget?.kind === 'APPROVE' ? 'Approve' : 'Reject'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, paddingBottom: isDesktopWeb ? 9 : 9, gap: isDesktopWeb ? 7 : 7.5 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: RADIUS.card, padding: isDesktopWeb ? 10 : 10.5, marginBottom: isDesktopWeb ? 9 : 9 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 6 : 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 5 : 4.5, flex: 1 },
  cardTitle: { fontWeight: '700', fontSize: 14, flex: 1, color: COLORS.heading },
  desc: { fontSize: isDesktopWeb ? 13 : 12, lineHeight: 18, marginBottom: isDesktopWeb ? 6 : 6, color: COLORS.muted },
  amount: { fontSize: isDesktopWeb ? 20 : 12, fontWeight: '800', marginBottom: isDesktopWeb ? 6 : 6, color: COLORS.accent },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 11, color: COLORS.muted },
  notesText: { fontSize: 12, padding: isDesktopWeb ? 6 : 6, borderRadius: 6, marginTop: isDesktopWeb ? 6 : 6, color: COLORS.muted, backgroundColor: COLORS.chipBg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: isDesktopWeb ? 6 : 6, marginTop: isDesktopWeb ? 9 : 9 },
  escalateBtn: { paddingHorizontal: isDesktopWeb ? 9 : 9, paddingVertical: isDesktopWeb ? 7 : 6.75, alignItems: 'center', justifyContent: 'center' },
  escalateText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.muted },
  rejectBtn: {
    paddingHorizontal: isDesktopWeb ? 11 : 10.5,
    paddingVertical: isDesktopWeb ? 7 : 6.75,
    borderRadius: RADIUS.button,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.dangerAccent,
  },
  rejectText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.dangerAccent },
  approveBtn: { paddingHorizontal: isDesktopWeb ? 11 : 10.5, paddingVertical: isDesktopWeb ? 7 : 6.75, borderRadius: RADIUS.button, backgroundColor: COLORS.button },
  approveText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,24,16,0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 17 : 16.5 },
  modalSheet: { width: '100%', maxWidth: 440, backgroundColor: COLORS.background, borderRadius: RADIUS.modal, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, flexShrink: 1 },
  modalLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginTop: isDesktopWeb ? 5 : 4.5, marginBottom: isDesktopWeb ? 3 : 3 },
  modalInput: {
    backgroundColor: COLORS.cardAlt,
    borderWidth: INPUT_BORDER_WIDTH,
    borderColor: COLORS.inputBorder,
    borderRadius: RADIUS.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: COLORS.heading,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 6, marginTop: 9 },
  modalCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.button, paddingVertical: 7.5 },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalConfirmBtn: { flex: 1.3, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.button, borderRadius: RADIUS.button, paddingVertical: 7.5 },
  modalConfirmBtnDanger: { backgroundColor: COLORS.dangerAccent },
  modalConfirmText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
