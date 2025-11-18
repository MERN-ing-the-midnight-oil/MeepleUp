/**
 * Game Database Service - Firebase Backend
 * Handles game searches using Firestore instead of bundling large JSON files
 */

import { db, auth } from '../config/firebase';

const GAMES_COLLECTION = 'games';
const GAMES_INDEX_COLLECTION = 'games_index'; // For faster searches

// Circuit breaker: disable Firestore if it fails too many times
let firestoreFailureCount = 0;
const MAX_FAILURES = 2;
let firestoreDisabled = false;

/**
 * Search for games by name using Firestore
 * @param {string} query - Game name to search for
 * @param {number} limit - Maximum number of results (default: 10)
 * @returns {Promise<Array>} Array of matching games
 */
export async function searchGamesByName(query, limit = 10) {
  if (!query || !query.trim()) {
    return [];
  }

  // Circuit breaker: skip Firestore if it's been disabled due to failures
  if (firestoreDisabled) {
    if (__DEV__) {
      console.log('[Game Database] Firestore disabled due to previous failures, skipping');
    }
    return [];
  }

  // Check if db is properly initialized
  if (!db) {
    if (__DEV__) {
      console.warn('[Game Database] Firestore db not initialized');
    }
    firestoreFailureCount++;
    if (firestoreFailureCount >= MAX_FAILURES) {
      firestoreDisabled = true;
    }
    return [];
  }

  // Check if user is authenticated (required by Firestore rules)
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      if (__DEV__) {
        console.warn('[Game Database] User not authenticated, Firestore rules may block query');
        console.log('[Game Database] Auth state:', auth ? 'exists' : 'null');
      }
      // Don't fail here - let the query try and see what error we get
    } else {
      if (__DEV__) {
        console.log('[Game Database] User authenticated:', currentUser.uid);
      }
    }
  } catch (authError) {
    if (__DEV__) {
      console.warn('[Game Database] Error checking auth:', authError);
    }
  }

  try {
    const searchTerm = query.toLowerCase().trim();
    
    if (__DEV__) {
      console.log('[Game Database] Starting search for:', searchTerm);
      console.log('[Game Database] db object:', db ? 'exists' : 'null');
      console.log('[Game Database] db type:', typeof db);
    }
    
    const gamesRef = db.collection(GAMES_COLLECTION);
    
    if (__DEV__) {
      console.log('[Game Database] Collection reference created');
    }
    
    // Add timeout wrapper to prevent hanging
    const queryWithTimeout = (queryPromise, queryName) => {
      if (__DEV__) {
        console.log(`[Game Database] Starting ${queryName} with 5s timeout`);
      }
      return Promise.race([
        queryPromise.then((result) => {
          if (__DEV__) {
            console.log(`[Game Database] ${queryName} completed successfully`);
          }
          return result;
        }),
        new Promise((_, reject) => {
          setTimeout(() => {
            if (__DEV__) {
              console.error(`[Game Database] ${queryName} timed out after 5 seconds`);
            }
            reject(new Error(`Firestore query timeout after 5 seconds: ${queryName}`));
          }, 5000);
        })
      ]);
    };
    
    // First, let's check if ANY games exist in the collection
    try {
      const testSnapshot = await queryWithTimeout(gamesRef.limit(1).get(), 'test query');
      if (__DEV__) {
        console.log('[Game Database] Test query - games exist:', !testSnapshot.empty);
        if (!testSnapshot.empty) {
          const testDoc = testSnapshot.docs[0];
          const testData = testDoc.data();
          console.log('[Game Database] Sample game data:', {
            id: testDoc.id,
            name: testData.name,
            nameLower: testData.nameLower,
            hasNameLower: 'nameLower' in testData,
            allFields: Object.keys(testData)
          });
        }
      }
    } catch (testError) {
      if (__DEV__) {
        console.error('[Game Database] Test query failed:', testError);
      }
    }

    // Try optimized query with index first (if index exists)
    try {
      if (__DEV__) {
        console.log('[Game Database] Attempting indexed query with nameLower field');
        console.log('[Game Database] Search term:', searchTerm);
        console.log('[Game Database] Range:', searchTerm, 'to', searchTerm + '\uf8ff');
      }
      
      // Use range query for prefix matching (starts with)
      // This requires a composite index on nameLower
      let queryRef = gamesRef
        .where('nameLower', '>=', searchTerm)
        .where('nameLower', '<=', searchTerm + '\uf8ff')
        .orderBy('nameLower')
        .limit(limit * 3); // Get more results to filter for contains matches
      
      if (__DEV__) {
        console.log('[Game Database] Query ref created, executing get()...');
      }
      
      const snapshot = await queryWithTimeout(queryRef.get(), 'indexed query');
      
      if (__DEV__) {
        console.log('[Game Database] Indexed query returned, empty:', snapshot.empty, 'size:', snapshot.size);
        if (!snapshot.empty) {
          const firstDoc = snapshot.docs[0];
          console.log('[Game Database] First result:', {
            id: firstDoc.id,
            name: firstDoc.data().name,
            nameLower: firstDoc.data().nameLower
          });
        }
      }
      
      if (!snapshot.empty) {
        const results = processSearchResults(snapshot, searchTerm, limit);
        if (__DEV__) {
          console.log('[Game Database] Processed', results.length, 'results from indexed query');
        }
        return results;
      } else {
        // Indexed query succeeded but returned no results - game doesn't exist
        if (__DEV__) {
          console.log('[Game Database] Indexed query returned empty - game not found in database');
          console.log('[Game Database] Returning empty array');
        }
        // Return empty array immediately - no fallback needed
        const emptyResult = [];
        if (__DEV__) {
          console.log('[Game Database] Empty result created, returning');
        }
        return emptyResult;
      }
    } catch (indexError) {
      // If index doesn't exist or query fails, fall back to simpler approach
      if (__DEV__) {
        console.log('[Game Database] Indexed query failed, using fallback:', indexError.message);
        console.log('[Game Database] Index error details:', indexError);
      }
      
      // Fallback: Get a smaller batch and filter client-side
      // Reduced from 5000 to 1000 to prevent crashes
      try {
        if (__DEV__) {
          console.log('[Game Database] Attempting fallback query (limit 1000)...');
        }
        
        const snapshot = await queryWithTimeout(gamesRef.limit(1000).get(), 'fallback query'); // Reduced limit to prevent crashes
        
        if (__DEV__) {
          console.log('[Game Database] Fallback query returned, empty:', snapshot.empty, 'size:', snapshot.size);
        }
        
        if (!snapshot.empty) {
          const results = processSearchResults(snapshot, searchTerm, limit);
          if (__DEV__) {
            console.log('[Game Database] Processed', results.length, 'results from fallback query');
          }
          return results;
        }
      } catch (fallbackError) {
        if (__DEV__) {
          console.error('[Game Database] Fallback query also failed:', fallbackError.message);
          console.error('[Game Database] Fallback error details:', fallbackError);
        }
        // Return empty - will fall back to BGG API
        return [];
      }
    }
    
    return [];
  } catch (error) {
    console.error('[Game Database] Firestore search error:', error);
    
    // Increment failure count and disable if too many failures
    firestoreFailureCount++;
    if (firestoreFailureCount >= MAX_FAILURES) {
      firestoreDisabled = true;
      if (__DEV__) {
        console.warn('[Game Database] Disabling Firestore after', firestoreFailureCount, 'failures');
      }
    }
    
    // Return empty array on error - will fall back to BGG API
    return [];
  }
}

