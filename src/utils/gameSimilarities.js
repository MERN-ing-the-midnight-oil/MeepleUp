/**
 * Finds similarities between a proposed game and user's owned/favorited games
 * Returns Beeple's personalized recommendation text based on matching attributes
 * 
 * @param {Object} proposedGame - The game being viewed
 * @param {Array} userCollection - User's owned games from CollectionsContext
 * @param {Object} customWeights - Optional custom weights for matching criteria
 * @param {number} customWeights.publisher - Weight for publisher matches (default: 3)
 * @param {number} customWeights.mechanics - Weight for mechanics matches (default: 3)
 * @param {number} customWeights.category - Weight for category matches (default: 2)
 * @param {number} customWeights.complexity - Weight for complexity matches (default: 1.5)
 * @param {number} customWeights.favorite - Multiplier for favorited games (default: 2)
 * @returns {string|null} Beeple's recommendation text or null if no strong matches
 */
export const findGameSimilarities = (proposedGame, userCollection, customWeights = null) => {
  if (!proposedGame || !userCollection || userCollection.length === 0) {
    return null;
  }

  // Default weight factors for different attributes
  const DEFAULT_WEIGHTS = {
    publisher: 3,
    mechanics: 3,
    category: 2,
    complexity: 1.5,
    favorite: 2 // Multiplier for favorited games
  };

  // Use custom weights if provided, otherwise use defaults
  // Weights are used as raw multipliers - their proportions determine relative importance
  const WEIGHTS = customWeights ? { ...DEFAULT_WEIGHTS, ...customWeights } : DEFAULT_WEIGHTS;

  const matches = {
    publisher: [],
    mechanics: [],
    category: [],
    complexity: []
  };

  // Normalize proposed game data
  // Check both game object and _bggData (BGG data might be nested)
  const bggData = proposedGame._bggData || proposedGame;
  const proposedPublisher = normalizeString(
    bggData.publisher || 
    (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : null)
  );
  const proposedMechanics = normalizeArray(bggData.mechanics || []);
  const proposedCategories = normalizeArray(bggData.categories || []);
  const proposedComplexity = bggData.averageWeight || bggData.complexity || null;

  // Get the proposed game's ID for comparison (to exclude it from matches)
  const proposedGameId = proposedGame.bggId || proposedGame.id;
  const proposedGameIdStr = proposedGameId ? String(proposedGameId) : null;

  // Find matches in user's collection (excluding the proposed game itself)
  userCollection.forEach(game => {
    // Skip if this is the same game (compare by bggId or id)
    const gameId = game.bggId || game.id;
    const gameIdStr = gameId ? String(gameId) : null;
    if (proposedGameIdStr && gameIdStr && proposedGameIdStr === gameIdStr) {
      return; // Skip comparing game to itself
    }
    const isFavorite = game.isFavorite === true;
    const favoriteMultiplier = isFavorite ? WEIGHTS.favorite : 1;

    // Get BGG data for user's game (might be nested or direct)
    const userGameBggData = game._bggData || game;
    const userGamePublisher = normalizeString(
      userGameBggData.publisher || 
      (Array.isArray(userGameBggData.publishers) && userGameBggData.publishers.length > 0 ? userGameBggData.publishers[0] : null)
    );
    const userGameMechanics = normalizeArray(userGameBggData.mechanics || []);
    const userGameCategories = normalizeArray(userGameBggData.categories || []);
    const userGameComplexity = userGameBggData.averageWeight || userGameBggData.complexity || null;

    // Check publisher match
    if (proposedPublisher && userGamePublisher) {
      if (proposedPublisher === userGamePublisher) {
        matches.publisher.push({
          game: game.title || game.name || 'Unknown Game',
          isFavorite,
          score: WEIGHTS.publisher * favoriteMultiplier
        });
      }
    }

    // Check mechanics match
    if (proposedMechanics.length > 0 && userGameMechanics.length > 0) {
      const sharedMechanics = proposedMechanics.filter(m => 
        userGameMechanics.includes(m)
      );
      
      sharedMechanics.forEach(mechanic => {
        matches.mechanics.push({
          game: game.title || game.name || 'Unknown Game',
          mechanic: formatMechanic(mechanic),
          isFavorite,
          score: WEIGHTS.mechanics * favoriteMultiplier
        });
      });
    }

    // Check category/theme match
    if (proposedCategories.length > 0 && userGameCategories.length > 0) {
      const sharedCategories = proposedCategories.filter(c => 
        userGameCategories.includes(c)
      );
      
      sharedCategories.forEach(category => {
        matches.category.push({
          game: game.title || game.name || 'Unknown Game',
          category: formatCategory(category),
          isFavorite,
          score: WEIGHTS.category * favoriteMultiplier
        });
      });
    }

    // Check complexity match (within 0.5 range)
    if (proposedComplexity && userGameComplexity) {
      const diff = Math.abs(proposedComplexity - userGameComplexity);
      if (diff <= 0.5) {
        matches.complexity.push({
          game: game.title || game.name || 'Unknown Game',
          weight: userGameComplexity,
          isFavorite,
          score: WEIGHTS.complexity * favoriteMultiplier
        });
      }
    }
  });

  // Build recommendation text based on best matches
  return buildRecommendationText(matches, proposedGame.title || proposedGame.name || 'this game');
};

