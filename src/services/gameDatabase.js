/**
 * Game Database Service - Firebase Backend
 * Handles game searches using Firestore instead of bundling large JSON files
 */

import { db, auth } from '../config/firebase';
import firebase from 'firebase/compat/app';

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
    const originalSearchTerm = query.toLowerCase().trim();
    
    // Import logger for in-app logging (for TestFlight debugging)
    let logger = null;
    try {
      logger = (await import('../utils/inAppLogger')).default;
    } catch (loggerError) {
      // Logger not available, continue without it
    }
    
    if (logger) {
      logger.debug(`[Firebase] Starting search for: "${originalSearchTerm}"`);
    }
    
    if (__DEV__) {
      console.log('[Game Database] Starting search for:', originalSearchTerm);
      console.log('[Game Database] db object:', db ? 'exists' : 'null');
      console.log('[Game Database] db type:', typeof db);
    }
    
    const gamesRef = db.collection(GAMES_COLLECTION);
    
    if (__DEV__) {
      console.log('[Game Database] Collection reference created');
    }
    
    // Strategy: Try progressive suffix removal for better matching
    // Example: "Feudum: Alter Ego - Forest" -> try "Feudum: Alter Ego" -> try "Feudum"
    // This helps find games when the search term has extra suffixes
    const generateSearchVariants = (term) => {
      const variants = [term]; // Always try original first
      
      // Remove common suffixes/patterns
      // Pattern: " - something" or ": something" at the end
      let cleaned = term;
      
      // Remove " - [word]" patterns (e.g., " - Forest", " - Expansion")
      cleaned = cleaned.replace(/\s*-\s*[^-:]+$/, '').trim();
      if (cleaned && cleaned !== term && cleaned.length >= 3) {
        variants.push(cleaned);
      }
      
      // Remove ": [word]" patterns (e.g., ": Arrows of the Forest")
      cleaned = term;
      cleaned = cleaned.replace(/:\s*[^:]+$/, '').trim();
      if (cleaned && cleaned !== term && cleaned.length >= 3) {
        variants.push(cleaned);
      }
      
      // Remove both patterns
      cleaned = term;
      cleaned = cleaned.replace(/\s*-\s*[^-:]+$/, '').trim();
      cleaned = cleaned.replace(/:\s*[^:]+$/, '').trim();
      if (cleaned && cleaned !== term && cleaned.length >= 3) {
        variants.push(cleaned);
      }
      
      // Remove last word if it's a common suffix word
      const suffixWords = ['forest', 'expansion', 'edition', 'promo', 'promotional', 'card', 'cards'];
      const words = term.split(/\s+/);
      if (words.length > 2) {
        const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
        if (suffixWords.includes(lastWord)) {
          const withoutLastWord = words.slice(0, -1).join(' ').trim();
          if (withoutLastWord && withoutLastWord !== term && withoutLastWord.length >= 3) {
            variants.push(withoutLastWord);
          }
        }
      }
      
      // Return unique variants, preserving order
      return [...new Set(variants)];
    };
    
    const searchVariants = generateSearchVariants(originalSearchTerm);
    if (__DEV__ && searchVariants.length > 1) {
      console.log('[Game Database] Generated search variants:', searchVariants);
    }
    
    // Add timeout wrapper to prevent hanging
    // Increased to 7s to give Firestore more time for legitimate slow queries
    // Range queries on large collections can take 3-5 seconds, so we need adequate timeout
    // 7 seconds balances allowing legitimate queries to complete vs fast fallback to BGG API
    const QUERY_TIMEOUT_MS = 7000; // Increased from 3000ms to 7000ms to prevent false timeouts
    
    // Track active queries to identify concurrency issues
    const activeQueries = new Set();
    const queryWithTimeout = (queryPromise, queryName, searchTermForLog = null) => {
      const searchInfo = searchTermForLog ? ` (search term: "${searchTermForLog}")` : '';
      const queryId = `${queryName}:${searchTermForLog || 'unknown'}`;
      
      // Track this query
      activeQueries.add(queryId);
      const activeCount = activeQueries.size;
      
      if (__DEV__) {
        console.log(`[Game Database] Starting ${queryName} with ${QUERY_TIMEOUT_MS/1000}s timeout${searchInfo} (${activeCount} active queries)`);
      }
      
      return Promise.race([
        queryPromise.then((result) => {
          activeQueries.delete(queryId);
          if (__DEV__) {
            console.log(`[Game Database] ${queryName} completed successfully${searchInfo}`);
          }
          return result;
        }),
        new Promise((_, reject) => {
          setTimeout(async () => {
            activeQueries.delete(queryId);
            
            // Try to log timeout via logger if available
            // Use WARN instead of ERROR - timeouts are expected when Firebase is slow,
            // and we have a BGG API fallback that usually succeeds
            try {
              const logger = (await import('../utils/inAppLogger')).default;
              logger.warn(`[Firebase] Query timeout for "${searchTermForLog || queryName}" (will fallback to BGG)`, {
                timeoutSeconds: QUERY_TIMEOUT_MS / 1000,
                queryName,
                searchTerm: searchTermForLog,
                activeQueriesCount: activeQueries.size,
                source: 'searchGamesByName_firebase',
              });
            } catch (loggerError) {
              // Logger not available, continue
            }
            
            if (__DEV__) {
              // Use warn instead of error - timeouts are expected for games that don't exist
              console.warn(`[Game Database] ${queryName} timed out after ${QUERY_TIMEOUT_MS/1000} seconds${searchInfo} (${activeQueries.size} still active)`);
            }
            reject(new Error(`Firestore query timeout after ${QUERY_TIMEOUT_MS/1000} seconds: ${queryName}${searchInfo}`));
          }, QUERY_TIMEOUT_MS);
        })
      ]);
    };
    
    // Test query removed - it was just diagnostic and caused unnecessary error logs

    // Try each search variant in order (exact first, then progressively shorter)
    for (let variantIndex = 0; variantIndex < searchVariants.length; variantIndex++) {
      const searchTerm = searchVariants[variantIndex];
      const isFirstVariant = variantIndex === 0;
      
      if (__DEV__ && !isFirstVariant) {
        console.log(`[Game Database] Trying variant ${variantIndex + 1}/${searchVariants.length}: "${searchTerm}"`);
      }
      
      // Try optimized query with index first (if index exists)
      try {
        if (__DEV__ && isFirstVariant) {
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
      
      if (logger) {
        logger.info(`[Firebase] Query completed for "${searchTerm}"`, {
          empty: snapshot.empty,
          size: snapshot.size,
          searchTerm,
        });
      }
      
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
        // Use the ORIGINAL search term for processing to maintain match quality scoring
        // This ensures reverseContains matches work correctly
        const results = processSearchResults(snapshot, originalSearchTerm, limit);
        if (__DEV__) {
          console.log('[Game Database] Processed', results.length, 'results from indexed query (showing top', limit, ')');
          if (results.length > 0) {
            console.log('[Game Database] Games found:', results.map(r => r.name).join(', '));
            console.log('[Game Database] Top 10 game titles:', results.slice(0, 10).map(r => `"${r.name}" (rank: ${r.rank || 'N/A'}, match: ${r.matchType || 'unknown'})`));
          }
        }
        
        // If we found good matches, return them (prioritize exact/startsWith over reverseContains)
        // Only continue to next variant if we only got reverseContains matches and this is the first variant
        const hasGoodMatches = results.some(r => 
          r.matchType === 'exact' || 
          r.matchType === 'startsWith' || 
          r.matchType === 'contains'
        );
        
        if (results.length > 0 && (hasGoodMatches || variantIndex === searchVariants.length - 1)) {
          // Found good matches or this is the last variant - return results
          return results;
        }
        
        // If we used full term and got no good matches, try falling back to first word only
        if (results.length === 0 && useFullTerm && words.length > 1) {
          if (logger) {
            logger.debug(`[Firebase] No results with full term "${searchTerm}", trying first word "${firstWord}"`);
          }
          if (__DEV__) {
            console.log('[Game Database] No results with full term, trying first word only:', firstWord);
          }
          
          // Try again with just the first word
          // Use a smaller limit for first-word fallback to improve performance
          // First-word queries can be very broad (e.g., "mermaid" matches many games)
          const fallbackPrefix = firstWord;
          const fallbackUpperBound = firstWord + '\uf8ff';
          const fallbackQueryRef = gamesRef
            .where('nameLower', '>=', fallbackPrefix)
            .where('nameLower', '<=', fallbackUpperBound)
            .orderBy('nameLower')
            .limit(100); // Reduced from 200 to 100 for better performance on broad queries
          
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
              const fallbackResults = processSearchResults(fallbackSnapshot, originalSearchTerm, limit);
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
        
        // If we got results (even if only reverseContains), return them
        // Otherwise continue to next variant
        if (results.length > 0) {
          return results;
        }
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
            .limit(100); // Reduced from 200 to 100 for better performance on broad queries
          
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
        
        // No results found for this variant - continue to next variant
        if (variantIndex < searchVariants.length - 1) {
          continue; // Try next variant
        }
        
        // This was the last variant - return empty
        if (logger) {
          logger.warn(`[Firebase] No results found for "${originalSearchTerm}" after trying all variants`, {
            searchTerm: originalSearchTerm,
            variants: searchVariants,
          });
        }
        if (__DEV__) {
          console.log('[Game Database] Indexed query returned empty - game not found in database');
          console.log('[Game Database] Returning empty array');
        }
        return [];
      }
    } catch (indexError) {
        // Error for this variant - continue to next variant unless it's the last one
        if (variantIndex < searchVariants.length - 1) {
          if (__DEV__) {
            console.warn(`[Game Database] Error with variant "${searchTerm}", trying next variant:`, indexError.message);
          }
          continue;
        }
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
            const results = processSearchResults(snapshot, originalSearchTerm, limit);
            if (__DEV__) {
              console.log('[Game Database] Processed', results.length, 'results from fallback query');
              if (results.length > 0) {
                console.log('[Game Database] Fallback games found:', results.map(r => r.name).join(', '));
                console.log('[Game Database] Top 10 fallback game titles:', results.slice(0, 10).map(r => `"${r.name}" (rank: ${r.rank || 'N/A'}, match: ${r.matchType || 'unknown'})`));
              }
            }
            if (results.length > 0) {
              return results;
            }
          }
          
          // Fallback also failed - continue to next variant unless it's the last one
          if (variantIndex < searchVariants.length - 1) {
            continue;
          }
        } catch (fallbackError) {
          if (__DEV__) {
            console.error('[Game Database] Fallback query also failed:', fallbackError.message);
            console.error('[Game Database] Fallback error details:', fallbackError);
          }
          // Continue to next variant unless it's the last one
          if (variantIndex < searchVariants.length - 1) {
            continue;
          }
          // Last variant failed - return empty
          return [];
        }
      }
    } // End of variant loop
    
    // If we get here, all variants were tried but none returned results
    if (__DEV__) {
      console.log('[Game Database] All search variants exhausted, returning empty array');
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
 * Now handles reverse matching: when game name is contained in search term (e.g., "Feudum: Alter Ego" matches "Feudum: Alter Ego - Forest")
 */
function processSearchResults(snapshot, searchTerm, limit) {
  const exactMatches = [];
  const startsWithMatches = [];
  const containsMatches = [];
  const reverseContainsMatches = []; // When game name is contained in search term (handles extra suffixes)
  const fuzzyMatches = []; // For typo-tolerant matches
  const nonMatches = []; // Store non-matching docs for potential fuzzy matching later
  
  // Helper to normalize strings for comparison
  const normalize = (str) => str.trim().toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizeNoSpaces = (str) => str.trim().toLowerCase().replace(/\s+/g, '');
  
  // First pass: collect exact, startsWith, contains, and reverse contains matches
  snapshot.forEach((doc) => {
    const game = doc.data();
    const gameNameLower = game.nameLower || game.name?.toLowerCase() || '';
    
    // Normalize both strings for comparison
    const normalizedSearch = normalizeNoSpaces(searchTerm);
    const normalizedGame = normalizeNoSpaces(gameNameLower);
    
    // Also keep version with spaces for exact matching
    const searchWithSpaces = normalize(searchTerm);
    const gameWithSpaces = normalize(gameNameLower);
    
    // 1. Exact matches (highest priority)
    if (gameWithSpaces === searchWithSpaces) {
      exactMatches.push({ doc, game, similarity: 1.0, matchType: 'exact' });
      return; // Skip other checks for exact matches
    } else if (normalizedGame === normalizedSearch) {
      // Exact match when spaces are removed (e.g., "smallworld" = "small world")
      exactMatches.push({ doc, game, similarity: 0.98, matchType: 'exact' });
      return;
    }
    
    // 2. Starts with matches
    if (gameWithSpaces.startsWith(searchWithSpaces)) {
      startsWithMatches.push({ doc, game, similarity: 1.0, matchType: 'startsWith' });
      return;
    } else if (normalizedGame.startsWith(normalizedSearch)) {
      startsWithMatches.push({ doc, game, similarity: 0.98, matchType: 'startsWith' });
      return;
    }
    
    // 3. Contains matches (search term is in game name)
    if (gameWithSpaces.includes(searchWithSpaces)) {
      containsMatches.push({ doc, game, similarity: 1.0, matchType: 'contains' });
      return;
    } else if (normalizedGame.includes(normalizedSearch)) {
      containsMatches.push({ doc, game, similarity: 0.95, matchType: 'contains' });
      return;
    }
    
    // 4. REVERSE contains matches (game name is in search term) - NEW!
    // This handles cases like: search="Feudum: Alter Ego - Forest", game="Feudum: Alter Ego"
    // Only check if game name is substantial (at least 4 chars) to avoid false positives
    if (gameWithSpaces.length >= 4 && searchWithSpaces.includes(gameWithSpaces)) {
      // Calculate similarity based on how much of the game name matches
      const matchRatio = gameWithSpaces.length / searchWithSpaces.length;
      const similarity = Math.max(0.85, matchRatio); // Higher similarity for closer matches
      reverseContainsMatches.push({ doc, game, similarity, matchType: 'reverseContains' });
      return;
    } else if (normalizedGame.length >= 4 && normalizedSearch.includes(normalizedGame)) {
      const matchRatio = normalizedGame.length / normalizedSearch.length;
      const similarity = Math.max(0.80, matchRatio);
      reverseContainsMatches.push({ doc, game, similarity, matchType: 'reverseContains' });
      return;
    }
    
    // 5. Store for potential fuzzy matching
    if (normalizedSearch.length >= 4 && normalizedGame.length >= 4) {
      nonMatches.push({ doc, game, gameNameLower: normalizedGame });
    } else {
      nonMatches.push({ doc, game, gameNameLower: normalizedGame });
    }
  });
  
  // Count how many good matches we have (including reverse contains)
  const goodMatchesCount = exactMatches.length + startsWithMatches.length + containsMatches.length + reverseContainsMatches.length;
  
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
  
  // Combine results in priority order: exact > startsWith > contains > reverseContains > fuzzy
  const allMatches = [...exactMatches, ...startsWithMatches, ...containsMatches, ...reverseContainsMatches, ...fuzzyMatches];
  
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
    // Priority: exact > startsWith > contains > reverseContains > fuzzy
    const aType = a.matchType || 'fuzzy';
    const bType = b.matchType || 'fuzzy';
    const typePriority = { 
      exact: 0, 
      startsWith: 1, 
      contains: 2, 
      reverseContains: 3,  // New: handles cases where game name is in search term
      fuzzy: 4 
    };
    const aPriority = typePriority[aType] ?? 4;
    const bPriority = typePriority[bType] ?? 4;
    
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
export async function getGamesFromFirebase(gameId) {
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
      thumbnail: game.thumbnail || null,
      image: game.image || null,
      minPlayers: game.minPlayers || null,
      maxPlayers: game.maxPlayers || null,
      playingTime: game.playingTime || null,
      minAge: game.minAge || null,
      description: game.description || null,
      abstractsRank: game.abstractsRank || '',
      cgsRank: game.cgsRank || '',
      childrensGamesRank: game.childrensGamesRank || '',
      familyGamesRank: game.familyGamesRank || '',
      partyGamesRank: game.partyGamesRank || '',
      strategyGamesRank: game.strategyGamesRank || '',
      thematicRank: game.thematicRank || '',
      wargamesRank: game.wargamesRank || '',
      // BGG data fields for recommendations
      mechanics: game.mechanics || null,
      categories: game.categories || null,
      publishers: game.publishers || null,
      publisher: game.publisher || null,
      averageWeight: game.averageWeight || null,
      complexity: game.complexity || null,
    };
  } catch (error) {
    console.error('[Game Database] Firestore getById error:', error);
    return null;
  }
}

