// src/utils/gameOptimizer.js

/**
 * Game Schedule Optimizer
 * 
 * Optimizes game selection for an event based on:
 * - Number of attending players
 * - Game duration constraints
 * - Player interest levels (NOT BGG ratings)
 * - Best player count matching
 */

/**
 * Interest level mapping
 * "really-want" = 5 points
 * "interested" = 3 points
 * "maybe" = 1 point
 * "rather-not" = -10 points (heavily penalized to avoid forcing unwanted games)
 * not voted = 0 points
 */
const INTEREST_WEIGHTS = {
  'really-want': 5,
  'interested': 3,
  'maybe': 1,
  'rather-not': -10,
};

/**
 * Calculate if a game has a "best player count" that matches target
 * 
 * @param {object} game - Game object
 * @param {number} targetCount - Target player count
 * @returns {boolean}
 */
function matchesBestPlayerCount(game, targetCount) {
  // Check various possible fields for best player count
  const bestCount = game.bestPlayerCount || 
                    game.idealPlayerCount || 
                    game.recommendedPlayers;
  
  if (!bestCount) return false;
  
  // Handle range (e.g., "3-4")
  if (typeof bestCount === 'string' && bestCount.includes('-')) {
    const [min, max] = bestCount.split('-').map(n => parseInt(n.trim()));
    return targetCount >= min && targetCount <= max;
  }
  
  // Handle single number
  const count = parseInt(bestCount);
  return count === targetCount;
}

/**
 * Calculate player count fitness score with emphasis on bestPlayerCount
 * 
 * @param {number} playerCount - Number of players
 * @param {object} game - Game object with minPlayers, maxPlayers, bestPlayerCount
 * @returns {number} - Score from 0-1 (1 is perfect fit)
 */
function calculatePlayerCountFitness(playerCount, game) {
  const { minPlayers, maxPlayers } = game;
  
  if (playerCount < minPlayers || playerCount > maxPlayers) {
    return 0; // Game can't accommodate this many players
  }
  
  // Check if this matches the best player count - BIG bonus
  if (matchesBestPlayerCount(game, playerCount)) {
    return 1.0; // Perfect fit!
  }
  
  // Otherwise, check how close to ideal range
  const idealMin = game.idealMinPlayers || minPlayers;
  const idealMax = game.idealMaxPlayers || maxPlayers;
  
  if (playerCount >= idealMin && playerCount <= idealMax) {
    return 0.8; // Good fit, but not perfect
  }
  
  // Calculate distance from ideal
  if (playerCount < idealMin) {
    const distance = idealMin - playerCount;
    const range = idealMin - minPlayers;
    return Math.max(0, 0.8 - (distance / range) * 0.4); // 0.4-0.8 range
  } else {
    const distance = playerCount - idealMax;
    const range = maxPlayers - idealMax;
    return Math.max(0, 0.8 - (distance / range) * 0.4); // 0.4-0.8 range
  }
}

/**
 * Calculate interest score for a game based on player interest levels
 * 
 * @param {object} game - Game object with proposed interest data
 * @param {array} attendees - List of attending user IDs
 * @returns {object} - { score, participantCount, avgInterest, hasVeto }
 */
function calculateInterestScore(game, attendees) {
  let totalInterest = 0;
  let votedCount = 0;
  let hasVeto = false;
  
  attendees.forEach(userId => {
    const userInterest = game.interests?.[userId];
    
    if (userInterest && INTEREST_WEIGHTS[userInterest] !== undefined) {
      const weight = INTEREST_WEIGHTS[userInterest];
      totalInterest += weight;
      votedCount++;
      
      // Check for veto
      if (userInterest === 'rather-not') {
        hasVeto = true;
      }
    }
  });
  
  // If no one voted, neutral score
  if (votedCount === 0) {
    return {
      score: 0,
      participantCount: 0,
      avgInterest: 0,
      hasVeto: false,
    };
  }
  
  const avgInterest = totalInterest / votedCount;
  
  // Normalize to 0-1 scale (max possible is 5, min is -10)
  // We'll use a sigmoid-like function to keep scores reasonable
  // Positive interest maps to 0.5-1.0, negative maps to 0-0.5
  let normalizedScore;
  if (avgInterest >= 0) {
    normalizedScore = 0.5 + (avgInterest / 10); // 0.5 to 1.0
  } else {
    // Heavy penalty for negative scores
    normalizedScore = Math.max(0, 0.5 + (avgInterest / 20)); // 0 to 0.5
  }
  
  return {
    score: normalizedScore,
    participantCount: votedCount,
    avgInterest,
    hasVeto,
  };
}

/**
 * Check if game should be filtered out due to lack of interest or veto
 * 
 * @param {object} game - Game object with interest data
 * @param {array} attendees - List of attending user IDs
 * @returns {boolean} - True if game should be filtered out
 */
