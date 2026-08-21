import React, { useMemo, useState } from 'react';
import { CloseButton } from '../../../../../shared/components/atoms/CloseButton';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { InitialsAvatar } from '../../../../../shared/components/InitialsAvatar';
import { showToast } from '../../../../../core/store/uiSlice';
import { useStaff, useShifts, usePerformance, useUpdateStaff, useResetStaffPassword, useStaffFinancialDetails, useGrantStaffAccess, useUpdateStaffStatus, useDeleteStaff } from '../../../../../core/api/hooks/useStaff';
import { useBranches } from '../../../../../core/api/hooks/useBranches';
import { pickImageAsDataUri } from '../../../../../core/utils/imagePicker';
import { getApiErrorMessage } from '../../../../../core/network/api';
import { usePlanCategory } from '../../../../../core/plan/planCategory';
import { isOwnerOrManager } from '../../../../../core/auth/permissions';
import { SalaryType, StaffStatus, LoginRole, LOGIN_ROLES, LOGIN_ROLE_LABEL } from '../../../../../core/api/staffApi';
import { SkeletonProfileHeader, SkeletonText, SkeletonList } from '../../../../../shared/components/atoms/Skeleton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const SALARY_TYPES: SalaryType[] = ['MONTHLY', 'DAILY', 'HOURLY'];
const STAFF_STATUSES: StaffStatus[] = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'];
const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On Leave',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
};

const formatShiftDate = (iso: string) => {
  const d = new Date(iso);
  return { month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(), day: d.getDate().toString() };
};

