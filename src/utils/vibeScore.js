/**
 * Calculates a Personal Vibe Score (0-100) for a game based on user's collection
 * Uses the same matching logic as Personal Match but returns a numeric score
 * 
 * @param {Object} game - The game to score
 * @param {Array} userCollection - User's owned games from CollectionsContext
 * @param {Object} customWeights - Optional custom weights for matching criteria
 * @returns {number} Vibe score from 0-100, or null if insufficient data
 */
export const calculateVibeScore = (game, userCollection, customWeights = null) => {
  if (!game || !userCollection || userCollection.length === 0) {
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
  const WEIGHTS = customWeights ? { ...DEFAULT_WEIGHTS, ...customWeights } : DEFAULT_WEIGHTS;

  let totalScore = 0;
  let maxPossibleScore = 0;

  // Normalize game data
  const bggData = game._bggData || game;
  const gamePublisher = normalizeString(
    bggData.publisher || 
    (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : null)
  );
  const gameMechanics = normalizeArray(bggData.mechanics || []);
  const gameCategories = normalizeArray(bggData.categories || []);
  const gameComplexity = bggData.averageWeight || bggData.complexity || null;

  // Track matches to avoid double counting
  const matchedGames = new Set();

  // Find matches in user's collection
  userCollection.forEach(userGame => {
    const isFavorite = userGame.isFavorite === true;
    const favoriteMultiplier = isFavorite ? WEIGHTS.favorite : 1;

    // Get BGG data for user's game
    const userGameBggData = userGame._bggData || userGame;
    const userGamePublisher = normalizeString(
      userGameBggData.publisher || 
      (Array.isArray(userGameBggData.publishers) && userGameBggData.publishers.length > 0 ? userGameBggData.publishers[0] : null)
    );
    const userGameMechanics = normalizeArray(userGameBggData.mechanics || []);
    const userGameCategories = normalizeArray(userGameBggData.categories || []);
    const userGameComplexity = userGameBggData.averageWeight || userGameBggData.complexity || null;

    // Check publisher match
    if (gamePublisher && userGamePublisher && gamePublisher === userGamePublisher) {
      const score = WEIGHTS.publisher * favoriteMultiplier;
      totalScore += score;
      maxPossibleScore += WEIGHTS.publisher * WEIGHTS.favorite; // Max possible
      matchedGames.add(userGame.bggId || userGame.id);
    }

    // Check mechanics match (count shared mechanics)
    if (gameMechanics.length > 0 && userGameMechanics.length > 0) {
      const sharedMechanics = gameMechanics.filter(m => userGameMechanics.includes(m));
      if (sharedMechanics.length > 0) {
        // Score based on proportion of shared mechanics
        const mechanicScore = (sharedMechanics.length / Math.max(gameMechanics.length, userGameMechanics.length)) * WEIGHTS.mechanics * favoriteMultiplier;
        totalScore += mechanicScore;
        maxPossibleScore += WEIGHTS.mechanics * WEIGHTS.favorite;
        matchedGames.add(userGame.bggId || userGame.id);
      }
    }

    // Check category match (count shared categories)
    if (gameCategories.length > 0 && userGameCategories.length > 0) {
      const sharedCategories = gameCategories.filter(c => userGameCategories.includes(c));
      if (sharedCategories.length > 0) {
        // Score based on proportion of shared categories
        const categoryScore = (sharedCategories.length / Math.max(gameCategories.length, userGameCategories.length)) * WEIGHTS.category * favoriteMultiplier;
        totalScore += categoryScore;
        maxPossibleScore += WEIGHTS.category * WEIGHTS.favorite;
        matchedGames.add(userGame.bggId || userGame.id);
      }
    }

    // Check complexity match (within 0.5 range, closer = better)
    if (gameComplexity && userGameComplexity) {
      const diff = Math.abs(gameComplexity - userGameComplexity);
      if (diff <= 0.5) {
        // Score decreases as difference increases
        const complexityScore = (1 - (diff / 0.5)) * WEIGHTS.complexity * favoriteMultiplier;
        totalScore += complexityScore;
        maxPossibleScore += WEIGHTS.complexity * WEIGHTS.favorite;
        matchedGames.add(userGame.bggId || userGame.id);
      }
    }
  });

  // If no matches found, return null
  if (totalScore === 0 || matchedGames.size === 0) {
    return null;
  }

  // Normalize to 0-100 scale
  // Base score on totalScore vs maxPossibleScore
  // If maxPossibleScore is 0, we can't calculate a meaningful score
  if (maxPossibleScore === 0) {
    return null;
  }

  // Calculate base score (0-100)
  const baseScore = (totalScore / maxPossibleScore) * 100;
  
  // Apply collection size factor (larger collections get slight boost)
  const collectionSizeFactor = Math.min(userCollection.length / 20, 1); // Cap at 1 for 20+ games
  const adjustedScore = baseScore * (0.7 + 0.3 * collectionSizeFactor);
  
  // Cap at 100 and round
  return Math.min(100, Math.round(adjustedScore));
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

