import { User } from '../domain/entities/User';

// Shared between AuthRepository (login-or-register bridge) and LoginScreen
// (pre-filling the form so what's submitted always matches what's checked).
export const DEMO_PASSWORD = 'PrabandhOS#Demo2026';
export const demoEmailFor = (role: User['role']) => `${role.toLowerCase()}@prabandhos.local`;
