import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { CreateCafeScreen } from './CreateCafeScreen';
import { renderWithProviders, createMockNavigation } from '../../../../test-utils';

jest.mock('../../../../core/api/authApi', () => ({
  authApi: { requestOtp: jest.fn(() => Promise.resolve()) },
}));

// Split out of CreateCafeScreen.test.tsx — see the note there on why this screen
// tolerates only a few interacting tests per file, which is also why this one holds
// a single test. The mirror case (an error disappearing once the value turns valid)
// isn't asserted here: a changeText that should clear an error doesn't flush in this
// RTL/React combination, so the assertion would fail on the harness, not the screen.
describe('CreateCafeScreen per-field error lifecycle', () => {
  it('flags a field as soon as it is left, without touching the others', async () => {
    const view = await renderWithProviders(<CreateCafeScreen navigation={createMockNavigation()} />, {
      preloadedState: { auth: { isLoading: false, error: null } } as any,
    });
    const phone = () => view.getByPlaceholderText('10-digit mobile number');

    fireEvent.changeText(phone(), '91574');
    fireEvent(phone(), 'blur');

    expect(await view.findByText('Enter a 10-digit mobile number.')).toBeOnTheScreen();
    // Leaving one field must not flag the rest of the form.
    expect(view.queryByText('Enter a valid email address.')).toBeNull();
    expect(view.queryByText('Enter your cafe’s name.')).toBeNull();
  });
});
