/**
 * Game Badge System
 * Awards badges based on BGG category rankings from CSV data
 */

// Category definitions with their icons and display names
// Field names match the CSV: abstractsRank, cgsRank, childrensGamesRank, etc.
export const CATEGORIES = {
  strategyGames: {
    name: 'Strategy',
    icon: 'brain', // Brain icon
    color: '#4a90e2',
    field: 'strategyGamesRank',
  },
  familyGames: {
    name: 'Family',
    icon: 'house', // House icon
    color: '#2ecc71',
    field: 'familyGamesRank',
  },
  partyGames: {
    name: 'Party',
    icon: 'balloons', // Balloons icon
    color: '#e74c3c',
    field: 'partyGamesRank',
  },
  wargames: {
    name: 'War',
    icon: 'swords', // Crossed swords icon
    color: '#c0392b',
    field: 'wargamesRank',
  },
  thematic: {
    name: 'Thematic',
    icon: 'compass', // Compass icon
    color: '#9b59b6',
    field: 'thematicRank',
  },
  abstracts: {
    name: 'Abstract',
    icon: 'pattern', // Pattern icon
    color: '#34495e',
    field: 'abstractsRank',
  },
  childrensGames: {
    name: 'Children',
    icon: 'toy', // Toy block icon
    color: '#f39c12',
    field: 'childrensGamesRank',
  },
  cgs: {
    name: 'CCG',
    icon: 'cards', // Card deck icon
    color: '#16a085',
    field: 'cgsRank',
  },
};

// Badge thresholds
const BADGE_THRESHOLDS = {
  gold: 50,
  silver: 100,
  bronze: 200,
};

/**
 * Get badge level (gold, silver, bronze, or null) based on rank
 * @param {string|number} rank - The rank value (can be empty string)
 * @returns {string|null} - 'gold', 'silver', 'bronze', or null
 */
export function getBadgeLevel(rank) {
  if (!rank || rank === '' || rank === '0') {
    return null;
  }

  const rankNum = parseInt(rank, 10);
  if (isNaN(rankNum) || rankNum === 0) {
    return null;
  }

  if (rankNum <= BADGE_THRESHOLDS.gold) {
    return 'gold';
  }
  if (rankNum <= BADGE_THRESHOLDS.silver) {
    return 'silver';
  }
  if (rankNum <= BADGE_THRESHOLDS.bronze) {
    return 'bronze';
  }

  return null;
}

/**
 * Get all badges for a game based on its category rankings
 * @param {Object} game - Game object with category rank fields
 * @returns {Array} - Array of badge objects { category, level, icon, name, color }
 */
export function getGameBadges(game) {
  if (!game) {
    return [];
  }

  const badges = [];

  // Check each category
  Object.keys(CATEGORIES).forEach((categoryKey) => {
    const category = CATEGORIES[categoryKey];
    const rankField = category.field;
    const rank = game[rankField] || '';
    const level = getBadgeLevel(rank);

    if (level) {
      badges.push({
        category: categoryKey,
        level,
        icon: category.icon,
        name: category.name,
        color: category.color,
      });
    }
  });

  // Sort badges: gold first, then silver, then bronze
  badges.sort((a, b) => {
    const levelOrder = { gold: 1, silver: 2, bronze: 3 };
    return levelOrder[a.level] - levelOrder[b.level];
  });

  return badges;
}

/**
 * Get star rating display (0-5 stars) based on average rating
 * @param {string|number} average - Average rating (typically 0-10 scale)
 * @returns {number} - Number of stars (0-5)
 */
export function getStarRating(average) {
  if (!average || average === '' || average === '0') {
    return 0;
  }

  const avgNum = parseFloat(average);
  if (isNaN(avgNum) || avgNum === 0) {
    return 0;
  }

  // BGG ratings are 0-10, convert to 0-5 stars
  // Round to nearest 0.5 star
  const stars = (avgNum / 10) * 5;
  return Math.round(stars * 2) / 2; // Round to 0.5 increments
}

