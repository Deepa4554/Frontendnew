import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { renderWithProviders, fireEvent, screen } from '../../../test-utils';
import { useItemVoidPrompt } from './useItemVoidPrompt';
import { OrderItem as ApiOrderItem } from '../../../core/api/ordersApi';
import { User } from '../../../features/auth/domain/entities/User';

const mockMutateAsync = jest.fn().mockResolvedValue({});
jest.mock('../../../core/api/hooks/useOrders', () => ({
  useRemoveOrderItem: () => ({ mutateAsync: mockMutateAsync }),
}));

const item = (over: Partial<ApiOrderItem> = {}): ApiOrderItem => ({
  id: 51,
  menuItemId: 7,
  name: 'Paneer Tikka',
  qty: 1,
  price: 260,
  variantId: null,
  variantName: null,
  selectedModifiers: [],
  taxableAmount: 260,
  taxAmount: 13,
  fireBatch: 0,
  status: 'NEW',
  newQty: 1,
  readQty: 0,
  preparingQty: 0,
  readyQty: 0,
  servedQty: 0,
  voided: false,
  voidedAt: null,
  stationName: 'Kitchen',
  ...over,
});

/** Stands in for the order rows on Tables/Token/Takeaway: it gates its remove button on
 *  canVoid exactly as they do, so this test exercises the rule through the same path the
 *  screens use rather than asserting on the helper in isolation. */
const Row: React.FC<{ line: ApiOrderItem }> = ({ line }) => {
  const voidPrompt = useItemVoidPrompt(900, 'void');
  return (
    <View>
      {voidPrompt.canVoid(line) && (
        <TouchableOpacity accessibilityLabel="Remove item" onPress={() => voidPrompt.request(line)}>
          <Text>x</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const renderRow = (role: User['role'], line: ApiOrderItem) =>
  renderWithProviders(<Row line={line} />, {
    preloadedState: {
      auth: {
        user: { id: '1', email: 'a@b.c', name: 'Staff', role, cafeId: '1' },
        isAuthenticated: true,
        isLoading: false,
        isRestoring: false,
        error: null,
      },
    } as any,
  });

beforeEach(() => mockMutateAsync.mockClear());

describe('useItemVoidPrompt — who may take a line off the bill', () => {
  const FLOOR_ROLES: User['role'][] = ['Waiter', 'Chef', 'KitchenStaff', 'Cashier', 'Accountant'];

  it.each(FLOOR_ROLES)('hides the remove button from a %s once the line is fired', async (role) => {
    await renderRow(role, item({ fireBatch: 1, status: 'PREPARING', newQty: 0, preparingQty: 1 }));
    expect(screen.queryByLabelText('Remove item')).toBeNull();
  });

  it.each(FLOOR_ROLES)('still lets a %s pull a line the kitchen never saw', async (role) => {
    await renderRow(role, item({ fireBatch: 0 }));
    expect(screen.getByLabelText('Remove item')).toBeTruthy();
  });

  it.each(['Owner', 'Manager'] as User['role'][])('keeps the button for a %s on a fired line', async (role) => {
    await renderRow(role, item({ fireBatch: 1, status: 'PREPARING', newQty: 0, preparingQty: 1 }));
    expect(screen.getByLabelText('Remove item')).toBeTruthy();
  });

  it('sends an unfired void straight through, with no reason prompt', async () => {
    await renderRow('Waiter', item({ fireBatch: 0 }));
    fireEvent.press(screen.getByLabelText('Remove item'));
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 900, itemId: 51 }));
  });

  it('holds a fired void for the reason prompt instead of firing it blind', async () => {
    // Owner, so the button is there — but a PREPARING line still owes a reason, and nothing
    // may reach the server until one is given.
    await renderRow('Owner', item({ fireBatch: 1, status: 'PREPARING', newQty: 0, preparingQty: 1 }));
    fireEvent.press(screen.getByLabelText('Remove item'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('refuses a fired void that reaches request() with the button gate bypassed', async () => {
    // Belt-and-braces: a screen that forgets `canVoid` must still not put a doomed request on
    // the wire, since Forbid() comes back with no body and reads to staff as a broken app.
    const Ungated: React.FC = () => {
      const voidPrompt = useItemVoidPrompt(900, 'void');
      const line = item({ fireBatch: 1, status: 'PREPARING', newQty: 0, preparingQty: 1 });
      return (
        <TouchableOpacity accessibilityLabel="Ungated" onPress={() => voidPrompt.request(line)}>
          <Text>x</Text>
        </TouchableOpacity>
      );
    };
    await renderWithProviders(<Ungated />, {
      preloadedState: {
        auth: {
          user: { id: '1', email: 'a@b.c', name: 'W', role: 'Waiter', cafeId: '1' },
          isAuthenticated: true, isLoading: false, isRestoring: false, error: null,
        },
      } as any,
    });
    fireEvent.press(screen.getByLabelText('Ungated'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('treats a login whose role has not loaded yet as floor staff', async () => {
    await renderWithProviders(<Row line={item({ fireBatch: 1, status: 'PREPARING' })} />);
    expect(screen.queryByLabelText('Remove item')).toBeNull();
  });
});
