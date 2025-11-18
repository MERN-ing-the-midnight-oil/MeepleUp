/**
 * Local BGG Database - Reads from JSON file
 * No server needed - works completely offline!
 * 
 * NOTE: The JSON file is large (64MB), so we load it lazily and asynchronously
 * to avoid crashing the app at startup.
 */

// Cache for loaded database
let gameDatabase = null;
let isLoading = false;
let loadPromise = null;

/**
 * Lazy require function - only loads the JSON when called, not at module initialization
 * This prevents the 64MB file from being loaded at app startup
 */
function lazyRequireJSON() {
  // Use a function to delay the require() call until it's actually needed
  // This prevents the file from being bundled/loaded at module initialization
  try {
    return require('../assets/data/boardgames_ranks.json');
  } catch (error) {
    console.warn('[BGG Local DB] Could not load JSON via require:', error.message);
    return null;
  }
}

/**
 * Load the game database from JSON asynchronously
 * This is a lazy load - only loads when first needed
 */
async function loadGameDatabase() {
  // If already loaded, return cached data
  if (gameDatabase) {
    return gameDatabase;
  }

  // If currently loading, wait for the existing load to complete
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  // Start loading
  isLoading = true;
  loadPromise = (async () => {
    try {
      let games;
      
      // Use lazy require - this only loads when the function is called
      // Wrap in setTimeout to make it truly async and non-blocking
      const loadedData = await new Promise((resolve) => {
        // Use setTimeout to defer loading to next event loop tick
        // This prevents blocking the main thread
        setTimeout(() => {
          try {
            const data = lazyRequireJSON();
            resolve(data);
          } catch (error) {
            resolve(null);
          }
        }, 0);
      });
      
      if (loadedData) {
        if (Array.isArray(loadedData)) {
          games = loadedData;
        } else if (typeof loadedData === 'object' && loadedData.default) {
          games = loadedData.default;
        } else {
          games = loadedData;
        }
      } else {
        // Fallback: try fetch for web environments
        try {
          const response = await fetch('/assets/data/boardgames_ranks.json');
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
          }
          games = await response.json();
        } catch (fetchError) {
          console.error('[BGG Local DB] Could not load via require or fetch:', fetchError);
          return [];
        }
      }
      
      // Ensure we have an array
      if (!Array.isArray(games)) {
        console.error('[BGG Local DB] Invalid game database format - expected array');
        return [];
      }
      
      gameDatabase = games;
      isLoading = false;
      
      if (__DEV__) {
        console.log(`[BGG Local DB] Loaded ${games.length} games from JSON`);
      }
      
      return games;
    } catch (error) {
      isLoading = false;
      console.error('[BGG Local DB] Error loading game database:', error);
      // Fallback: return empty array
      return [];
    }
  })();

  return loadPromise;
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

