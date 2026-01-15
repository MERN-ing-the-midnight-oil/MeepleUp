/**
 * Utility to manage pending game search retries in local storage
 * When a user skips a game search, we save it to retry later
 * Fixed delay: 1 second between retries, maximum 5 retries
 */

import storage from './storage';

const STORAGE_KEY = 'pending_game_retries';
const METADATA_KEY = 'pending_game_retries_metadata';

/**
 * Get retry metadata structure for a game
 * @param {number} attemptCount - Number of retry attempts (0 = first retry after 1s)
 * @returns {number} Milliseconds to wait before next retry
 */
export const getRetryDelay = (attemptCount) => {
  // Fixed delay: 1 second for all retries
  // Limit to 5 retries max
  const maxDelayMs = 1 * 1000; // 1 second in milliseconds
  return maxDelayMs;
};

/**
 * Check if a game has exceeded the maximum retry attempts
 * @param {number} attemptCount - Number of retry attempts
 * @returns {boolean} True if max retries exceeded
 */
export const hasExceededMaxRetries = (attemptCount) => {
  const MAX_RETRIES = 5;
  return attemptCount >= MAX_RETRIES;
};

/**
 * Get all pending game retries from storage
 * @returns {Promise<Array<string>>} Array of game titles to retry
 */
export const getPendingRetries = async () => {
  try {
    const data = await storage.getItem(STORAGE_KEY);
    if (!data) {
      return [];
    }
    const retries = JSON.parse(data);
    // Only log when there are actually pending retries to avoid noise
    if (__DEV__ && retries.length > 0) {
      console.log('[PendingGameRetries] Retrieved pending retries:', retries.length, 'titles');
    }
    return Array.isArray(retries) ? retries : [];
  } catch (error) {
    console.error('[PendingGameRetries] Error getting pending retries:', error);
    return [];
  }
};

/**
 * Get retry metadata (attempt count, last retry timestamp) for all pending games
 * @returns {Promise<Object>} Object mapping game titles to metadata {attemptCount: number, lastRetryAt: number}
 */
export const getRetryMetadata = async () => {
  try {
    const data = await storage.getItem(METADATA_KEY);
    if (!data) {
      return {};
    }
    const metadata = JSON.parse(data);
    return typeof metadata === 'object' && metadata !== null ? metadata : {};
  } catch (error) {
    console.error('[PendingGameRetries] Error getting retry metadata:', error);
    return {};
  }
};

/**
 * Set retry metadata for games
 * @param {Object} metadata - Object mapping game titles to metadata
 * @returns {Promise<void>}
 */