/**
 * Batch fetch multiple games from Firestore games collection by BGG IDs
 * @param {Array<string|number>} gameIds - Array of BGG game IDs
 * @returns {Promise<Map<string, Object>>} Map of gameId -> game object (only includes found games)
 */
export async function batchGetGamesById(gameIds) {
  if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
    return new Map();
  }

  if (!db) {
    if (__DEV__) {
      console.warn('[Game Database] Firestore db not initialized, cannot batch fetch games');
    }
    return new Map();
  }

  try {
    const gamesRef = db.collection(GAMES_COLLECTION);
    const gameMap = new Map();
    
    // Firestore compat API: Use Promise.all with individual gets
    // Process in smaller batches to avoid overwhelming Firestore
    const BATCH_SIZE = 20;
    
    for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
      const batch = gameIds.slice(i, i + BATCH_SIZE);
      
      try {
        // Use Promise.all to fetch all games in batch concurrently
        const docPromises = batch.map(async (gameId) => {
          try {
            const docRef = gamesRef.doc(gameId.toString());
            const doc = await docRef.get();
            return doc;
          } catch (err) {
            console.warn(`[Game Database] Error fetching game ${gameId}:`, err);
            return null;
          }
        });
        
        const docs = await Promise.all(docPromises);
        let fetchedCount = 0;
        
        docs.forEach(doc => {
          if (doc && doc.exists) {
            const game = doc.data();
            const gameId = game.id || doc.id;
            
            gameMap.set(gameId.toString(), {
              id: gameId,
              name: game.name,
              yearPublished: game.yearPublished || '',
              rank: game.rank || '0',
              average: game.average || '',
              bayesAverage: game.bayesAverage || '',
              usersRated: game.usersRated || '',
              thumbnail: game.thumbnail || null,
              image: game.image || null,
              minPlayers: game.minPlayers || null,
              maxPlayers: game.maxPlayers || null,
              playingTime: game.playingTime || null,
              minAge: game.minAge || null,
              description: game.description || null,
              abstractsRank: game.abstractsRank || '',
              cgsRank: game.cgsRank || '',
              childrensGamesRank: game.childrensGamesRank || '',
              familyGamesRank: game.familyGamesRank || '',
              partyGamesRank: game.partyGamesRank || '',
              strategyGamesRank: game.strategyGamesRank || '',
              thematicRank: game.thematicRank || '',
              wargamesRank: game.wargamesRank || '',
              // BGG data fields for recommendations
              mechanics: game.mechanics || null,
              categories: game.categories || null,
              publishers: game.publishers || null,
              publisher: game.publisher || null,
              averageWeight: game.averageWeight || null,
              complexity: game.complexity || null,
            });
            fetchedCount++;
          }
        });
        
        // Reduced logging - only log every 5th batch or final batch
        if (__DEV__ && (Math.floor(i / BATCH_SIZE) + 1) % 5 === 0 || i + BATCH_SIZE >= gameIds.length) {
          console.log(`[Game Database] Batch fetched ${fetchedCount}/${batch.length} games (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
        }
      } catch (batchError) {
        console.error(`[Game Database] Error in batch fetch (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, batchError);
        // Continue with next batch even if one fails
      }
    }
    
    // Reduced logging - only log summary if incomplete or in dev mode with significant batch
    if (__DEV__ && (gameMap.size < gameIds.length * 0.9 || gameIds.length > 50)) {
      console.log(`[Game Database] Batch fetch complete: ${gameMap.size}/${gameIds.length} games found`);
    }
    
    return gameMap;
  } catch (error) {
    console.error('[Game Database] Error in batchGetGamesById:', error);
    return new Map();
  }
}

