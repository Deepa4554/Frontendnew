import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import { CreateMenuItemRequest } from '../api/menuApi';

/**
 * Picks a .csv file (web only — no native file-picker dependency in this app yet)
 * and parses it via xlsx, which already ships in this project for export.
 *
 * Resolves to `null` if the user closes/cancels the file dialog without picking
 * anything — that's a normal outcome, not an error, so callers shouldn't show an
 * error alert for it. Modern Chromium fires a native `cancel` event on the input
 * for this; older browsers that don't support it fall back to detecting "the
 * window regained focus but no file was ever chosen" a moment later.
 */
export const pickAndParseCsv = (): Promise<{ fileName: string; rows: Record<string, string>[] } | null> => {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'web') {
      reject(new Error('CSV import is available on the web app for now.'));
      return;
    }
    // No DOM lib in this RN project's tsconfig — these globals are real at runtime
    // on web (react-native-web), so isolate the untyped interop to `any` here rather
    // than widening the whole project's type-checking with a DOM lib addition.
    const win: any = (globalThis as any).window;
    const doc: any = win.document;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.csv';

    let settled = false;
    const finishWith = (fn: () => void) => {
      if (settled) return;
      settled = true;
      win.removeEventListener('focus', onWindowFocus);
      fn();
    };

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        finishWith(() => resolve(null));
        return;
      }
      const reader: any = new win.FileReader();
      reader.onload = (e: any) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
          finishWith(() => resolve({ fileName: file.name, rows }));
        } catch (err) {
          finishWith(() => reject(err instanceof Error ? err : new Error('Could not read that file as CSV.')));
        }
      };
      reader.onerror = () => finishWith(() => reject(reader.error ?? new Error('Could not read that file.')));
      reader.readAsBinaryString(file);
    };
    input.oncancel = () => finishWith(() => resolve(null));

    // Fallback for browsers without the native `cancel` event: the dialog closing
    // (picked or cancelled) always refocuses the window; if no file ever arrives
    // shortly after, treat it as a cancel instead of hanging forever.
    const onWindowFocus = () => {
      setTimeout(() => finishWith(() => resolve(null)), 500);
    };
    win.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });
};

/** CSV columns are matched case-insensitively: name, category, price, subtitle, description. */
const VEG_NON_VEG_ALIASES: Record<string, 'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian'> = {
  veg: 'Veg', vegetarian: 'Veg', v: 'Veg',
  nonveg: 'NonVeg', 'non-veg': 'NonVeg', 'non veg': 'NonVeg', n: 'NonVeg',
  jain: 'Jain', j: 'Jain',
  egg: 'Eggetarian', eggetarian: 'Eggetarian', e: 'Eggetarian',
};

/** Maps a free-text CSV cell ("Veg", "non-veg", "N", ...) to the enum the API expects.
 * Unrecognized/blank stays untagged rather than guessing — same reasoning as every
 * other veg/non-veg renderer in the app (POS, KDS, print) treating "no tag" as its
 * own state, not a silent default to Veg. */
const parseVegNonVegCell = (raw: string): 'Veg' | 'NonVeg' | 'Jain' | 'Eggetarian' | undefined =>
  VEG_NON_VEG_ALIASES[raw.trim().toLowerCase()];

export const normalizeMenuCsvRows = (rows: Record<string, string>[]): CreateMenuItemRequest[] => {
  const get = (row: Record<string, string>, key: string) => {
    const foundKey = Object.keys(row).find((k) => k.trim().toLowerCase() === key);
    return foundKey ? String(row[foundKey]).trim() : '';
  };
  return rows
    .map((row) => ({
      name: get(row, 'name'),
      category: get(row, 'category') || 'Food',
      price: parseFloat(get(row, 'price')),
      subtitle: get(row, 'subtitle') || undefined,
      description: get(row, 'description') || undefined,
      vegNonVegType: parseVegNonVegCell(get(row, 'veg') || get(row, 'vegnonveg') || get(row, 'type')),
    }))
    .filter((r) => r.name && !Number.isNaN(r.price) && r.price > 0);
};