function shouldFilterGame(game, attendees) {
  if (!game.interests) return true;
  
  const interests = Object.entries(game.interests);
  
  // Filter if no one voted
  if (interests.length === 0) return true;
  
  // Check for "rather-not" vetoes
  const hasVeto = interests.some(([_, interest]) => interest === 'rather-not');
  if (hasVeto) return true;
  
  // Filter if no one marked "really-want" or "interested"
  const hasStrongInterest = interests.some(
    ([_, interest]) => interest === 'really-want' || interest === 'interested'
  );
  
  return !hasStrongInterest;
}

/**
 * Find combinations of games whose bestPlayerCount adds up to total players
 * This allows splitting the group optimally
 * 
 * @param {array} games - Array of games
 * @param {number} targetPlayers - Total number of players
 * @returns {array} - Array of game combinations with their combined best counts
 */
function findBestPlayerCountCombinations(games, targetPlayers) {
  const combinations = [];
  
  // Single game perfect matches
  games.forEach(game => {
    if (matchesBestPlayerCount(game, targetPlayers)) {
      combinations.push({
        games: [game],
        totalBestCount: targetPlayers,
        isSplit: false,
      });
    }
  });
  
  // Two-game splits
  for (let i = 0; i < games.length; i++) {
    const game1 = games[i];
    const best1 = parseInt(game1.bestPlayerCount || game1.idealPlayerCount || 0);
    
    if (best1 === 0 || best1 >= targetPlayers) continue;
    
    for (let j = i + 1; j < games.length; j++) {
      const game2 = games[j];
      const best2 = parseInt(game2.bestPlayerCount || game2.idealPlayerCount || 0);
      
      if (best1 + best2 === targetPlayers) {
        combinations.push({
          games: [game1, game2],
          totalBestCount: targetPlayers,
          isSplit: true,
          splitCounts: [best1, best2],
        });
      }
    }
  }
  
  // Three-game splits (for larger groups)
  if (targetPlayers >= 9) {
    for (let i = 0; i < games.length; i++) {
      const game1 = games[i];
      const best1 = parseInt(game1.bestPlayerCount || game1.idealPlayerCount || 0);
      
      if (best1 === 0 || best1 >= targetPlayers) continue;
      
      for (let j = i + 1; j < games.length; j++) {
        const game2 = games[j];
        const best2 = parseInt(game2.bestPlayerCount || game2.idealPlayerCount || 0);
        
        if (best1 + best2 >= targetPlayers) continue;
        
        for (let k = j + 1; k < games.length; k++) {
          const game3 = games[k];
          const best3 = parseInt(game3.bestPlayerCount || game3.idealPlayerCount || 0);
          
          if (best1 + best2 + best3 === targetPlayers) {
            combinations.push({
              games: [game1, game2, game3],
              totalBestCount: targetPlayers,
              isSplit: true,
              splitCounts: [best1, best2, best3],
            });
          }
        }
      }
    }
  }
  
  return combinations;
}

/**
 * Main optimization function
 * 
 * @param {array} proposedGames - Array of proposed game objects
 * @param {array} attendees - Array of attending user IDs
 * @param {number} eventDurationMinutes - Total event duration in minutes
 * @param {object} options - Optional parameters
 * @returns {array} - Optimized list of game suggestions with schedules
 */
