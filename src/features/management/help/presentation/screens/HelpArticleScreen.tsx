import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const RELATED = [
  { id: 'r1', title: 'Troubleshooting Paper Jams', icon: 'printer-alert' },
  { id: 'r2', title: 'Ethernet Setup Guide', icon: 'ethernet' },
];

export const HelpArticleScreen = ({ navigation }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="book-open-outline" title="Help Article" onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Help Center</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.iconBtn}>
            <Icon name="dots-vertical" size={22} color={COLORS.heading} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.breadcrumbRow}>
          <Text style={styles.breadcrumb}>HARDWARE</Text>
          <Icon name="chevron-right" size={13} color={COLORS.muted} />
          <Text style={styles.breadcrumb}>PRINTING</Text>
        </View>

        <Text style={styles.title}>Connecting your Receipt Printer</Text>

        <View style={styles.metaRow}>
          <Icon name="clock-outline" size={14} color={COLORS.muted} />
          <Text style={styles.metaText}>Last updated 2 days ago</Text>
          <Icon name="timer-sand" size={14} color={COLORS.muted} style={{ marginLeft: 12 }} />
          <Text style={styles.metaText}>5 min read</Text>
        </View>

        <View style={styles.introCard}>
          <Text style={styles.introText}>
            Setting up your receipt printer is a crucial step to ensuring your PrabandhOS system runs
            smoothly. This guide covers the physical connection and the software pairing process for
            standard Bluetooth and Ethernet thermal printers.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>1. Physical Installation</Text>
        <View style={styles.stepCard}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={styles.stepText}>Connect the power cable to the back of the printer and a wall outlet.</Text>
        </View>
        <View style={styles.stepCard}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={styles.stepText}>Insert the paper roll with the edge feeding from the bottom.</Text>
        </View>

        <Text style={styles.sectionTitle}>2. Pairing with PrabandhOS</Text>
        <View style={styles.pairCard}>
          <View style={styles.pairRow}>
            <Icon name="cog-outline" size={20} color={COLORS.heading} />
            <View style={styles.pairTextBox}>
              <Text style={styles.pairTitle}>Open App Settings</Text>
              <Text style={styles.pairDesc}>Tap on the menu icon and navigate to 'Hardware' &gt; 'Printers'.</Text>
            </View>
          </View>
          <View style={styles.pairRow}>
            <Icon name="magnify" size={20} color={COLORS.accent} />
            <View style={styles.pairTextBox}>
              <Text style={styles.pairTitle}>Scan for Devices</Text>
              <Text style={styles.pairDesc}>
                Ensure Bluetooth is enabled on your tablet. Tap 'Add New Printer' to begin searching.
              </Text>
            </View>
          </View>
          <View style={styles.proTip}>
            <Icon name="creation" size={16} color={COLORS.accent} />
            <Text style={styles.proTipText}>
              <Text style={styles.proTipBold}>Pro Tip: </Text>
              Most Star Micronics printers use '1234' as the default pairing PIN.
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.helpfulTitle}>Was this helpful?</Text>
        <View style={styles.helpfulRow}>
          <TouchableOpacity style={styles.helpfulBtn}>
            <Icon name="thumb-up-outline" size={16} color={COLORS.heading} />
            <Text style={styles.helpfulBtnText}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.helpfulBtn}>
            <Icon name="thumb-down-outline" size={16} color={COLORS.heading} />
            <Text style={styles.helpfulBtnText}>No</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Related Articles</Text>
        <View style={styles.relatedCard}>
          {RELATED.map((r, i) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.relatedRow, i !== RELATED.length - 1 && styles.relatedDivider]}
            >
              <Icon name={r.icon} size={18} color={COLORS.accent} />
              <Text style={styles.relatedText}>{r.title}</Text>
              <Icon name="chevron-right" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
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
    paddingHorizontal: isDesktopWeb ? 9 : 9,
    paddingTop: isDesktopWeb ? 9 : 9,
    paddingBottom: isDesktopWeb ? 6 : 6,
    gap: isDesktopWeb ? 3 : 3,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: isDesktopWeb ? 18 : 14,
    fontWeight: '700',
    color: COLORS.heading,
  },
  content: {
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingBottom: isDesktopWeb ? 30 : 30,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 3 : 3,
    marginTop: isDesktopWeb ? 6 : 6,
    marginBottom: isDesktopWeb ? 6 : 6,
  },
  breadcrumb: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: isDesktopWeb ? 26 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    lineHeight: 32,
    marginBottom: isDesktopWeb ? 7.5 : 7.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isDesktopWeb ? 3 : 3,
    marginBottom: isDesktopWeb ? 13.5 : 13.5,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.muted,
  },
  introCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 13.5 : 13.5,
  },
  introText: {
    fontSize: isDesktopWeb ? 14 : 12,
    color: COLORS.heading,
    lineHeight: 21,
  },
  sectionTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 10.5 : 10.5,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 10.5 : 10.5,
    marginBottom: isDesktopWeb ? 7.5 : 7.5,
    gap: isDesktopWeb ? 9 : 9,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: isDesktopWeb ? 14 : 12,
    color: COLORS.heading,
    lineHeight: 20,
  },
  pairCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 18 : 18,
    gap: isDesktopWeb ? 12 : 12,
  },
  pairRow: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 9 : 9,
  },
  pairTextBox: {
    flex: 1,
  },
  pairTitle: {
    fontSize: isDesktopWeb ? 15 : 14,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 2.25 : 2.25,
  },
  pairDesc: {
    fontSize: isDesktopWeb ? 13 : 12,
    color: COLORS.muted,
    lineHeight: 18,
  },
  proTip: {
    flexDirection: 'row',
    gap: isDesktopWeb ? 6 : 6,
    backgroundColor: COLORS.proTipBg,
    borderRadius: 8,
    padding: isDesktopWeb ? 9 : 9,
  },
  proTipText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.heading,
    lineHeight: 17,
  },
  proTipBold: {
    fontWeight: '700',
    color: COLORS.accent,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginBottom: isDesktopWeb ? 15 : 15,
  },
  helpfulTitle: {
    fontSize: isDesktopWeb ? 18 : 14,
    fontWeight: '700',
    color: COLORS.heading,
    textAlign: 'center',
    marginBottom: isDesktopWeb ? 10.5 : 10.5,
  },
  helpfulRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: isDesktopWeb ? 9 : 9,
    marginBottom: isDesktopWeb ? 21 : 21,
  },
  helpfulBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 6,
    paddingHorizontal: 16.5,
    paddingVertical: 7.5,
  },
  helpfulBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
  relatedCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11.25,
  },
  relatedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  relatedText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.heading,
  },
});
