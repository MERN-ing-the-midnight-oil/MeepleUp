/**
 * @jest-environment node
 */
import { calculateMatchScore } from '../../src/utils/matchScore';

describe('matchScore', () => {
  it('returns null when game is null', () => {
    expect(calculateMatchScore(null, [{ id: 1 }])).toBe(null);
  });

  it('returns null when userCollection is empty', () => {
    expect(calculateMatchScore({ id: 1 }, [])).toBe(null);
  });

  it('returns null when userCollection is null/undefined', () => {
    expect(calculateMatchScore({ id: 1 }, null)).toBe(null);
  });

  it('returns null when no matches between game and collection', () => {
    const game = {
      _bggData: { publisher: 'A', mechanics: ['a'], categories: ['x'], averageWeight: 2 },
    };
    const collection = [
      {
        bggId: '1',
        _bggData: { publisher: 'B', mechanics: ['b'], categories: ['y'], averageWeight: 4 },
      },
    ];
    expect(calculateMatchScore(game, collection)).toBe(null);
  });

  it('returns a score when publisher matches', () => {
    const game = {
      _bggData: { publisher: 'Same Publisher', mechanics: [], categories: [], averageWeight: 2 },
    };
    const collection = [
      {
        bggId: '1',
        _bggData: { publisher: 'Same Publisher', mechanics: [], categories: [] },
      },
    ];
    const score = calculateMatchScore(game, collection);
    expect(score).not.toBe(null);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns a score when mechanics overlap', () => {
    const game = {
      _bggData: { publisher: '', mechanics: ['Dice Rolling'], categories: [], averageWeight: 2 },
    };
    const collection = [
      {
        bggId: '1',
        _bggData: { publisher: '', mechanics: ['Dice Rolling', 'Set Collection'], categories: [] },
      },
    ];
    const score = calculateMatchScore(game, collection);
    expect(score).not.toBe(null);
    expect(score).toBeGreaterThan(0);
  });

  it('accepts customWeights', () => {
    const game = {
      _bggData: { publisher: 'P', mechanics: [], categories: [], averageWeight: 2 },
    };
    const collection = [
      { bggId: '1', _bggData: { publisher: 'P', mechanics: [], categories: [] } },
    ];
    const scoreDefault = calculateMatchScore(game, collection);
    const scoreCustom = calculateMatchScore(game, collection, { publisher: 10 });
    expect(scoreCustom).toBeGreaterThanOrEqual(0);
    expect(scoreCustom).toBeLessThanOrEqual(100);
    expect(typeof scoreDefault).toBe('number');
  });
});
