import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import { RecipeImportRow } from '../api/recipeApi';

/**
 * Picks a .csv/.xlsx/.xls file and parses it via xlsx (same library and pattern as
 * csvMenuImport.ts's pickAndParseCsv — see that file for the cancel-detection notes).
 * Excel files carry real cell types, so numbers land on `rows` as numbers already; CSV
 * cells are always strings and get coerced by normalizeRecipeImportRows below.
 */
export const pickAndParseRecipeSheet = (): Promise<{ fileName: string; rows: Record<string, string | number>[] } | null> => {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'web') {
      reject(new Error('Sheet import is available on the web app for now.'));
      return;
    }
    const win: any = (globalThis as any).window;
    const doc: any = win.document;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';

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
          const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
          finishWith(() => resolve({ fileName: file.name, rows }));
        } catch (err) {
          finishWith(() => reject(err instanceof Error ? err : new Error('Could not read that file.')));
        }
      };
      reader.onerror = () => finishWith(() => reject(reader.error ?? new Error('Could not read that file.')));
      reader.readAsBinaryString(file);
    };
    input.oncancel = () => finishWith(() => resolve(null));

    const onWindowFocus = () => {
      setTimeout(() => finishWith(() => resolve(null)), 500);
    };
    win.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });
};

/** Four columns, matched case-insensitively: MenuItemName, IngredientName,
 * QuantityPerServing, Unit. Stock and cost are deliberately not here — they're managed on
 * the Inventory screen, and per-dish costing computes from quantity × that ingredient's
 * rate. Rows missing a menu item, ingredient, unit, or a positive quantity are dropped
 * before they ever reach the server — the server does its own (more detailed, per-row)
 * validation on what's left. */
export const normalizeRecipeImportRows = (rows: Record<string, string | number>[]): RecipeImportRow[] => {
  const get = (row: Record<string, string | number>, key: string) => {
    const foundKey = Object.keys(row).find((k) => k.trim().toLowerCase() === key);
    return foundKey ? String(row[foundKey]).trim() : '';
  };
  const getNum = (row: Record<string, string | number>, key: string) => {
    const raw = get(row, key);
    if (raw === '') return undefined;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? undefined : n;
  };

  return rows
    .map((row) => ({
      menuItemName: get(row, 'menuitemname') || get(row, 'menu item name') || get(row, 'recipe'),
      ingredientName: get(row, 'ingredientname') || get(row, 'ingredient name') || get(row, 'ingredient'),
      quantity: getNum(row, 'quantityperserving') ?? getNum(row, 'quantity per serving') ?? getNum(row, 'quantity') ?? NaN,
      unit: get(row, 'unit'),
    }))
    .filter((r) => r.menuItemName && r.ingredientName && r.unit && !Number.isNaN(r.quantity) && r.quantity > 0);
};
