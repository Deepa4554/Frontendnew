import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PurchaseOrderScreen } from './PurchaseOrderScreen';

// Only the network boundary is faked — every hook (useCreatePurchaseOrder,
// useReceivePurchaseOrder, useCancelPurchaseOrder, usePurchaseOrders, cache
// invalidation) runs for real against a real QueryClient, so this exercises the
// actual Ordered -> Received/Cancelled state machine, not a scripted mock of it.
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));

let mockOrders: any[] = [];
let mockNextOrderId = 1;
let mockNextItemId = 1;

jest.mock('../../../../../core/api/inventoryApi', () => ({
  inventoryApi: {
    list: jest.fn(async () => [
      { id: 1, name: 'Milk', unit: 'litre', current: 10, unitCost: 40, reorderLevel: 5, isActive: true },
    ]),
    listPurchaseOrders: jest.fn(async () => mockOrders),
    createPurchaseOrder: jest.fn(async (req: any) => {
      const order = {
        id: mockNextOrderId++,
        vendorId: req.vendorId ?? null,
        supplierName: req.vendorId ? 'Acme Supplies' : (req.supplierName ?? null),
        vendorPhone: req.vendorId ? '9000000000' : null,
        note: req.note ?? null,
        status: 'ORDERED',
        createdByName: 'Tester',
        createdAt: new Date().toISOString(),
        receivedAt: null,
        receivedByName: null,
        items: req.items.map((it: any) => ({
          purchaseItemId: mockNextItemId++,
          inventoryItemId: it.inventoryItemId,
          inventoryItemName: 'Milk',
          quantity: it.quantity,
          unit: it.unit,
          unitCost: it.unitCost ?? null,
          expiryDate: null,
          receivedQuantity: null,
        })),
      };
      mockOrders = [order, ...mockOrders];
      return order;
    }),
    receivePurchaseOrder: jest.fn(async (id: number, req: any) => {
      mockOrders = mockOrders.map((o) =>
        o.id === id
          ? {
              ...o,
              status: 'RECEIVED',
              receivedAt: new Date().toISOString(),
              receivedByName: 'Tester',
              items: o.items.map((item: any) => {
                const r = req.items.find((x: any) => x.purchaseItemId === item.purchaseItemId);
                return r ? { ...item, unitCost: r.unitCost, receivedQuantity: r.receivedQuantity, expiryDate: r.expiryDate ?? null } : item;
              }),
            }
          : o,
      );
      return mockOrders.find((o) => o.id === id);
    }),
    cancelPurchaseOrder: jest.fn(async (id: number) => {
      mockOrders = mockOrders.map((o) => (o.id === id ? { ...o, status: 'CANCELLED' } : o));
      return mockOrders.find((o) => o.id === id);
    }),
  },
}));

jest.mock('../../../../../core/api/vendorsApi', () => ({
  vendorsApi: { list: jest.fn(async () => [{ id: 1, name: 'Acme Supplies', phone: '9000000000', isActive: true }]) },
}));

jest.mock('../../../../../core/api/settingsApi', () => ({
  settingsApi: { get: jest.fn(async () => ({ businessName: 'Test Cafe' })) },
}));

const renderScreen = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PurchaseOrderScreen />
    </QueryClientProvider>,
  );
};

