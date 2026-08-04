import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { useIntegrations, useConnectIntegration, useDisconnectIntegration } from '../../../../../core/api/hooks/useIntegrations';
import { ApiIntegration } from '../../../../../core/api/integrationsApi';
import { SkeletonGrid } from '../../../../../shared/components/atoms/Skeleton';
import { SearchClearButton } from '../../../../../shared/components/atoms/SearchClearButton';
import { ErrorState } from '../../../../../shared/components/atoms/StateComponents';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

export const IntegrationsHubScreen = () => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const ICON_FOR: Record<string, { icon: string; bg: string; color: string }> = {
    UberEats: { icon: 'moped-outline', bg: '#1A1A1A', color: '#FFFFFF' },
    DoorDash: { icon: 'bike-fast', bg: '#FCE0E0', color: COLORS.dangerAccent },
    Deliveroo: { icon: 'shopping-outline', bg: '#D9F2ED', color: '#1C8A72' },
    Menulog: { icon: 'silverware-fork-knife', bg: '#F3DFC9', color: COLORS.accent },
    Stripe: { icon: 'credit-card-outline', bg: '#E4E1FA', color: '#5B4FE0' },
    'WhatsApp Business': { icon: 'whatsapp', bg: '#DCF5E4', color: '#25D366' },
  };
  const DEFAULT_ICON = { icon: 'puzzle-outline', bg: COLORS.chipBg, color: COLORS.muted };
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const { data: integrations = [], isLoading, isError, refetch } = useIntegrations();
  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();

  const filtered = integrations.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const grouped = useMemo(() => {
    const map = new Map<string, ApiIntegration[]>();
    filtered.forEach((i) => {
      const list = map.get(i.category) ?? [];
      list.push(i);
      map.set(i.category, list);
    });
    return Array.from(map.entries());
  }, [filtered]);

  // WhatsApp Business needs a bespoke Baileys QR-pairing flow, not the generic
  // connect/disconnect toggle every other card here uses — the tap target routes to its own
  // setup screen instead of calling connect/disconnect.mutate() directly. The card's
  // CONNECTED pill still works unmodified, since it's driven by the same Integration.Status
  // row WhatsAppSetupScreen keeps in sync via WhatsAppInternalController.UpsertSession.
  const toggle = (item: ApiIntegration) => {
    if (item.name === 'WhatsApp Business') {
      navigation.navigate('WhatsAppSetup');
      return;
    }
    if (item.status === 'CONNECTED') {
      disconnect.mutate(item.id);
    } else {
      connect.mutate(item.id);
    }
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="api" title="Integrations" />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          {!isDesktopWeb && (
            <>
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
                <Icon name="arrow-left" size={20} color={COLORS.heading} />
              </TouchableOpacity>
              <Icon name="api" size={22} color={COLORS.accent} />
            </>
          )}
          <Text style={styles.brandTitle}>Integrations</Text>
          <View style={{ flex: 1 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.searchWrapper}>
          <Icon name="magnify" size={18} color={COLORS.muted} style={{ marginRight: 8 }} />
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.searchInput, { paddingRight: 24 }]}
              placeholder="Search integrations..."
              placeholderTextColor={COLORS.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && <SearchClearButton onPress={() => setSearch('')} />}
          </View>
        </View>

        {isError && integrations.length === 0 ? (
          <ErrorState
            title="Couldn't load integrations"
            message="Check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : (
        <>
        {isLoading && <SkeletonGrid items={6} columns={2} style={{ paddingHorizontal: 16, marginTop: 4 }} />}

        {!isLoading && grouped.length === 0 && (
          <Text style={{ paddingHorizontal: 16, color: COLORS.muted, fontSize: 13 }}>No integrations match your search.</Text>
        )}

        {grouped.map(([category, items]) => (
          <View key={category}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{category}</Text>
            </View>
            <View style={styles.deliveryGrid}>
              {items.map((item) => {
                const visual = ICON_FOR[item.name] ?? DEFAULT_ICON;
                const connected = item.status === 'CONNECTED';
                const pending = (connect.isPending && connect.variables === item.id) || (disconnect.isPending && disconnect.variables === item.id);
                return (
                  <View key={item.id} style={styles.deliveryCard}>
                    <View style={[styles.deliveryIconBox, { backgroundColor: visual.bg }]}>
                      <Icon name={visual.icon} size={24} color={visual.color} />
                    </View>
                    <Text style={styles.deliveryName}>{item.name}</Text>
                    {connected && (
                      <View style={styles.connectedPill}>
                        <Text style={styles.connectedPillText}>CONNECTED</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => toggle(item)} disabled={pending} style={{ marginTop: 8 }}>
                      {pending ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : item.name === 'WhatsApp Business' ? (
                        <Text style={styles.setupLink}>{connected ? 'Manage' : 'Setup'}</Text>
                      ) : (
                        <Text style={connected ? styles.disconnectLink : styles.setupLink}>
                          {connected ? 'Disconnect' : 'Setup'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        </>
        )}
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
    gap: isDesktopWeb ? 7 : 7.5,
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    paddingTop: isDesktopWeb ? 8 : 9,
    paddingBottom: isDesktopWeb ? 8 : 9,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: isDesktopWeb ? 20 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    marginHorizontal: isDesktopWeb ? 12 : 12,
    paddingHorizontal: isDesktopWeb ? 10 : 10.5,
    height: 46,
    marginBottom: isDesktopWeb ? 14 : 15,
  },
  searchInputWrap: {
    flex: 1,
  },
  searchInput: {
    width: '100%',
    fontSize: 16,
    color: COLORS.heading,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    marginBottom: isDesktopWeb ? 8 : 9,
  },
  sectionTitle: {
    fontSize: isDesktopWeb ? 18 : 14,
    fontWeight: 'bold',
    color: COLORS.heading,
  },
  deliveryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: isDesktopWeb ? 12 : 12,
    gap: isDesktopWeb ? 8 : 9,
    marginBottom: isDesktopWeb ? 14 : 15,
  },
  deliveryCard: {
    width: '46.5%',
    backgroundColor: COLORS.cardAlt,
    borderRadius: 8,
    padding: isDesktopWeb ? 12 : 12,
    alignItems: 'center',
  },
  deliveryIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isDesktopWeb ? 7 : 7.5,
  },
  deliveryName: {
    fontSize: isDesktopWeb ? 13 : 12,
    fontWeight: '700',
    color: COLORS.heading,
    marginBottom: isDesktopWeb ? 4 : 4.5,
  },
  connectedPill: {
    backgroundColor: COLORS.successBg,
    paddingHorizontal: isDesktopWeb ? 6 : 6,
    paddingVertical: isDesktopWeb ? 2 : 2.25,
    borderRadius: 8,
  },
  connectedPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.success,
  },
  setupLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },
  disconnectLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dangerAccent,
    textDecorationLine: 'underline',
  },
});