const formatShiftTime = (startsAt: string, endsAt: string) => {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const hours = (e.getTime() - s.getTime()) / 3600000;
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${fmt(s)} - ${fmt(e)} (${hours.toFixed(1)} hrs)`;
};

export const StaffProfileScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const staffId: number | undefined = route?.params?.staffId;
  const { hasPlan } = usePlanCategory();
  // Shifts/Performance are Plus-only on the backend (see StaffController) — gating the
  // queries themselves avoids a silent 403 turning into a misleading "no shifts yet"
  // empty state for a Basic-plan cafe.
  const showPlusSections = hasPlan('PLUS');
  const { data: allStaff = [], isLoading: staffLoading, isError: staffIsError, refetch: refetchStaff } = useStaff();
  const { data: branches = [] } = useBranches();
  const { data: shifts = [], isLoading: shiftsLoading } = useShifts(staffId ?? null, showPlusSections);
  const staffHasLogin = allStaff.find((s) => s.id === staffId)?.hasLogin ?? false;
  const { data: performance } = usePerformance(staffId ?? null, showPlusSections);
  const updateStaff = useUpdateStaff();
  const resetPassword = useResetStaffPassword();
  const grantAccess = useGrantStaffAccess();
  const updateStatus = useUpdateStaffStatus();
  const deleteStaff = useDeleteStaff();
  const role = useSelector((s: any) => s.auth.user?.role);
  const canViewFinancials = isOwnerOrManager(role);
  const canManage = isOwnerOrManager(role);
  // Only an Owner can grant another Owner login — Manager still sees the regular list
  // (backend enforces this too; see StaffController.GrantAccess).
  const grantRoleOptions = role === 'Owner' ? (['Owner', ...LOGIN_ROLES] as LoginRole[]) : LOGIN_ROLES;
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [newLoginPassword, setNewLoginPassword] = useState('');
  const [grantAccessOpen, setGrantAccessOpen] = useState(false);
  const [grantPhone, setGrantPhone] = useState('');
  const [grantPassword, setGrantPassword] = useState('');
  const [grantLoginRole, setGrantLoginRole] = useState<LoginRole>('Waiter');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [hrModalOpen, setHrModalOpen] = useState(false);
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [salaryType, setSalaryType] = useState<SalaryType>('MONTHLY');
  const [basicSalary, setBasicSalary] = useState('');

  const [financialsExpanded, setFinancialsExpanded] = useState(false);
  const [revealFinancials, setRevealFinancials] = useState(false);
  const { data: financials } = useStaffFinancialDetails(staffId ?? null, revealFinancials, canViewFinancials && financialsExpanded);
  const [financialsModalOpen, setFinancialsModalOpen] = useState(false);
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');

  const openHrModal = () => {
    if (!staff) return;
    setDepartment(staff.department ?? '');
    setDesignation(staff.designation ?? '');
    setSalaryType(staff.salaryType);
    setBasicSalary(staff.basicSalary != null ? String(staff.basicSalary) : '');
    setHrModalOpen(true);
  };

  const saveHrDetails = async () => {
    if (!staff) return;
    const parsedSalary = basicSalary ? parseFloat(basicSalary) : undefined;
    if (parsedSalary !== undefined && (isNaN(parsedSalary) || parsedSalary < 0)) {
      dispatch(showToast({ message: 'Enter a valid, non-negative salary.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await updateStaff.mutateAsync({
        id: staff.id,
        req: {
          department: department.trim() || undefined,
          designation: designation.trim() || undefined,
          salaryType,
          basicSalary: parsedSalary,
        },
      });
      setHrModalOpen(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save HR details'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const openFinancialsModal = () => {
    setBankAccountNumber(financials?.revealed ? financials.bankAccountNumber ?? '' : '');
    setBankIfsc(financials?.bankIfsc ?? '');
    setBankName(financials?.bankName ?? '');
    setAadhaar(financials?.revealed ? financials.aadhaar ?? '' : '');
    setPan(financials?.revealed ? financials.pan ?? '' : '');
    setFinancialsModalOpen(true);
  };

  const saveFinancials = async () => {
    if (!staff) return;
    const trimmedAccount = bankAccountNumber.trim();
    const trimmedIfsc = bankIfsc.trim();
    const trimmedAadhaar = aadhaar.trim();
    const trimmedPan = pan.trim();
    if (trimmedAccount && !/^\d{9,18}$/.test(trimmedAccount)) {
      dispatch(showToast({ message: 'Bank account number should be 9-18 digits.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (trimmedIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmedIfsc)) {
      dispatch(showToast({ message: 'Enter a valid IFSC code (e.g. SBIN0001234).', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (trimmedAadhaar && !/^\d{12}$/.test(trimmedAadhaar)) {
      dispatch(showToast({ message: 'Aadhaar number must be exactly 12 digits.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (trimmedPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(trimmedPan)) {
      dispatch(showToast({ message: 'Enter a valid PAN (e.g. ABCDE1234F).', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await updateStaff.mutateAsync({
        id: staff.id,
        req: {
          bankAccountNumber: trimmedAccount || undefined,
          bankIfsc: trimmedIfsc || undefined,
          bankName: bankName.trim() || undefined,
          aadhaar: trimmedAadhaar || undefined,
          pan: trimmedPan || undefined,
        },
      });
      setFinancialsModalOpen(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not save financial details'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const staff = useMemo(() => allStaff.find((s) => s.id === staffId), [allStaff, staffId]);
  const branchName = useMemo(() => branches.find((b) => b.id === staff?.branchId)?.name, [branches, staff]);
  const recentShifts = useMemo(
    () => [...shifts].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()).slice(0, 5),
    [shifts],
  );

  const handleUploadPhoto = async () => {
    if (!staff) return;
    try {
      setUploadingPhoto(true);
      const dataUri = await pickImageAsDataUri();
      if (!dataUri) return; // user cancelled the file dialog
      await updateStaff.mutateAsync({ id: staff.id, req: { photoUrl: dataUri } });
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not upload photo'), icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSelectBranch = async (branchId: number) => {
    if (!staff) return;
    try {
      await updateStaff.mutateAsync({ id: staff.id, req: { branchId } });
      setBranchPickerOpen(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update branch'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleResetPassword = async () => {
    if (!staff) return;
    if (newLoginPassword.length < 6) {
      dispatch(showToast({ message: 'Password must be at least 6 characters.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await resetPassword.mutateAsync({ id: staff.id, newPassword: newLoginPassword });
      setResetPasswordOpen(false);
      setNewLoginPassword('');
      dispatch(showToast({ message: `Password updated for ${staff.name}.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not reset password'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleGrantAccess = async () => {
    if (!staff) return;
    if (!grantPhone.trim() || !/^\d{10}$/.test(grantPhone.trim())) {
      dispatch(showToast({ message: 'Enter a valid 10-digit mobile number.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    if (grantPassword.length < 6) {
      dispatch(showToast({ message: 'Password must be at least 6 characters.', icon: 'alert-circle-outline', tone: 'warning' }));
      return;
    }
    try {
      await grantAccess.mutateAsync({ id: staff.id, req: { phone: grantPhone.trim(), password: grantPassword, loginRole: grantLoginRole } });
      setGrantAccessOpen(false);
      setGrantPhone('');
      setGrantPassword('');
      setGrantLoginRole('Waiter');
      dispatch(showToast({ message: `${staff.name} can now log in to the app.`, icon: 'check-circle', tone: 'success' }));
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not give app access'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleUpdateStatus = async (status: StaffStatus) => {
    if (!staff) return;
    try {
      await updateStatus.mutateAsync({ id: staff.id, status });
      setStatusPickerOpen(false);
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not update status'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  const handleDeleteStaff = async () => {
    if (!staff) return;
    try {
      await deleteStaff.mutateAsync(staff.id);
      setDeleteConfirmOpen(false);
      navigation?.goBack?.();
    } catch (err) {
      dispatch(showToast({ message: getApiErrorMessage(err, 'Could not remove staff member'), icon: 'alert-circle-outline', tone: 'danger' }));
    }
  };

  if (staffIsError && allStaff.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Couldn't load staff profile"
          message="Check your connection and try again."
          onRetry={() => refetchStaff()}
        />
      </View>
    );
  }

  if (staffLoading) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 16 }}>
          <SkeletonProfileHeader style={{ marginBottom: 24 }} />
          <SkeletonText lines={2} style={{ marginBottom: 16 }} />
          <SkeletonText lines={2} style={{ marginBottom: 16 }} />
          <SkeletonText lines={2} style={{ marginBottom: 16 }} />
        </View>
      </View>
    );
  }

  if (!staff) {
    return (
      <View style={styles.container}>
        <DesktopPageHeader icon="account-circle-outline" title="Staff Profile" onBack={() => navigation?.goBack?.()} />
        {!isDesktopWeb && (
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
              <Icon name="arrow-left" size={22} color={COLORS.heading} />
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.notFoundText}>Staff member not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="account-circle-outline" title="Staff Profile" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Staff Profile</Text>
          <View style={{ flex: 1 }} />
          {staff.photoUrl ? (
            <Image source={{ uri: staff.photoUrl }} style={styles.headerAvatar} />
          ) : (
            <InitialsAvatar name={staff.name} size={34} />
          )}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.profileWrap}>
          <View style={styles.photoWrap}>
            {staff.photoUrl ? (
              <Image source={{ uri: staff.photoUrl }} style={styles.photo} />
            ) : (
              <InitialsAvatar name={staff.name} size={100} style={styles.photo} />
            )}
            {staff.status === 'ACTIVE' && <View style={styles.onlineDot} />}
            <TouchableOpacity style={styles.photoEditBtn} onPress={handleUploadPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="camera" size={14} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{staff.name}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>{staff.role.toUpperCase()}</Text>
            </View>
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>{staff.status === 'ACTIVE' ? 'Active' : staff.status.replace('_', ' ')}</Text>
            </View>
          </View>
        </View>

        {showPlusSections && (
          <>
            <Text style={styles.sectionLabel}>PERFORMANCE (LIVE FROM ORDERS)</Text>
            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Attendance</Text>
                {performance?.attendanceRatePct != null ? (
                  <>
                    <View style={styles.metricValueRow}>
                      <Text style={styles.metricValue}>{performance.attendanceRatePct}%</Text>
                    </View>
                    <View style={styles.metricBar}>
                      <View style={[styles.metricBarFill, { width: `${Math.min(100, performance.attendanceRatePct)}%` }]} />
                    </View>
                  </>
                ) : (
                  <Text style={styles.metricEmptyHint}>No completed shifts yet</Text>
                )}
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Orders Handled</Text>
                <Text style={styles.metricValue}>{performance?.totalOrders ?? 0}</Text>
              </View>
            </View>

            <View style={styles.wideMetricCard}>
              <Text style={styles.metricLabel}>Revenue Generated</Text>
              <Text style={styles.wideMetricValue}>₹{(performance?.totalRevenue ?? 0).toFixed(2)}</Text>
              <Text style={styles.wideMetricHint}>Across every order this staff member served, whether or not they have an app login</Text>
            </View>
          </>
        )}

        <View style={styles.roleCard}>
          <View style={styles.roleCardHeader}>
            <Text style={styles.roleCardTitle}>Contact & Workspace</Text>
            <Icon name="information-outline" size={18} color={COLORS.muted} />
          </View>
          <TouchableOpacity style={styles.roleItem} onPress={() => setBranchPickerOpen(true)}>
            <View style={styles.roleItemIcon}>
              <Icon name="storefront-outline" size={18} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roleItemLabel}>BRANCH</Text>
              <Text style={styles.roleItemValue}>{branchName ?? 'Unassigned'}</Text>
            </View>
            <Icon name="pencil-outline" size={16} color={COLORS.muted} />
          </TouchableOpacity>
          {!!staff.email && (
            <View style={styles.roleItem}>
              <View style={styles.roleItemIcon}>
                <Icon name="email-outline" size={18} color={COLORS.accent} />
              </View>
              <View>
                <Text style={styles.roleItemLabel}>EMAIL</Text>
                <Text style={styles.roleItemValue}>{staff.email}</Text>
              </View>
            </View>
          )}
          {!!staff.phone && (
            <View style={styles.roleItem}>
              <View style={styles.roleItemIcon}>
                <Icon name="phone-outline" size={18} color={COLORS.accent} />
              </View>
              <View>
                <Text style={styles.roleItemLabel}>PHONE</Text>
                <Text style={styles.roleItemValue}>{staff.phone}</Text>
              </View>
            </View>
          )}
          {!!staff.hourlyRate && (
            <View style={styles.roleItem}>
              <View style={styles.roleItemIcon}>
                <Icon name="cash-multiple" size={18} color={COLORS.accent} />
              </View>
              <View>
                <Text style={styles.roleItemLabel}>HOURLY RATE</Text>
                <Text style={styles.roleItemValue}>₹{staff.hourlyRate.toFixed(2)}/hr</Text>
              </View>
            </View>
          )}
          <TouchableOpacity style={styles.roleItem} onPress={openHrModal}>
            <View style={styles.roleItemIcon}>
              <Icon name="badge-account-outline" size={18} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roleItemLabel}>HR DETAILS</Text>
              <Text style={styles.roleItemValue}>
                {[staff.department, staff.designation].filter(Boolean).join(' · ') || 'Add department & designation'}
              </Text>
              <Text style={styles.roleItemSubValue}>
                {staff.salaryType} salary{staff.basicSalary != null ? ` · ₹${staff.basicSalary.toFixed(2)}` : ''}
              </Text>
            </View>
            <Icon name="pencil-outline" size={16} color={COLORS.muted} />
          </TouchableOpacity>
          {canManage && (
            <TouchableOpacity style={styles.roleItem} onPress={() => setStatusPickerOpen(true)}>
              <View style={styles.roleItemIcon}>
                <Icon name="account-clock-outline" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleItemLabel}>STATUS</Text>
                <Text style={styles.roleItemValue}>{STAFF_STATUS_LABEL[staff.status]}</Text>
              </View>
              <Icon name="pencil-outline" size={16} color={COLORS.muted} />
            </TouchableOpacity>
          )}
          {!staff.hasLogin && canManage && (
            <TouchableOpacity style={styles.roleItem} onPress={() => setGrantAccessOpen(true)}>
              <View style={styles.roleItemIcon}>
                <Icon name="key-plus" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleItemLabel}>APP LOGIN</Text>
                <Text style={styles.roleItemValue}>Give app access</Text>
              </View>
              <Icon name="chevron-right" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
          {staff.hasLogin && (
            <TouchableOpacity style={styles.roleItem} onPress={() => setResetPasswordOpen(true)}>
              <View style={styles.roleItemIcon}>
                <Icon name="lock-reset" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleItemLabel}>APP LOGIN</Text>
                <Text style={styles.roleItemValue}>Reset password</Text>
              </View>
              <Icon name="chevron-right" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
          {staff.hasLogin && canManage && (
            <TouchableOpacity
              style={styles.roleItem}
              onPress={() => navigation.navigate('StaffAccess', { staffId: staff.id, staffName: staff.name })}
            >
              <View style={styles.roleItemIcon}>
                <Icon name="shield-key-outline" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleItemLabel}>SCREEN ACCESS</Text>
                <Text style={styles.roleItemValue}>Choose which screens {staff.name.split(' ')[0]} can see</Text>
              </View>
              <Icon name="chevron-right" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
          {staff.hasLogin && canManage && (
            <TouchableOpacity
              style={styles.roleItem}
              onPress={() => navigation.navigate('StaffKitchenAssignment', { staffId: staff.id, staffName: staff.name })}
            >
              <View style={styles.roleItemIcon}>
                <Icon name="chef-hat" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleItemLabel}>KITCHEN ASSIGNMENT</Text>
                <Text style={styles.roleItemValue}>Pin {staff.name.split(' ')[0]}'s KDS to one kitchen</Text>
              </View>
              <Icon name="chevron-right" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        {canManage && (
          <TouchableOpacity style={styles.dangerCard} onPress={() => setDeleteConfirmOpen(true)}>
            <Icon name="trash-can-outline" size={18} color={COLORS.dangerAccent} />
            <Text style={styles.dangerCardText}>Remove Staff Member</Text>
          </TouchableOpacity>
        )}

        {canViewFinancials && (
          <View style={styles.roleCard}>
            <TouchableOpacity style={styles.roleCardHeader} onPress={() => setFinancialsExpanded((v) => !v)}>
              <Text style={styles.roleCardTitle}>Financial Details</Text>
              <Icon name={financialsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.muted} />
            </TouchableOpacity>
            {financialsExpanded && (
              <>
                <View style={styles.roleItem}>
                  <View style={styles.roleItemIcon}>
                    <Icon name="bank-outline" size={18} color={COLORS.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleItemLabel}>BANK ACCOUNT</Text>
                    <Text style={styles.roleItemValue}>{financials?.bankAccountNumber ?? '—'}{financials?.bankIfsc ? ` · ${financials.bankIfsc}` : ''}</Text>
                  </View>
                </View>
                <View style={styles.roleItem}>
                  <View style={styles.roleItemIcon}>
                    <Icon name="card-account-details-outline" size={18} color={COLORS.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleItemLabel}>AADHAAR</Text>
                    <Text style={styles.roleItemValue}>{financials?.aadhaar ?? '—'}</Text>
                  </View>
                </View>
                <View style={styles.roleItem}>
                  <View style={styles.roleItemIcon}>
                    <Icon name="card-account-details" size={18} color={COLORS.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleItemLabel}>PAN</Text>
                    <Text style={styles.roleItemValue}>{financials?.pan ?? '—'}</Text>
                  </View>
                </View>
                <View style={styles.financialsActionRow}>
                  <TouchableOpacity style={styles.financialsActionBtn} onPress={() => setRevealFinancials((v) => !v)}>
                    <Icon name={revealFinancials ? 'eye-off-outline' : 'eye-outline'} size={16} color={COLORS.heading} />
                    <Text style={styles.financialsActionText}>{revealFinancials ? 'Hide' : 'Reveal'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.financialsActionBtn} onPress={openFinancialsModal}>
                    <Icon name="pencil-outline" size={16} color={COLORS.heading} />
                    <Text style={styles.financialsActionText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {showPlusSections && (
          <>
            <View style={styles.shiftHeader}>
              <Text style={styles.sectionLabelInline}>RECENT SHIFT HISTORY</Text>
            </View>

            {shiftsLoading ? (
              <SkeletonList rows={3} style={{ marginTop: 10, paddingHorizontal: 16 }} />
            ) : recentShifts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No shifts scheduled yet.</Text>
              </View>
            ) : (
              recentShifts.map((s) => {
                const { month, day } = formatShiftDate(s.startsAt);
                return (
                  <View key={s.id} style={styles.shiftCard}>
                    <View style={styles.shiftDate}>
                      <Text style={styles.shiftMonth}>{month}</Text>
                      <Text style={styles.shiftDay}>{day}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shiftTitle}>{s.notes || 'Shift'}</Text>
                      <Text style={styles.shiftTime}>{formatShiftTime(s.startsAt, s.endsAt)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={branchPickerOpen} transparent animationType="fade" onRequestClose={() => setBranchPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Select Branch</Text>
              <CloseButton onPress={() => setBranchPickerOpen(false)} size={18} />
            </View>
            {branches.length === 0 ? (
              <Text style={styles.emptyText}>No branches yet — create one in Branch Management first.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {branches.map((b) => (
                  <TouchableOpacity key={b.id} style={styles.pickerRow} onPress={() => handleSelectBranch(b.id)}>
                    <Text style={styles.pickerRowText}>{b.name}</Text>
                    <Text style={styles.pickerRowSub}>{b.address}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setBranchPickerOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={resetPasswordOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { setResetPasswordOpen(false); setNewLoginPassword(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Reset Password</Text>
              <CloseButton onPress={() => { setResetPasswordOpen(false); setNewLoginPassword(''); }} size={18} />
            </View>
            <Text style={styles.resetPasswordHint}>
              Set a new app login password for {staff.name}. They'll be signed out of any other devices.
            </Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.resetPasswordInput}
                placeholder="New password (min 6 characters)"
                placeholderTextColor={COLORS.placeholder}
                value={newLoginPassword}
                onChangeText={setNewLoginPassword}
                secureTextEntry
                autoFocus
              />
            </View>
            <View style={styles.resetPasswordActions}>
              <TouchableOpacity
                style={styles.resetPasswordCancelBtn}
                onPress={() => { setResetPasswordOpen(false); setNewLoginPassword(''); }}
              >
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resetPasswordConfirmBtn}
                onPress={handleResetPassword}
                disabled={resetPassword.isPending}
              >
                <Text style={styles.resetPasswordConfirmText}>{resetPassword.isPending ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={hrModalOpen} transparent animationType="fade" onRequestClose={() => setHrModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>HR Details</Text>
              <CloseButton onPress={() => setHrModalOpen(false)} size={18} />
            </View>
            <Text style={styles.fieldLabel}>Department</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} placeholder="e.g. Kitchen" placeholderTextColor={COLORS.placeholder} value={department} onChangeText={setDepartment} />
            </View>
            <Text style={styles.fieldLabel}>Designation</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} placeholder="e.g. Senior Barista" placeholderTextColor={COLORS.placeholder} value={designation} onChangeText={setDesignation} />
            </View>
            <Text style={styles.fieldLabel}>Salary Type</Text>
            <View style={styles.typeRow}>
              {SALARY_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[styles.typePill, salaryType === t && styles.typePillActive]} onPress={() => setSalaryType(t)}>
                  <Text style={[styles.typePillText, salaryType === t && styles.typePillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>{salaryType === 'HOURLY' ? 'Basic Salary (not used for hourly staff)' : salaryType === 'DAILY' ? 'Day Rate' : 'Monthly Basic Salary'}</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={COLORS.placeholder} value={basicSalary} onChangeText={setBasicSalary} />
            </View>
            <View style={styles.resetPasswordActions}>
              <TouchableOpacity style={styles.resetPasswordCancelBtn} onPress={() => setHrModalOpen(false)}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetPasswordConfirmBtn} onPress={saveHrDetails} disabled={updateStaff.isPending}>
                <Text style={styles.resetPasswordConfirmText}>{updateStaff.isPending ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={financialsModalOpen} transparent animationType="fade" onRequestClose={() => setFinancialsModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Edit Financial Details</Text>
              <CloseButton onPress={() => setFinancialsModalOpen(false)} size={18} />
            </View>
            <Text style={styles.fieldLabel}>Bank Account Number</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} placeholderTextColor={COLORS.placeholder} value={bankAccountNumber} onChangeText={setBankAccountNumber} />
            </View>
            <Text style={styles.fieldLabel}>IFSC</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} placeholderTextColor={COLORS.placeholder} value={bankIfsc} onChangeText={setBankIfsc} autoCapitalize="characters" />
            </View>
            <Text style={styles.fieldLabel}>Bank Name</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} placeholderTextColor={COLORS.placeholder} value={bankName} onChangeText={setBankName} />
            </View>
            <Text style={styles.fieldLabel}>Aadhaar</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} placeholderTextColor={COLORS.placeholder} value={aadhaar} onChangeText={setAadhaar} keyboardType="number-pad" />
            </View>
            <Text style={styles.fieldLabel}>PAN</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput style={styles.resetPasswordInput} placeholderTextColor={COLORS.placeholder} value={pan} onChangeText={setPan} autoCapitalize="characters" />
            </View>
            <View style={styles.resetPasswordActions}>
              <TouchableOpacity style={styles.resetPasswordCancelBtn} onPress={() => setFinancialsModalOpen(false)}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetPasswordConfirmBtn} onPress={saveFinancials} disabled={updateStaff.isPending}>
                <Text style={styles.resetPasswordConfirmText}>{updateStaff.isPending ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={grantAccessOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { setGrantAccessOpen(false); setGrantPhone(''); setGrantPassword(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Give App Access</Text>
              <TouchableOpacity
                onPress={() => { setGrantAccessOpen(false); setGrantPhone(''); setGrantPassword(''); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.resetPasswordHint}>
              Lets {staff.name} log in to PrabandhOS on this cafe's account.
            </Text>
            <Text style={styles.fieldLabel}>Login mobile number</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.resetPasswordInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={COLORS.placeholder}
                value={grantPhone}
                onChangeText={setGrantPhone}
                maxLength={10}
                keyboardType="phone-pad"
              />
            </View>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.resetPasswordInput}
                placeholder="Min 6 characters"
                placeholderTextColor={COLORS.placeholder}
                value={grantPassword}
                onChangeText={setGrantPassword}
                secureTextEntry
              />
            </View>
            <Text style={styles.fieldLabel}>Login role</Text>
            <View style={styles.typeRow}>
              {grantRoleOptions.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.typePill, grantLoginRole === r && styles.typePillActive]}
                  onPress={() => setGrantLoginRole(r)}
                >
                  <Text style={[styles.typePillText, grantLoginRole === r && styles.typePillTextActive]}>{LOGIN_ROLE_LABEL[r]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.resetPasswordActions}>
              <TouchableOpacity
                style={styles.resetPasswordCancelBtn}
                onPress={() => { setGrantAccessOpen(false); setGrantPhone(''); setGrantPassword(''); }}
              >
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetPasswordConfirmBtn} onPress={handleGrantAccess} disabled={grantAccess.isPending}>
                <Text style={styles.resetPasswordConfirmText}>{grantAccess.isPending ? 'Saving…' : 'Give Access'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={statusPickerOpen} transparent animationType="fade" onRequestClose={() => setStatusPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Set Status</Text>
              <CloseButton onPress={() => setStatusPickerOpen(false)} size={18} />
            </View>
            {STAFF_STATUSES.map((s) => (
              <TouchableOpacity key={s} style={styles.pickerRow} onPress={() => handleUpdateStatus(s)} disabled={updateStatus.isPending}>
                <Text style={styles.pickerRowText}>{STAFF_STATUS_LABEL[s]}</Text>
                {staff.status === s && <Icon name="check" size={16} color={COLORS.accent} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setStatusPickerOpen(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteConfirmOpen} transparent animationType="fade" onRequestClose={() => setDeleteConfirmOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Remove Staff Member</Text>
              <CloseButton onPress={() => setDeleteConfirmOpen(false)} size={18} />
            </View>
            <Text style={styles.resetPasswordHint}>
              This permanently removes {staff.name} from your roster{staff.hasLogin ? ' and revokes their app login' : ''}. This can't be undone.
            </Text>
            <View style={styles.resetPasswordActions}>
              <TouchableOpacity style={styles.resetPasswordCancelBtn} onPress={() => setDeleteConfirmOpen(false)}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerConfirmBtn} onPress={handleDeleteStaff} disabled={deleteStaff.isPending}>
                <Text style={styles.resetPasswordConfirmText}>{deleteStaff.isPending ? 'Removing…' : 'Remove'}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 9 : 9,
    paddingTop: isDesktopWeb ? 9 : 9,
    paddingBottom: isDesktopWeb ? 6 : 6,
    gap: isDesktopWeb ? 4 : 4.5,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  headerAvatar: { width: 34, height: 34, borderRadius: 17 },
  notFoundText: { textAlign: 'center', color: COLORS.muted, marginTop: isDesktopWeb ? 40 : 30, fontSize: isDesktopWeb ? 14 : 12 },
  profileWrap: { alignItems: 'center', paddingVertical: isDesktopWeb ? 12 : 12 },
  photoWrap: { position: 'relative', marginBottom: isDesktopWeb ? 10 : 10.5 },
  photo: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: COLORS.cardAlt },
  onlineDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.success,
    borderWidth: 3,
    borderColor: COLORS.background,
  },
  photoEditBtn: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.heading,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  name: { fontSize: isDesktopWeb ? 24 : 12, fontWeight: 'bold', color: COLORS.heading, marginBottom: isDesktopWeb ? 7 : 7.5 },
  badgeRow: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6 },
  rolePill: { backgroundColor: COLORS.vibeCrema, paddingHorizontal: isDesktopWeb ? 9 : 9, paddingVertical: isDesktopWeb ? 4 : 3.75, borderRadius: 12 },
  rolePillText: { fontSize: 11, fontWeight: '700', color: COLORS.heading },
  activePill: { backgroundColor: COLORS.successBg, paddingHorizontal: isDesktopWeb ? 9 : 9, paddingVertical: isDesktopWeb ? 4 : 3.75, borderRadius: 12 },
  activePillText: { fontSize: 11, fontWeight: '700', color: COLORS.success },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 9 : 9,
  },
  metricRow: { flexDirection: 'row', paddingHorizontal: isDesktopWeb ? 12 : 12, gap: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 9 : 9 },
  metricCard: { flex: 1, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12 },
  metricLabel: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 6 },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 4 : 4.5 },
  metricValue: { fontSize: isDesktopWeb ? 26 : 12, fontWeight: 'bold', color: COLORS.heading },
  metricValueSub: { fontSize: isDesktopWeb ? 14 : 12, color: COLORS.muted },
  metricEmptyHint: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 4 : 4.5 },
  metricBar: { height: 6, borderRadius: 3, backgroundColor: COLORS.background, marginTop: isDesktopWeb ? 7 : 7.5, overflow: 'hidden' },
  metricBarFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.button },
  starsRow: { flexDirection: 'row', gap: isDesktopWeb ? 2 : 2.25, marginTop: isDesktopWeb ? 6 : 6 },
  wideMetricCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 16 : 18,
  },
  wideMetricValue: { fontSize: isDesktopWeb ? 28 : 12, fontWeight: 'bold', color: COLORS.heading },
  wideMetricHint: { fontSize: isDesktopWeb ? 13 : 12, fontStyle: 'italic', color: COLORS.muted, marginTop: isDesktopWeb ? 3 : 3 },
  emptyCard: {
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 16 : 18,
    alignItems: 'center',
  },
  emptyText: { fontSize: isDesktopWeb ? 13 : 12, color: COLORS.muted },
  roleCard: {
    backgroundColor: COLORS.aiCardBg,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 13 : 13.5,
    marginBottom: isDesktopWeb ? 16 : 18,
  },
  roleCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isDesktopWeb ? 12 : 12 },
  roleCardTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  roleItem: { flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 9 : 9, backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 7 : 7.5 },
  roleItemIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: COLORS.proTipBg, alignItems: 'center', justifyContent: 'center' },
  roleItemLabel: { fontSize: 10, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5, marginBottom: isDesktopWeb ? 1.5 : 1.5 },
  roleItemValue: { fontSize: isDesktopWeb ? 15 : 12, fontWeight: '700', color: COLORS.heading },
  roleItemSubValue: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  financialsActionRow: { flexDirection: 'row', gap: isDesktopWeb ? 7 : 7.5, marginTop: isDesktopWeb ? 3 : 3 },
  financialsActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4 : 4.5, paddingVertical: isDesktopWeb ? 7 : 7.5, borderRadius: 6, backgroundColor: COLORS.cardAlt },
  financialsActionText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: isDesktopWeb ? 3 : 3, marginTop: isDesktopWeb ? 4 : 4.5 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 6 },
  typePill: { paddingHorizontal: isDesktopWeb ? 10 : 10.5, paddingVertical: isDesktopWeb ? 6 : 6, borderRadius: 20, backgroundColor: COLORS.cardAlt },
  typePillActive: { backgroundColor: COLORS.button },
  typePillText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  typePillTextActive: { color: '#FFFFFF' },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 9 : 9 },
  sectionLabelInline: { fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 },
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 7 : 7.5,
    gap: isDesktopWeb ? 9 : 9,
  },
  shiftDate: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftMonth: { fontSize: 10, fontWeight: '700', color: COLORS.muted },
  shiftDay: { fontSize: isDesktopWeb ? 16 : 12, fontWeight: 'bold', color: COLORS.heading },
  shiftTitle: { fontSize: isDesktopWeb ? 15 : 14, fontWeight: '700', color: COLORS.heading },
  shiftTime: { fontSize: 12, color: COLORS.muted, marginTop: isDesktopWeb ? 1.5 : 1.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43, 24, 16, 0.5)', justifyContent: 'center', alignItems: 'center', padding: isDesktopWeb ? 18 : 18 },
  pickerSheet: { width: '100%', maxWidth: 420, backgroundColor: COLORS.background, borderRadius: 12, padding: isDesktopWeb ? 10.5 : 10.5, maxHeight: '80%', overflow: 'hidden' },
  pickerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  pickerTitle: { fontSize: 12, fontWeight: '800', color: COLORS.heading, marginBottom: 6, flexShrink: 1 },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  pickerRowText: { fontSize: 12, color: COLORS.heading },
  pickerRowSub: { fontSize: 12, color: COLORS.muted },
  pickerCancelBtn: { alignItems: 'center', paddingVertical: 7.5, marginTop: 4.5 },
  pickerCancelText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  resetPasswordHint: { fontSize: 12, color: COLORS.muted, marginBottom: 7.5, lineHeight: 16 },
  resetPasswordInput: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 8,
    paddingHorizontal: 7.5,
    paddingVertical: 6,
    fontSize: 16,
    color: COLORS.heading,
  },
  resetPasswordActions: { flexDirection: 'row', gap: 6, marginTop: 6 },
  resetPasswordCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 7.5, borderRadius: 6 },
  resetPasswordConfirmBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7.5,
    borderRadius: 6,
    backgroundColor: COLORS.button,
  },
  resetPasswordConfirmText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  dangerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerBg,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    borderRadius: 8,
    paddingVertical: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 16 : 18,
  },
  dangerCardText: { fontSize: isDesktopWeb ? 14 : 13, fontWeight: '700', color: COLORS.dangerAccent },
  dangerConfirmBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7.5,
    borderRadius: 6,
    backgroundColor: COLORS.dangerAccent,
  },
});
