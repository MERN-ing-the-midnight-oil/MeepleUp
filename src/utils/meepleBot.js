/**
 * MeepleBot Algorithm Utilities
 * 
 * This module provides utilities for the MeepleBot game suggestion algorithm.
 * MeepleBot suggests games based on:
 * 1. Number of players interested in playing
 * 2. Availability of at least one player who can teach (if some don't know the game)
 * 
 * Teaching Status Values (can be multiple per player):
 * - 'happy-to-teach': Player can and wants to teach this game (highest priority for teaching)
 * - 'would-happily-play': Player knows the game and wants to play (can potentially teach if needed)
 * - 'want-to-play': Player wants to play this game (has interest, may or may not know it)
 * - 'please-bring': Player wants someone to bring this game (high interest, request to owner)
 * - 'want-to-learn': Player is interested in learning this game (needs teaching)
 * - 'havent-played-yet': Player owns it but hasn't played (needs teaching)
 * - 'not-excited-to-play': Player is not excited to play this game (negative interest)
 * - null or []: No status set (neutral, doesn't count toward interest or teaching)
 * 
 * Note: teachingStatus can be either a single string (old format) or an array of strings (new format)
 */

/**
 * Normalize teaching status to array format (handles both old single-value and new array format)
 * @param {string|string[]|null} status - The teaching status (single value or array)
 * @returns {string[]} - Array of statuses
 */
const normalizeStatuses = (status) => {
  if (!status) return [];
  if (Array.isArray(status)) return status;
  return [status];
};

/**
 * Check if a teaching status indicates the player can teach
 * @param {string|string[]|null} status - The teaching status (single value or array)
 * @returns {boolean} - True if the player can teach
 */
export const canTeach = (status) => {
  const statuses = normalizeStatuses(status);
  return statuses.includes('happy-to-teach') || statuses.includes('would-happily-play');
  // Note: 'want-to-play' and 'please-bring' don't indicate teaching ability
};

/**
 * Check if a teaching status indicates the player needs teaching
 * @param {string|string[]|null} status - The teaching status (single value or array)
 * @returns {boolean} - True if the player needs teaching
 */
export const needsTeaching = (status) => {
  const statuses = normalizeStatuses(status);
  return statuses.includes('want-to-learn') || statuses.includes('havent-played-yet');
};

/**
 * Check if a teaching status indicates interest in playing
 * @param {string|string[]|null} status - The teaching status (single value or array)
 * @returns {boolean} - True if the player is interested (has any positive status)
 */
export const isInterested = (status) => {
  const statuses = normalizeStatuses(status);
  // Exclude 'not-excited-to-play' from interest check
  return statuses.length > 0 && !statuses.every(s => s === 'not-excited-to-play');
};

/**
 * Get the interest weight for a single status value
 * Higher weight = more interest/enthusiasm
 * @param {string} status - A single teaching status value
 * @returns {number} - Interest weight for this status
 */
const getSingleStatusWeight = (status) => {
  switch (status) {
    case 'happy-to-teach':
      return 3; // Highest - actively wants to teach/play
    case 'please-bring':
      return 2.5; // Very high - explicit request to bring
    case 'would-happily-play':
      return 2; // High - knows it and wants to play
    case 'want-to-play':
      return 1.5; // Medium-high - wants to play
    case 'want-to-learn':
      return 1; // Medium - interested but needs teaching
    case 'havent-played-yet':
      return 0.5; // Low - owns it but hasn't played
    case 'not-excited-to-play':
      return -1; // Negative - reduces interest
    default:
      return 0; // Unknown status = no weight
  }
};

/**
 * Get the interest weight for a teaching status (single value or array)
 * Higher weight = more interest/enthusiasm
 * @param {string|string[]|null} status - The teaching status (single value or array)
 * @returns {number} - Total interest weight (can be negative if "not-excited-to-play" is selected)
 */
export const getInterestWeight = (status) => {
  const statuses = normalizeStatuses(status);
  if (statuses.length === 0) return 0;
  
  // Sum all status weights
  return statuses.reduce((total, s) => total + getSingleStatusWeight(s), 0);
};

/**
 * Get the teaching priority for a single status value
 * Higher priority = more likely/willing to teach
 * @param {string} status - A single teaching status value
 * @returns {number} - Teaching priority for this status
 */
const getSingleStatusTeachingPriority = (status) => {
  switch (status) {
    case 'happy-to-teach':
      return 2; // Highest - explicitly wants to teach
    case 'would-happily-play':
      return 1; // Medium - knows it, could teach if needed
    default:
      return 0; // Cannot teach
  }
};

/**
 * Get the teaching priority for a teaching status (single value or array)
 * Higher priority = more likely/willing to teach
 * @param {string|string[]|null} status - The teaching status (single value or array)
 * @returns {number} - Maximum teaching priority (takes highest priority from all statuses)
 */
