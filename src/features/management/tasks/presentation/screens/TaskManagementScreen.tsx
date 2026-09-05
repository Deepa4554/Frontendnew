import React, { useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../../../../../core/store/uiSlice';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useTasks, useCreateTask, useUpdateTaskStatus, useDeleteTask } from '../../../../../core/api/hooks/useTasks';
import { useStaff } from '../../../../../core/api/hooks/useStaff';
import { ApiTask, TaskPriority, TaskStatus } from '../../../../../core/api/tasksApi';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { CategoryFilterModal, CategoryFilterTrigger } from '../../../../../shared/components/molecules/CategoryFilterModal';

import { modalHeadingOverride } from '../../../../../shared/design/commonStyles';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const makePriorityColor = (COLORS: ReturnType<typeof useThemeColors>): Record<TaskPriority, string> => ({
  LOW: COLORS.success,
  MEDIUM: COLORS.accent,
  HIGH: COLORS.warning,
  URGENT: COLORS.dangerAccent,
});

const STATUS_ICON: Record<TaskStatus, string> = {
  TODO: 'circle-outline',
  IN_PROGRESS: 'progress-clock',
  DONE: 'check-circle',
  BLOCKED: 'alert-circle',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
};

// CategoryFilterModal just renders whatever string it's given as the row label — raw enum
// values like "IN_PROGRESS" would show with the underscore, so the filter trigger/modal work
// off these human labels instead of TaskStatus directly, translating back on select.
const FILTER_LABEL: Record<TaskStatus | 'ALL', string> = { ALL: 'All', ...STATUS_LABEL };

const DUE_OPTIONS = [
  { label: 'Today', ms: 0 },
  { label: 'Tomorrow', ms: 86400000 },
  { label: 'In 3 days', ms: 3 * 86400000 },
  { label: 'Next week', ms: 7 * 86400000 },
];
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_TO_WIRE: Record<TaskPriority, 'Low' | 'Medium' | 'High' | 'Urgent'> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

const TaskCard: React.FC<{ item: ApiTask; assigneeName: string }> = ({ item, assigneeName }) => {
  const COLORS = useThemeColors();
  const { isDesktopWeb } = useResponsive();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const PRIORITY_COLOR = makePriorityColor(COLORS);
  const updateStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const isOverdue = new Date(item.dueDate) < new Date() && item.status !== 'DONE';

  return (
    <View style={[styles.card, { borderLeftColor: PRIORITY_COLOR[item.priority] }]}>
      <View style={styles.cardHeader}>
        <Icon
          name={STATUS_ICON[item.status]}
          size={18}
          color={item.status === 'DONE' ? COLORS.success : item.status === 'BLOCKED' ? COLORS.dangerAccent : COLORS.accent}
        />
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => setStatusPickerVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="dots-vertical" size={18} color={COLORS.muted} />
        </TouchableOpacity>
      </View>

      {!!item.description && <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>}

      <View style={styles.metaRow}>
        <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[item.priority] }]} />
        <Text style={styles.meta}>{item.priority}</Text>
        <Text style={styles.meta}>· {assigneeName}</Text>
        <Text style={[styles.meta, isOverdue && styles.metaOverdue]}>
          · Due: {new Date(item.dueDate).toLocaleDateString()}
        </Text>
      </View>

      {item.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {item.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.statusPillRow}>
        <View style={[styles.statusPill, { backgroundColor: `${PRIORITY_COLOR[item.priority]}22` }]}>
          <Text style={[styles.statusPillText, { color: PRIORITY_COLOR[item.priority] }]}>
            {STATUS_LABEL[item.status]}
          </Text>
        </View>
      </View>

      <Modal visible={statusPickerVisible} transparent animationType="fade" onRequestClose={() => setStatusPickerVisible(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setStatusPickerVisible(false)}>
          <View style={styles.pickerSheet}>
            {/* Tapping the backdrop closes this too, but that's an invisible affordance —
                the X is the one a first-time user can actually see. */}
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.pickerTitle, { flex: 1, minWidth: 0 }]} numberOfLines={2}>{item.title}</Text>
              <CloseButton onPress={() => setStatusPickerVisible(false)} size={22} />
            </View>
            {(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as TaskStatus[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.pickerRow}
                onPress={() => {
                  updateStatus.mutate({ id: item.id, status: s });
                  setStatusPickerVisible(false);
                }}
              >
                <Icon name={STATUS_ICON[s]} size={18} color={item.status === s ? COLORS.accent : COLORS.muted} />
                <Text style={[styles.pickerRowText, item.status === s && styles.pickerRowTextActive]}>
                  Mark as {STATUS_LABEL[s]}
                </Text>
                {item.status === s && <Icon name="check" size={16} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
            <View style={styles.pickerDivider} />
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => {
                deleteTask.mutate(item.id);
                setStatusPickerVisible(false);
              }}
            >
              <Icon name="trash-can-outline" size={18} color={COLORS.dangerAccent} />
              <Text style={[styles.pickerRowText, { color: COLORS.dangerAccent }]}>Delete Task</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export const TaskManagementScreen: React.FC = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const PRIORITY_COLOR = makePriorityColor(COLORS);
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const { data: tasks = [], isLoading } = useTasks(filter === 'ALL' ? undefined : { status: filter });
  const { data: allTasksForCounts = [] } = useTasks();
  const { data: staff = [] } = useStaff();
  const createTask = useCreateTask();

  const [addVisible, setAddVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueIdx, setDueIdx] = useState(0);

  const filters: (TaskStatus | 'ALL')[] = ['ALL', 'TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
  const countFor = (f: TaskStatus | 'ALL') =>
    f === 'ALL' ? allTasksForCounts.length : allTasksForCounts.filter((t) => t.status === f).length;
  const filterLabels = filters.map((f) => FILTER_LABEL[f]);
  const filterCounts = filters.reduce<Record<string, number>>((acc, f) => {
    acc[FILTER_LABEL[f]] = countFor(f);
    return acc;
  }, {});
  const filterForLabel = (label: string): TaskStatus | 'ALL' => filters.find((f) => FILTER_LABEL[f] === label) ?? 'ALL';
  const assigneeName = (id: number | null) => staff.find((s) => s.id === id)?.name ?? 'Unassigned';

  const resetForm = () => {
    setTitle('');
    setAssigneeId(staff[0]?.id ?? null);
    setPriority('MEDIUM');
    setDueIdx(0);
  };

  const handleAddTask = async () => {
    if (!title.trim()) {
      dispatch(showToast({ message: 'Please enter a task title.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await createTask.mutateAsync({
        title: title.trim(),
        assignedToId: assigneeId ?? undefined,
        priority: PRIORITY_TO_WIRE[priority],
        dueDate: new Date(Date.now() + DUE_OPTIONS[dueIdx].ms).toISOString(),
      });
      setAddVisible(false);
      resetForm();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not create task'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="format-list-checks" title="Tasks" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Tasks</Text>
            <Text style={styles.headerSubtitle}>{allTasksForCounts.filter((t) => t.status !== 'DONE').length} active</Text>
          </View>
        </View>
      )}

      <CategoryFilterTrigger
        label={`${FILTER_LABEL[filter]} · ${countFor(filter)}`}
        onPress={() => setCategoryPickerVisible(true)}
      />
      <CategoryFilterModal
        visible={categoryPickerVisible}
        onClose={() => setCategoryPickerVisible(false)}
        title="Filter by Status"
        categories={filterLabels}
        activeCategory={FILTER_LABEL[filter]}
        counts={filterCounts}
        onSelect={(label) => setFilter(filterForLabel(label))}
      />

      {isLoading ? (
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          <SkeletonList rows={5} />
        </ScrollView>
      ) : tasks.length === 0 ? (
        <View style={styles.emptyBox}>
          <Icon name="check-all" size={32} color={COLORS.muted} />
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptyDesc}>No tasks in this category.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {tasks.map((item) => (
            <TaskCard key={item.id} item={item} assigneeName={assigneeName(item.assignedToId)} />
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => { resetForm(); setAddVisible(true); }}>
        <Icon name="plus" size={24} color="#FFFFFF" />
        <Text style={styles.fabText}>Add Task</Text>
      </TouchableOpacity>

      {/* ---------- Add Task modal ---------- */}
      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => setAddVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalTitle, modalHeadingOverride(styles.modalTitle.fontSize)]}>New Task</Text>
                <CloseButton onPress={() => setAddVisible(false)} size={22} />
              </View>

              <Text style={styles.fieldLabel}>Title</Text>
              <View style={{ borderRadius: 8 }}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Restock cold brew concentrate"
                  placeholderTextColor={COLORS.placeholder}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              <Text style={styles.fieldLabel}>Assign To</Text>
              <View style={styles.chipWrap}>
                {staff.length === 0 && <Text style={{ color: COLORS.muted, fontSize: 12 }}>No staff yet — add some in Team Portal.</Text>}
                {staff.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.pickChip, assigneeId === s.id && styles.pickChipActive]}
                    onPress={() => setAssigneeId(s.id)}
                  >
                    <Text style={[styles.pickChipText, assigneeId === s.id && styles.pickChipTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.chipWrap}>
                {PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.pickChip,
                      priority === p && { backgroundColor: PRIORITY_COLOR[p], borderColor: PRIORITY_COLOR[p] },
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text style={[styles.pickChipText, priority === p && styles.pickChipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Due</Text>
              <View style={styles.chipWrap}>
                {DUE_OPTIONS.map((d, idx) => (
                  <TouchableOpacity
                    key={d.label}
                    style={[styles.pickChip, dueIdx === idx && styles.pickChipActive]}
                    onPress={() => setDueIdx(idx)}
                  >
                    <Text style={[styles.pickChipText, dueIdx === idx && styles.pickChipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setAddVisible(false); resetForm(); }}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddTask} disabled={createTask.isPending}>
                  <Icon name="check" size={16} color="#FFFFFF" />
                  <Text style={styles.modalSaveText}>Create Task</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, paddingHorizontal: isDesktopWeb ? 12 : 12, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: isDesktopWeb ? -8 : -6 },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  headerSubtitle: { fontSize: 13, color: COLORS.muted, marginTop: isDesktopWeb ? 2 : 1.5 },
  card: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 10 : 10.5,
    marginBottom: isDesktopWeb ? 9 : 9,
    borderLeftWidth: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 5 : 4.5 },
  cardTitle: { flex: 1, fontWeight: '700', fontSize: isDesktopWeb ? 15 : 14, color: COLORS.heading },
  menuBtn: { padding: isDesktopWeb ? 3 : 3 },
  desc: { fontSize: 12, lineHeight: 18, color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 3, flexWrap: 'wrap' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: 11, color: COLORS.muted },
  metaOverdue: { color: COLORS.dangerAccent, fontWeight: '700' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 5 : 4.5, marginTop: isDesktopWeb ? 6 : 6 },
  tag: { paddingHorizontal: isDesktopWeb ? 6 : 6, paddingVertical: isDesktopWeb ? 2 : 2.25, borderRadius: 999, backgroundColor: COLORS.chipBg },
  tagText: { fontSize: 10, fontWeight: '600', color: COLORS.muted },
  statusPillRow: { flexDirection: 'row', marginTop: isDesktopWeb ? 8 : 7.5 },
  statusPill: { paddingHorizontal: isDesktopWeb ? 8 : 7.5, paddingVertical: isDesktopWeb ? 3 : 3, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: isDesktopWeb ? 60 : 60, gap: isDesktopWeb ? 6 : 6 },
  emptyTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '700', color: COLORS.heading },
  emptyDesc: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingHorizontal: isDesktopWeb ? 15 : 15,
    paddingVertical: isDesktopWeb ? 12 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { fontSize: isDesktopWeb ? 14 : 12, fontWeight: '700', color: '#FFFFFF' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(43,24,16,0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 23 : 22.5 },
  pickerSheet: { width: '100%', maxWidth: 420, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 14 : 13.5 },
  pickerTitle: { fontSize: isDesktopWeb ? 15 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 9 : 9 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9, paddingVertical: isDesktopWeb ? 9 : 9 },
  pickerRowText: { flex: 1, fontSize: isDesktopWeb ? 14 : 12, color: COLORS.heading, fontWeight: '600' },
  pickerRowTextActive: { color: COLORS.accent, fontWeight: '800' },
  pickerDivider: { height: 1, backgroundColor: COLORS.divider, marginVertical: isDesktopWeb ? 5 : 4.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,24,16,0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 15 : 15 },
  modalSheet: { width: '100%', maxWidth: 460, maxHeight: '85%', backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 12 : 12, overflow: 'hidden' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isDesktopWeb ? 6 : 6 },
  modalTitle: { fontSize: isDesktopWeb ? 16 : 14, fontWeight: '800', color: COLORS.heading, marginBottom: isDesktopWeb ? 6 : 6, flexShrink: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.heading, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 5 : 4.5 },
  input: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: isDesktopWeb ? 8 : 7.5,
    height: 34,
    fontSize: isDesktopWeb ? 12 : 16,
    color: COLORS.heading,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 6 },
  pickChip: {
    paddingHorizontal: isDesktopWeb ? 11 : 10.5,
    paddingVertical: isDesktopWeb ? 7 : 6.75,
    borderRadius: 14,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pickChipActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  pickChipText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  pickChipTextActive: { color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 16.5 },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: 10.5,
  },
  modalCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  modalSaveBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingVertical: 10.5,
  },
  modalSaveText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
