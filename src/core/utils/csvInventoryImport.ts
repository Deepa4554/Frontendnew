import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import { InventoryImportRow } from '../api/inventoryApi';

/**
 * Picks a .csv/.xlsx/.xls stock sheet and parses it via xlsx — same picker/cancel
 * handling as csvMenuImport.ts and csvRecipeImport.ts, see those for the notes.
 */
export const pickAndParseInventorySheet = (): Promise<{ fileName: string; rows: Record<string, string | number>[] } | null> => {
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
          const workbook = XLSX.read(e.target?.result, { type: 'binary' });
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

/** Columns matched case-insensitively: IngredientName, Unit, CurrentStock, UnitCost
 * (required) plus Category, MaxStock, ReorderLevel (optional). Rows missing a name, unit,
 * stock, or rate are dropped here; the server validates the rest per row and reports back
 * what it rejected. */
export const normalizeInventoryImportRows = (rows: Record<string, string | number>[]): InventoryImportRow[] => {
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
      name: get(row, 'ingredientname') || get(row, 'ingredient name') || get(row, 'name') || get(row, 'itemname'),
      unit: get(row, 'unit'),
      currentStock: getNum(row, 'currentstock') ?? getNum(row, 'current stock') ?? getNum(row, 'stock') ?? NaN,
      unitCost: getNum(row, 'unitcost') ?? getNum(row, 'unit cost') ?? getNum(row, 'rate') ?? NaN,
      category: get(row, 'category') || undefined,
      maxStock: getNum(row, 'maxstock') ?? getNum(row, 'max stock') ?? getNum(row, 'max'),
      reorderLevel: getNum(row, 'reorderlevel') ?? getNum(row, 'reorder level'),
    }))
    .filter((r) => r.name && r.unit && !Number.isNaN(r.currentStock) && !Number.isNaN(r.unitCost));
};
