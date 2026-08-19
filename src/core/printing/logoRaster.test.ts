import { getLogoRaster, __resetLogoRasterCache } from './logoRaster';
import { apiClient } from '../network/api';

jest.mock('../network/api', () => ({ apiClient: { get: jest.fn() } }));
const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

beforeEach(() => {
  jest.clearAllMocks();
  __resetLogoRasterCache();
});

describe('getLogoRaster', () => {
  it('returns the fetched bytes on success', async () => {
    const bytes = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 0xff]);
    mockGet.mockResolvedValue({ data: bytes.buffer } as any);

    const result = await getLogoRaster(32);

    expect(result).toEqual(bytes);
    expect(mockGet).toHaveBeenCalledWith('/settings/logo/thermal', expect.objectContaining({ params: { columns: 32 } }));
  });

  it('returns null, not a rejection, when the cafe has no logo (empty 204 body)', async () => {
    mockGet.mockResolvedValue({ data: new ArrayBuffer(0) } as any);

    expect(await getLogoRaster(32)).toBeNull();
  });

  it('returns null rather than throwing when the request fails', async () => {
    // A logo fetch failing (timeout, 500, network drop) must never surface as an unhandled
    // rejection in the middle of printing a bill — see PrinterService.printReceipt, which
    // awaits this directly.
    mockGet.mockRejectedValue(new Error('network down'));

    await expect(getLogoRaster(32)).resolves.toBeNull();
  });

  it('fetches once per column width and reuses the cached result', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mockGet.mockResolvedValue({ data: bytes.buffer } as any);

    await getLogoRaster(32);
    await getLogoRaster(32);
    await getLogoRaster(32);

    // Not "fewer calls than three" — exactly one, or a slow logo host would still be adding
    // network latency to every single receipt printed this session.
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('fetches separately for a different paper width', async () => {
    mockGet.mockResolvedValue({ data: new Uint8Array([1]).buffer } as any);

    await getLogoRaster(32);
    await getLogoRaster(48);

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({ params: { columns: 32 } }));
    expect(mockGet).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ params: { columns: 48 } }));
  });

  it('caches a failure too, rather than retrying on every print', async () => {
    mockGet.mockRejectedValue(new Error('host unreachable'));

    await getLogoRaster(32);
    await getLogoRaster(32);

    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
