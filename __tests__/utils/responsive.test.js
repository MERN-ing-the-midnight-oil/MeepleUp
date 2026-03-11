/**
 * @jest-environment node
 */
import {
  BREAKPOINTS,
  getResponsiveValue,
  getColumnCount,
  getResponsiveSpacing,
  isWeb,
  isMobilePlatform,
} from '../../src/utils/responsive';

describe('responsive', () => {
  describe('BREAKPOINTS', () => {
    it('has expected breakpoint values', () => {
      expect(BREAKPOINTS.xs).toBe(0);
      expect(BREAKPOINTS.sm).toBe(576);
      expect(BREAKPOINTS.md).toBe(768);
      expect(BREAKPOINTS.lg).toBe(992);
      expect(BREAKPOINTS.xl).toBe(1200);
      expect(BREAKPOINTS.xxl).toBe(1400);
    });
  });

  describe('getResponsiveValue', () => {
    it('returns xxl value when width >= xxl', () => {
      expect(getResponsiveValue({ xs: 1, xxl: 99 }, 1400)).toBe(99);
    });

    it('returns xl value when width >= xl and < xxl', () => {
      expect(getResponsiveValue({ xs: 1, xl: 88 }, 1200)).toBe(88);
    });

    it('returns lg value when width >= lg', () => {
      expect(getResponsiveValue({ xs: 1, lg: 77 }, 992)).toBe(77);
    });

    it('returns xs value for small width', () => {
      expect(getResponsiveValue({ xs: 10, lg: 20 }, 400)).toBe(10);
    });

    it('returns first value when xs not defined', () => {
      const values = { md: 5, lg: 10 };
      expect(getResponsiveValue(values, 100)).toBe(5);
    });
  });

  describe('getColumnCount', () => {
    it('returns mobile (1) for small width', () => {
      expect(getColumnCount(400)).toBe(1);
    });

    it('returns tablet (2) for md width', () => {
      expect(getColumnCount(800)).toBe(2);
    });

    it('returns desktop (3) for lg width', () => {
      expect(getColumnCount(1000)).toBe(3);
    });

    it('returns largeDesktop (4) for xl width', () => {
      expect(getColumnCount(1300)).toBe(4);
    });

    it('respects custom options', () => {
      expect(getColumnCount(400, { mobile: 2 })).toBe(2);
    });
  });

  describe('getResponsiveSpacing', () => {
    it('returns a number for given width', () => {
      const result = getResponsiveSpacing(400);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isWeb / isMobilePlatform', () => {
    it('isWeb and isMobilePlatform are booleans', () => {
      expect(typeof isWeb).toBe('boolean');
      expect(typeof isMobilePlatform).toBe('boolean');
    });
  });
});
