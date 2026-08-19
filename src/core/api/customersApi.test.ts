import { customersApi } from './customersApi';
import { apiClient } from '../network/api';

jest.mock('../network/api', () => ({ apiClient: { get: jest.fn() } }));

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

/** The server clamps pageSize to 100 (Pagination.MaxPageSize) — mirrored here, because
 * silently returning fewer rows than asked for is the exact behaviour listAll exists to cope
 * with, and a stub that honoured a huge pageSize would test nothing. */
const SERVER_MAX_PAGE_SIZE = 100;

const fakeServer = (totalCustomers: number) => {
  const everyone = Array.from({ length: totalCustomers }, (_, i) => ({
    id: i + 1,
    name: `Customer ${i + 1}`,
    phone: `98${String(i).padStart(8, '0')}`,
  }));
  mockGet.mockImplementation((_url: string, config?: any) => {
    const page = config?.params?.page ?? 1;
    const pageSize = Math.min(config?.params?.pageSize ?? 20, SERVER_MAX_PAGE_SIZE);
    const items = everyone.slice((page - 1) * pageSize, page * pageSize);
    return Promise.resolve({
      data: { items, page, pageSize, totalCount: totalCustomers, totalPages: Math.ceil(totalCustomers / pageSize) },
    }) as any;
  });
  return everyone;
};

beforeEach(() => jest.clearAllMocks());

describe('customersApi.listAll', () => {
  it('returns every customer when there are more than one page of them', async () => {
    // The failure this guards: a single request for a huge page comes back clamped to 100,
    // and the export ships 100 rows under a filename claiming to be the whole book.
    fakeServer(250);

    const all = await customersApi.listAll();

    expect(all).toHaveLength(250);
    expect(all[0].name).toBe('Customer 1');
    expect(all[249].name).toBe('Customer 250');
    expect(new Set(all.map((c) => c.id)).size).toBe(250); // no page overlap
  });

  it('stops after one request when everyone fits on a page', async () => {
    fakeServer(12);

    const all = await customersApi.listAll();

    expect(all).toHaveLength(12);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('returns nothing, and asks only once, when there are no customers', async () => {
    fakeServer(0);

    expect(await customersApi.listAll()).toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('passes the search term through on every page', async () => {
    fakeServer(150);

    await customersApi.listAll('raj');

    expect(mockGet).toHaveBeenCalledTimes(2);
    for (const call of mockGet.mock.calls) {
      expect((call[1] as any).params.search).toBe('raj');
    }
  });

  it('gives up rather than looping forever if the count never settles', async () => {
    // A server whose totalCount keeps growing (or is simply wrong) must not spin this
    // forever — the page cap is the backstop.
    mockGet.mockImplementation(() =>
      Promise.resolve({
        data: { items: [{ id: 1, name: 'A', phone: '9800000000' }], page: 1, pageSize: 100, totalCount: 999999, totalPages: 9999 },
      }) as any,
    );

    const all = await customersApi.listAll();

    expect(mockGet.mock.calls.length).toBeLessThanOrEqual(200);
    expect(all.length).toBeLessThanOrEqual(200);
  });
});
