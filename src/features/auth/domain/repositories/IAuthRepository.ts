import { User, AuthSession } from '../entities/User';

export interface IAuthRepository {
  loginWithEmail(email: string, password: string, role?: User['role']): Promise<AuthSession>;
  loginWithMobile(phone: string, otp: string): Promise<AuthSession>;
  registerCafe(cafeName: string, email: string, password: string, ownerName: string, phone: string, otp: string): Promise<AuthSession>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  restoreSession(): Promise<User | null>;
}
