import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { getPrinterConfig, savePrinterConfig, getStationPrinterConfig, saveStationPrinterConfig, PrinterType } from '../../../../../core/printing/printerConfig';
import { BluetoothPrinter, BluetoothPrinterDevice } from '../../../../../core/printing/BluetoothPrinter';
import { PrinterService } from '../../../../../core/printing/PrinterService';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

const SAMPLE_RECEIPT = (businessName: string, taxRatePct: number) => ({
  businessName,
  orderNumber: '#TEST',
  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  title: 'Test Print',
  orderTypeLabel: 'Takeaway',
  items: [{ name: 'Sample Item', qty: 1, price: 100 }],
  subtotal: 100,
  taxRatePct,
  tax: (100 * taxRatePct) / 100,
  total: 100 + (100 * taxRatePct) / 100,
  footer: 'This is a test print from Printer Settings.',
});

export const PrinterSettingsScreen = ({ navigation, route }: any) => {
  const { isDesktopWeb } = useResponsive();
  const COLORS = useThemeColors();
  const styles = makeStyles(COLORS, isDesktopWeb);
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const { data: settings } = useSettings();
  // Reached two ways: Profile → Printer Settings (this device's single default/fallback
  // printer, no params) or Kitchen Stations → Configure Printer (stationKey set — a
  // printer just for that station's KOTs, see PrinterService.printKot's routing).
  const stationKey: string | undefined = route?.params?.stationKey;
  const stationLabel: string | undefined = route?.params?.stationLabel;
  const initial = stationKey ? getStationPrinterConfig(stationKey) ?? { type: 'none' as const } : getPrinterConfig();

  const persistConfig = (config: Parameters<typeof savePrinterConfig>[0]) =>
    stationKey ? saveStationPrinterConfig(stationKey, config) : savePrinterConfig(config);

  const [type, setType] = useState<PrinterType>(initial.type);
  const [wifiIp, setWifiIp] = useState(initial.wifiIp ?? '');
  const [wifiPort, setWifiPort] = useState(String(initial.wifiPort ?? 9100));
  const [columns, setColumns] = useState(initial.columns ?? 32);
  const [bluetoothAddress, setBluetoothAddress] = useState(initial.bluetoothAddress);
  const [bluetoothName, setBluetoothName] = useState(initial.bluetoothName);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothPrinterDevice[]>([]);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  // Filled by "Check connection" below. Null until asked for, so the panel stays out of the way
  // on a till where Bluetooth is simply working.
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const save = () => {
    if (type === 'wifi') {
      if (!wifiIp.trim()) {
        dispatch(showToast({ message: 'Enter the printer’s IP address.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      const port = parseInt(wifiPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        dispatch(showToast({ message: 'Enter a port between 1 and 65535 (usually 9100).', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      persistConfig({ type, wifiIp: wifiIp.trim(), wifiPort: port, columns });
    } else if (type === 'bluetooth') {
      if (!bluetoothAddress) {
        dispatch(showToast({ message: 'Scan and select a paired Bluetooth printer first.', icon: 'alert-circle-outline', tone: 'warning' }));
        return;
      }
      persistConfig({ type, bluetoothAddress, bluetoothName, columns });
    } else {
      persistConfig({ type: 'none' });
    }
    setSaved(true);
    dispatch(showToast({ message: 'Printer settings updated.', icon: 'check-circle', tone: 'success' }));
  };

  // Bluetooth works on both platforms now, but by different routes: native lists the devices
  // the OS has already paired, while the browser (Web Bluetooth) can only pop its own chooser
  // and has no access to the system's paired list at all — so every message below differs.
  const isWeb = Platform.OS === 'web';

  const scanBluetooth = async () => {
    if (!BluetoothPrinter.isSupported()) {
      dispatch(showToast({
        message: isWeb
          ? 'This browser can’t do Bluetooth. Use Chrome on Android, Bluefy on iPhone/iPad, a WiFi printer, or the mobile app.'
          : 'Bluetooth printing isn’t available on this device.',
        icon: 'information-outline',
        tone: 'info',
      }));
      return;
    }
    try {
      setScanning(true);
      const found = await BluetoothPrinter.scanDevices();
      setDevices(found);
      if (found.length === 0) dispatch(showToast({
        message: isWeb
          ? 'No printer picked. Switch the printer on, tap Scan and choose it from the browser’s list.'
          : 'Pair your printer in your phone’s Bluetooth settings first, then scan again.',
        icon: 'information-outline',
        tone: 'info',
      }));
    } catch (err) {
      dispatch(showToast({ message: err instanceof Error ? err.message : 'Could not scan for Bluetooth devices.', icon: 'alert-circle-outline', tone: 'danger' }));
    } finally {
      setScanning(false);
    }
  };

  /** Reports what the browser will and won't remember about the printer. Auto-reconnect after a
   * reload rests on Web Bluetooth's getDevices(), which behaves differently in every browser
   * that has it — when reconnecting silently fails there is nothing on screen to say why, and
   * this is how the till itself answers that. */
  const checkConnection = async () => {
    // Slow on purpose — it waits for the printer to advertise itself before giving up, so this
    // can run the better part of half a minute against a printer that's switched off.
    setChecking(true);
    setDiagnostic(null);
    try {
      setDiagnostic(await BluetoothPrinter.describeConnection());
    } catch (err) {
      setDiagnostic(err instanceof Error ? err.message : 'Could not read the Bluetooth status.');
    } finally {
      setChecking(false);
    }
  };

  const selectDevice = (d: BluetoothPrinterDevice) => {
    setBluetoothAddress(d.address);
    setBluetoothName(d.name);
  };

  const testPrint = async () => {
    // Test against the currently EDITED (not yet necessarily saved) config, so the
    // user can verify before committing.
    const draftConfig =
      type === 'wifi'
        ? { type, wifiIp: wifiIp.trim(), wifiPort: parseInt(wifiPort, 10) || 9100, columns }
        : type === 'bluetooth'
        ? { type, bluetoothAddress, bluetoothName, columns }
        : { type: 'none' as const };
    persistConfig(draftConfig);

    setTesting(true);
    const result = await PrinterService.printReceipt(SAMPLE_RECEIPT(settings?.businessName ?? 'PrabandhOS', settings?.taxRatePct ?? 8), draftConfig);
    setTesting(false);
    dispatch(showToast({ message: result.message, icon: result.ok ? 'printer-check' : 'alert-circle-outline', tone: result.ok ? 'success' : 'danger' }));
  };

  return (
    <View style={styles.container}>
      <DesktopPageHeader icon="printer" title={stationKey ? `${stationLabel ?? stationKey} Printer` : 'Printer Settings'} onBack={() => navigation?.goBack?.()} />
      {!isDesktopWeb && (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()}>
            <Icon name="arrow-left" size={22} color={COLORS.heading} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{stationKey ? `${stationLabel ?? stationKey} Printer` : 'Printer Settings'}</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={styles.subtitle}>
          {stationKey
            ? `Printer for "${stationLabel ?? stationKey}" KOTs on this device. Leave unset and this station's tickets fall back to the device's default printer below.`
            : 'Printer setup is per-device — each till/terminal can have its own printer.'}
        </Text>

        <Text style={styles.fieldLabel}>Printer Type</Text>
        <View style={styles.typeRow}>
          {(['none', 'wifi', 'bluetooth'] as PrinterType[]).map((t) => (
            <TouchableOpacity key={t} style={[styles.typePill, type === t && styles.typePillActive]} onPress={() => setType(t)}>
              <Icon
                name={t === 'wifi' ? 'wifi' : t === 'bluetooth' ? 'bluetooth' : 'printer-off-outline'}
                size={16}
                color={type === t ? '#FFFFFF' : COLORS.muted}
              />
              <Text style={[styles.typeText, type === t && styles.typeTextActive]}>
                {t === 'wifi' ? 'WiFi / LAN' : t === 'bluetooth' ? 'Bluetooth' : 'None'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {type === 'wifi' && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Printer IP address</Text>
            <View style={{ borderRadius: 8 }}>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 192.168.1.50"
                placeholderTextColor={COLORS.placeholder}
                value={wifiIp}
                onChangeText={setWifiIp}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Port</Text>
                <View style={{ borderRadius: 8 }}>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="9100"
                    placeholderTextColor={COLORS.placeholder}
                    value={wifiPort}
                    onChangeText={(t) => setWifiPort(t.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Paper width</Text>
                <View style={styles.columnsRow}>
                  {[32, 48].map((c) => (
                    <TouchableOpacity key={c} style={[styles.columnsPill, columns === c && styles.columnsPillActive]} onPress={() => setColumns(c)}>
                      <Text style={[styles.columnsText, columns === c && styles.columnsTextActive]}>{c === 32 ? '58mm' : '80mm'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <Text style={styles.hint}>Network printers usually listen on port 9100. Make sure this device and the printer are on the same WiFi.</Text>
          </View>
        )}

        {type === 'bluetooth' && (
          <View style={styles.card}>
            <TouchableOpacity style={styles.scanBtn} onPress={scanBluetooth} disabled={scanning}>
              {scanning ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Icon name="magnify" size={16} color={COLORS.accent} />}
              <Text style={styles.scanBtnText}>
                {scanning ? 'Scanning…' : isWeb ? 'Scan for nearby printers' : 'Scan for paired devices'}
              </Text>
            </TouchableOpacity>

            {devices.map((d) => (
              <TouchableOpacity
                key={d.address}
                style={[styles.deviceRow, bluetoothAddress === d.address && styles.deviceRowActive]}
                onPress={() => selectDevice(d)}
              >
                <Icon name="printer-outline" size={18} color={bluetoothAddress === d.address ? '#FFFFFF' : COLORS.heading} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.deviceName, bluetoothAddress === d.address && styles.deviceTextActive]}>{d.name}</Text>
                  <Text style={[styles.deviceAddress, bluetoothAddress === d.address && styles.deviceTextActive]}>{d.address}</Text>
                </View>
                {bluetoothAddress === d.address && <Icon name="check-circle" size={18} color="#FFFFFF" />}
              </TouchableOpacity>
            ))}

            {bluetoothAddress && devices.length === 0 && (
              <View style={styles.deviceRow}>
                <Icon name="printer-outline" size={18} color={COLORS.heading} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{bluetoothName}</Text>
                  <Text style={styles.deviceAddress}>{bluetoothAddress} · previously saved</Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.diagnosticBtn} onPress={checkConnection} disabled={checking}>
              {checking ? <ActivityIndicator size="small" color={COLORS.muted} /> : <Icon name="stethoscope" size={15} color={COLORS.muted} />}
              <Text style={styles.diagnosticBtnText}>
                {checking ? 'Checking — this can take up to 30s…' : 'Check connection'}
              </Text>
            </TouchableOpacity>

            {diagnostic !== null && (
              <Text style={styles.diagnosticBox} selectable>
                {diagnostic}
              </Text>
            )}

            <Text style={styles.hint}>
              {isWeb
                ? 'Chrome on Android/desktop over https, or the Bluefy browser on iPhone/iPad — Safari can’t do Bluetooth at all. Only BLE printers work here; older Bluetooth Classic units need the mobile app. Pick the printer once: switching apps, sleeping the screen, even closing and reopening the browser will drop the connection, and it reconnects by itself each time you come back. Tap Scan again only if a print says the printer was forgotten.'
                : 'Pair the printer in your phone’s Bluetooth settings first, then scan here to pick it.'}
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.testBtn} onPress={testPrint} disabled={testing || type === 'none'}>
          {testing ? <ActivityIndicator size="small" color={COLORS.heading} /> : <Icon name="printer-check" size={18} color={COLORS.heading} />}
          <Text style={styles.testBtnText}>{testing ? 'Printing…' : 'Test Print'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={save}>
          <Icon name="check" size={16} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>Save Printer Settings</Text>
        </TouchableOpacity>
        {saved && <Text style={styles.savedHint}>Saved on this device.</Text>}
      </ScrollView>
    </View>
  );
};

const makeStyles = (COLORS: ReturnType<typeof useThemeColors>, isDesktopWeb: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: isDesktopWeb ? 9 : 9, paddingTop: isDesktopWeb ? 9 : 9, paddingBottom: isDesktopWeb ? 6 : 6, gap: isDesktopWeb ? 4.5 : 4.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: isDesktopWeb ? 20 : 14, fontWeight: 'bold', color: COLORS.heading },
  subtitle: { fontSize: 12, color: COLORS.muted, lineHeight: 18, marginBottom: isDesktopWeb ? 15 : 15 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: isDesktopWeb ? 6 : 6 },
  typeRow: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 12 : 12 },
  typePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4.5 : 4.5,
    backgroundColor: COLORS.cardAlt, borderRadius: 9, paddingVertical: isDesktopWeb ? 9 : 9,
  },
  typePillActive: { backgroundColor: COLORS.button },
  typeText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  typeTextActive: { color: '#FFFFFF' },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 12 : 12 },
  fieldInput: {
    backgroundColor: COLORS.background, borderRadius: 8, paddingHorizontal: isDesktopWeb ? 10.5 : 10.5, height: 46,
    fontSize: 16, color: COLORS.heading, borderWidth: 1, borderColor: COLORS.inputBorder, marginBottom: isDesktopWeb ? 9 : 9,
  },
  fieldRow: { flexDirection: 'row', gap: isDesktopWeb ? 9 : 9 },
  columnsRow: { flexDirection: 'row', gap: isDesktopWeb ? 6 : 6 },
  columnsPill: { flex: 1, alignItems: 'center', paddingVertical: isDesktopWeb ? 9 : 9, borderRadius: 9, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.inputBorder },
  columnsPillActive: { backgroundColor: COLORS.button, borderColor: COLORS.button },
  columnsText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  columnsTextActive: { color: '#FFFFFF' },
  hint: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 3 : 3, lineHeight: 16 },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 6,
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: 6, paddingVertical: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 9 : 9,
  },
  scanBtnText: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.accent },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: isDesktopWeb ? 7.5 : 7.5, backgroundColor: COLORS.background,
    borderRadius: 8, padding: isDesktopWeb ? 9 : 9, marginBottom: isDesktopWeb ? 6 : 6,
  },
  deviceRowActive: { backgroundColor: COLORS.button },
  deviceName: { fontSize: isDesktopWeb ? 13 : 12, fontWeight: '700', color: COLORS.heading },
  deviceAddress: { fontSize: 11, color: COLORS.muted, marginTop: isDesktopWeb ? 0.75 : 0.75 },
  deviceTextActive: { color: '#FFFFFF' },
  diagnosticBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.divider, borderRadius: 6, paddingVertical: 7.5, marginTop: 3,
  },
  diagnosticBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.muted },
  diagnosticBox: {
    fontSize: 11, lineHeight: 16, color: COLORS.heading, backgroundColor: COLORS.background,
    borderRadius: 6, padding: 9, marginTop: 6, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 6 : 6,
    borderWidth: 1, borderColor: COLORS.divider, borderRadius: 6, paddingVertical: isDesktopWeb ? 10.5 : 10.5, marginBottom: isDesktopWeb ? 9 : 9,
  },
  testBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.heading },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.button, borderRadius: 6, paddingVertical: 10.5,
  },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  savedHint: { fontSize: 11, color: COLORS.success, textAlign: 'center', marginTop: 7.5 },
});
