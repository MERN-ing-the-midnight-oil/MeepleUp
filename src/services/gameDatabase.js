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
    const queryWithTimeout = (queryPromise, queryName, searchTermForLog = null) => {
      const searchInfo = searchTermForLog ? ` (search term: "${searchTermForLog}")` : '';
      if (__DEV__) {
        console.log(`[Game Database] Starting ${queryName} with 5s timeout${searchInfo}`);
      }
      return Promise.race([
        queryPromise.then((result) => {
          if (__DEV__) {
            console.log(`[Game Database] ${queryName} completed successfully${searchInfo}`);
          }
          return result;
        }),
        new Promise((_, reject) => {
          setTimeout(() => {
            if (__DEV__) {
              console.error(`[Game Database] ${queryName} timed out after 5 seconds${searchInfo}`);
            }
            reject(new Error(`Firestore query timeout after 5 seconds: ${queryName}${searchInfo}`));
          }, 5000);
        })
      ]);
    };
    
    // Test query removed - it was just diagnostic and caused unnecessary error logs

    // Try optimized query with index first (if index exists)
    try {
      if (__DEV__) {
        console.log('[Game Database] Attempting indexed query with nameLower field');
        console.log('[Game Database] Search term:', searchTerm);
      }
      
      // Use range query for prefix matching (starts with)
      // This requires a composite index on nameLower
      // Get more results to allow for partial (contains) and fuzzy matching
      // For better partial matching, use a shorter prefix to catch games that contain the search term
      // For "cat chaos", we want to find "cat chaos card game" - so we use just "cat" as the lower bound
      // and extend the upper bound to catch all games starting with the first word
      const words = searchTerm.split(/\s+/);
      const firstWord = words[0];
      
      // For multi-word searches, try using the full search term as prefix first
      // This is more efficient and will find exact matches faster
      // Only fall back to first word if the full term is too long or doesn't work
      const useFullTerm = words.length > 1 && searchTerm.length <= 30;
      const searchPrefix = useFullTerm ? searchTerm : firstWord;
      const searchUpperBound = (useFullTerm ? searchTerm : firstWord) + '\uf8ff';
      
      if (__DEV__) {
        console.log('[Game Database] Range:', searchPrefix, 'to', searchUpperBound, '(searching for:', searchTerm + ')');
      }
      
      // Use a more targeted search: if the search term is short or specific, use exact prefix
      // Otherwise, use a broader range but limit results more aggressively
      // For multi-word searches, we need more results to ensure we don't miss matches
      const isShortQuery = searchTerm.length <= 4;
      const isMultiWord = words.length > 1;
      // Increase limit for multi-word searches to ensure we capture all games starting with the first word
      const limitSize = isShortQuery ? 50 : (isMultiWord ? 200 : 100);
      
      if (__DEV__ && isMultiWord) {
        console.log('[Game Database] Multi-word search detected, using higher limit:', limitSize);
      }
      
      let queryRef = gamesRef
        .where('nameLower', '>=', searchPrefix) // Start from first word to catch partial matches
        .where('nameLower', '<=', searchUpperBound) // Extend to catch all games starting with first word
        .orderBy('nameLower')
        .limit(limitSize);
      
      if (__DEV__) {
        console.log('[Game Database] Query ref created, executing get()...');
      }
      
      const snapshot = await queryWithTimeout(queryRef.get(), 'indexed query', searchTerm);
      
      if (__DEV__) {
        console.log('[Game Database] Indexed query returned, empty:', snapshot.empty, 'size:', snapshot.size);
        if (!snapshot.empty) {
          const firstDoc = snapshot.docs[0];
          const lastDoc = snapshot.docs[snapshot.docs.length - 1];
          console.log('[Game Database] First result:', {
            id: firstDoc.id,
            name: firstDoc.data().name,
            nameLower: firstDoc.data().nameLower
          });
          console.log('[Game Database] Last result:', {
            id: lastDoc.id,
            name: lastDoc.data().name,
            nameLower: lastDoc.data().nameLower
          });
          // Check if search term appears in any results
          const matchingResults = snapshot.docs.filter(doc => {
            const nameLower = doc.data().nameLower || '';
            return nameLower.includes(searchTerm);
          });
          console.log('[Game Database] Results containing search term "' + searchTerm + '":', matchingResults.length);
          if (matchingResults.length > 0) {
            console.log('[Game Database] Matching game names:', matchingResults.slice(0, 5).map(doc => doc.data().name));
          }
        }
      }
      
      if (!snapshot.empty) {
        // Process all results (not limited) to allow for partial matching
        // The limit will be applied in processSearchResults for final return
        const results = processSearchResults(snapshot, searchTerm, limit);
        if (__DEV__) {
          console.log('[Game Database] Processed', results.length, 'results from indexed query (showing top', limit, ')');
          if (results.length > 0) {
            console.log('[Game Database] Games found:', results.map(r => r.name).join(', '));
            console.log('[Game Database] Top 10 game titles:', results.slice(0, 10).map(r => `"${r.name}" (rank: ${r.rank || 'N/A'}, match: ${r.matchType || 'unknown'})`));
          }
        }
        
        // If we used full term and got no good matches, try falling back to first word only
        if (results.length === 0 && useFullTerm && words.length > 1) {
          if (__DEV__) {
            console.log('[Game Database] No results with full term, trying first word only:', firstWord);
          }
          
          // Try again with just the first word
          const fallbackPrefix = firstWord;
          const fallbackUpperBound = firstWord + '\uf8ff';
          const fallbackQueryRef = gamesRef
            .where('nameLower', '>=', fallbackPrefix)
            .where('nameLower', '<=', fallbackUpperBound)
            .orderBy('nameLower')
            .limit(200);
          
          try {
            const fallbackSnapshot = await queryWithTimeout(fallbackQueryRef.get(), 'fallback first-word query', searchTerm);
            if (!fallbackSnapshot.empty) {
              if (__DEV__) {
                console.log('[Game Database] Fallback query returned', fallbackSnapshot.size, 'documents starting with "' + firstWord + '"');
                // Log first few game names to see what we got
                const sampleGames = fallbackSnapshot.docs.slice(0, 10).map(doc => ({
                  id: doc.id,
                  name: doc.data().name,
                  nameLower: doc.data().nameLower
                }));
                console.log('[Game Database] Sample games from fallback query:', sampleGames);
              }
              const fallbackResults = processSearchResults(fallbackSnapshot, searchTerm, limit);
              if (__DEV__) {
                console.log('[Game Database] Fallback query found', fallbackResults.length, 'results after filtering');
                if (fallbackResults.length === 0 && fallbackSnapshot.size > 0) {
                  console.log('[Game Database] WARNING: Fallback returned', fallbackSnapshot.size, 'games but 0 matched the search term "' + searchTerm + '"');
                  console.log('[Game Database] This suggests the game might not be in the database, or the nameLower field doesn\'t match');
                }
              }
              if (fallbackResults.length > 0) {
                return fallbackResults;
              }
            }
          } catch (fallbackError) {
            if (__DEV__) {
              console.warn('[Game Database] Fallback query failed:', fallbackError);
            }
          }
        }
        
        return results;
      } else {
        // Indexed query succeeded but returned no results
        // For multi-word searches, try falling back to first word only
        if (useFullTerm && words.length > 1) {
          if (__DEV__) {
            console.log('[Game Database] No results with full term, trying first word only:', firstWord);
          }
          
          const fallbackPrefix = firstWord;
          const fallbackUpperBound = firstWord + '\uf8ff';
          const fallbackQueryRef = gamesRef
            .where('nameLower', '>=', fallbackPrefix)
            .where('nameLower', '<=', fallbackUpperBound)
            .orderBy('nameLower')
            .limit(200);
          
          try {
            const fallbackSnapshot = await queryWithTimeout(fallbackQueryRef.get(), 'fallback first-word query', searchTerm);
            if (!fallbackSnapshot.empty) {
              if (__DEV__) {
                console.log('[Game Database] Fallback query returned', fallbackSnapshot.size, 'documents starting with "' + firstWord + '"');
                // Log first few game names to see what we got
                const sampleGames = fallbackSnapshot.docs.slice(0, 10).map(doc => ({
                  id: doc.id,
                  name: doc.data().name,
                  nameLower: doc.data().nameLower
                }));
                console.log('[Game Database] Sample games from fallback query:', sampleGames);
              }
              const fallbackResults = processSearchResults(fallbackSnapshot, searchTerm, limit);
              if (__DEV__) {
                console.log('[Game Database] Fallback query found', fallbackResults.length, 'results after filtering');
                if (fallbackResults.length === 0 && fallbackSnapshot.size > 0) {
                  console.log('[Game Database] WARNING: Fallback returned', fallbackSnapshot.size, 'games but 0 matched the search term "' + searchTerm + '"');
                  console.log('[Game Database] This suggests the game might not be in the database, or the nameLower field doesn\'t match');
                }
              }
              if (fallbackResults.length > 0) {
                return fallbackResults;
              }
            }
          } catch (fallbackError) {
            if (__DEV__) {
              console.warn('[Game Database] Fallback query failed:', fallbackError);
            }
          }
        }
        
        // No results found
        if (__DEV__) {
          console.log('[Game Database] Indexed query returned empty - game not found in database');
          console.log('[Game Database] Returning empty array');
        }
        return [];
      }
    } catch (indexError) {
      // If index doesn't exist or query fails, fall back to simpler approach
      if (__DEV__) {
        console.log('[Game Database] Indexed query failed, using fallback:', indexError.message);
        console.log('[Game Database] Index error details:', indexError);
      }
      
      // Fallback: Get a smaller batch and filter client-side
      // Reduced from 1000 to 200 to improve performance
      try {
        if (__DEV__) {
          console.log('[Game Database] Attempting fallback query (limit 200)...');
        }
        
        const snapshot = await queryWithTimeout(gamesRef.limit(200).get(), 'fallback query', searchTerm); // Reduced limit for better performance
        
        if (__DEV__) {
          console.log('[Game Database] Fallback query returned, empty:', snapshot.empty, 'size:', snapshot.size);
        }
        
        if (!snapshot.empty) {
          const results = processSearchResults(snapshot, searchTerm, limit);
          if (__DEV__) {
            console.log('[Game Database] Processed', results.length, 'results from fallback query');
            if (results.length > 0) {
              console.log('[Game Database] Fallback games found:', results.map(r => r.name).join(', '));
              console.log('[Game Database] Top 10 fallback game titles:', results.slice(0, 10).map(r => `"${r.name}" (rank: ${r.rank || 'N/A'}, match: ${r.matchType || 'unknown'})`));
            }
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
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity score (0-1, where 1 is identical)
 */
function calculateSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Process search results and filter by match type with fuzzy matching
 * Only uses fuzzy matching if we don't have enough exact/startsWith/contains matches
 */
function processSearchResults(snapshot, searchTerm, limit) {
  const exactMatches = [];
  const startsWithMatches = [];
  const containsMatches = [];
  const fuzzyMatches = []; // For typo-tolerant matches
  const nonMatches = []; // Store non-matching docs for potential fuzzy matching later
  
  // First pass: collect exact, startsWith, and contains matches
  snapshot.forEach((doc) => {
    const game = doc.data();
    const gameNameLower = game.nameLower || game.name?.toLowerCase() || '';
    
    // Normalize both strings for comparison (remove extra spaces, punctuation)
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedGame = gameNameLower.trim().toLowerCase();
    
    if (normalizedGame === normalizedSearch) {
      exactMatches.push({ doc, game, similarity: 1.0, matchType: 'exact' });
    } else if (normalizedGame.startsWith(normalizedSearch)) {
      startsWithMatches.push({ doc, game, similarity: 1.0, matchType: 'startsWith' });
    } else if (normalizedGame.includes(normalizedSearch)) {
      containsMatches.push({ doc, game, similarity: 1.0, matchType: 'contains' });
    } else {
      // Also check if search term is contained in game name (reverse check)
      // This helps with cases like searching "imperius" but game is "imperious"
      if (normalizedSearch.length >= 4 && normalizedGame.length >= normalizedSearch.length) {
        // Check if search term is a substring of game name
        if (normalizedGame.includes(normalizedSearch)) {
          containsMatches.push({ doc, game, similarity: 0.95, matchType: 'contains' });
        } else {
          // Store for potential fuzzy matching (only if we need more results)
          nonMatches.push({ doc, game, gameNameLower: normalizedGame });
        }
      } else {
        nonMatches.push({ doc, game, gameNameLower: normalizedGame });
      }
    }
  });
  
  // Count how many good matches we have
  const goodMatchesCount = exactMatches.length + startsWithMatches.length + containsMatches.length;
  
  // Only do expensive fuzzy matching if we don't have enough good matches
  // This significantly improves performance for common games
  if (goodMatchesCount < limit && nonMatches.length > 0 && searchTerm.length >= 4) {
    if (__DEV__) {
      console.log(`[Game Database] Only ${goodMatchesCount} good matches found, doing fuzzy matching on ${nonMatches.length} candidates`);
    }
    
    // Second pass: fuzzy matching only on non-matching documents
    nonMatches.forEach(({ doc, game, gameNameLower }) => {
      const searchPrefix = searchTerm.substring(0, Math.min(6, searchTerm.length));
      const gamePrefix = gameNameLower.substring(0, Math.min(6, gameNameLower.length));
      
      // Quick prefix check before expensive Levenshtein calculation
      if (searchPrefix.length >= 4 && gamePrefix.length >= 4 && 
          calculateSimilarity(searchPrefix, gamePrefix) >= 0.6) {
        const similarity = calculateSimilarity(searchTerm, gameNameLower);
        // Include if similarity is high (>= 0.75, increased threshold for better performance)
        if (similarity >= 0.75) {
          fuzzyMatches.push({ doc, game, similarity, matchType: 'fuzzy' });
        }
      }
    });
  } else if (__DEV__ && goodMatchesCount >= limit) {
    console.log(`[Game Database] Found ${goodMatchesCount} good matches (>= ${limit}), skipping fuzzy matching for performance`);
  }
  
  // Combine results in priority order
  const allMatches = [...exactMatches, ...startsWithMatches, ...containsMatches, ...fuzzyMatches];
  
  // Convert to result format
  const results = allMatches.map(({ game, doc, similarity, matchType }) => ({
    id: game.id || doc.id,
    name: game.name,
    yearPublished: game.yearPublished || '',
    rank: game.rank || '0',
    average: game.average || '',
    bayesAverage: game.bayesAverage || '',
    usersRated: game.usersRated || '',
    similarity: similarity || 1.0,
    matchType: matchType || (game.nameLower === searchTerm ? 'exact' : 
                            game.nameLower.startsWith(searchTerm) ? 'startsWith' :
                            game.nameLower.includes(searchTerm) ? 'contains' : 'fuzzy'),
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
  
  // Sort by match type priority first, then by rank, then by similarity
  results.sort((a, b) => {
    // Priority: exact > starts with > contains > fuzzy
    const aType = a.matchType || 'fuzzy';
    const bType = b.matchType || 'fuzzy';
    const typePriority = { exact: 0, startsWith: 1, contains: 2, fuzzy: 3 };
    const aPriority = typePriority[aType] ?? 3;
    const bPriority = typePriority[bType] ?? 3;
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Within same type, sort by rank (lower is better)
    const aRank = parseInt(a.rank) || 999999;
    const bRank = parseInt(b.rank) || 999999;
    
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    
    // If ranks are equal, sort by similarity (higher is better)
    const aSim = a.similarity || 0;
    const bSim = b.similarity || 0;
    return bSim - aSim;
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

