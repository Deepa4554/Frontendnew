import { combineReducers } from '@reduxjs/toolkit';
import { tablesReducer } from './tablesSlice';
import { uiReducer } from './uiSlice';
import { branchReducer } from './branchSlice';
import { authReducer } from '../../features/auth/presentation/viewmodels/authSlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  tables: tablesReducer,
  ui: uiReducer,
  branch: branchReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
