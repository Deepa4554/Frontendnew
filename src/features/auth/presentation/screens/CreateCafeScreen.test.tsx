import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { CreateCafeScreen } from './CreateCafeScreen';
import { authApi } from '../../../../core/api/authApi';
import { renderWithProviders, createMockNavigation } from '../../../../test-utils';

// Nothing here should reach the network — a fully valid form would otherwise fire a
// real request-otp call at the deployed API.
jest.mock('../../../../core/api/authApi', () => ({
  authApi: { requestOtp: jest.fn(() => Promise.resolve()) },
}));

beforeEach(() => jest.clearAllMocks());

const setupCreateCafe = async () => {
  const navigation = createMockNavigation();
  const view = await renderWithProviders(<CreateCafeScreen navigation={navigation} />, {
    preloadedState: { auth: { isLoading: false, error: null } } as any,
  });

  const pressSendCode = () => fireEvent.press(view.getByText('Send Verification Code'));
  const fill = (placeholder: string, value: string) =>
    fireEvent.changeText(view.getByPlaceholderText(placeholder), value);

  return { navigation, view, pressSendCode, fill };
};

// NOTE: this screen tolerates only three interacting tests per file. Under RTL v14 +
// React 19 the state updates fireEvent queues here aren't drained by teardown, and
// from the fourth test on every render comes back as an empty tree — no combination
// of act()/cleanup/waitFor in afterEach avoids it. The remaining cases therefore live
// in CreateCafeScreen.fieldErrors.test.tsx, which gets its own module registry.
describe('CreateCafeScreen validation feedback', () => {
  it('shows no errors before the user has touched anything', async () => {
    const { view } = await setupCreateCafe();
    expect(view.queryByText('Enter a valid email address.')).toBeNull();
    expect(view.queryByText('Enter your cafe’s name.')).toBeNull();
  });

  // The regression this guards: the button used to be disabled while the form was
  // invalid, which swallowed the press and left the user with a dead grey button and
  // no idea which field was wrong.
  it('names every missing field when the button is pressed on an empty form', async () => {
    const { view, pressSendCode } = await setupCreateCafe();
    pressSendCode();

    expect(await view.findByText('Enter your cafe’s name.')).toBeOnTheScreen();
    expect(view.getByText('Enter your name.')).toBeOnTheScreen();
    expect(view.getByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(view.getByText('Enter a 10-digit mobile number.')).toBeOnTheScreen();
    expect(view.getByText('Password must be at least 6 characters.')).toBeOnTheScreen();
    expect(authApi.requestOtp).not.toHaveBeenCalled();
  });

  it('flags an email typed without an @, and leaves valid fields alone', async () => {
    const { view, fill, pressSendCode } = await setupCreateCafe();
    fill('e.g. Aroma Loft', 'Raj Restaurant');
    fill('you@example.com', 'rajrestaurant555gmail.com');
    pressSendCode();

    expect(await view.findByText('Enter a valid email address.')).toBeOnTheScreen();
    // The cafe name is filled in, so it must not be flagged alongside the email.
    expect(view.queryByText('Enter your cafe’s name.')).toBeNull();
    expect(authApi.requestOtp).not.toHaveBeenCalled();
  });
});
