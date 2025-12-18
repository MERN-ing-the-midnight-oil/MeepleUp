/**
 * Vibe Scores Service
 * Manages calculation and storage of Personal Vibe Scores for games in meepleups
 */

import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { calculateVibeScore } from '../utils/vibeScore';
import { getGameDetails } from '../utils/api';

/**
 * Calculate and store vibe scores for a game for all members of a meepleup
 * @param {string} eventId - The meepleup/event ID
 * @param {string} gameId - The game ID (BGG ID)
 * @param {Object} game - The game object (optional, will fetch if not provided)
 * @param {Object} collections - All user collections { userId: [games] }
 * @param {Object} memberWeights - User weights { userId: { publisher: 3, ... } }
 * @returns {Promise<void>}
 */
export const calculateVibeScoresForGame = async (eventId, gameId, game = null, collections = {}, memberWeights = {}) => {
  if (!db || !eventId || !gameId) {
    console.warn('[VibeScores] Missing required parameters');
    return;
  }

  try {
    // Get game data if not provided
    let gameData = game;
    if (!gameData) {
      gameData = await getGameDetails(gameId);
      if (!gameData) {
        console.warn(`[VibeScores] Could not fetch game data for ${gameId}`);
        return;
      }
    }

    // Get all members of the meepleup
    const membersSnapshot = await db.collection('gamingGroups').doc(eventId)
      .collection('members').get();

    if (membersSnapshot.empty) {
      console.log('[VibeScores] No members found for meepleup');
      return;
    }

    const scores = {};
    const updates = {};

    // Calculate score for each member
    for (const memberDoc of membersSnapshot.docs) {
      const userId = memberDoc.id;
      let userCollection = collections[userId] || [];
      
      // If collection not provided, fetch from Firestore
      if (userCollection.length === 0) {
        try {
          const userGamesSnapshot = await db.collection('userGames').doc(userId).collection('games').get();
          userCollection = userGamesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              bggId: data.bggId || null,
              title: data.title || data.gameName || 'Unknown Game',
              mechanics: data.mechanics || null,
              categories: data.categories || null,
              publishers: data.publishers || null,
              publisher: data.publisher || null,
              complexity: data.complexity || null,
              averageWeight: data.averageWeight || data.complexity || null,
              isFavorite: data.isFavorite || false,
            };
          });
        } catch (err) {
          console.warn(`[VibeScores] Error fetching collection for user ${userId}:`, err);
          continue;
        }
      }
      
      if (userCollection.length === 0) {
        // No collection, skip
        continue;
      }

      // Get user's custom weights if available
      let customWeights = memberWeights[userId] || null;
      if (!customWeights) {
        try {
          const userDoc = await db.collection('users').doc(userId).get();
          const userData = userDoc.data();
          customWeights = userData?.personalMatchWeights || null;
        } catch (err) {
          // Use default weights
        }
      }

      // Calculate vibe score
      const score = calculateVibeScore(gameData, userCollection, customWeights);
      
      if (score !== null) {
        scores[userId] = score;
        updates[userId] = score;
      }
    }

    // Store scores in Firestore
    if (Object.keys(updates).length > 0) {
      const vibeScoreRef = db.collection('gamingGroups').doc(eventId)
        .collection('vibeScores').doc(gameId);
      
      await vibeScoreRef.set({
        gameId,
        scores: updates,
        updatedAt: firebase.firestore.Timestamp.now(),
      }, { merge: true });

      console.log(`[VibeScores] Calculated scores for ${Object.keys(updates).length} members for game ${gameId}`);
    }
  } catch (error) {
    console.error('[VibeScores] Error calculating vibe scores:', error);
  }
};

/**
 * Calculate vibe scores for all games in a meepleup for a specific user
 * Called when a new member joins or when a user's collection changes
 * @param {string} eventId - The meepleup/event ID
 * @param {string} userId - The user ID
 * @param {Array} userCollection - The user's game collection
 * @param {Object} customWeights - User's custom weights (optional)
 * @returns {Promise<void>}
 */
