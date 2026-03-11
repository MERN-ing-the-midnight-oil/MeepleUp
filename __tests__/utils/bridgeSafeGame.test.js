/**
 * @jest-environment node
 */
const {
  toPlainGame,
  toPlainGameViaJSON,
  buildGridGamePayloads,
} = require('../../src/utils/bridgeSafeGame');

describe('bridgeSafeGame', () => {
  describe('toPlainGame', () => {
    it('returns null/undefined as-is', () => {
      expect(toPlainGame(null)).toBe(null);
      expect(toPlainGame(undefined)).toBe(undefined);
    });

    it('returns primitives as-is', () => {
      expect(toPlainGame('a')).toBe('a');
      expect(toPlainGame(1)).toBe(1);
      expect(toPlainGame(true)).toBe(true);
    });

    it('returns undefined for symbol and function', () => {
      expect(toPlainGame(Symbol('x'))).toBe(undefined);
      expect(toPlainGame(() => {})).toBe(undefined);
    });

    it('copies array via JSON', () => {
      const arr = [1, 2, { a: 3 }];
      const out = toPlainGame(arr);
      expect(out).toEqual([1, 2, { a: 3 }]);
      expect(out).not.toBe(arr);
    });

    it('copies object via JSON', () => {
      const obj = { id: 1, name: 'Test' };
      const out = toPlainGame(obj);
      expect(out).toEqual({ id: 1, name: 'Test' });
      expect(out).not.toBe(obj);
    });
  });

  describe('toPlainGameViaJSON', () => {
    it('returns plain object for game', () => {
      const game = { id: 1, name: 'Catan' };
      const out = toPlainGameViaJSON(game);
      expect(out).toEqual({ id: 1, name: 'Catan' });
    });

    it('falls back to toPlainGame for circular refs', () => {
      const o = { a: 1 };
      o.self = o;
      const out = toPlainGameViaJSON(o);
      expect(out).toBeDefined();
      expect(typeof out).toBe('object');
    });
  });

  describe('buildGridGamePayloads', () => {
    it('returns gamePayload and preloadedBggDataPayload', () => {
      const game = { id: 1, name: 'Catan', _bggData: { year: 1995 } };
      const out = buildGridGamePayloads(game);
      expect(out).toHaveProperty('gamePayload');
      expect(out).toHaveProperty('preloadedBggDataPayload');
      expect(out).toHaveProperty('plainGame');
      expect(typeof out.gamePayload).toBe('string');
      expect(out.plainGame).toEqual(expect.objectContaining({ id: 1, name: 'Catan' }));
    });

    it('handles null game', () => {
      const out = buildGridGamePayloads(null);
      expect(out.gamePayload).toBeDefined();
      expect(out.plainGame).toEqual({});
    });
  });
});
