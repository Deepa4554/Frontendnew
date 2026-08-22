import { getEffectivePrinterConfig, savePrinterConfig, saveStationPrinterConfig, clearStationPrinterConfig } from './printerConfig';

// The real module is MMKV, which needs a native/browser storage this suite has neither of.
// A plain Map is enough: everything under test is about which config WINS, not about storage.
const mockStore = new Map<string, string>();
jest.mock('../storage/mmkv', () => ({
  getItem: (key: string) => mockStore.get(key),
  setItem: (key: string, value: string) => mockStore.set(key, String(value)),
  removeItem: (key: string) => mockStore.delete(key),
}));

const TILL_PRINTER = { type: 'wifi' as const, wifiIp: '192.168.1.50', wifiPort: 9100, columns: 32 };
const KITCHEN_PRINTER = { type: 'wifi' as const, wifiIp: '192.168.1.60', wifiPort: 9100, columns: 32 };

beforeEach(() => {
  mockStore.clear();
});

/**
 * Which printer a KOT line actually routes to. The rule is "the station's own printer if it has
 * one, otherwise this device's" — and the interesting cases are all about what counts as
 * "has one".
 */
describe('getEffectivePrinterConfig', () => {
  it('uses the device printer when the station has no row of its own', () => {
    savePrinterConfig(TILL_PRINTER);

    expect(getEffectivePrinterConfig('Kitchen')).toEqual(TILL_PRINTER);
  });

  it('prefers the station printer when one is configured', () => {
    savePrinterConfig(TILL_PRINTER);
    saveStationPrinterConfig('Kitchen', KITCHEN_PRINTER);

    expect(getEffectivePrinterConfig('Kitchen')).toEqual(KITCHEN_PRINTER);
  });

  it('falls back to the device printer for a station saved as none', () => {
    // The regression this exists for: opening Kitchen Stations → Configure Printer and saving
    // without picking anything used to store {type:'none'} for that station. Being a row rather
    // than an absent row, it outranked a perfectly good till printer — every KOT failed with
    // "No printer set up yet" while Test Print, which never consults a station, worked fine.
    savePrinterConfig(TILL_PRINTER);
    saveStationPrinterConfig('Kitchen', { type: 'none' });

    expect(getEffectivePrinterConfig('Kitchen')).toEqual(TILL_PRINTER);
  });

  it('leaves other stations alone when one is cleared', () => {
    savePrinterConfig(TILL_PRINTER);
    saveStationPrinterConfig('Kitchen', KITCHEN_PRINTER);
    saveStationPrinterConfig('Bar', KITCHEN_PRINTER);
    clearStationPrinterConfig('Kitchen');

    expect(getEffectivePrinterConfig('Kitchen')).toEqual(TILL_PRINTER);
    expect(getEffectivePrinterConfig('Bar')).toEqual(KITCHEN_PRINTER);
  });

  it('uses the device printer when no station is named at all', () => {
    savePrinterConfig(TILL_PRINTER);
    saveStationPrinterConfig('Kitchen', KITCHEN_PRINTER);

    expect(getEffectivePrinterConfig()).toEqual(TILL_PRINTER);
    expect(getEffectivePrinterConfig(null)).toEqual(TILL_PRINTER);
  });

  it('reports none only when the device itself has no printer', () => {
    expect(getEffectivePrinterConfig('Kitchen').type).toBe('none');
  });
});