export const calculateVibeScoresForUser = async (eventId, userId, userCollection = [], customWeights = null) => {
  if (!db || !eventId || !userId || !userCollection || userCollection.length === 0) {
    console.warn('[VibeScores] Missing required parameters or empty collection');
    return;
  }

  try {
    // Get all confirmed attendees and their games (super collection)
    const membersSnapshot = await db.collection('gamingGroups').doc(eventId)
      .collection('members').get();

    if (membersSnapshot.empty) {
      console.log('[VibeScores] No members found for meepleup');
      return;
    }

    // Collect all unique games from all members (super collection)
    const allGames = new Map(); // gameId -> game object

    for (const memberDoc of membersSnapshot.docs) {
      const memberId = memberDoc.id;
      // Get member's collection from Firestore
      try {
        const memberGamesSnapshot = await db.collection('userGames').doc(memberId)
          .collection('games').get();
        
        memberGamesSnapshot.forEach(doc => {
          const data = doc.data();
          const gameId = data.bggId || doc.id;
          if (gameId && !allGames.has(gameId)) {
            allGames.set(gameId, {
              id: doc.id,
              bggId: gameId,
              title: data.title || data.gameName || 'Unknown Game',
              mechanics: data.mechanics || null,
              categories: data.categories || null,
              publishers: data.publishers || null,
              publisher: data.publisher || null,
              complexity: data.complexity || null,
              averageWeight: data.averageWeight || data.complexity || null,
            });
          }
        });
      } catch (err) {
        console.warn(`[VibeScores] Error fetching games for member ${memberId}:`, err);
        // Continue with other members
      }
    }

    console.log(`[VibeScores] Found ${allGames.size} unique games in meepleup`);

    // Calculate score for each game
    // Use batches to avoid Firestore limits (500 operations per batch)
    const BATCH_SIZE = 500;
    const gameEntries = Array.from(allGames.entries());
    let totalUpdated = 0;

    for (let i = 0; i < gameEntries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchGames = gameEntries.slice(i, i + BATCH_SIZE);
      let batchUpdateCount = 0;

      for (const [gameId, game] of batchGames) {
        // Try to get full game data from gameDatabase if needed
        let gameData = game;
        if (!gameData.mechanics && !gameData.categories && gameData.bggId) {
          try {
            const { getGameById } = await import('../services/gameDatabase');
            const fullGameData = await getGameById(gameData.bggId);
            if (fullGameData) {
              gameData = {
                ...gameData,
                mechanics: fullGameData.mechanics || gameData.mechanics,
                categories: fullGameData.categories || gameData.categories,
                publishers: fullGameData.publishers || gameData.publishers,
                publisher: fullGameData.publisher || gameData.publisher,
                complexity: fullGameData.complexity || gameData.complexity,
                averageWeight: fullGameData.averageWeight || fullGameData.complexity || gameData.averageWeight,
              };
            }
          } catch (err) {
            // Use game data as-is
          }
        }

        const score = calculateVibeScore(gameData, userCollection, customWeights);
        
        if (score !== null) {
          const vibeScoreRef = db.collection('gamingGroups').doc(eventId)
            .collection('vibeScores').doc(gameId);
          
          batch.set(vibeScoreRef, {
            gameId,
            [`scores.${userId}`]: score,
            updatedAt: firebase.firestore.Timestamp.now(),
          }, { merge: true });
          batchUpdateCount++;
        }
      }

      if (batchUpdateCount > 0) {
        await batch.commit();
        totalUpdated += batchUpdateCount;
      }
    }

    if (totalUpdated > 0) {
      console.log(`[VibeScores] Calculated scores for ${totalUpdated} games for user ${userId}`);
    }
  } catch (error) {
    console.error('[VibeScores] Error calculating vibe scores for user:', error);
  }
};

/**
 * Get vibe score for a specific game and user
 * @param {string} eventId - The meepleup/event ID
 * @param {string} gameId - The game ID
 * @param {string} userId - The user ID
 * @returns {Promise<number|null>} The vibe score or null if not found
 */
export const getVibeScore = async (eventId, gameId, userId) => {
  if (!db || !eventId || !gameId || !userId) {
    return null;
  }

  try {
    const vibeScoreDoc = await db.collection('gamingGroups').doc(eventId)
      .collection('vibeScores').doc(gameId).get();
    
    if (vibeScoreDoc.exists) {
      const data = vibeScoreDoc.data();
      return data.scores?.[userId] || null;
    }
    
    return null;
  } catch (error) {
    console.error('[VibeScores] Error getting vibe score:', error);
    return null;
  }
};

/**
 * Get all vibe scores for a game
 * @param {string} eventId - The meepleup/event ID
 * @param {string} gameId - The game ID
 * @returns {Promise<Object>} Object mapping userId to score
 */
export const getVibeScoresForGame = async (eventId, gameId) => {
  if (!db || !eventId || !gameId) {
    return {};
  }

  try {
    const vibeScoreDoc = await db.collection('gamingGroups').doc(eventId)
      .collection('vibeScores').doc(gameId).get();
    
    if (vibeScoreDoc.exists) {
      const data = vibeScoreDoc.data();
      return data.scores || {};
    }
    
    return {};
  } catch (error) {
    console.error('[VibeScores] Error getting vibe scores:', error);
    return {};
  }
};