describe('PurchaseOrderScreen — Ordered/Received/Cancelled flow', () => {
  beforeEach(() => {
    mockOrders = [];
    mockNextOrderId = 1;
    mockNextItemId = 1;
  });

  // Default 5000ms timeout is too tight for this test -- it's a full place/receive/cancel
  // flow across two orders, each step its own render + waitFor round trip.
  it('places an order with no price, receives it with the real price, and cancels a second order', async () => {
    const { getByText, queryByText, getByTestId, queryByTestId, getByPlaceholderText } = await renderScreen();

    // --- Step 1: place an order with a vendor, no price ---
    await waitFor(() => expect(getByText('No purchase orders yet.')).toBeTruthy());
    fireEvent.press(getByTestId('po-fab'));
    await waitFor(() => expect(getByText('Place Purchase Order')).toBeTruthy());

    const createModal = getByTestId('create-order-modal');
    fireEvent.press(within(createModal).getByText('Select vendor...'));
    await waitFor(() => expect(getByTestId('vendor-picker-modal')).toBeTruthy());
    fireEvent.press(getByTestId('vendor-row-1'));

    fireEvent.press(within(createModal).getByText('Select ingredient...'));
    await waitFor(() => expect(getByTestId('ingredient-picker-modal')).toBeTruthy());
    fireEvent.press(getByTestId('ingredient-row-1'));

    fireEvent.changeText(within(createModal).getByPlaceholderText('Qty (litre)'), '5');
    // Deliberately leave "Expected ₹/unit" blank — price isn't known yet at order time.

    fireEvent.press(getByTestId('po-submit-create'));

    // --- Assert: order shows as Ordered, with no price, stock untouched ---
    await waitFor(() => expect(queryByText('Place Purchase Order')).toBeNull());
    let card = getByTestId('po-card-1');
    expect(within(card).getByText('Acme Supplies')).toBeTruthy();
    expect(within(card).getByText('Ordered')).toBeTruthy();
    expect(within(card).getByText('5litre')).toBeTruthy(); // no "× ₹" suffix — price unset
    expect(within(card).getByTestId('po-send-whatsapp')).toBeTruthy(); // vendor has a phone
    expect(within(card).getByTestId('po-mark-received')).toBeTruthy();
    expect(within(card).getByTestId('po-cancel-order')).toBeTruthy();

    // --- Step 3: receive it with the real quantity/price/expiry ---
    fireEvent.press(within(card).getByTestId('po-mark-received'));
    await waitFor(() => expect(getByText('Receive Order #1')).toBeTruthy());
    const receiveModal = getByTestId('receive-modal');
    expect(within(receiveModal).getByDisplayValue('5')).toBeTruthy(); // received qty pre-filled from ordered qty
    fireEvent.changeText(within(receiveModal).getByPlaceholderText('Actual ₹/unit'), '45');
    fireEvent.press(getByTestId('po-submit-receive'));

    // --- Assert: order now shows Received, with the real price, no more actions ---
    await waitFor(() => expect(queryByText('Receive Order #1')).toBeNull());
    card = getByTestId('po-card-1');
    expect(within(card).getByText('Received')).toBeTruthy();
    expect(within(card).getByText('5litre × ₹45.00')).toBeTruthy();
    expect(within(card).getByText('Received by Tester')).toBeTruthy();
    expect(within(card).queryByTestId('po-mark-received')).toBeNull();
    expect(within(card).queryByTestId('po-cancel-order')).toBeNull();
    expect(within(card).queryByTestId('po-send-whatsapp')).toBeNull();

    // --- A second order, one-off supplier, then Cancel it ---
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b) => b.text === 'Cancel order')?.onPress?.();
    });

    fireEvent.press(getByTestId('po-fab'));
    await waitFor(() => expect(getByText('Place Purchase Order')).toBeTruthy());
    const createModal2 = getByTestId('create-order-modal');
    fireEvent.changeText(within(createModal2).getByPlaceholderText('e.g. Local Roasters Co.'), 'Local Roasters');
    fireEvent.press(within(createModal2).getByText('Select ingredient...'));
    await waitFor(() => expect(getByTestId('ingredient-picker-modal')).toBeTruthy());
    fireEvent.press(getByTestId('ingredient-row-1'));
    fireEvent.changeText(within(createModal2).getByPlaceholderText('Qty (litre)'), '2');
    fireEvent.press(getByTestId('po-submit-create'));

    await waitFor(() => expect(getByTestId('po-card-2')).toBeTruthy());
    const card2 = getByTestId('po-card-2');
    expect(within(card2).getByText('Local Roasters')).toBeTruthy();
    expect(within(card2).getByText('Ordered')).toBeTruthy();
    expect(within(card2).queryByTestId('po-send-whatsapp')).toBeNull(); // no vendor phone for a one-off supplier

    fireEvent.press(within(card2).getByTestId('po-cancel-order'));
    await waitFor(() => expect(within(getByTestId('po-card-2')).getByText('Cancelled')).toBeTruthy());
    expect(within(getByTestId('po-card-2')).queryByTestId('po-mark-received')).toBeNull();

    // First order's Received state must be untouched by the second order's flow.
    expect(within(getByTestId('po-card-1')).getByText('Received')).toBeTruthy();
  }, 15000);
});