/**
 * Check if a game is missing all critical fields needed for recommendations
 * Critical fields: mechanics, categories, publisher/publishers, complexity/averageWeight
 */
function isGameMissingAllCriticalFields(bggData) {
  const hasPublisher = !!(bggData.publisher || 
    (Array.isArray(bggData.publishers) && bggData.publishers.length > 0));
  const hasMechanics = !!(bggData.mechanics && 
    Array.isArray(bggData.mechanics) && bggData.mechanics.length > 0);
  const hasCategories = !!(bggData.categories && 
    Array.isArray(bggData.categories) && bggData.categories.length > 0);
  const hasComplexity = !!(bggData.complexity || bggData.averageWeight);
  
  // Missing all critical fields
  return !hasPublisher && !hasMechanics && !hasCategories && !hasComplexity;
}

/**
 * Update game document in Firestore with BGG API data
 * This caches BGG data (thumbnails, images, descriptions, etc.) to reduce API calls
 * Games missing all critical fields (mechanics, categories, publisher, complexity) are marked
 * as displayOnly: true - these can be displayed but cannot be favorited or used for recommendations
 * @param {string} gameId - BGG game ID
 * @param {Object} bggData - Game data from BGG API
 * @returns {Promise<boolean>} True if update was successful
 */
export async function updateGameWithBGGData(gameId, bggData) {
  if (!gameId || !bggData) {
    return false;
  }
  
  // Check if game is missing all critical fields
  const isDisplayOnly = isGameMissingAllCriticalFields(bggData);

  try {
    const gamesRef = db.collection(GAMES_COLLECTION);
    const docRef = gamesRef.doc(gameId.toString());
    
    // Check if document exists first
    const doc = await docRef.get();
    
    if (!doc.exists) {
      if (__DEV__) {
        console.log('[Game Database] Game not in Firestore, creating new document:', gameId);
      }
      // Create new document with ALL BGG data
      // Save the entire BGG "Thing" object, preserving all fields even if not currently used
      const gameDocument = {
        // Spread all fields from bggData first to preserve everything
        ...bggData,
        // Ensure required fields are set (may override if bggData has them)
        id: gameId.toString(),
        name: bggData.name || '',
        nameLower: (bggData.name || '').toLowerCase(),
        // Ensure publisher field is set (extract from publishers array if needed)
        publisher: bggData.publisher || (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : null),
        // Ensure averageWeight is set (alias for complexity)
        averageWeight: bggData.averageWeight || bggData.complexity || null,
        // Add metadata fields
        bggDataCached: true,
        bggDataCachedAt: firebase.firestore.Timestamp.now(),
        displayOnly: isDisplayOnly,
      };
      
      await docRef.set(gameDocument);
    } else {
      // Update existing document with ALL BGG data
      // Merge all fields from bggData into the existing document
      const existingData = doc.data();
      const updateData = {};
      
      // Update ALL fields from bggData (preserve all BGG "Thing" data)
      // This ensures we save all fields, even ones we're not currently using
      Object.keys(bggData).forEach(key => {
        // Always update with new BGG data (fields may change over time)
        if (bggData[key] !== undefined && bggData[key] !== null) {
          updateData[key] = bggData[key];
        }
      });
      
      // Ensure required metadata fields are set
      updateData.nameLower = (bggData.name || existingData.name || '').toLowerCase();
      updateData.publisher = bggData.publisher || (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers[0] : existingData.publisher || null);
      updateData.averageWeight = bggData.averageWeight || bggData.complexity || existingData.averageWeight || null;
      updateData.bggDataCached = true;
      updateData.bggDataCachedAt = firebase.firestore.Timestamp.now();
      updateData.displayOnly = isDisplayOnly;
      
      // Preserve existing fields that might not be in bggData (like nameLower if name didn't change)
      if (existingData.nameLower && !updateData.nameLower) {
        updateData.nameLower = existingData.nameLower;
      }
      
      if (Object.keys(updateData).length > 0) {
        if (__DEV__) {
          console.log('[Game Database] Updating game with ALL BGG data:', gameId, Object.keys(updateData).length, 'fields');
        }
        await docRef.update(updateData);
      } else {
        if (__DEV__) {
          console.log('[Game Database] No updates needed for game:', gameId);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[Game Database] Error updating game with BGG data:', error);
    return false;
  }
}

/**
 * Save BGG API search results to Firestore - DO NOT SAVE INCOMPLETE RECORDS
 * 
 * IMPORTANT: This function does NOT save incomplete records to Firestore.
 * Search results only contain basic info (id, name, yearPublished) from the /search endpoint.
 * We should NEVER save incomplete records to Firebase.
 * 
 * Full "Thing" data must be fetched using getGamesFromGeek() before saving to Firestore.
 * This ensures Firebase always has complete game records with all BGG data.
 * 
 * @param {Array} searchResults - Array of game search results from BGG API (basic info only)
 * @returns {Promise<number>} Always returns 0 - we don't save incomplete records
 */
export async function cacheBGGSearchResults(searchResults) {
  // DO NOT save incomplete records to Firestore
  // Search results only have id, name, yearPublished - not full "Thing" data
  // Games should only be saved to Firestore after fetching complete data via getGamesFromGeek()
  if (__DEV__) {
    console.log(`[Game Database] Skipping cache of ${searchResults?.length || 0} search results - incomplete data. Full "Thing" data will be fetched and cached when games are selected.`);
  }
  return 0;
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

