/**
 * Background service for retrying pending game searches
 * Retries happen automatically while the app is active/foreground:
 * - Fixed delay: 1 second between retries
 * - Maximum 5 retries per game
 * - Games that exceed 5 retries are automatically removed
 */

import { AppState, Platform } from 'react-native';
import { getGamesReadyForRetry, markGameRetried, removePendingRetries, getRetryMetadata, hasExceededMaxRetries } from './pendingGameRetries';
import { retryPendingGameSearches } from './retryPendingGames';

const CHECK_INTERVAL_MS = 10 * 1000; // Check every 10 seconds for games ready to retry
let retryServiceActive = false;
let intervalId = null;
let appStateListener = null;
let addGameToCollectionFn = null;
let currentUserId = null;

/**
 * Start the background retry service
 * @param {Function} addGameToCollection - Function to add games to collection (takes userId, gameData)
 * @param {string} userId - Current user ID
 */
export const startBackgroundRetryService = (addGameToCollection, userId) => {
  if (retryServiceActive) {
    if (__DEV__) {
      console.log('[BackgroundRetryService] Service already active');
    }
    return;
  }

  if (!userId) {
    if (__DEV__) {
      console.warn('[BackgroundRetryService] Cannot start service without userId');
    }
    return;
  }

  addGameToCollectionFn = addGameToCollection;
  currentUserId = userId;
  retryServiceActive = true;

  if (__DEV__) {
    console.log('[BackgroundRetryService] Starting background retry service');
  }

  // Check immediately when service starts
  checkAndRetryReadyGames();

  // Set up interval to check periodically
  intervalId = setInterval(() => {
    // On web, AppState might not be available, so always check
    const isActive = Platform.OS === 'web' || AppState.currentState === 'active';
    if (isActive) {
      checkAndRetryReadyGames();
    }
  }, CHECK_INTERVAL_MS);

  // Listen to app state changes (only on native platforms)
  if (AppState && AppState.addEventListener) {
    appStateListener = AppState.addEventListener('change', handleAppStateChange);
  }

  if (__DEV__) {
    console.log('[BackgroundRetryService] Service started (checking every', CHECK_INTERVAL_MS / 1000, 'seconds when app is active)');
  }
};

/**
 * Stop the background retry service
 */
export const stopBackgroundRetryService = () => {
  if (!retryServiceActive) {
    return;
  }

  retryServiceActive = false;

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (appStateListener) {
    appStateListener.remove();
    appStateListener = null;
  }

  addGameToCollectionFn = null;
  currentUserId = null;

  if (__DEV__) {
    console.log('[BackgroundRetryService] Service stopped');
  }
};

/**
 * Handle app state changes (active/background/inactive)
 */
const handleAppStateChange = (nextAppState) => {
  if (__DEV__) {
    console.log('[BackgroundRetryService] App state changed to:', nextAppState);
  }

  if (nextAppState === 'active') {
    // When app becomes active, check immediately
    checkAndRetryReadyGames();
  }
};

/**
 * Check for games ready to retry and retry them
 */
const checkAndRetryReadyGames = async () => {
  if (!addGameToCollectionFn || !currentUserId) {
    if (__DEV__) {
      console.warn('[BackgroundRetryService] Cannot retry - missing addGameToCollection function or userId');
    }
    return;
  }

  try {
    // First, clean up games that have exceeded max retries
    const { getPendingRetries } = await import('./pendingGameRetries');
    const allPendingTitles = await getPendingRetries();
    const metadata = await getRetryMetadata();
    const gamesToRemove = [];
    
    for (const gameTitle of allPendingTitles) {
      const gameMetadata = metadata[gameTitle];
      if (gameMetadata && hasExceededMaxRetries(gameMetadata.attemptCount)) {
        gamesToRemove.push(gameTitle);
      }
    }
    
    if (gamesToRemove.length > 0) {
      if (__DEV__) {
        console.log('[BackgroundRetryService] Removing', gamesToRemove.length, 'games that exceeded max retries:', gamesToRemove);
      }
      await removePendingRetries(gamesToRemove);
    }

    const readyGames = await getGamesReadyForRetry();

    if (readyGames.length === 0) {
      // No games ready for retry yet
      return;
    }

    if (__DEV__) {
      console.log('[BackgroundRetryService] Found', readyGames.length, 'games ready for retry:', readyGames);
    }

    // Mark all ready games as retried (update metadata before attempting)
    // This ensures retry count is tracked correctly
    for (const gameTitle of readyGames) {
      await markGameRetried(gameTitle);
    }

    // Retry the games (this will only retry the ready ones we marked)
    const wrappedAddGame = (gameData) => addGameToCollectionFn(currentUserId, gameData);
    const result = await retryPendingGameSearchesFiltered(wrappedAddGame, readyGames);

    if (result.successCount > 0) {
      if (__DEV__) {
        console.log('[BackgroundRetryService] Successfully retried', result.successCount, 'games:', result.addedGames);
      }
    }

    if (result.failedCount > 0) {
      if (__DEV__) {
        console.log('[BackgroundRetryService]', result.failedCount, 'games still pending after retry');
      }
    }
  } catch (error) {
    console.error('[BackgroundRetryService] Error checking and retrying games:', error);
  }
};