export function optimizeGameSchedule(
  proposedGames,
  attendees,
  eventDurationMinutes = 240, // Default 4 hours
  options = {}
) {
  const {
    minParticipantsPerGame = 2,
    bufferTimeMinutes = 15, // Time between games for setup/breakdown
    allowParallelGames = true, // Allow splitting group into multiple simultaneous games
    prioritizeBestPlayerCount = true, // Heavily weight games matching bestPlayerCount
  } = options;
  
  const playerCount = attendees.length;
  
  if (playerCount === 0 || proposedGames.length === 0) {
    return [];
  }
  
  // Step 1: Filter out games that can't work
  const viableGames = proposedGames.filter(game => {
    // Must accommodate at least minimum participants
    if (game.maxPlayers < minParticipantsPerGame) return false;
    
    // Filter out games with vetoes or no interest
    if (shouldFilterGame(game, attendees)) return false;
    
    // Must have playing time data
    if (!game.playingTime || game.playingTime <= 0) return false;
    
    return true;
  });
  
  if (viableGames.length === 0) {
    return [];
  }
  
  // Step 2: Find perfect bestPlayerCount combinations
  const bestCountCombos = prioritizeBestPlayerCount 
    ? findBestPlayerCountCombinations(viableGames, playerCount)
    : [];
  
  // Step 3: Score each game individually
  const scoredGames = viableGames.map(game => {
    const playerFitness = calculatePlayerCountFitness(playerCount, game);
    const interestData = calculateInterestScore(game, attendees);
    
    // Check if this game is part of a perfect bestPlayerCount combo
    const isInPerfectCombo = bestCountCombos.some(combo => 
      combo.games.some(g => g.bggId === game.bggId)
    );
    
    // Scoring weights:
    // - 60% interest score (most important - what players want)
    // - 30% player count fitness
    // - 10% bonus for being in a perfect bestPlayerCount combo
    let overallScore = (interestData.score * 0.6) + (playerFitness * 0.3);
    
    if (isInPerfectCombo) {
      overallScore += 0.1; // 10% bonus
    }
    
    return {
      ...game,
      scores: {
        overall: overallScore,
        playerFitness,
        interestScore: interestData.score,
        avgInterest: interestData.avgInterest,
        participantCount: interestData.participantCount,
        isInPerfectCombo,
        hasVeto: interestData.hasVeto,
      },
    };
  });
  
  // Step 4: Sort by overall score
  scoredGames.sort((a, b) => b.scores.overall - a.scores.overall);
  
  // Step 5: Build schedule that fits time constraint
  const schedule = [];
  let remainingTime = eventDurationMinutes;
  const selectedGameIds = new Set();
  
  // First, try to fit perfect bestPlayerCount combos if they're high-scoring
  if (prioritizeBestPlayerCount && bestCountCombos.length > 0) {
    for (const combo of bestCountCombos) {
      // Calculate average score for this combo
      const comboGames = combo.games.map(g => 
        scoredGames.find(sg => sg.bggId === g.bggId)
      ).filter(Boolean);
      
      if (comboGames.length !== combo.games.length) continue;
      
      const avgComboScore = comboGames.reduce((sum, g) => sum + g.scores.overall, 0) / comboGames.length;
      
      // Only use combo if it's high-scoring (> 0.6)
      if (avgComboScore < 0.6) continue;
      
      const comboTime = Math.max(...comboGames.map(g => g.playingTime)) + bufferTimeMinutes;
      
      if (comboTime <= remainingTime) {
        comboGames.forEach(game => {
          schedule.push({
            game,
            estimatedDuration: game.playingTime,
            bufferTime: bufferTimeMinutes,
            totalTime: game.playingTime + bufferTimeMinutes,
            recommendedPlayers: combo.isSplit ? 
              combo.splitCounts[combo.games.findIndex(g => g.bggId === game.bggId)] : 
              playerCount,
            isPartOfSplit: combo.isSplit,
            splitInfo: combo.isSplit ? combo : null,
          });
          selectedGameIds.add(game.bggId);
        });
        
        remainingTime -= comboTime;
        break; // Use first viable combo
      }
    }
  }
  
  // Step 6: Fill remaining time with highest-scoring games
  for (const game of scoredGames) {
    const gameTime = game.playingTime + bufferTimeMinutes;
    
    if (selectedGameIds.has(game.bggId)) continue;
    
    if (gameTime <= remainingTime) {
      schedule.push({
        game,
        estimatedDuration: game.playingTime,
        bufferTime: bufferTimeMinutes,
        totalTime: gameTime,
        recommendedPlayers: playerCount,
        isPartOfSplit: false,
      });
      
      selectedGameIds.add(game.bggId);
      remainingTime -= gameTime;
      
      // Stop if we can't fit another meaningful game (< 30 min remaining)
      if (remainingTime < 30) break;
    }
  }
  
  return schedule;
}

/**
 * Generate human-readable explanation of optimization results
 * 
 * @param {array} schedule - Optimized schedule from optimizeGameSchedule
 * @param {number} attendeeCount - Number of attending players
 * @returns {object} - Summary statistics and explanations
 */
export function generateScheduleSummary(schedule, attendeeCount) {
  if (schedule.length === 0) {
    return {
      totalGames: 0,
      totalTime: 0,
      hasSplitGames: false,
      message: 'No games could be scheduled. Try proposing more games or adjusting your preferences.',
    };
  }
  
  const totalTime = schedule.reduce((sum, item) => sum + item.totalTime, 0);
  const avgScore = schedule.reduce((sum, item) => sum + item.game.scores.overall, 0) / schedule.length;
  const avgInterest = schedule.reduce((sum, item) => sum + item.game.scores.avgInterest, 0) / schedule.length;
  const hasSplitGames = schedule.some(item => item.isPartOfSplit);
  
  return {
    totalGames: schedule.length,
    totalTime,
    avgScore: avgScore.toFixed(2),
    avgInterest: avgInterest.toFixed(1),
    attendeeCount,
    hasSplitGames,
    message: `Scheduled ${schedule.length} game${schedule.length > 1 ? 's' : ''} for ${attendeeCount} player${attendeeCount > 1 ? 's' : ''}.`,
  };
}

export default {
  optimizeGameSchedule,
  generateScheduleSummary,
  calculatePlayerCountFitness,
  calculateInterestScore,
  findBestPlayerCountCombinations,
};




















