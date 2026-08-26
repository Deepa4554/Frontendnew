import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, Switch } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../../../../core/theme/useThemeColors';
import { showToast } from '../../../../../core/store/uiSlice';
import { getPrinterConfig, savePrinterConfig, getStationPrinterConfig, saveStationPrinterConfig, clearStationPrinterConfig, isAutoPrintHost, setAutoPrintHost, PrinterType } from '../../../../../core/printing/printerConfig';
import { BluetoothPrinter, BluetoothPrinterDevice } from '../../../../../core/printing/BluetoothPrinter';
import { UsbAgentPrinter } from '../../../../../core/printing/UsbAgentPrinter';
import { PrinterService } from '../../../../../core/printing/PrinterService';
import { useSettings } from '../../../../../core/api/hooks/useSettings';
import { useResponsive } from '../../../../../core/utils/useResponsive';
import { DesktopPageHeader } from '../../../../../shared/components/desktop/DesktopPageHeader';

// Icon and label per transport. A lookup rather than the chain of ternaries this used to be
// inline — a fourth option made that unreadable. 'browser' is labelled for the case it's
// nearly always reached for: a USB printer, the one kind no other transport here can drive.
const TYPE_META: Record<PrinterType, { icon: string; label: string }> = {
  none: { icon: 'printer-off-outline', label: 'None' },
  wifi: { icon: 'wifi', label: 'WiFi / LAN' },
  bluetooth: { icon: 'bluetooth', label: 'Bluetooth' },
  browser: { icon: 'usb', label: 'USB / Browser' },
};

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

  /**
   * "None" on a STATION means "this station has no printer of its own", not "this station must
   * not print" — its tickets belong on the device's default printer. So the row is CLEARED
   * rather than written as {type:'none'}: a stored row, even a 'none' one, outranks the device
   * printer in getEffectivePrinterConfig, and every KOT for that station then failed with "No
   * printer set up yet" while Test Print — which never consults a station — kept working.
   *
   * The rule lives here rather than in save() because testPrint() persists too. Opening a
   * station's printer screen and pressing Test Print, without ever pressing Save, was enough to
   * plant the row and break that station's KOTs for good.
   */
  const persistConfig = (config: Parameters<typeof savePrinterConfig>[0]) => {
    if (!stationKey) return savePrinterConfig(config);
    if (config.type === 'none') return clearStationPrinterConfig(stationKey);
    return saveStationPrinterConfig(stationKey, config);
  };

  const [type, setType] = useState<PrinterType>(initial.type);
  const [wifiIp, setWifiIp] = useState(initial.wifiIp ?? '');
  const [wifiPort, setWifiPort] = useState(String(initial.wifiPort ?? 9100));
  const [columns, setColumns] = useState(initial.columns ?? 32);
  const [bluetoothAddress, setBluetoothAddress] = useState(initial.bluetoothAddress);
  const [bluetoothName, setBluetoothName] = useState(initial.bluetoothName);
  const [usbAgentPrinterName, setUsbAgentPrinterName] = useState(initial.usbAgentPrinterName ?? '');
  const [agentPrinters, setAgentPrinters] = useState<string[] | null>(null);
  const [detectingAgent, setDetectingAgent] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothPrinterDevice[]>([]);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  // Filled by "Check connection" below. Null until asked for, so the panel stays out of the way
  // on a till where Bluetooth is simply working.
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [autoPrintHost, setAutoPrintHostState] = useState(isAutoPrintHost());

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
    } else if (type === 'browser') {
      // Without a local agent, there's nothing to point at — the printer is whichever one the
      // person picks in the dialog, and the browser is what remembers that choice. With one
      // (usbAgentPrinterName set), that name is exactly what PrintAgent needs to route the raw
      // bytes to the right Windows print queue.
      persistConfig({ type, columns, usbAgentPrinterName: usbAgentPrinterName.trim() || undefined });
    } else {
      // persistConfig turns this into "clear the row" for a station — see its doc comment.
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

  /** Asks PrintAgent (if it's running on this machine) which Windows printers it can see, so
   * the cashier can tap one instead of typing it exactly as Devices and Printers spells it. */
  const detectAgentPrinters = async () => {
    setDetectingAgent(true);
    setAgentPrinters(null);
    try {
      const found = await UsbAgentPrinter.listPrinters();
      setAgentPrinters(found);
      if (found.length === 0) {
        dispatch(showToast({ message: 'PrintAgent is running but Windows has no printers installed.', icon: 'information-outline', tone: 'info' }));
      }
    } catch (err) {
      setAgentPrinters([]);
      dispatch(showToast({
        message: 'Could not reach PrintAgent on this machine. Install and run it first, or leave this blank to keep using the print dialog.',
        icon: 'alert-circle-outline',
        tone: 'warning',
      }));
    } finally {
      setDetectingAgent(false);
    }
  };

  const toggleAutoPrintHost = (value: boolean) => {
    setAutoPrintHost(value);
    setAutoPrintHostState(value);
    dispatch(showToast({
      message: value ? 'This device will now auto-print every fired KOT, even ones taken on another phone.' : 'Auto-print host turned off for this device.',
      icon: value ? 'printer-check' : 'printer-off-outline',
      tone: 'info',
    }));
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
        : type === 'browser'
        ? { type, columns, usbAgentPrinterName: usbAgentPrinterName.trim() || undefined }
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
          {(['none', 'wifi', 'bluetooth', 'browser'] as PrinterType[]).map((t) => (
            <TouchableOpacity key={t} style={[styles.typePill, type === t && styles.typePillActive]} onPress={() => setType(t)}>
              <Icon name={TYPE_META[t].icon} size={16} color={type === t ? '#FFFFFF' : COLORS.muted} />
              <Text style={[styles.typeText, type === t && styles.typeTextActive]}>{TYPE_META[t].label}</Text>
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

        {type === 'browser' && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Paper width</Text>
            <View style={styles.columnsRow}>
              {[32, 48].map((c) => (
                <TouchableOpacity key={c} style={[styles.columnsPill, columns === c && styles.columnsPillActive]} onPress={() => setColumns(c)}>
                  <Text style={[styles.columnsText, columns === c && styles.columnsTextActive]}>{c === 32 ? '58mm' : '80mm'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>
              {isWeb
                ? 'Prints through the browser’s print dialog, so it can use a printer plugged into this computer over USB — the one kind Bluetooth and WiFi printing can’t reach. Plug the printer in and let Windows install it (it usually does that by itself), then pick it once in the dialog; the browser offers it by default after that.\n\nA dialog opens on every print and someone has to confirm it — that’s a browser rule, not a setting. In Chrome’s dialog, set Margins to None and switch Headers and footers off the first time, or the slip prints with page numbers and wide white edges.'
                : 'This only works in the web app — the mobile app has no print dialog to hand the receipt to. Use Bluetooth or WiFi on this device instead.'}
            </Text>

            {isWeb && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Local print agent (optional — no dialog, no blur)</Text>
                <TouchableOpacity style={styles.scanBtn} onPress={detectAgentPrinters} disabled={detectingAgent}>
                  {detectingAgent ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Icon name="magnify" size={16} color={COLORS.accent} />}
                  <Text style={styles.scanBtnText}>{detectingAgent ? 'Checking…' : 'Detect installed printers'}</Text>
                </TouchableOpacity>

                {agentPrinters !== null && agentPrinters.length > 0 && agentPrinters.map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={[styles.deviceRow, usbAgentPrinterName === name && styles.deviceRowActive]}
                    onPress={() => setUsbAgentPrinterName(name)}
                  >
                    <Icon name="printer-outline" size={18} color={usbAgentPrinterName === name ? '#FFFFFF' : COLORS.heading} />
                    <Text style={[styles.deviceName, usbAgentPrinterName === name && styles.deviceTextActive]}>{name}</Text>
                    {usbAgentPrinterName === name && <Icon name="check-circle" size={18} color="#FFFFFF" />}
                  </TouchableOpacity>
                ))}

                <View style={{ borderRadius: 8, marginTop: 6 }}>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Windows printer name, e.g. POS-58"
                    placeholderTextColor={COLORS.placeholder}
                    value={usbAgentPrinterName}
                    onChangeText={setUsbAgentPrinterName}
                    autoCapitalize="none"
                  />
                </View>
                <Text style={styles.hint}>
                  Set this and printing skips the dialog entirely and comes out as crisp as the printer's own self-test page — PrintAgent sends the exact same raw bytes the WiFi/Bluetooth transports use, instead of Chrome rendering an HTML page (which is what causes faded, patchy-looking text on a thermal head). Needs the PrintAgent program installed and running on this till first. Leave this blank and printing works exactly as before, through the dialog.
                </Text>
              </>
            )}
          </View>
        )}

        {!stationKey && (
          <View style={[styles.card, styles.toggleRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Auto-print host</Text>
              <Text style={styles.hint}>
                Also print every kitchen ticket fired from ANY device, not just this one — turn this on for the
                one till whose printer is the cafe's main one, so an order a waiter takes on their own phone still
                comes out here. Leave off on every other device, or the same ticket prints more than once.
              </Text>
            </View>
            <Switch
              value={autoPrintHost}
              onValueChange={toggleAutoPrintHost}
              trackColor={{ false: '#DDD1C6', true: COLORS.accent }}
              thumbColor="#FFFFFF"
            />
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
  // Wraps because there are four of these now: they still sit on one row wherever there's
  // room, and fall to two on a phone-width till rather than squeezing every label to nothing.
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: isDesktopWeb ? 6 : 6, marginBottom: isDesktopWeb ? 12 : 12 },
  typePill: {
    flexGrow: 1, flexBasis: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: isDesktopWeb ? 4.5 : 4.5,
    backgroundColor: COLORS.cardAlt, borderRadius: 9, paddingVertical: isDesktopWeb ? 9 : 9,
  },
  typePillActive: { backgroundColor: COLORS.button },
  typeText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  typeTextActive: { color: '#FFFFFF' },
  card: { backgroundColor: COLORS.cardAlt, borderRadius: 8, padding: isDesktopWeb ? 12 : 12, marginBottom: isDesktopWeb ? 12 : 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
