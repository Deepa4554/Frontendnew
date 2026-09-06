import { ordersApi } from './ordersApi';
import { apiClient } from '../network/api';

jest.mock('../network/api', () => ({ apiClient: { post: jest.fn() } }));

const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

const cart = [
  { menuItemId: 35, qty: 1 },
  { menuItemId: 53, qty: 2, modifier: 'no onion' },
  { menuItemId: 12, qty: 1, variantId: 7, modifierOptionIds: [3, 3, 9] },
  { menuItemId: 88, qty: 1, openPrice: 45.5 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: { id: 2087, items: [] } } as any);
});

describe('ordersApi.addItems', () => {
  // The regression this exists for: submitAppend used to `await ordersApi.addItem(...)` inside a
  // `for (const c of cart)` loop, so a four-item round cost four serialised round trips — each
  // one re-locking the order, re-running the offer engine and recomputing totals server-side.
  it('sends the whole round in ONE request, not one per line', async () => {
    await ordersApi.addItems(2087, cart);

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('posts to the batch route with every line in the body', async () => {
    await ordersApi.addItems(2087, cart);

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/orders/2087/items/batch');
    expect(body).toEqual({ items: cart });
  });

  // A repeated option id is how a Quantity-type add-on group says "2x Extra Cheese" (see
  // ResolveLinePricingAsync) — flattening or de-duplicating it on the way out would silently
  // undercharge, so the array has to survive batching exactly as keyed.
  it('preserves repeated modifier option ids', async () => {
    await ordersApi.addItems(2087, cart);

    const body = mockPost.mock.calls[0][1] as { items: typeof cart };
    expect(body.items[2].modifierOptionIds).toEqual([3, 3, 9]);
  });

  it('returns the updated order the response carries', async () => {
    mockPost.mockResolvedValue({ data: { id: 2087, total: 610 } } as any);

    await expect(ordersApi.addItems(2087, cart)).resolves.toEqual({ id: 2087, total: 610 });
  });
});