export const getTeachingPriority = (status) => {
  const statuses = normalizeStatuses(status);
  if (statuses.length === 0) return 0;
  
  // Return the highest priority from all statuses
  return Math.max(...statuses.map(s => getSingleStatusTeachingPriority(s)));
};

/**
 * Analyze a game's status across all event members
 * @param {Object} game - The game object
 * @param {Array} memberGames - Array of member game collections with teachingStatus
 * @returns {Object} - Analysis result
 */
export const analyzeGameForEvent = (game, memberGames) => {
  const gameId = game.id || game.gameId;
  
  // Find all instances of this game across members
  const gameInstances = memberGames.filter(
    (memberGame) => (memberGame.id === gameId || memberGame.gameId === gameId)
  );

  const statusCounts = {
    'happy-to-teach': 0,
    'would-happily-play': 0,
    'want-to-play': 0,
    'please-bring': 0,
    'want-to-learn': 0,
    'havent-played-yet': 0,
    'not-excited-to-play': 0,
    null: 0,
  };

  let totalInterest = 0;
  let totalTeachingPriority = 0;
  let canTeachCount = 0;
  let needsTeachingCount = 0;

  gameInstances.forEach((instance) => {
    const status = instance.teachingStatus || null;
    const statuses = normalizeStatuses(status);
    
    // Count each status (for arrays, count each status separately)
    if (statuses.length === 0) {
      statusCounts[null] = (statusCounts[null] || 0) + 1;
    } else {
      statuses.forEach(s => {
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
    }

    if (isInterested(status)) {
      totalInterest += getInterestWeight(status);
      totalTeachingPriority += getTeachingPriority(status);
      
      if (canTeach(status)) {
        canTeachCount++;
      }
      if (needsTeaching(status)) {
        needsTeachingCount++;
      }
    }
  });

  const hasTeacher = canTeachCount > 0;
  const hasLearners = needsTeachingCount > 0;
  const needsTeacher = hasLearners && !hasTeacher;

  return {
    gameId,
    game,
    instanceCount: gameInstances.length,
    statusCounts,
    totalInterest,
    totalTeachingPriority,
    canTeachCount,
    needsTeachingCount,
    hasTeacher,
    hasLearners,
    needsTeacher,
    // Score for ranking: interest + teaching availability bonus
    score: totalInterest + (hasTeacher ? 2 : 0) - (needsTeacher ? 5 : 0),
  };
};

/**
 * Suggest games for an event based on member interest and teaching availability
 * @param {Array} allGames - All unique games in the event collection
 * @param {Array} memberGames - Array of all member game collections with teachingStatus
 * @param {Object} options - Options for filtering/sorting
 * @param {boolean} options.requireTeacher - Only suggest games with at least one teacher (default: true)
 * @param {number} options.minInterest - Minimum interest score to include (default: 1)
 * @param {number} options.maxResults - Maximum number of suggestions (default: 10)
 * @returns {Array} - Sorted array of game suggestions with analysis
 */
export const suggestGamesForEvent = (
  allGames,
  memberGames,
  options = {}
) => {
  const {
    requireTeacher = true,
    minInterest = 1,
    maxResults = 10,
  } = options;

  // Analyze each game
  const analyzedGames = allGames.map((game) =>
    analyzeGameForEvent(game, memberGames)
  );

  // Filter games
  const filteredGames = analyzedGames.filter((analysis) => {
    if (requireTeacher && analysis.needsTeacher) {
      return false; // Skip games that need a teacher but don't have one
    }
    if (analysis.totalInterest < minInterest) {
      return false; // Skip games with too little interest
    }
    return true;
  });

  // Sort by score (descending), then by total interest
  const sortedGames = filteredGames.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.totalInterest - a.totalInterest;
  });

  // Return top results
  return sortedGames.slice(0, maxResults);
};

/**
 * Format a game suggestion for display
 * @param {Object} analysis - Analysis result from analyzeGameForEvent
 * @returns {string} - Formatted suggestion text
 */
export const formatGameSuggestion = (analysis) => {
  const { game, canTeachCount, needsTeachingCount, totalInterest } = analysis;
  const gameName = game.title || game.name || 'Unknown Game';
  
  const parts = [];
  
  if (canTeachCount > 0) {
    parts.push(`${canTeachCount} player${canTeachCount > 1 ? 's' : ''} can teach`);
  }
  
  if (needsTeachingCount > 0) {
    parts.push(`${needsTeachingCount} player${needsTeachingCount > 1 ? 's' : ''} want${needsTeachingCount > 1 ? '' : 's'} to learn`);
  }
  
  const interestText = parts.length > 0 
    ? ` (${parts.join(', ')})`
    : '';
  
  return `${gameName}${interestText}`;
};