/**
 * Process search results and filter by match type
 */
function processSearchResults(snapshot, searchTerm, limit) {
  const exactMatches = [];
  const startsWithMatches = [];
  const containsMatches = [];
  
  snapshot.forEach((doc) => {
    const game = doc.data();
    const gameNameLower = game.nameLower || game.name?.toLowerCase() || '';
    
    if (gameNameLower === searchTerm) {
      exactMatches.push({ doc, game });
    } else if (gameNameLower.startsWith(searchTerm)) {
      startsWithMatches.push({ doc, game });
    } else if (gameNameLower.includes(searchTerm)) {
      containsMatches.push({ doc, game });
    }
  });
  
  // Combine results in priority order
  const allMatches = [...exactMatches, ...startsWithMatches, ...containsMatches];
  
  // Convert to result format
  const results = allMatches.map(({ game, doc }) => ({
    id: game.id || doc.id,
    name: game.name,
    yearPublished: game.yearPublished || '',
    rank: game.rank || '0',
    average: game.average || '',
    bayesAverage: game.bayesAverage || '',
    usersRated: game.usersRated || '',
    // Category ranks
    abstractsRank: game.abstractsRank || '',
    cgsRank: game.cgsRank || '',
    childrensGamesRank: game.childrensGamesRank || '',
    familyGamesRank: game.familyGamesRank || '',
    partyGamesRank: game.partyGamesRank || '',
    strategyGamesRank: game.strategyGamesRank || '',
    thematicRank: game.thematicRank || '',
    wargamesRank: game.wargamesRank || '',
  }));
  
  // Sort by rank (lower is better) within each match type
  results.sort((a, b) => {
    const aRank = parseInt(a.rank) || 999999;
    const bRank = parseInt(b.rank) || 999999;
    return aRank - bRank;
  });
  
  return results.slice(0, limit);
}

/**
 * Get game by BGG ID from Firestore
 * @param {string} gameId - BGG game ID
 * @returns {Promise<Object|null>} Game object or null if not found
 */
export async function getGameById(gameId) {
  if (!gameId) return null;

  try {
    const gamesRef = db.collection(GAMES_COLLECTION);
    // Use doc() since the document ID is the game ID (faster, no index needed)
    const docRef = gamesRef.doc(gameId.toString());
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const game = doc.data();
    
    return {
      id: game.id || doc.id,
      name: game.name,
      yearPublished: game.yearPublished || '',
      rank: game.rank || '0',
      average: game.average || '',
      bayesAverage: game.bayesAverage || '',
      usersRated: game.usersRated || '',
      abstractsRank: game.abstractsRank || '',
      cgsRank: game.cgsRank || '',
      childrensGamesRank: game.childrensGamesRank || '',
      familyGamesRank: game.familyGamesRank || '',
      partyGamesRank: game.partyGamesRank || '',
      strategyGamesRank: game.strategyGamesRank || '',
      thematicRank: game.thematicRank || '',
      wargamesRank: game.wargamesRank || '',
    };
  } catch (error) {
    console.error('[Game Database] Firestore getById error:', error);
    return null;
  }
}

/**
 * Check if game database is populated in Firestore
 * @returns {Promise<boolean>} True if database has games
 */
export async function isDatabasePopulated() {
  try {
    const gamesRef = db.collection(GAMES_COLLECTION);
    const snapshot = await gamesRef.limit(1).get();
    return !snapshot.empty;
  } catch (error) {
    console.error('[Game Database] Error checking if populated:', error);
    return false;
  }
}

