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
  extraReducers: (builder) => {
    // Matched by action type string (not an imported thunk) to avoid a
    // branchSlice -> authSlice import cycle. `branch` is persisted (see store/index.ts),
    // so without this a logout followed by a different account logging in on the same
    // device would silently inherit the previous session's branch filter/id.
    builder.addMatcher(
      (action): action is { type: 'auth/logout/fulfilled' } => action.type === 'auth/logout/fulfilled',
      (state) => {
        state.activeBranchId = null;
      },
    );
  },
});

export const { setActiveBranch } = branchSlice.actions;
export const branchReducer = branchSlice.reducer;
