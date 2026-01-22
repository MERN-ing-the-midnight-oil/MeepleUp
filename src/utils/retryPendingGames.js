/**
 * Utility function to retry pending game searches and auto-add to collection
 * This is called when user visits CollectionScreen or EventHub (Gameplan tab)
 */

import { searchGamesByName, getGames } from './api';
import { getPendingRetries, removePendingRetries } from './pendingGameRetries';

/**
 * Retry pending game searches and auto-add successful results to collection
 * @param {Function} addGameToCollection - Function to add game to collection
 * @returns {Promise<{successCount: number, failedCount: number, addedGames: string[]}>}
 */
export const retryPendingGameSearches = async (addGameToCollection) => {
  console.log('[RetryPendingGames] Starting retry process for pending game searches');
  
  const pendingTitles = await getPendingRetries();
  
  if (pendingTitles.length === 0) {
    console.log('[RetryPendingGames] No pending games to retry');
    return { successCount: 0, failedCount: 0, addedGames: [] };
  }
  
  console.log('[RetryPendingGames] Found', pendingTitles.length, 'pending games to retry:', pendingTitles);
  
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
  
  for (const gameTitle of pendingTitles) {
    try {
      console.log('[RetryPendingGames] Retrying search for:', gameTitle);
      const cleanedTitle = cleanGameTitle(gameTitle);
      const searchQuery = cleanedTitle !== gameTitle ? cleanedTitle : gameTitle;
      
      // Search for the game
      const searchResults = await searchGamesByName(searchQuery, true);
      
      if (!searchResults || searchResults.length === 0) {
        console.log('[RetryPendingGames] No results found for:', gameTitle);
        failedGames.push(gameTitle);
        failedCount++;
        continue;
      }
      
      console.log('[RetryPendingGames] Found', searchResults.length, 'results for:', gameTitle);
      
      // Auto-select best match (same logic as gameSearch.js)
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
        console.log('[RetryPendingGames] No valid match found for:', gameTitle);
        failedGames.push(gameTitle);
        failedCount++;
        continue;
      }
      
      console.log('[RetryPendingGames] Auto-selected best match for', gameTitle, ':', bestMatch.name, '(BGG ID:', bestMatch.id, ')');
      
      // Get full game details
      const gameDetails = await getGames(bestMatch.id, 'pending_retry');
      
      if (!gameDetails) {
        console.log('[RetryPendingGames] Failed to get game details for:', gameTitle, 'BGG ID:', bestMatch.id);
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
        source: 'pending_retry',
      };
      
      // Add to collection
      console.log('[RetryPendingGames] Adding game to collection:', gameData.title);
      await addGameToCollection(gameData);
      
      addedGames.push(gameTitle);
      successCount++;
      console.log('[RetryPendingGames] Successfully added', gameTitle, 'to collection');
      
    } catch (error) {
      console.error('[RetryPendingGames] Error retrying game:', gameTitle, error);
      failedGames.push(gameTitle);
      failedCount++;
    }
  }
  
  // Remove successfully added games from pending retries
  if (addedGames.length > 0) {
    console.log('[RetryPendingGames] Removing', addedGames.length, 'successfully added games from pending retries');
    await removePendingRetries(addedGames);
  }
  
  console.log('[RetryPendingGames] Retry process complete. Success:', successCount, 'Failed:', failedCount);
  
  return {
    successCount,
    failedCount,
    addedGames,
    failedGames,
  };
};

