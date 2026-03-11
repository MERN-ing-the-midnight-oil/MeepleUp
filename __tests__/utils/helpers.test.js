/**
 * @jest-environment node
 */
import {
  formatDate,
  formatTime,
  getDistance,
  debounce,
  truncateText,
  ensureSerializableId,
  ensureStringOrNull,
} from '../../src/utils/helpers';

describe('helpers', () => {
  describe('formatDate', () => {
    it('formats a date string for display', () => {
      const result = formatDate('2025-03-15T14:00:00Z');
      expect(result).toMatch(/\w{3}, \w{3} \d{1,2}, 2025/);
    });

    it('handles Date objects', () => {
      const date = new Date('2025-06-15T12:00:00Z');
      const result = formatDate(date.toISOString());
      expect(result).toMatch(/\d{4}/);
      expect(result.length).toBeGreaterThan(5);
    });
  });

  describe('formatTime', () => {
    it('formats time from date string', () => {
      const result = formatTime('2025-03-15T14:30:00Z');
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('getDistance', () => {
    it('returns 0 for same coordinates', () => {
      expect(getDistance(0, 0, 0, 0)).toBe(0);
    });

    it('returns positive distance for different coordinates', () => {
      const d = getDistance(0, 0, 1, 1);
      expect(d).toBeGreaterThan(0);
      expect(typeof d).toBe('number');
    });

    it('uses Haversine formula (approx distance NYC to LA ~2450 mi)', () => {
      const nyc = [40.7128, -74.006];
      const la = [34.0522, -118.2437];
      const d = getDistance(nyc[0], nyc[1], la[0], la[1]);
      expect(d).toBeGreaterThan(2400);
      expect(d).toBeLessThan(2600);
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('delays execution until wait time has passed', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      debounced();
      expect(fn).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets timer on repeated calls', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      debounced();
      jest.advanceTimersByTime(50);
      debounced();
      jest.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();
      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes arguments to the inner function', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      debounced('a', 'b');
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith('a', 'b');
    });
  });

  describe('truncateText', () => {
    it('returns full text when under maxLength', () => {
      expect(truncateText('hello', 10)).toBe('hello');
    });

    it('truncates and adds ellipsis when over maxLength', () => {
      expect(truncateText('hello world', 5)).toBe('hello...');
    });

    it('returns exact text when length equals maxLength', () => {
      expect(truncateText('hello', 5)).toBe('hello');
    });
  });

  describe('ensureSerializableId', () => {
    it('returns null for null/undefined', () => {
      expect(ensureSerializableId(null)).toBe(null);
      expect(ensureSerializableId(undefined)).toBe(null);
    });

    it('returns string for Symbol', () => {
      const s = Symbol('test');
      expect(ensureSerializableId(s)).toBe(String(s));
    });

    it('returns value for string and number', () => {
      expect(ensureSerializableId('id')).toBe('id');
      expect(ensureSerializableId(42)).toBe(42);
    });

    it('converts other types to string', () => {
      expect(ensureSerializableId(true)).toBe('true');
    });
  });

  describe('ensureStringOrNull', () => {
    it('returns null for null/undefined', () => {
      expect(ensureStringOrNull(null)).toBe(null);
      expect(ensureStringOrNull(undefined)).toBe(null);
    });

    it('returns null for Symbol', () => {
      expect(ensureStringOrNull(Symbol('x'))).toBe(null);
    });

    it('returns string for non-empty string', () => {
      expect(ensureStringOrNull('https://x.com')).toBe('https://x.com');
    });

    it('returns null for empty string', () => {
      expect(ensureStringOrNull('')).toBe(null);
    });

    it('returns null for number', () => {
      expect(ensureStringOrNull(123)).toBe(null);
    });
  });
});
