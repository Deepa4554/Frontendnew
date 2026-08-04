import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type SeedTableStatus = 'empty' | 'occupied' | 'reserved';

export interface TableRecord {
  id: string;
  zone: string;
  status: SeedTableStatus;
  seats?: number;
  guests?: number;
  bill?: number;
  time?: string;
  guestName?: string;
  vip?: boolean;
  progress?: number;
}

interface TablesState {
  zones: string[];
  tables: TableRecord[];
  selectedTableForOrder: string | null;
  /** When set, the POS opens in "resume/append mode" for this existing open order
   * (from the Tables screen's "Add Items" action) instead of building a brand-new order. */
  resumeOrderId: number | null;
  resumeTableCode: string | null;
  /** Set by the Token Dashboard just before navigating to POS (both the "+" new-token FAB
   * and its "Add Item" on an existing token) so the POS opens with the Token order-type pill
   * already active instead of defaulting to Dine In. Consumed once by POS on mount. */
  pendingOrderType: string | null;
}

const initialState: TablesState = {
  zones: ['Indoor', 'Terrace', 'Bar Area', 'Mezzanine'],
  selectedTableForOrder: null,
  resumeOrderId: null,
  resumeTableCode: null,
  pendingOrderType: null,
  // All tables start free — occupancy comes live from unpaid POS orders.
  tables: [
    { id: 'T1', zone: 'Indoor', status: 'empty', seats: 4 },
    { id: 'T2', zone: 'Indoor', status: 'empty', seats: 2 },
    { id: 'T3', zone: 'Indoor', status: 'empty', seats: 4 },
    { id: 'T4', zone: 'Indoor', status: 'empty', seats: 2 },
    { id: 'T5', zone: 'Indoor', status: 'empty', seats: 6 },
    { id: 'T6', zone: 'Indoor', status: 'empty', seats: 4 },
    { id: 'T7', zone: 'Indoor', status: 'empty', seats: 6 },
    { id: 'T8', zone: 'Indoor', status: 'empty', seats: 2 },
  ],
};

const tablesSlice = createSlice({
  name: 'tables',
  initialState,
  reducers: {
    addTable: (state, action: PayloadAction<{ id: string; zone: string; seats: number }>) => {
      state.tables.push({
        id: action.payload.id,
        zone: action.payload.zone,
        status: 'empty',
        seats: action.payload.seats,
      });
    },
    removeTable: (state, action: PayloadAction<string>) => {
      state.tables = state.tables.filter((t) => t.id !== action.payload);
    },
    selectTableForOrder: (state, action: PayloadAction<string>) => {
      state.selectedTableForOrder = action.payload;
    },
    clearSelectedTable: (state) => {
      state.selectedTableForOrder = null;
      // Leaving/finishing a POS session also exits resume-mode so the next visit
      // starts a fresh order rather than silently appending to an old one.
      state.resumeOrderId = null;
      state.resumeTableCode = null;
    },
    /** Open the POS to append to an existing open order (Tables → "Add Items", or the Token
     * Dashboard's "Add Item" for a tableless QSR order — tableCode omitted there). */
    resumeOrder: (state, action: PayloadAction<{ orderId: number; tableCode?: string | null }>) => {
      state.resumeOrderId = action.payload.orderId;
      state.resumeTableCode = action.payload.tableCode ?? null;
      // Only a real table resume should pre-select a table (which also restricts the POS's
      // order-type pills to DINE_IN) — a tableless QSR resume must leave this untouched.
      if (action.payload.tableCode) state.selectedTableForOrder = action.payload.tableCode;
    },
    /** Exit resume/append mode only (leaves the plain table selection untouched) — the POS
     * dispatches this on blur so re-entering it later starts a fresh order, not an append. */
    clearResumeOrder: (state) => {
      state.resumeOrderId = null;
      state.resumeTableCode = null;
    },
    setPendingOrderType: (state, action: PayloadAction<string | null>) => {
      state.pendingOrderType = action.payload;
    },
  },
});

export const {
  addTable, removeTable, selectTableForOrder, clearSelectedTable, resumeOrder, clearResumeOrder, setPendingOrderType,
} = tablesSlice.actions;
export const tablesReducer = tablesSlice.reducer;