/**
 * Retry specific pending games (filtered version of retryPendingGameSearches)
 * @param {Function} addGameToCollection - Function to add game to collection
 * @param {string[]} gameTitles - Specific game titles to retry (if empty, retries all)
 * @returns {Promise<{successCount: number, failedCount: number, addedGames: string[]}>}
 */
const retryPendingGameSearchesFiltered = async (addGameToCollection, gameTitles = []) => {
  const { getPendingRetries } = await import('./pendingGameRetries');
  const { searchGamesByName, getGames } = await import('./api');
  
  const allPendingTitles = await getPendingRetries();
  
  // Filter to only the games we want to retry
  const titlesToRetry = gameTitles.length > 0 
    ? allPendingTitles.filter(title => gameTitles.includes(title))
    : allPendingTitles;

  if (titlesToRetry.length === 0) {
    return { successCount: 0, failedCount: 0, addedGames: [], failedGames: [] };
  }

  const addedGames = [];
  const failedGames = [];
  let successCount = 0;
  let failedCount = 0;

  // Helper function to clean game title (same as in gameSearch.js)
  const cleanGameTitle = (title) => {
    if (!title) return title;
    return title
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/\s*\[[^\]]*\]\s*/g, ' ')
      .replace(/\s*-\s*(modern|published|game|expansion|edition).*$/i, '')
      .trim();
  };

  for (const gameTitle of titlesToRetry) {
    try {
      const cleanedTitle = cleanGameTitle(gameTitle);
      const searchQuery = cleanedTitle !== gameTitle ? cleanedTitle : gameTitle;
      
      // Search for the game
      const searchResults = await searchGamesByName(searchQuery, true);
      
      if (!searchResults || searchResults.length === 0) {
        // No results - will retry again later (up to 5 retries total)
        failedGames.push(gameTitle);
        failedCount++;
        continue;
      }

      // Auto-select best match (same logic as retryPendingGames.js)
      const normalizedSearchTitle = gameTitle.toLowerCase().trim();
      const scoredResults = searchResults.map(result => {
        let score = 0;
        const normalizedResultName = (result.name || '').toLowerCase().trim();
        
        if (normalizedResultName === normalizedSearchTitle) {
          score += 1000;
        } else if (normalizedResultName.startsWith(normalizedSearchTitle)) {
          score += 500;
        } else if (normalizedResultName.includes(normalizedSearchTitle)) {
          score += 100;
        }
        
        if (result.type === 'boardgame') {
          score += 50;
        }
        
        return { ...result, _matchScore: score };
      });

      scoredResults.sort((a, b) => {
        if (b._matchScore !== a._matchScore) {
          return b._matchScore - a._matchScore;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

      const bestMatch = scoredResults[0];

      if (!bestMatch || !bestMatch.id) {
        failedGames.push(gameTitle);
        failedCount++;
        continue;
      }

      // Get full game details
      const gameDetails = await getGames(bestMatch.id, 'background_retry');

      if (!gameDetails) {
        failedGames.push(gameTitle);
        failedCount++;
        continue;
      }

      // Prepare game data for collection
      const gameData = {
        title: gameDetails.name || gameTitle,
        bggId: bestMatch.id.toString(),
        image: gameDetails.image || null,
        thumbnail: gameDetails.thumbnail || null,
        description: gameDetails.description || '',
        yearPublished: gameDetails.yearPublished || null,
        minPlayers: gameDetails.minPlayers || null,
        maxPlayers: gameDetails.maxPlayers || null,
        playingTime: gameDetails.playingTime || null,
        mechanics: gameDetails.mechanics || null,
        categories: gameDetails.categories || null,
        publishers: gameDetails.publishers || null,
        publisher: gameDetails.publisher || null,
        complexity: gameDetails.complexity || gameDetails.averageWeight || null,
        averageWeight: gameDetails.averageWeight || gameDetails.complexity || null,
        source: 'background_retry',
      };

      // Add to collection (wrap to match expected signature)
      const wrappedAddGame = (gameData) => addGameToCollectionFn(currentUserId, gameData);
      await wrappedAddGame(gameData);

      addedGames.push(gameTitle);
      successCount++;

    } catch (error) {
      console.error('[BackgroundRetryService] Error retrying game:', gameTitle, error);
      failedGames.push(gameTitle);
      failedCount++;
    }
  }

  // Remove successfully added games from pending retries
  if (addedGames.length > 0) {
    await removePendingRetries(addedGames);
  }

  return {
    successCount,
    failedCount,
    addedGames,
    failedGames,
  };
};

