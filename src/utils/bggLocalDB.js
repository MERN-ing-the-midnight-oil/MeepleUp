/**
 * Local BGG Database - Reads from JSON file
 * No server needed - works completely offline!
 */

// Import the JSON database directly
// This will be bundled with the app at build time
// For React Native/Expo, we'll use require() which works for JSON files
let gameDatabaseJSON = null;
try {
  gameDatabaseJSON = require('../assets/data/boardgames_ranks.json');
} catch (error) {
  console.warn('[BGG Local DB] Could not load JSON via require, will try fetch:', error.message);
}

// Cache for loaded database
let gameDatabase = null;
let isLoaded = false;

/**
 * Load the game database from JSON
 * This is a one-time load when the app starts
 */
async function loadGameDatabase() {
  if (isLoaded && gameDatabase) {
    return gameDatabase;
  }

  try {
    let games;
    
    // Try require() first (works in Node/bundled environments)
    if (gameDatabaseJSON) {
      if (Array.isArray(gameDatabaseJSON)) {
        games = gameDatabaseJSON;
      } else if (typeof gameDatabaseJSON === 'object' && gameDatabaseJSON.default) {
        games = gameDatabaseJSON.default;
      } else {
        games = gameDatabaseJSON;
      }
    } else {
      // Fallback: try to fetch from assets (for web/Expo)
      try {
        // For Expo, assets are in different locations - adjust path as needed
        const response = await fetch('https://your-cdn-or-assets/boardgames_ranks.json');
        games = await response.json();
      } catch (fetchError) {
        console.error('[BGG Local DB] Could not load game database via fetch:', fetchError);
        return [];
      }
    }
    
    // Ensure we have an array
    if (!Array.isArray(games)) {
      console.error('[BGG Local DB] Invalid game database format - expected array');
      return [];
    }
    
    gameDatabase = games;
    isLoaded = true;
    
    if (__DEV__) {
      console.log(`[BGG Local DB] Loaded ${games.length} games from JSON`);
    }
    
    return games;
  } catch (error) {
    console.error('[BGG Local DB] Error loading game database:', error);
    // Fallback: return empty array
    return [];
  }
}

/**
 * Search for games by name
 * @param {string} query - Game name to search for
 * @param {number} limit - Maximum number of results (default: 10)
 * @returns {Promise<Array>} Array of matching games
 */
export async function searchGamesByName(query, limit = 10) {
  if (!query || !query.trim()) {
    return [];
  }

  const games = await loadGameDatabase();
  if (!games || games.length === 0) {
    return [];
  }

  const searchTerm = query.toLowerCase().trim();
  const results = [];
  const exactMatches = [];
  const startsWithMatches = [];
  const containsMatches = [];

  for (const game of games) {
    const gameName = game.name ? game.name.toLowerCase() : '';
    
    if (gameName === searchTerm) {
      exactMatches.push(game);
    } else if (gameName.startsWith(searchTerm)) {
      startsWithMatches.push(game);
    } else if (gameName.includes(searchTerm)) {
      containsMatches.push(game);
    }
  }

  // Combine results: exact matches first, then starts with, then contains
  const allResults = [...exactMatches, ...startsWithMatches, ...containsMatches];

  // Sort by rank (lower rank = better)
  allResults.sort((a, b) => {
    const aRank = parseInt(a.rank) || 999999;
    const bRank = parseInt(b.rank) || 999999;
    return aRank - bRank;
  });

  return allResults.slice(0, limit);
}

/**
 * Get game by BGG ID
 * @param {string} gameId - BGG game ID
 * @returns {Promise<Object|null>} Game object or null if not found
 */
export async function getGameById(gameId) {
  if (!gameId) return null;

  const games = await loadGameDatabase();
  if (!games || games.length === 0) {
    return null;
  }

  return games.find(game => game.id === gameId.toString()) || null;
}

/**
 * Format game data to match BGG API response format
 * @param {Object} game - Game object from database
 * @returns {Object} Formatted game data
 */
export function formatGameForAPI(game) {
  if (!game) return null;

  return {
    id: game.id,
    name: game.name,
    yearPublished: game.yearPublished || '',
    rank: game.rank || '',
    bayesAverage: game.bayesAverage || '',
    average: game.average || '',
    usersRated: game.usersRated || '',
    // No thumbnail/image from CSV
    thumbnail: null,
    image: null,
  };
}

/**
 * Parse BGG search response format (for compatibility)
 * Converts our local format to match BGG XML API format
 */
export function parseBGGSearchResponse(games) {
  if (!Array.isArray(games)) return [];
  
  return games.map(game => ({
    id: game.id,
    name: game.name,
    yearPublished: game.yearPublished || '',
  }));
}

/**
 * Parse BGG game details response format (for compatibility)
 */
export function parseBGGGameDetails(game) {
  if (!game) return null;

  return {
    id: game.id,
    name: game.name,
    description: '', // Not in CSV
    image: null, // Not in CSV
    thumbnail: null, // Not in CSV
    yearPublished: game.yearPublished || '',
    minPlayers: '', // Not in CSV
    maxPlayers: '', // Not in CSV
    playingTime: '', // Not in CSV
    averageRating: parseFloat(game.average) || 0,
  };
}

