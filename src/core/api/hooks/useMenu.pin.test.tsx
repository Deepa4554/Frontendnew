import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { queryKeys } from './queryKeys';
import { useToggleMenuPinned } from './useMenu';
import { menuApi } from '../menuApi';
import type { MenuItem } from '../menuApi';

jest.mock('../menuApi', () => ({
  menuApi: { togglePinned: jest.fn() },
}));

// A bare client, not the shared test-utils one: this hook needs no Redux/Paper providers.
const makeTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const togglePinned = menuApi.togglePinned as jest.MockedFunction<typeof menuApi.togglePinned>;

/** Two menu rows, neither pinned. Only the fields this hook touches are filled in. */
const seedMenu = (client: QueryClient) =>
  client.setQueryData(queryKeys.menu, [
    { id: 1, name: 'Masala Chai', pinned: false, variants: [{ id: 9 }] },
    { id: 2, name: 'Veg Sandwich', pinned: false },
  ] as unknown as MenuItem[]);

const cached = (client: QueryClient, id: number) =>
  client.getQueryData<MenuItem[]>(queryKeys.menu)?.find((i) => i.id === id);

/** A promise plus the handles to settle it later, so a tap can be inspected mid-flight. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** renderHook fills `result.current` from an effect, which isn't guaranteed to have flushed
 *  by the time it resolves — so wait for it rather than tapping a null. */
const renderPinHook = async (client: QueryClient) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useToggleMenuPinned(), { wrapper });
  await waitFor(() => expect(result.current).toBeTruthy());
  return result;
};

/** One tap on the pin button. */
const tap = async (result: { current: ReturnType<typeof useToggleMenuPinned> }, id: number) => {
  await act(async () => {
    result.current.mutate(id);
  });
};

describe('useToggleMenuPinned', () => {
  const clients: QueryClient[] = [];
  const newClient = () => {
    const client = makeTestQueryClient();
    clients.push(client);
    return client;
  };

  beforeEach(() => jest.clearAllMocks());
  // Drops each client's caches, and with them the gc timers left behind by a query that
  // was seeded but never observed and by mutations that outlived their observer.
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('pins the item in the cache before the request comes back', async () => {
    const client = newClient();
    seedMenu(client);
    const request = deferred<MenuItem>();
    togglePinned.mockReturnValue(request.promise);

    const result = await renderPinHook(client);
    await tap(result, 1);

    // The point of the whole exercise: the icon flips on the tap, not on the round trip.
    await waitFor(() => expect(cached(client, 1)?.pinned).toBe(true));
    // ...and the row keeps everything else it had, so it can still open its options picker.
    expect(cached(client, 1)?.variants).toHaveLength(1);
    expect(cached(client, 2)?.pinned).toBe(false);

    request.resolve({ id: 1, pinned: true } as MenuItem);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cached(client, 1)?.pinned).toBe(true);
  });

  it('puts the pin back when the request fails', async () => {
    const client = newClient();
    seedMenu(client);
    togglePinned.mockRejectedValue(new Error('offline'));

    const result = await renderPinHook(client);
    await tap(result, 1);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached(client, 1)?.pinned).toBe(false);
  });

  it('survives a burst of impatient taps and refetches only once', async () => {
    const client = newClient();
    seedMenu(client);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const first = deferred<MenuItem>();
    const second = deferred<MenuItem>();
    togglePinned.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const result = await renderPinHook(client);
    await tap(result, 1);
    await waitFor(() => expect(cached(client, 1)?.pinned).toBe(true));
    await tap(result, 1);
    await waitFor(() => expect(cached(client, 1)?.pinned).toBe(false));

    // Responses landing out of order must not resurrect an earlier tap's answer: two taps
    // means two server toggles, so the item is back where it started either way.
    second.resolve({ id: 1, pinned: false } as MenuItem);
    first.resolve({ id: 1, pinned: true } as MenuItem);
    await waitFor(() => expect(togglePinned).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(invalidate.mock.calls.filter((c) => c[0]?.queryKey === queryKeys.menu)).toHaveLength(1),
    );
    expect(cached(client, 1)?.pinned).toBe(false);
  });
});
