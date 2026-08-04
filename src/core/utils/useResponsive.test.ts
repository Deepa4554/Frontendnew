import { Dimensions, Platform } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useResponsive, BREAKPOINTS } from './useResponsive';

const setWidth = (width: number, height = 800) =>
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale: 2, fontScale: 1 });

describe('useResponsive', () => {
  afterEach(() => jest.restoreAllMocks());

  it('classifies a phone width as mobile', async () => {
    setWidth(BREAKPOINTS.tablet - 1);
    const { result } = await renderHook(() => useResponsive());
    expect(result.current.screenSize).toBe('mobile');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isWideLayout).toBe(false);
  });

  it('classifies a tablet width as tablet (wide layout, not mobile)', async () => {
    setWidth(BREAKPOINTS.tablet);
    const { result } = await renderHook(() => useResponsive());
    expect(result.current.screenSize).toBe('tablet');
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isWideLayout).toBe(true);
  });

  it('classifies a desktop width as desktop', async () => {
    setWidth(BREAKPOINTS.desktop);
    const { result } = await renderHook(() => useResponsive());
    expect(result.current.screenSize).toBe('desktop');
    expect(result.current.isDesktop).toBe(true);
  });

  it('isDesktopWeb is true only on a wide *web* viewport, never native', async () => {
    setWidth(BREAKPOINTS.desktop);

    Platform.OS = 'web';
    expect((await renderHook(() => useResponsive())).result.current.isDesktopWeb).toBe(true);

    Platform.OS = 'android';
    expect((await renderHook(() => useResponsive())).result.current.isDesktopWeb).toBe(false);
  });
});