const setRetryMetadata = async (metadata) => {
  try {
    await storage.setItem(METADATA_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.error('[PendingGameRetries] Error setting retry metadata:', error);
  }
};

/**
 * Get the next retry time for a specific game (in milliseconds from now)
 * @param {string} gameTitle - The game title to check
 * @returns {Promise<number|null>} Milliseconds until next retry, or null if not in pending retries
 */
export const getNextRetryTime = async (gameTitle) => {
  try {
    const pendingTitles = await getPendingRetries();
    if (!pendingTitles.includes(gameTitle)) {
      return null; // Not in pending retries
    }

    const metadata = await getRetryMetadata();
    const gameMetadata = metadata[gameTitle] || { attemptCount: 0, lastRetryAt: null, addedAt: Date.now() };
    const delayMs = getRetryDelay(gameMetadata.attemptCount);
    
    // If there's a lastRetryAt, next retry is lastRetryAt + delay
    // Otherwise, next retry is addedAt + delay (for first retry)
    const baseTime = gameMetadata.lastRetryAt || gameMetadata.addedAt || Date.now();
    const nextRetryAt = baseTime + delayMs;
    const now = Date.now();
    
    // Return milliseconds until next retry (or 0 if ready now)
    return Math.max(0, nextRetryAt - now);
  } catch (error) {
    console.error('[PendingGameRetries] Error getting next retry time:', error);
    return null;
  }
};

/**
 * Get games that are ready for retry based on fixed delay
 * @returns {Promise<Array<string>>} Array of game titles ready for retry
 */
export const getGamesReadyForRetry = async () => {
  try {
    const pendingTitles = await getPendingRetries();
    if (pendingTitles.length === 0) {
      return [];
    }

    const metadata = await getRetryMetadata();
    const now = Date.now();
    const readyGames = [];

    for (const gameTitle of pendingTitles) {
      const gameMetadata = metadata[gameTitle] || { attemptCount: 0, lastRetryAt: null };
      
      // Skip games that have exceeded max retries
      if (hasExceededMaxRetries(gameMetadata.attemptCount)) {
        continue;
      }
      
      const delayMs = getRetryDelay(gameMetadata.attemptCount);
      const nextRetryAt = gameMetadata.lastRetryAt 
        ? gameMetadata.lastRetryAt + delayMs 
        : now; // If no previous retry, ready immediately

      if (now >= nextRetryAt) {
        readyGames.push(gameTitle);
      }
    }

    if (__DEV__ && readyGames.length > 0) {
      console.log('[PendingGameRetries] Games ready for retry:', readyGames.length, 'of', pendingTitles.length);
    }

    return readyGames;
  } catch (error) {
    console.error('[PendingGameRetries] Error getting games ready for retry:', error);
    return [];
  }
};

/**
 * Add a game title to pending retries
 * @param {string} gameTitle - The game title to retry later
 * @returns {Promise<void>}
 */
export const addPendingRetry = async (gameTitle) => {
  try {
    const current = await getPendingRetries();
    if (!current.includes(gameTitle)) {
      const updated = [...current, gameTitle];
      await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
      
      // Initialize metadata if this is a new game (start at attemptCount 0)
      const metadata = await getRetryMetadata();
      if (!metadata[gameTitle]) {
        metadata[gameTitle] = {
          attemptCount: 0,
          lastRetryAt: null,
          addedAt: Date.now(),
        };
        await setRetryMetadata(metadata);
      }
      
      if (__DEV__) {
        const delaySec = getRetryDelay(0) / 1000;
        console.log('[PendingGameRetries] Added pending retry:', gameTitle, 'Total pending:', updated.length, `(first retry in ${delaySec}s)`);
      }
    } else {
      if (__DEV__) {
        console.log('[PendingGameRetries] Game already in pending retries:', gameTitle);
      }
    }
  } catch (error) {
    console.error('[PendingGameRetries] Error adding pending retry:', error);
  }
};

/**
 * Mark a game as retried (update metadata with attempt count and timestamp)
 * @param {string} gameTitle - The game title that was retried
 * @returns {Promise<void>}
 */
export const markGameRetried = async (gameTitle) => {
  try {
    const metadata = await getRetryMetadata();
    const gameMetadata = metadata[gameTitle] || { attemptCount: 0, lastRetryAt: null };
    
    metadata[gameTitle] = {
      attemptCount: gameMetadata.attemptCount + 1,
      lastRetryAt: Date.now(),
      addedAt: gameMetadata.addedAt || Date.now(),
    };
    
    await setRetryMetadata(metadata);
    
    if (__DEV__) {
      const nextDelaySec = getRetryDelay(metadata[gameTitle].attemptCount) / 1000;
      console.log('[PendingGameRetries] Marked as retried:', gameTitle, `(attempt ${metadata[gameTitle].attemptCount}, next retry in ${nextDelaySec}s)`);
    }
  } catch (error) {
    console.error('[PendingGameRetries] Error marking game as retried:', error);
  }
};

/**
 * Remove game titles from pending retries
 * @param {string[]} gameTitles - Array of game titles to remove
 * @returns {Promise<void>}
 */
export const removePendingRetries = async (gameTitles) => {
  try {
    const current = await getPendingRetries();
    const updated = current.filter(title => !gameTitles.includes(title));
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    
    // Also remove metadata for successfully added games
    const metadata = await getRetryMetadata();
    for (const gameTitle of gameTitles) {
      delete metadata[gameTitle];
    }
    await setRetryMetadata(metadata);
    
    if (__DEV__) {
      console.log('[PendingGameRetries] Removed pending retries:', gameTitles.length, 'Remaining:', updated.length);
    }
  } catch (error) {
    console.error('[PendingGameRetries] Error removing pending retries:', error);
  }
};

/**
 * Clear all pending retries
 * @returns {Promise<void>}
 */
export const clearAllPendingRetries = async () => {
  try {
    await storage.removeItem(STORAGE_KEY);
    if (__DEV__) {
      console.log('[PendingGameRetries] Cleared all pending retries');
    }
  } catch (error) {
    console.error('[PendingGameRetries] Error clearing pending retries:', error);
  }
};

