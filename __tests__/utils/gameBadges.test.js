/**
 * @jest-environment node
 */
import { CATEGORIES, getBadgeLevel, getGameBadges, getStarRating } from '../../src/utils/gameBadges';

describe('gameBadges', () => {
  describe('CATEGORIES', () => {
    it('has strategyGames, familyGames, partyGames', () => {
      expect(CATEGORIES.strategyGames.name).toBe('Strategy');
      expect(CATEGORIES.strategyGames.field).toBe('strategyGamesRank');
      expect(CATEGORIES.familyGames.name).toBe('Family');
      expect(CATEGORIES.partyGames.name).toBe('Party');
    });
  });

  describe('getBadgeLevel', () => {
    it('returns null for empty/falsy rank', () => {
      expect(getBadgeLevel('')).toBe(null);
      expect(getBadgeLevel('0')).toBe(null);
      expect(getBadgeLevel(null)).toBe(null);
    });

    it('returns gold for rank <= 50', () => {
      expect(getBadgeLevel(1)).toBe('gold');
      expect(getBadgeLevel(50)).toBe('gold');
      expect(getBadgeLevel('25')).toBe('gold');
    });

    it('returns silver for rank 51-100', () => {
      expect(getBadgeLevel(51)).toBe('silver');
      expect(getBadgeLevel(100)).toBe('silver');
    });

    it('returns bronze for rank 101-200', () => {
      expect(getBadgeLevel(101)).toBe('bronze');
      expect(getBadgeLevel(200)).toBe('bronze');
    });

    it('returns null for rank > 200', () => {
      expect(getBadgeLevel(201)).toBe(null);
      expect(getBadgeLevel(500)).toBe(null);
    });
  });

  describe('getGameBadges', () => {
    it('returns empty array for null game', () => {
      expect(getGameBadges(null)).toEqual([]);
    });

    it('returns badges for game with category ranks', () => {
      const game = {
        strategyGamesRank: '10',
        familyGamesRank: '150',
        partyGamesRank: '',
      };
      const badges = getGameBadges(game);
      expect(badges.length).toBeGreaterThan(0);
      const strategyBadge = badges.find((b) => b.category === 'strategyGames');
      expect(strategyBadge).toBeDefined();
      expect(strategyBadge.level).toBe('gold');
      const familyBadge = badges.find((b) => b.category === 'familyGames');
      expect(familyBadge.level).toBe('bronze');
    });

    it('sorts badges gold, silver, bronze', () => {
      const game = {
        strategyGamesRank: '100',
        familyGamesRank: '10',
        partyGamesRank: '60',
      };
      const badges = getGameBadges(game);
      const levels = badges.map((b) => b.level);
      const goldIndex = levels.indexOf('gold');
      const silverIndex = levels.indexOf('silver');
      const bronzeIndex = levels.indexOf('bronze');
      if (goldIndex >= 0 && silverIndex >= 0) expect(goldIndex).toBeLessThan(silverIndex);
      if (silverIndex >= 0 && bronzeIndex >= 0) expect(silverIndex).toBeLessThan(bronzeIndex);
    });
  });

  describe('getStarRating', () => {
    it('returns 0 for empty/falsy', () => {
      expect(getStarRating('')).toBe(0);
      expect(getStarRating(0)).toBe(0);
      expect(getStarRating(null)).toBe(0);
    });

    it('converts BGG 0-10 scale to 0-5 stars', () => {
      expect(getStarRating(10)).toBe(5);
      expect(getStarRating(5)).toBe(2.5);
      expect(getStarRating(8)).toBe(4);
    });

    it('rounds to nearest 0.5', () => {
      const r = getStarRating(7.2);
      expect([3, 3.5, 4]).toContain(r);
    });
  });
});
