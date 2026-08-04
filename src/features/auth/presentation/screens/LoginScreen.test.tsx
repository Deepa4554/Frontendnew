import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';
import { renderWithProviders, createMockNavigation } from '../../../../test-utils';

// renderWithProviders is async in RTL-native v14 — always await setup().
const setup = async (preloadedAuth: Record<string, unknown> = {}) => {
  const navigation = createMockNavigation();
  await renderWithProviders(<LoginScreen navigation={navigation} />, {
    preloadedState: { auth: { isLoading: false, error: null, ...preloadedAuth } } as any,
  });
  return { navigation };
};

describe('LoginScreen', () => {
  it('renders the sign-in form', async () => {
    const { navigation } = await setup();
    expect(screen.getByText('Welcome Back')).toBeOnTheScreen();
    expect(screen.getByText('Sign In')).toBeOnTheScreen();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('starts with empty email and password fields', async () => {
    await setup();
    expect(screen.getByPlaceholderText('manager@prabandhos.ai').props.value).toBe('');
    expect(screen.getByPlaceholderText('••••••••').props.value).toBe('');
  });

  it('masks the password field by default', async () => {
    await setup();
    const password = screen.getByPlaceholderText('••••••••');
    expect(password.props.secureTextEntry).toBe(true);
  });

  it('navigates to ForgotPassword from the "Forgot Access?" link', async () => {
    const { navigation } = await setup();
    fireEvent.press(screen.getByText('Forgot Access?'));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword');
  });

  it('shows the auth error coming from redux state', async () => {
    await setup({ error: 'Invalid credentials' });
    expect(screen.getByText('Invalid credentials')).toBeOnTheScreen();
  });

  it('shows a loading label on the sign-in button while authenticating', async () => {
    await setup({ isLoading: true });
    expect(screen.getByText('Signing In…')).toBeOnTheScreen();
    expect(screen.queryByText('Sign In')).toBeNull();
  });
});
