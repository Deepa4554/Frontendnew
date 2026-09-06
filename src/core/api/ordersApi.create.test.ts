import { ordersApi } from './ordersApi';
import { apiClient } from '../network/api';

jest.mock('../network/api', () => ({ apiClient: { post: jest.fn() } }));

const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

const base = {
  orderType: 'DINE_IN' as const,
  tableCode: 'T11',
  items: [{ menuItemId: 35, qty: 1 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: { id: 1, currentFireBatch: 1 } } as any);
});

describe('ordersApi.create — fireImmediately', () => {
  // The regression this exists for: submitOrder used to POST /orders and then POST
  // /orders/{id}/fire, so every KOT tap paid two serialised round trips for something the
  // cashier always wanted as one action.
  it('sends the flag through so create and fire are ONE request', async () => {
    await ordersApi.create({ ...base, fireImmediately: true });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/orders');
    expect((body as { fireImmediately?: boolean }).fireImmediately).toBe(true);
  });

  // Hold Order's whole purpose is an order that exists on the table without reaching the
  // kitchen — sending true here would fire it the moment it was held.
  it('carries false through for Hold Order rather than dropping the field', async () => {
    await ordersApi.create({ ...base, fireImmediately: false });

    const body = mockPost.mock.calls[0][1] as { fireImmediately?: boolean };
    expect(body.fireImmediately).toBe(false);
  });

  // Every other caller of create() must keep the old two-step behaviour, which the backend
  // gets by defaulting the flag to false when it is absent.
  it('omits the field entirely when a caller does not ask to fire', async () => {
    await ordersApi.create(base);

    const body = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect('fireImmediately' in body).toBe(false);
  });
});
