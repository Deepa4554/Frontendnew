import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface BranchState {
  /** null = "All Branches" (no filter, sees everything — the default for
   * single-location cafes and cafes that haven't set up branches yet). */
  activeBranchId: number | null;
}

const initialState: BranchState = {
  activeBranchId: null,
};

const branchSlice = createSlice({
  name: 'branch',
  initialState,
  reducers: {
    setActiveBranch: (state, action: PayloadAction<number | null>) => {
      state.activeBranchId = action.payload;
    },
  },
});

export const { setActiveBranch } = branchSlice.actions;
export const branchReducer = branchSlice.reducer;
