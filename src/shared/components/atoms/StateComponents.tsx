import React from 'react';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useResponsive } from '../../../core/utils/useResponsive';

// ─── Empty State ─────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox-outline',
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const { isDesktopWeb } = useResponsive();
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <Icon name={icon} size={64} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>{title}</Text>
      {description && (
        <Text style={[styles.emptyDescription, { color: theme.colors.onSurfaceVariant }]}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button mode="contained" onPress={onAction} style={styles.actionButton}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
};

// ─── Error State ─────────────────────────────────────────────────────────────
interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
}) => {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <Icon name="alert-circle-outline" size={64} color={theme.colors.error} style={{ opacity: 0.6 }} />
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>{title}</Text>
      <Text style={[styles.emptyDescription, { color: theme.colors.onSurfaceVariant }]}>{message}</Text>
      {onRetry && (
        <Button mode="contained" onPress={onRetry} style={styles.actionButton} buttonColor={theme.colors.error}>
          Retry
        </Button>
      )}
    </View>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  label: string;
}

const statusColors: Record<StatusBadgeProps['status'], { bg: string; text: string }> = {
  success: { bg: '#DCFCE7', text: '#15803D' },
  warning: { bg: '#FEF3C7', text: '#B45309' },
  error:   { bg: '#FEE2E2', text: '#B91C1C' },
  info:    { bg: '#DBEAFE', text: '#1D4ED8' },
  neutral: { bg: '#F1F5F9', text: '#475569' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const colors = statusColors[status];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{label}</Text>
    </View>
  );
};

// ─── Section Header ─────────────────────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, actionLabel, onAction }) => {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>{title}</Text>
      {actionLabel && onAction && (
        <Button mode="text" compact onPress={onAction}>{actionLabel}</Button>
      )}
    </View>
  );
};

// Module-scope styles can't use the reactive useResponsive() hook (no component
// context here) — a load-time width check is an acceptable static approximation for
// this file since it doesn't need to react to a live window resize.
const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 768;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: isDesktopWeb ? 32 : 24,
  },
  emptyTitle: {
    fontSize: isDesktopWeb ? 18 : 14,
    fontWeight: '700',
    marginTop: isDesktopWeb ? 16 : 12,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: isDesktopWeb ? 14 : 12,
    marginTop: isDesktopWeb ? 8 : 6,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButton: {
    marginTop: isDesktopWeb ? 24 : 18,
    paddingHorizontal: isDesktopWeb ? 16 : 12,
  },
  badge: {
    paddingHorizontal: isDesktopWeb ? 8 : 6,
    paddingVertical: isDesktopWeb ? 3 : 2.25,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isDesktopWeb ? 12 : 9,
    marginTop: isDesktopWeb ? 4 : 3,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
});
