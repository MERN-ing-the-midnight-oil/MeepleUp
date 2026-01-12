/**
 * Utility to manage pending game search retries in local storage
 * When a user skips a game search, we save it to retry later
 */

import storage from './storage';

const STORAGE_KEY = 'pending_game_retries';

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
    if (__DEV__) {
      console.log('[PendingGameRetries] Retrieved pending retries:', retries.length, 'titles');
    }
    return Array.isArray(retries) ? retries : [];
  } catch (error) {
    console.error('[PendingGameRetries] Error getting pending retries:', error);
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
      if (__DEV__) {
        console.log('[PendingGameRetries] Added pending retry:', gameTitle, 'Total pending:', updated.length);
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
 * Remove game titles from pending retries
 * @param {string[]} gameTitles - Array of game titles to remove
 * @returns {Promise<void>}
 */
export const removePendingRetries = async (gameTitles) => {
  try {
    const current = await getPendingRetries();
    const updated = current.filter(title => !gameTitles.includes(title));
    await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
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

