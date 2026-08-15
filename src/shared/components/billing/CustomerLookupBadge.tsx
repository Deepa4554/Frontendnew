import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../core/theme/useThemeColors';
import { RADIUS } from '../../design/commonStyles';
import { useCustomerByPhone } from '../../../core/api/hooks/useCustomers';

/**
 * Existing-vs-new indicator for any guest-phone entry point (POS Guest Details, Quick
 * Fire, WhatsApp prompt). Renders nothing until `phone` is a complete 10-digit number —
 * React Query dedupes by phone, so multiple badges mounted for the same in-progress
 * number (e.g. two modals sharing one draft field) share a single network call.
 */
export const CustomerLookupBadge: React.FC<{ phone: string }> = ({ phone }) => {
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS);
  const lookup = useCustomerByPhone(phone);

  if (phone.length !== 10) return null;

  if (lookup.isFetching) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={COLORS.muted} />
        <Text style={styles.checking}>Checking…</Text>
      </View>
    );
  }
  if (!lookup.data) return null;

  return lookup.data.exists ? (
    <View style={[styles.row, styles.badge, { backgroundColor: COLORS.successBg }]}>
      <Icon name="check-circle" size={14} color={COLORS.success} />
      <Text style={[styles.text, { color: COLORS.success }]}>Existing customer: {lookup.data.name}</Text>
    </View>
  ) : (
    <View style={[styles.row, styles.badge, { backgroundColor: COLORS.cardAlt }]}>
      <Icon name="account-plus-outline" size={14} color={COLORS.muted} />
      <Text style={[styles.text, { color: COLORS.muted }]}>New customer</Text>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  checking: { fontSize: 12, color: COLORS.muted },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.button, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '600' },
});