/**
 * Helper: Normalize string for comparison
 */
const normalizeString = (str) => {
  if (!str) return '';
  return str.toLowerCase().trim();
};

/**
 * Helper: Normalize array of strings
 */
const normalizeArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => normalizeString(item)).filter(Boolean);
};

/**
 * Helper: Format mechanic name for display
 */
const formatMechanic = (mechanic) => {
  return mechanic
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Helper: Format category name for display
 */
const formatCategory = (category) => {
  return formatMechanic(category); // Same formatting logic
};

/**
 * Build personalized recommendation text from matches
 */
const buildRecommendationText = (matches, proposedTitle) => {
  const recommendations = [];

  // Prioritize publisher matches (highest weight)
  if (matches.publisher.length > 0) {
    // Sort by score and take best match
    const best = matches.publisher.sort((a, b) => b.score - a.score)[0];
    const relationship = best.isFavorite ? 'favorited' : 'own';
    recommendations.push(
      `it's published by the same company as "${best.game}", a game you ${relationship}`
    );
  }

  // Add mechanics matches (highest weight)
  if (matches.mechanics.length > 0) {
    // Group by mechanic to avoid repetition
    const mechanicGroups = {};
    matches.mechanics.forEach(m => {
      if (!mechanicGroups[m.mechanic]) {
        mechanicGroups[m.mechanic] = [];
      }
      mechanicGroups[m.mechanic].push(m);
    });

    // Take top 2 mechanics
    const topMechanics = Object.entries(mechanicGroups)
      .sort((a, b) => b[1][0].score - a[1][0].score)
      .slice(0, 2);

    topMechanics.forEach(([mechanic, games]) => {
      const best = games.sort((a, b) => b.score - a.score)[0];
      const relationship = best.isFavorite ? 'favorited' : 'own';
      recommendations.push(
        `it has ${mechanic}, just like "${best.game}" that you ${relationship}`
      );
    });
  }

  // Add category matches if we don't have enough recommendations yet
  if (recommendations.length < 2 && matches.category.length > 0) {
    const best = matches.category.sort((a, b) => b.score - a.score)[0];
    const relationship = best.isFavorite ? 'favorited' : 'own';
    recommendations.push(
      `it shares the ${best.category} theme with "${best.game}" that you ${relationship}`
    );
  }

  // Add complexity match as final piece if available
  if (recommendations.length < 3 && matches.complexity.length > 0) {
    const best = matches.complexity.sort((a, b) => b.score - a.score)[0];
    const relationship = best.isFavorite ? 'favorited' : 'own';
    recommendations.push(
      `it has a similar complexity level to "${best.game}" that you ${relationship}`
    );
  }

  // Return null if no meaningful matches
  if (recommendations.length === 0) {
    return null;
  }

  // Build final text with Beeple's greeting
  const gameTitle = proposedTitle || 'this game';
  return `Beep-Boop-Bop, I'm Beeple and here is why you might like "${gameTitle}": ${recommendations.join(', and ')}.`;
};

