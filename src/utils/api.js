import axios from 'axios';
import { API_CONFIG } from '../config/api';
import { ensureSerializableId, ensureStringOrNull } from './helpers';

// ============================================================================
// ARCHIVED: Barcode Scanning Feature
// The barcode scanning functionality has been archived to src/archive/barcode-scanner/
// These functions are preserved but not actively used.
// ============================================================================

// RapidAPI Barcode Lookup configuration (ARCHIVED - kept for deprecated functions)
const RAPIDAPI_BARCODE_BASE = 'https://barcodes-lookup.p.rapidapi.com';

// GameUPC API configuration (ARCHIVED - kept for deprecated functions)
const GAMEUPC_BASE = 'https://api.gameupc.com/test';

/**
 * Clean the scanner title by removing common board game terms
 * This helps when searching BoardGameGeek API
 * @param {string} title - The title from the barcode scanner
 * @returns {string} - Cleaned title without "Board Game", "Board", "Game" words
 * @deprecated This function is part of the archived barcode scanning feature
 */
export const cleanScannerTitle = (title) => {
  if (!title) return '';
  return title.replace(/\b(Board Game|Board|Game)\b/gi, '').trim();
};

/**
 * Process and score BGG search results with improved matching
 * Handles reverse matching (when game name is contained in search term)
 * @param {Array} results - Raw BGG API search results
 * @param {string} originalQuery - Original search query (for scoring)
 * @returns {Array} Processed and scored results, sorted by match quality
 */
function processBGGSearchResults(results, originalQuery) {
  if (!results || results.length === 0) {
    return [];
  }
  
  const normalize = (str) => str.trim().toLowerCase();
  const normalizedQuery = normalize(originalQuery);
  
  // Score and categorize each result
  const scoredResults = results.map(result => {
    const resultName = result.name || '';
    const normalizedResultName = normalize(resultName);
    let score = 0;
    let matchType = 'none';
    
    // 1. Exact match (highest priority)
    if (normalizedResultName === normalizedQuery) {
      score += 1000;
      matchType = 'exact';
    }
    // 2. Starts with match
    else if (normalizedResultName.startsWith(normalizedQuery)) {
      score += 500;
      matchType = 'startsWith';
    }
    // 3. Contains match (search term is in game name)
    else if (normalizedResultName.includes(normalizedQuery)) {
      score += 100;
      matchType = 'contains';
    }
    // 4. REVERSE contains match (game name is in search term) - NEW!
    // This handles cases like: search="Feudum: Alter Ego - Forest", game="Feudum: Alter Ego"
    else if (normalizedResultName.length >= 4 && normalizedQuery.includes(normalizedResultName)) {
      // Calculate similarity based on how much of the game name matches
      const matchRatio = normalizedResultName.length / normalizedQuery.length;
      score += Math.max(80, Math.floor(100 * matchRatio)); // 80-100 points based on match ratio
      matchType = 'reverseContains';
    }
    
    // Prefer boardgames over expansions
    if (result.type === 'boardgame') {
      score += 50;
    }
    
    // Prefer games with better (lower) rank
    if (result.rank && result.rank > 0) {
      score += Math.max(0, 10000 - result.rank);
    }
    
    // Prefer games with thumbnails
    if (result.thumbnail) {
      score += 10;
    }
    
    return { ...result, _matchScore: score, _matchType: matchType };
  });
  
  // Sort by match type priority first, then by score
  const typePriority = { 
    exact: 0, 
    startsWith: 1, 
    contains: 2, 
    reverseContains: 3,  // New: handles cases where game name is in search term
    none: 4 
  };
  
  scoredResults.sort((a, b) => {
    const aPriority = typePriority[a._matchType] ?? 4;
    const bPriority = typePriority[b._matchType] ?? 4;
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Within same type, sort by score (higher is better)
    if (b._matchScore !== a._matchScore) {
      return b._matchScore - a._matchScore;
    }
    
    // Tie-breaker: sort by name
    return (a.name || '').localeCompare(b.name || '');
  });
  
  // Remove temporary scoring fields
  return scoredResults.map(({ _matchScore, _matchType, ...clean }) => clean);
}

/**
 * Search for a game by barcode/UPC using RapidAPI and then search BGG
 * @param {string} barcode - The UPC/EAN barcode number
 * @param {boolean} searchBGG - Whether to automatically search BGG after barcode lookup
 * @returns {Promise<Object>} Combined product information from barcode and BGG
 * @deprecated ARCHIVED - This function is part of the archived barcode scanning feature
 * See src/archive/barcode-scanner/barcodeApi.js for the archived implementation
 */
export const searchGameByBarcodeWithBGG = async (barcode, searchBGG = true) => {
  try {
    // First, get product info from barcode
    const barcodeResult = await searchGameByBarcode(barcode);
    
    // If GameUPC already returned verified BGG info, use it
    if (barcodeResult.source === 'gameupc' && barcodeResult.bggInfoStatus === 'verified' && barcodeResult.bggId) {
      try {
        const bggDetails = await getGames(barcodeResult.bggId);
        return {
          ...barcodeResult,
          bggMatch: true,
          bggName: barcodeResult.bggName,
          bggDetails: bggDetails,
        };
      } catch (bggError) {
        if (__DEV__) {
          console.warn('Failed to get BGG details for GameUPC verified game:', bggError);
        }
        // Return what we have from GameUPC
        return {
          ...barcodeResult,
          bggMatch: true,
        };
      }
    }
    
    // If GameUPC returned "choose from options", don't search BGG automatically
    if (barcodeResult.bggInfoStatus === 'choose_from_bgg_info_or_search') {
      return barcodeResult;
    }
    
    if (!searchBGG || !barcodeResult.cleanedTitle) {
      return barcodeResult;
    }

    // Then search BGG with cleaned title
    try {
      const searchResponse = await searchGamesByName(barcodeResult.cleanedTitle);
      const bggResults = (searchResponse && typeof searchResponse === 'object' && 'results' in searchResponse) 
        ? searchResponse.results 
        : (searchResponse || []);
      
      if (bggResults && bggResults.length > 0) {
        // Get detailed info for the first (most relevant) result
        const topResult = bggResults[0];
        const bggDetails = await getGames(topResult.id);
        
        return {
          ...barcodeResult,
          bggMatch: true,
          bggId: topResult.id,
          bggName: topResult.name,
          bggYear: topResult.yearPublished,
          bggDetails: bggDetails,
          bggSearchResults: bggResults, // Keep all results in case user wants to pick a different one
        };
      } else {
        return {
          ...barcodeResult,
          bggMatch: false,
          bggSearchQuery: barcodeResult.cleanedTitle,
        };
      }
    } catch (bggError) {
      if (__DEV__) {
        console.warn('BGG search failed, returning barcode result only:', bggError);
      }
      return {
        ...barcodeResult,
        bggMatch: false,
        bggError: bggError.message,
      };
    }
  } catch (error) {
    throw error;
  }
};

/**
 * Search for a game by barcode/UPC using GameUPC API
 * @param {string} barcode - The UPC/EAN barcode number
 * @param {string} searchTerms - Optional search terms for additional search
 * @returns {Promise<Object>} Game information from GameUPC
 * @deprecated ARCHIVED - This function is part of the archived barcode scanning feature
 * See src/archive/barcode-scanner/barcodeApi.js for the archived implementation
 */
export const searchGameUPC = async (barcode, searchTerms = null) => {
  try {
    const cleanBarcode = barcode.trim().replace(/[\s-]/g, '');
    const url = searchTerms 
      ? `${GAMEUPC_BASE}/upc/${cleanBarcode}?search=${encodeURIComponent(searchTerms)}`
      : `${GAMEUPC_BASE}/upc/${cleanBarcode}`;

    const response = await axios.get(url);

    if (process.env.NODE_ENV === 'development') {
      if (__DEV__) {
        console.log('GameUPC API Response:', response.data);
      }
    }

    if (response.data.status === 'error') {
      throw new Error(response.data.message || 'GameUPC API error');
    }

    if (response.data.status !== 'ok') {
      throw new Error('Invalid response from GameUPC API');
    }

    return {
      barcode: cleanBarcode,
      name: response.data.name,
      searchedFor: response.data.searched_for,
      bggInfoStatus: response.data.bgg_info_status,
      bggInfo: response.data.bgg_info || [],
      rawData: response.data,
    };
  } catch (error) {
    console.error('Error searching GameUPC:', error);
    throw error;
  }
};

/**
 * Update GameUPC with user's BGG selection
 * @param {string} barcode - The UPC/EAN barcode number
 * @param {number} bggId - The BGG ID selected by the user
 * @param {string} userId - Unique user identifier (at least 8 characters)
 * @returns {Promise<Object>} Update result
 * @deprecated ARCHIVED - This function is part of the archived barcode scanning feature
 * See src/archive/barcode-scanner/barcodeApi.js for the archived implementation
 */
export const updateGameUPCSelection = async (barcode, bggId, userId) => {
  try {
    const cleanBarcode = barcode.trim().replace(/[\s-]/g, '');
    const updateUrl = `${GAMEUPC_BASE}/upc/${cleanBarcode}/bgg_id/${bggId}`;
    
    const response = await axios.post(updateUrl, {
      user_id: userId || `user_${Date.now()}`,
    });

    return response.data;
  } catch (error) {
    console.error('Error updating GameUPC selection:', error);
    throw error;
  }
};

/**
 * Search for a game by barcode/UPC using RapidAPI, with GameUPC as fallback
 * @param {string} barcode - The UPC/EAN barcode number
 * @returns {Promise<Object>} Product information from the barcode lookup
 * @deprecated ARCHIVED - This function is part of the archived barcode scanning feature
 * See src/archive/barcode-scanner/barcodeApi.js for the archived implementation
 */
export const searchGameByBarcode = async (barcode) => {
  if (!barcode || !barcode.trim()) {
    throw new Error('Barcode is required');
  }

  const cleanBarcode = barcode.trim().replace(/[\s-]/g, '');
  let primaryResult = null;
  let primaryError = null;

  // ARCHIVED: Barcode scanning feature is archived
  // Try primary barcode lookup API first
  try {
    const response = await axios.get(`${RAPIDAPI_BARCODE_BASE}/`, {
      params: {
        query: cleanBarcode,
      },
      headers: {
        'X-RapidAPI-Key': API_CONFIG.RAPIDAPI_KEY,
        'X-RapidAPI-Host': API_CONFIG.RAPIDAPI_HOST,
      },
    });

    if (process.env.NODE_ENV === 'development') {
      if (__DEV__) {
        console.log('Primary Barcode API Response:', response.data);
      }
    }

    const data = response.data;
    let product = null;

    // Handle various response structures from RapidAPI
    if (data.products && Array.isArray(data.products) && data.products.length > 0) {
      product = data.products[0];
    } else if (data.product) {
      product = data.product;
    } else if (data.title || data.product_name) {
      product = data;
    } else if (data.data) {
      product = data.data;
    }

    if (product) {
      // Extract product information with fallbacks
      const rawTitle = product.title || product.product_name || product.name || 'Unknown Product';
      primaryResult = {
        barcode: cleanBarcode,
        title: rawTitle,
        cleanedTitle: cleanScannerTitle(rawTitle),
        description: product.description || product.desc || '',
        brand: product.brand || product.manufacturer || '',
        category: product.category || product.category_name || '',
        image: null,
        source: 'rapidapi',
        rawData: product,
      };

      // Handle images
      if (product.image) {
        primaryResult.image = product.image;
      } else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
        primaryResult.image = product.images[0];
      } else if (product.images && typeof product.images === 'string') {
        primaryResult.image = product.images;
      } else if (product.image_url) {
        primaryResult.image = product.image_url;
      } else if (product.thumbnail) {
        primaryResult.image = product.thumbnail;
      }
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('Primary barcode lookup failed, trying GameUPC fallback:', error);
    }
    primaryError = error;
  }

  // If primary lookup succeeded, return it
  if (primaryResult) {
    return primaryResult;
  }

  // ARCHIVED: GameUPC fallback is part of archived barcode scanning
  // Otherwise, try GameUPC as fallback
  try {
    // Note: searchGameUPC is also archived - this will fail if called
    const gameUPCResult = await searchGameUPC(cleanBarcode);
    
    // Handle GameUPC response
    if (gameUPCResult.bggInfoStatus === 'verified' && gameUPCResult.bggInfo.length > 0) {
      // We have a verified BGG match
      const bggInfo = gameUPCResult.bggInfo[0];
      return {
        barcode: cleanBarcode,
        title: gameUPCResult.name,
        cleanedTitle: cleanScannerTitle(gameUPCResult.name),
        description: '',
        brand: '',
        category: '',
        image: bggInfo.image_url || bggInfo.thumbnail_url || null,
        source: 'gameupc',
        bggId: bggInfo.id,
        bggName: bggInfo.name,
        bggThumbnail: bggInfo.thumbnail_url,
        bggImage: bggInfo.image_url,
        bggDataUrl: bggInfo.data_url,
        bggPageUrl: bggInfo.page_url,
        bggInfoStatus: 'verified',
        bggInfo: [bggInfo],
        rawData: gameUPCResult.rawData,
      };
    } else if (gameUPCResult.bggInfoStatus === 'choose_from_bgg_info_or_search') {
      // Need user to choose from options
      return {
        barcode: cleanBarcode,
        title: gameUPCResult.name,
        cleanedTitle: cleanScannerTitle(gameUPCResult.name),
        description: '',
        brand: '',
        category: '',
        image: null,
        source: 'gameupc',
        bggInfoStatus: 'choose_from_bgg_info_or_search',
        bggInfo: gameUPCResult.bggInfo,
        searchedFor: gameUPCResult.searchedFor,
        rawData: gameUPCResult.rawData,
      };
    } else {
      // GameUPC found the product but no BGG info
      return {
        barcode: cleanBarcode,
        title: gameUPCResult.name,
        cleanedTitle: cleanScannerTitle(gameUPCResult.name),
        description: '',
        brand: '',
        category: '',
        image: null,
        source: 'gameupc',
        bggInfoStatus: gameUPCResult.bggInfoStatus,
        rawData: gameUPCResult.rawData,
      };
    }
  } catch (gameUPCError) {
    console.error('GameUPC fallback also failed:', gameUPCError);
    
    // If both failed, throw the original error
    if (primaryError) {
      if (primaryError.response) {
        if (primaryError.response.status === 404) {
          throw new Error('Product not found in any database. Please check the barcode and try again.');
        } else if (primaryError.response.status === 429) {
          throw new Error('Too many requests. Please try again later.');
        } else if (primaryError.response.status === 401 || primaryError.response.status === 403) {
          throw new Error('API authentication failed. Please check API key configuration.');
        }
      }
      throw primaryError;
    }
    
    throw new Error('Failed to lookup barcode. Please try again.');
  }
};

/**
 * Search for games by name
 * Priority: Firebase Firestore -> BGG API (if fallbackToBGG is true)
 * @param {string} query - Game name to search for
 * @param {boolean} fallbackToBGG - If true, fall back to BGG API when Firestore returns no results
 * @returns {Promise<Array>} Array of matching games
 */
export const searchGamesByName = async (query, fallbackToBGG = false) => {
  // Track try counts
  let firebaseTries = 0;
  let bggTries = 0;
  
  try {
    if (__DEV__) {
      console.log('[Game Search] Searching for:', query);
    }

    // Try Firebase Firestore first (if available)
    let firestoreFailed = false;
    let firestoreResults = null;
    try {
      firebaseTries = 1; // Count Firebase attempt
      const { searchGamesByName: searchFirestore } = await import('../services/gameDatabase');
      
      // gameDatabase has its own 7s timeout, so we don't need a wrapper timeout here
      // This gives Firestore more time for legitimate slow queries while still timing out if broken
      firestoreResults = await searchFirestore(query, 50);
      
      if (firestoreResults && firestoreResults.length > 0) {
        if (__DEV__) {
          console.log('[Firestore] Query completed, results:', firestoreResults.length);
          console.log(`[Firestore] Found ${firestoreResults.length} games`);
        }
        // Format response
        const formatted = firestoreResults.map(game => ({
          id: game.id,
          name: game.name,
          yearPublished: game.yearPublished || '',
        }));
        if (__DEV__) {
          console.log('[Firestore] Returning formatted results:', formatted.length);
        }
        // Return results with try counts
        return { results: formatted, firebaseTries, bggTries };
      } else {
        // Firestore returned empty array or null - mark as failed to trigger BGG fallback
        firestoreFailed = true;
        if (__DEV__) {
          console.log('[Firestore] No results found');
        }
      }
    } catch (firestoreError) {
      // Firestore error or timeout - mark as failed and fall through to BGG if fallback enabled
      firestoreFailed = true;
      
      // Log Firebase failure with logger
      try {
        const logger = (await import('./inAppLogger')).default;
        logger.warn(`[searchGamesByName] ❌ Firebase failed/timed out`, {
          query,
          error: firestoreError.message,
          willFallbackToBGG: fallbackToBGG,
          firebaseTries: 1,
        });
      } catch (loggerError) {
        // Logger not available, continue
      }
      
      if (__DEV__) {
        console.warn(`[Game Search] Firestore search error for "${query}":`, firestoreError.message);
        console.log('[Firestore] Not available or error, trying BGG API:', firestoreError.message);
      }
      // Don't throw - fall through to BGG API if fallback is enabled
    }

    // No results found in Firestore OR Firestore failed/timed out - try BGG API if fallback is enabled
    // Note: For search, we'll allow BGG API calls since we don't know the publication year yet
    // The filtering will happen when we fetch individual game details
    if (fallbackToBGG && (firestoreFailed || !firestoreResults || firestoreResults.length === 0)) {
      // Log BGG fallback attempt
      try {
        const logger = (await import('./inAppLogger')).default;
        logger.info(`[searchGamesByName] 🔄 Attempting BGG API fallback`, {
          query,
          firestoreFailed,
          firestoreResultsCount: firestoreResults?.length || 0,
          reason: firestoreFailed ? 'firebase_error' : 'no_results',
        });
      } catch (loggerError) {
        // Logger not available, continue
      }
      
      if (__DEV__) {
        console.log('[Game Search] Firestore failed or returned no results, trying BGG API...');
      }
      
      // Retry BGG search with exponential backoff if rate limited
      // Keep trying until we get results - don't give up on rate-limited errors
      // Exponential backoff prevents overwhelming the API - delays get progressively longer
      const maxBggRetries = 30; // Increased retries - keep trying for rate-limited errors
      let bggRetryCount = 0;
      let bggResults = null;
      let lastError = null;
      const searchStartTime = Date.now();
      
      if (__DEV__) {
        console.log(`[Game Search → BGG API] ⏱️ Starting search for "${query}"`, {
          timestamp: new Date().toISOString(),
        });
      }
      
      while (bggRetryCount <= maxBggRetries) {
        try {
          if (bggRetryCount > 0) {
            // Exponential backoff: 10s, 20s, 40s, 80s, 160s, 320s, 640s (10.7 min), 1280s (21.3 min)
            // Cap at 80 seconds to avoid extremely long waits
            const backoffMs = Math.min(10000 * Math.pow(2, Math.min(bggRetryCount - 1, 4)), 80000);
            const elapsed = ((Date.now() - searchStartTime) / 1000).toFixed(1);
            if (__DEV__) {
              console.log(`[Game Search → BGG API] 🔄 Retry ${bggRetryCount}/${maxBggRetries} for "${query}" after ${backoffMs}ms delay...`, {
                elapsedSeconds: elapsed,
              });
            }
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          } else {
            if (__DEV__) {
              console.log(`[Game Search → BGG API] 📡 Sending search query to BGG: "${query}"`);
            }
          }
          
          // Generate search variants for progressive suffix removal
          const generateSearchVariants = (term) => {
            const variants = [term]; // Always try original first
            
            // Remove common suffixes/patterns
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
            const suffixWords = ['forest', 'expansion', 'edition', 'promo', 'promotional', 'card', 'cards', 'arrows'];
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
          
          const searchVariants = generateSearchVariants(query);
          let bggResults = [];
          let attemptDuration = '0.00'; // Initialize outside loop
          
          // Try each variant in order
          for (let variantIndex = 0; variantIndex < searchVariants.length; variantIndex++) {
            const searchVariant = searchVariants[variantIndex];
            const isFirstVariant = variantIndex === 0;
            
            if (__DEV__ && !isFirstVariant) {
              console.log(`[Game Search → BGG API] Trying variant ${variantIndex + 1}/${searchVariants.length}: "${searchVariant}"`);
            }
            
            const attemptStartTime = Date.now();
            const { searchBGGAPI } = await import('../services/bggApi');
            
            // Log BGG API call attempt
            try {
              const logger = (await import('./inAppLogger')).default;
              logger.debug(`[searchGamesByName] 📡 Calling BGG API`, {
                query,
                variant: searchVariant,
                variantIndex: variantIndex + 1,
                totalVariants: searchVariants.length,
                retryCount: bggRetryCount,
              });
            } catch (loggerError) {
              // Logger not available, continue
            }
            
            const variantResults = await searchBGGAPI(searchVariant, 50, 3); // 3 retries per attempt
            attemptDuration = ((Date.now() - attemptStartTime) / 1000).toFixed(2);
            
            if (variantResults && variantResults.length > 0) {
              // Log BGG API success
              try {
                const logger = (await import('./inAppLogger')).default;
                logger.info(`[searchGamesByName] ✅ BGG API SUCCESS`, {
                  query,
                  variant: searchVariant,
                  resultCount: variantResults.length,
                  durationSeconds: attemptDuration,
                });
              } catch (loggerError) {
                // Logger not available, continue
              }
              // Process and score results with improved matching
              const processedResults = processBGGSearchResults(variantResults, query);
              
              if (processedResults.length > 0) {
                bggResults = processedResults;
                const totalDuration = ((Date.now() - searchStartTime) / 1000).toFixed(2);
                if (__DEV__) {
                  console.log(`[Game Search → BGG API] ✅ BGG returned ${bggResults.length} result(s) for "${query}" (using variant "${searchVariant}")`, {
                    attemptDurationSeconds: attemptDuration,
                    totalDurationSeconds: totalDuration,
                    attempts: bggRetryCount + 1,
                    variantUsed: searchVariant,
                  });
                  console.log(`[BGG API] Found ${bggResults.length} games`);
                }
                break; // Found results, stop trying variants
              }
            }
            
            // If this was the last variant and we still have no results, use empty array
            if (variantIndex === searchVariants.length - 1 && bggResults.length === 0) {
              if (__DEV__) {
                console.log(`[Game Search → BGG API] No results found after trying all ${searchVariants.length} variants`);
              }
            }
          }
          
          if (bggResults && bggResults.length > 0) {
            // DO NOT cache incomplete search results to Firestore
            // Search results only contain basic info (id, name, yearPublished) from /search endpoint
            // We should NEVER save incomplete records to Firebase
            // Full "Thing" data will be fetched and cached when user selects a game via getGames()
            
            bggTries = bggRetryCount + 1; // Count total BGG attempts (retries + 1)
            return { results: bggResults, firebaseTries, bggTries };
          } else {
            // No results - BGG successfully returned empty array (no <item> tags in XML)
            // Note: This doesn't definitively mean the game doesn't exist - BGG API doesn't distinguish
            // between "game doesn't exist" and "search didn't find it". The caller will add to pending retries
            // so we can try again later, as BGG API often needs multiple attempts.
            const totalDuration = ((Date.now() - searchStartTime) / 1000).toFixed(2);
            bggTries = bggRetryCount + 1; // Count total BGG attempts
            if (__DEV__) {
              console.log(`[Game Search → BGG API] ✅ BGG returned no results for "${query}" (will be added to pending retries)`, {
                attemptDurationSeconds: attemptDuration,
                totalDurationSeconds: totalDuration,
              });
            }
            return { results: [], firebaseTries, bggTries };
          }
        } catch (bggError) {
          lastError = bggError;
          const attemptDuration = ((Date.now() - searchStartTime) / 1000).toFixed(2);
          const isRateLimited = bggError.message && bggError.message.includes('rate limited');
          
          // Log BGG API error
          try {
            const logger = (await import('./inAppLogger')).default;
            logger.error(`[searchGamesByName] ❌ BGG API ERROR`, {
              query,
              error: bggError.message,
              isRateLimited,
              retryCount: bggRetryCount,
              maxRetries: maxBggRetries,
              willRetry: isRateLimited && bggRetryCount < maxBggRetries,
            });
          } catch (loggerError) {
            // Logger not available, continue
          }
          
          // Check if it's a rate limit error - keep retrying
          if (isRateLimited) {
            if (bggRetryCount < maxBggRetries) {
              if (__DEV__) {
                console.warn(`[Game Search → BGG API] ⚠️ Rate limited for "${query}", will retry (attempt ${bggRetryCount + 1}/${maxBggRetries})...`, {
                  elapsedSeconds: attemptDuration,
                });
              }
              bggRetryCount++;
              continue; // Keep retrying
            } else {
              console.error(`[Game Search → BGG API] ❌ Rate limited for "${query}" after ${maxBggRetries} retries. Throwing error to allow caller to retry.`, {
                totalDurationSeconds: attemptDuration,
              });
              // Throw error so caller can handle it (TextListGameIdentifier will keep retrying)
              const rateLimitError = new Error(`BGG API rate limited for "${query}" after ${maxBggRetries} retries`);
              rateLimitError.isRateLimited = true;
              throw rateLimitError;
            }
          } else {
            // Other error - log and retry a few times, then break
            console.error(`[Game Search → BGG API] ❌ BGG search failed for "${query}":`, {
              error: bggError.message,
              elapsedSeconds: attemptDuration,
            });
            if (bggRetryCount < 3) { // Retry up to 3 times for non-rate-limit errors
              if (__DEV__) {

                console.warn(`[Game Search → BGG API] Will retry after error...`);

              }
              bggRetryCount++;
              continue;
            } else {
              if (__DEV__) {
                console.warn('[BGG API] Search failed after retries:', bggError);
              }
              break;
            }
          }
        }
      }
      
      // If we exhausted retries and still have an error, throw it so caller can handle it
      if (lastError && lastError.message && lastError.message.includes('rate limited')) {
        const totalDuration = ((Date.now() - searchStartTime) / 1000).toFixed(2);
        bggTries = bggRetryCount + 1; // Count total BGG attempts
        
        // Log final BGG failure (rate limited)
        try {
          const logger = (await import('./inAppLogger')).default;
          logger.error(`[searchGamesByName] ❌ BGG API FAILED (rate limited after all retries)`, {
            query,
            totalDurationSeconds: totalDuration,
            retries: bggRetryCount,
            maxRetries: maxBggRetries,
            firebaseTries,
            bggTries,
          });
        } catch (loggerError) {
          // Logger not available, continue
        }
        
        console.error(`[Game Search → BGG API] ❌ Exhausted all retries for "${query}" due to rate limiting. Game may exist but BGG API is overloaded.`, {
          totalDurationSeconds: totalDuration,
        });
        // Throw a specific error so the caller knows this is rate-limited, not a definitive "no results"
        const rateLimitError = new Error(`BGG API rate limited for "${query}" after exhausting retries`);
        rateLimitError.isRateLimited = true;
        rateLimitError.firebaseTries = firebaseTries;
        rateLimitError.bggTries = bggTries;
        throw rateLimitError;
      }
    }

    // No results found (successful API call returned empty, not rate-limited)
    // Log final BGG result (no results or failed)
    try {
      const logger = (await import('./inAppLogger')).default;
      logger.warn(`[searchGamesByName] ⚠️ BGG API returned no results or failed`, {
        firebaseTries,
        bggTries,
        query,
        hadError: !!lastError,
        errorMessage: lastError?.message || null,
        retries: bggRetryCount,
        reason: lastError ? 'bgg_api_error' : 'no_results',
      });
    } catch (loggerError) {
      // Logger not available, continue
    }
    
    if (__DEV__) {
      console.warn(`[Game Search] No results found for "${query}" (successful API call with no results)`);
    }
    if (__DEV__) {
      console.log('[Game Search] No results found, returning empty array');
    }
    return { results: [], firebaseTries, bggTries };
  } catch (error) {
    // Log final error
    try {
      const logger = (await import('./inAppLogger')).default;
      logger.error(`[searchGamesByName] ❌ FINAL ERROR`, {
        query,
        error: error.message,
        isRateLimited: error.isRateLimited || error.message?.includes('rate limited'),
        willRethrow: error.isRateLimited || error.message?.includes('rate limited'),
      });
    } catch (loggerError) {
      // Logger not available, continue
    }
    
    // Re-throw rate-limit errors so caller can handle them (keep game in loading state)
    if (error.isRateLimited || (error.message && error.message.includes('rate limited'))) {
      throw error;
    }
    console.error('[Game Search] Error:', error);
    return [];
  }
};

/**
 * Get detailed game information by BGG ID
 * Priority: Firebase Firestore -> BGG API (only if game not found in Firestore)
 */
export const getGames = async (gameId, source = 'unknown') => {
  try {
    let gameData = null;
    let dataSource = null; // Track where the data came from: 'firebase', 'bgg', or 'firebase+bgg'

    // Try Firebase Firestore first
    try {
      const { getGamesFromFirebase: getFirestoreGame } = await import('../services/gameDatabase');
      const firestoreGame = await getFirestoreGame(gameId);
      
      if (firestoreGame) {
        // Log Firebase success
        try {
          const logger = (await import('./inAppLogger')).default;
          logger.info(`[getGames] ✅ SUCCESS from getGamesFromFirebase`, {
            gameId,
            gameName: firestoreGame.name,
            source,
            hasThumbnail: !!firestoreGame.thumbnail,
            hasImage: !!firestoreGame.image,
            hasDescription: !!firestoreGame.description,
          });
        } catch (loggerError) {
          // Logger not available, continue
        }
        
        if (__DEV__) {
          console.log(`[getGames] ✅ Found in Firebase: ${firestoreGame.name} (${gameId})`);
        }
        
        dataSource = 'firebase';
        // Format to match BGG API response format (ensure id/thumbnail serializable for RN bridge)
        gameData = {
          id: ensureSerializableId(firestoreGame.id),
          name: firestoreGame.name,
          yearPublished: firestoreGame.yearPublished || '',
          rank: firestoreGame.rank || '',
          bayesAverage: firestoreGame.bayesAverage || '',
          average: firestoreGame.average || '',
          usersRated: firestoreGame.usersRated || '',
          thumbnail: ensureStringOrNull(firestoreGame.thumbnail),
          image: ensureStringOrNull(firestoreGame.image),
          minPlayers: firestoreGame.minPlayers || null,
          maxPlayers: firestoreGame.maxPlayers || null,
          playingTime: firestoreGame.playingTime || null,
          minAge: firestoreGame.minAge || null,
          description: firestoreGame.description || null,
          // Category ranks
          strategyGamesRank: firestoreGame.strategyGamesRank || '',
          familyGamesRank: firestoreGame.familyGamesRank || '',
          partyGamesRank: firestoreGame.partyGamesRank || '',
          abstractsRank: firestoreGame.abstractsRank || '',
          thematicRank: firestoreGame.thematicRank || '',
          wargamesRank: firestoreGame.wargamesRank || '',
          childrensGamesRank: firestoreGame.childrensGamesRank || '',
          cgsRank: firestoreGame.cgsRank || '',
          // BGG data fields for recommendations
          mechanics: firestoreGame.mechanics || null,
          categories: firestoreGame.categories || null,
          publishers: firestoreGame.publishers || null,
          publisher: firestoreGame.publisher || null,
          averageWeight: firestoreGame.averageWeight || firestoreGame.complexity || null,
        };
        
        // Check if Firestore game is missing CRITICAL BGG data (thumbnails, images, descriptions)
        // Only fetch from BGG API if critical display fields are missing
        // Optional fields like designers, mechanics, categories, publishers are nice-to-have but not required
        const isMissingData = !gameData.thumbnail || 
                              !gameData.image || 
                              !gameData.description;
        
        if (gameData && isMissingData) {
          if (__DEV__) {
            console.warn(`⚠️ [Game Details] BGG API CALL - Missing data for: ${gameData.name} (${gameId}, Source: ${source})`);
          }
          try {
            const { getGamesFromGeek } = await import('../services/bggApi');
            const bggData = await getGamesFromGeek(gameId);
            
            if (bggData) {
              // Log BGG API success (enrichment)
              try {
                const logger = (await import('./inAppLogger')).default;
                logger.info(`[getGames] ✅ SUCCESS from getGamesFromGeek (enrichment)`, {
                  gameId,
                  gameName: bggData.name,
                  source,
                  enrichedFrom: 'firebase',
                  hasThumbnail: !!bggData.thumbnail,
                  hasImage: !!bggData.image,
                  hasDescription: !!bggData.description,
                });
              } catch (loggerError) {
                // Logger not available, continue
              }
              
              if (__DEV__) {
                console.log(`[getGames] ✅ Enriched from BGG API: ${bggData.name} (${gameId})`);
              }
              
              dataSource = 'firebase+bgg';
              // Merge BGG API data into gameData, prioritizing BGG API data for missing fields
              // This ensures we get the full "thing" object data including large images
              gameData = {
                ...gameData,
                // Always use BGG API data if available (it's more complete and up-to-date)
                thumbnail: ensureStringOrNull(bggData.thumbnail) || gameData.thumbnail,
                image: ensureStringOrNull(bggData.image) || gameData.image, // Large image for details view
                description: bggData.description || gameData.description,
                yearPublished: bggData.yearPublished || gameData.yearPublished,
                minPlayers: bggData.minPlayers || gameData.minPlayers,
                maxPlayers: bggData.maxPlayers || gameData.maxPlayers,
                playingTime: bggData.playingTime || gameData.playingTime,
                minPlayTime: bggData.minPlayTime || gameData.minPlayTime,
                maxPlayTime: bggData.maxPlayTime || gameData.maxPlayTime,
                minAge: bggData.minAge || gameData.minAge,
                // Ratings (use BGG API as it's more current)
                average: bggData.average || gameData.average,
                bayesAverage: bggData.bayesAverage || gameData.bayesAverage,
                usersRated: bggData.usersRated || gameData.usersRated,
                rank: bggData.rank || gameData.rank,
                // Category ranks
                strategyGamesRank: bggData.strategyGamesRank || gameData.strategyGamesRank,
                familyGamesRank: bggData.familyGamesRank || gameData.familyGamesRank,
                partyGamesRank: bggData.partyGamesRank || gameData.partyGamesRank,
                abstractsRank: bggData.abstractsRank || gameData.abstractsRank,
                thematicRank: bggData.thematicRank || gameData.thematicRank,
                wargamesRank: bggData.wargamesRank || gameData.wargamesRank,
                childrensGamesRank: bggData.childrensGamesRank || gameData.childrensGamesRank,
                cgsRank: bggData.cgsRank || gameData.cgsRank,
                // Additional BGG data fields
                mechanics: bggData.mechanics || gameData.mechanics,
                categories: bggData.categories || gameData.categories,
                designers: bggData.designers || gameData.designers,
                publishers: bggData.publishers || gameData.publishers,
                publisher: bggData.publisher || gameData.publisher,
                artists: bggData.artists || gameData.artists,
                complexity: bggData.complexity || gameData.complexity,
                averageWeight: bggData.averageWeight || bggData.complexity || gameData.averageWeight,
                ownedCount: bggData.ownedCount || gameData.ownedCount,
                bestPlayerCount: bggData.bestPlayerCount || gameData.bestPlayerCount,
                languageDependence: bggData.languageDependence || gameData.languageDependence,
                suggestedPlayerAge: bggData.suggestedPlayerAge || gameData.suggestedPlayerAge,
                alternateNames: bggData.alternateNames || gameData.alternateNames,
                dimensions: bggData.dimensions || gameData.dimensions,
                weight: bggData.weight || gameData.weight,
              };
              
              if (__DEV__) {
                console.log(`[Game Details] Updated game data from BGG API "thing" object for: ${gameData.name}`, {
                  hasThumbnail: !!gameData.thumbnail,
                  hasImage: !!gameData.image,
                  hasDescription: !!gameData.description,
                  hasMechanics: !!gameData.mechanics,
                  hasCategories: !!gameData.categories,
                  hasDesigners: !!gameData.designers,
                  hasPublishers: !!gameData.publishers,
                });
              }
              
              // Update Firestore with the complete BGG data (non-blocking)
              try {
                const { updateGameWithBGGData } = await import('../services/gameDatabase');
                updateGameWithBGGData(gameId, bggData).catch(err => {
                  if (__DEV__) {
                    console.warn('[Game Details] Failed to update Firestore with BGG data:', err);
                  }
                });
              } catch (cacheError) {
                if (__DEV__) {
                  console.warn('[Game Details] Error updating Firestore with BGG data:', cacheError);
                }
              }
            }
          } catch (bggError) {
            if (__DEV__) {
              console.warn('[Game Details] Failed to fetch BGG "thing" object:', bggError);
            }
          }
        }
      }
    } catch (firestoreError) {
      if (__DEV__) {
        console.log('[Firestore] Not available, will try BGG API');
      }
    }

    // If no game data found at all, try BGG API as last resort and cache it
    if (!gameData) {
      try {
        if (__DEV__) {
          console.log('[BGG API] Game not in database, fetching from BGG API');
        }
        const { getGamesFromGeek } = await import('../services/bggApi');
        const bggData = await getGamesFromGeek(gameId);
        
        if (bggData) {
          // Log BGG API success (fallback)
          try {
            const logger = (await import('./inAppLogger')).default;
            logger.info(`[getGames] ✅ SUCCESS from getGamesFromGeek (fallback)`, {
              gameId,
              gameName: bggData.name,
              source,
              hasThumbnail: !!bggData.thumbnail,
              hasImage: !!bggData.image,
              hasDescription: !!bggData.description,
            });
          } catch (loggerError) {
            // Logger not available, continue
          }
          
          if (__DEV__) {
            console.log(`[getGames] ✅ Found in BGG API (fallback): ${bggData.name} (${gameId})`);
          }
          
          dataSource = 'bgg';
          
          gameData = {
            id: ensureSerializableId(bggData.id),
            name: bggData.name,
            yearPublished: bggData.yearPublished || '',
            rank: bggData.rank || '',
            bayesAverage: bggData.bayesAverage || '',
            average: bggData.average || '',
            usersRated: bggData.usersRated || '',
            thumbnail: ensureStringOrNull(bggData.thumbnail),
            image: ensureStringOrNull(bggData.image),
            minPlayers: bggData.minPlayers || null,
            maxPlayers: bggData.maxPlayers || null,
            playingTime: bggData.playingTime || null,
            minAge: bggData.minAge || null,
            description: bggData.description || null,
            // Category ranks
            strategyGamesRank: bggData.strategyGamesRank || '',
            familyGamesRank: bggData.familyGamesRank || '',
            partyGamesRank: bggData.partyGamesRank || '',
            abstractsRank: bggData.abstractsRank || '',
            thematicRank: bggData.thematicRank || '',
            wargamesRank: bggData.wargamesRank || '',
            childrensGamesRank: bggData.childrensGamesRank || '',
            cgsRank: bggData.cgsRank || '',
            // BGG data fields for recommendations
            mechanics: bggData.mechanics || null,
            categories: bggData.categories || null,
            publishers: bggData.publishers || null,
            publisher: bggData.publisher || null,
            averageWeight: bggData.averageWeight || bggData.complexity || null,
          };
          
          // Cache BGG data to Firestore for future use (non-blocking)
          try {
            const { updateGameWithBGGData } = await import('../services/gameDatabase');
            updateGameWithBGGData(gameId, bggData).catch(err => {
              if (__DEV__) {
                console.warn('[Game Details] Failed to cache BGG data:', err);
              }
            });
          } catch (cacheError) {
            // Non-critical - just log it
            if (__DEV__) {
              console.warn('[Game Details] Error caching BGG data:', cacheError);
            }
          }
        }
      } catch (bggError) {
        if (__DEV__) {
          console.warn('[BGG API] Failed to fetch game:', bggError);
        }
      }
    }

    if (!gameData) {
      // Log failure
      try {
        const logger = (await import('./inAppLogger')).default;
        logger.warn(`[getGames] ❌ NOT FOUND`, {
          gameId,
          source,
          dataSource: 'none',
        });
      } catch (loggerError) {
        // Logger not available, continue
      }
      
      if (__DEV__) {
        console.warn('[Game Details] Game not found:', gameId);
      }
      return null;
    }

    // Log final success with data source
    try {
      const logger = (await import('./inAppLogger')).default;
      logger.info(`[getGames] ✅ FINAL RESULT`, {
        gameId,
        gameName: gameData.name,
        source,
        dataSource: dataSource || 'unknown',
        hasThumbnail: !!gameData.thumbnail,
        hasImage: !!gameData.image,
        hasDescription: !!gameData.description,
      });
    } catch (loggerError) {
      // Logger not available, continue
    }
    
    if (__DEV__ && dataSource) {
      console.log(`[getGames] ✅ Final result from ${dataSource}: ${gameData.name} (${gameId})`);
    }

    return gameData;
  } catch (error) {
    console.error('[Game Details] Error:', error);
    return null;
  }
};

/**
 * Generate a random join code for events
 */
import { wordList1, wordList2, wordList3 } from './wordlist';

export const generateJoinCode = () => {
  // Select one word from each list: word1, word2, word3
  const word1Index = Math.floor(Math.random() * wordList1.length);
  const word2Index = Math.floor(Math.random() * wordList2.length);
  const word3Index = Math.floor(Math.random() * wordList3.length);
  
  return `${wordList1[word1Index]} ${wordList2[word2Index]} ${wordList3[word3Index]}`;
};

/**
 * Validate join code format - expects 3 words separated by spaces or hyphens
 * Case-insensitive: accepts any case combination
 */
export const validateJoinCode = (code) => {
  if (!code || typeof code !== 'string') {
    return false;
  }
  // Normalize: trim, lowercase, and check for 3 words separated by spaces or hyphens
  const normalized = code.trim().toLowerCase();
  const words = normalized.split(/[\s-]+/);
  return words.length === 3 && words.every(word => /^[a-z]+$/.test(word) && word.length > 0);
};

/**
 * Fetch BGG collection for a user
 * NOTE: BGG API is no longer used. This function is deprecated.
 * @deprecated BGG API integration has been removed
 */
/**
 * Get BGG API bearer token from config
 * @returns {string|null} Bearer token or null if not configured
 */
function getBGGToken() {
  try {
    // Try direct environment variable access first (for Expo)
    let token = process.env.EXPO_PUBLIC_BGG_API_TOKEN || 
                process.env.EXPO_PUBLIC_BGGbearerToken ||
                process.env.BGGbearerToken ||
                process.env.REACT_APP_BGG_API_TOKEN ||
                null;
    
    // If not found, try API_CONFIG
    if (!token) {
      token = API_CONFIG.BGG_API_TOKEN || null;
    }
    
    if (__DEV__) {
      if (token) {
        if (__DEV__) {

          console.log('[BGG Collection] Token found, length:', token.length, 'first 10 chars:', token.substring(0, 10));

        }
      } else {
        if (__DEV__) {

          console.warn('[BGG Collection] No token found. Checked:', {
          EXPO_PUBLIC_BGG_API_TOKEN: !!process.env.EXPO_PUBLIC_BGG_API_TOKEN,
          EXPO_PUBLIC_BGGbearerToken: !!process.env.EXPO_PUBLIC_BGGbearerToken,
          BGGbearerToken: !!process.env.BGGbearerToken,
          REACT_APP_BGG_API_TOKEN: !!process.env.REACT_APP_BGG_API_TOKEN,
        });

        }
      }
    }
    return token;
  } catch (error) {
    if (__DEV__) {

      console.warn('[BGG Collection] Error loading API config:', error);

    }
    return null;
  }
}

/**
 * Fetch a user's collection from BoardGameGeek using their username
 * Uses BGG's XML API with Bearer token authentication
 * Handles 202 responses (when BGG is processing) with automatic retry
 * @param {string} username - BGG username
 * @param {Object} options - Optional parameters
 * @param {boolean} options.own - Filter to owned games (default: true)
 * @param {boolean} options.stats - Include statistics (default: true)
 * @param {string} options.subtype - Filter by subtype, e.g. 'boardgame' (default: 'boardgame')
 * @param {number} options.maxRetries - Maximum number of retries (default: 30)
 * @param {Function} options.onProgress - Callback for progress updates: (attempt, maxRetries, estimatedSecondsRemaining) => void
 * @returns {Promise<Array>} Array of games in the collection
 */
export const fetchBGGCollection = async (username, options = {}) => {
  if (!username || !username.trim()) {
    throw new Error('BGG username is required');
  }

  const {
    own = true,
    stats = true,
    subtype = 'boardgame',
    maxRetries = 30, // Increased from 5 to 30 to handle large collections (up to ~2 minutes)
    onProgress,
  } = options;

  try {
    const trimmedUsername = username.trim();
    const params = new URLSearchParams({
      username: trimmedUsername, // URLSearchParams handles encoding automatically
      ...(own && { own: '1' }),
      ...(stats && { stats: '1' }),
      ...(subtype && { subtype }),
    });
    
    const url = `https://boardgamegeek.com/xmlapi2/collection?${params.toString()}`;
    const token = getBGGToken();
    
    if (__DEV__) {
      console.log('[BGG Collection] Fetching collection for:', username);
      if (__DEV__) {

        console.log('[BGG Collection] URL:', url);

      }
    }

    // Retry logic for 202 responses with exponential backoff
    let retries = 0;
    let xmlText = null;
    const initialDelay = 2000; // Start with 2 seconds
    const maxDelay = 10000; // Cap at 10 seconds
    
    while (retries < maxRetries) {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
      
      if (__DEV__) {
        console.log(`[BGG Collection] Response status: ${response.status} (attempt ${retries + 1}/${maxRetries})`);
      }
      
      if (response.status === 200) {
        xmlText = await response.text();
        if (onProgress) {
          onProgress(retries + 1, maxRetries, 0);
        }
        break;
      } else if (response.status === 202) {
        // BGG is processing the request - wait and retry with exponential backoff
        // Exponential backoff: 2s, 4s, 8s, then cap at 10s
        const delay = Math.min(initialDelay * Math.pow(2, retries), maxDelay);
        const remainingRetries = maxRetries - retries - 1;
        const estimatedSecondsRemaining = Math.ceil((delay * remainingRetries) / 1000);
        
        if (onProgress) {
          onProgress(retries + 1, maxRetries, estimatedSecondsRemaining);
        }
        
        if (__DEV__) {
          console.log(`[BGG Collection] BGG is processing request (202). Waiting ${delay}ms before retry ${retries + 1}/${maxRetries}...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else if (response.status === 429) {
        // Rate limit exceeded - wait longer before retrying
        retries++;
        const rateLimitDelay = 60000; // 60 seconds for rate limits
        if (__DEV__) {
          console.log(`[BGG Collection] Rate limit exceeded (429). Waiting ${rateLimitDelay}ms before retry ${retries}/${maxRetries}...`);
        }
        
        // If we've exhausted retries, throw error
        if (retries >= maxRetries) {
          throw new Error(
            'Rate limit exceeded. BGG is limiting API requests. Please wait a few minutes and try again.\n\n' +
            'Tip: If you have a large collection, the import may take longer. Try again in 5-10 minutes.'
          );
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
      } else if (response.status === 401) {
        // If we have a token and got 401, try without token
        if (token) {
          if (__DEV__) {
            console.log('[BGG Collection] Token auth failed (401), trying without token');
          }
          const responseNoAuth = await fetch(url);
          if (responseNoAuth.status === 200) {
            xmlText = await responseNoAuth.text();
            if (onProgress) {
              onProgress(retries + 1, maxRetries, 0);
            }
            break;
          } else if (responseNoAuth.status === 202) {
            // BGG is processing - wait and retry with exponential backoff
            const delay = Math.min(initialDelay * Math.pow(2, retries), maxDelay);
            const remainingRetries = maxRetries - retries - 1;
            const estimatedSecondsRemaining = Math.ceil((delay * remainingRetries) / 1000);
            
            if (onProgress) {
              onProgress(retries + 1, maxRetries, estimatedSecondsRemaining);
            }
            
            if (__DEV__) {
              console.log(`[BGG Collection] BGG is processing request (202). Waiting ${delay}ms before retry...`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
            continue;
          } else if (responseNoAuth.status === 429) {
            // Rate limit on retry without token - wait longer
            retries++;
            const rateLimitDelay = 60000;
            if (__DEV__) {
              console.log(`[BGG Collection] Rate limit exceeded (429) on retry. Waiting ${rateLimitDelay}ms before retry ${retries}/${maxRetries}...`);
            }
            
            // If we've exhausted retries, throw error
            if (retries >= maxRetries) {
              throw new Error(
                'Rate limit exceeded. BGG is limiting API requests. Please wait a few minutes and try again.\n\n' +
                'Tip: If you have a large collection, the import may take longer. Try again in 5-10 minutes.'
              );
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
            continue;
          }
        }
        // If no token or retry without token also failed, throw error
        const body = await response.text();
        throw new Error(`Authentication failed (401). ${token ? 'Token may be invalid.' : 'Bearer token required. Make sure BGGbearerToken is set in your .env file.'}`);
      } else {
        const body = await response.text();
        throw new Error(`Failed to fetch collection: ${response.status} ${response.statusText}. ${body || ''}`);
      }
    }
    
    if (!xmlText) {
      throw new Error('Max retries exceeded. BGG may still be processing your collection. Please try again in a few moments.');
    }
    
    if (!xmlText || xmlText.trim().length === 0) {
      throw new Error('No collection data returned. Make sure your BGG collection is set to public and "Include me in the Gamer Database" is enabled in privacy settings.');
    }

    // Check for errors in XML (BGG returns errors with 200 status)
    // Handle both <errors><error><message> and <error><message> formats
    const errorMatch = xmlText.match(/<errors>[\s\S]*?<error[^>]*>[\s\S]*?<message>([^<]+)<\/message>[\s\S]*?<\/error>[\s\S]*?<\/errors>/i) ||
                      xmlText.match(/<error[^>]*>[\s\S]*?<message>([^<]+)<\/message>[\s\S]*?<\/error>/i);
    if (errorMatch) {
      const errorMessage = errorMatch[1] ? errorMatch[1].trim() : 'Error fetching collection from BGG';
      
      // Check for specific error cases and provide helpful messages
      const lowerErrorMessage = errorMessage.toLowerCase();
      
      if (lowerErrorMessage.includes('invalid username') || 
          lowerErrorMessage.includes('user not found') ||
          lowerErrorMessage.includes('username not found') ||
          lowerErrorMessage.includes('unknown user')) {
        throw new Error(
          `The username "${username.trim()}" was not found on BoardGameGeek.\n\n` +
          `Please check that:\n` +
          `• The username is spelled correctly\n` +
          `• The username exists on BoardGameGeek\n` +
          `• You're using your BGG username (not your email or display name)`
        );
      }
      
      // Check for rate limit errors
      if (lowerErrorMessage.includes('rate limit') || lowerErrorMessage.includes('rate limit exceeded')) {
        throw new Error(
          'Rate limit exceeded. BGG is limiting API requests. Please wait a few minutes and try again.\n\n' +
          'Tip: If you have a large collection, the import may take longer. Try again in 5-10 minutes.'
        );
      }
      
      // Check for privacy/access related errors
      if (lowerErrorMessage.includes('private') || 
          lowerErrorMessage.includes('not available') ||
          lowerErrorMessage.includes('access denied') ||
          lowerErrorMessage.includes('permission')) {
        throw new Error(
          'Unable to access collection. Please make sure your BGG collection is set to public and "Include me in the Gamer Database" is enabled in your privacy settings.\n\n' +
          'Go to: https://boardgamegeek.com/settings/privacy\n' +
          'And toggle "Include Me in the Gamer Database" to ON.'
        );
      }
      
      // For other errors, throw the original message
      throw new Error(errorMessage);
    }

    // Check if we have an items element (even if empty)
    const hasItemsElement = xmlText.includes('<items') || xmlText.includes('<items>');
    
    // Check for totalitems attribute to see if collection is empty
    const totalItemsMatch = xmlText.match(/<items[^>]*totalitems="(\d+)"/);
    const totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1], 10) : null;
    
    // Parse XML using regex (React Native compatible)
    const collection = [];
    const itemRegex = /<item[^>]*objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const objectId = match[1];
      const itemXml = match[2];

      // Extract name
      const primaryNameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*>([^<]+)<\/name>/);
      const nameMatch = itemXml.match(/<name[^>]*>([^<]+)<\/name>/);
      const name = primaryNameMatch ? primaryNameMatch[1].trim() : (nameMatch ? nameMatch[1].trim() : '');

      // Extract year published
      const yearMatch = itemXml.match(/<yearpublished[^>]*value="(\d+)"/);
      const yearPublished = yearMatch ? yearMatch[1] : null;

      // Extract thumbnail
      const thumbnailMatch = itemXml.match(/<thumbnail>([^<]+)<\/thumbnail>/);
      const thumbnail = thumbnailMatch ? thumbnailMatch[1].trim() : null;

      // Extract image
      const imageMatch = itemXml.match(/<image>([^<]+)<\/image>/);
      const image = imageMatch ? imageMatch[1].trim() : null;

      // Extract collection status
      const statusMatch = itemXml.match(/<status[^>]*>([\s\S]*?)<\/status>/);
      let status = {};
      if (statusMatch) {
        const statusXml = statusMatch[1];
        status.own = statusXml.includes('<own>1</own>') || !!statusXml.match(/<own[^>]*>1<\/own>/);
        status.prevowned = statusXml.includes('<prevowned>1</prevowned>') || !!statusXml.match(/<prevowned[^>]*>1<\/prevowned>/);
        status.fortrade = statusXml.includes('<fortrade>1</fortrade>') || !!statusXml.match(/<fortrade[^>]*>1<\/fortrade>/);
        status.want = statusXml.includes('<want>1</want>') || !!statusXml.match(/<want[^>]*>1<\/want>/);
        status.wanttoplay = statusXml.includes('<wanttoplay>1</wanttoplay>') || !!statusXml.match(/<wanttoplay[^>]*>1<\/wanttoplay>/);
        status.wanttobuy = statusXml.includes('<wanttobuy>1</wanttobuy>') || !!statusXml.match(/<wanttobuy[^>]*>1<\/wanttobuy>/);
        status.wishlist = statusXml.includes('<wishlist>1</wishlist>') || !!statusXml.match(/<wishlist[^>]*>1<\/wishlist>/);
        status.preordered = statusXml.includes('<preordered>1</preordered>') || !!statusXml.match(/<preordered[^>]*>1<\/preordered>/);
      }

      // Extract stats
      let rating = null;
      let numplays = null;
      
      const statsMatch = itemXml.match(/<stats[^>]*>([\s\S]*?)<\/stats>/);
      if (statsMatch) {
        const statsXml = statsMatch[1];
        
        // Extract rating value
        const ratingMatch = statsXml.match(/<rating[^>]*>([\s\S]*?)<\/rating>/);
        if (ratingMatch) {
          const ratingXml = ratingMatch[1];
          const valueMatch = ratingXml.match(/<value[^>]*>([^<]+)<\/value>/);
          if (valueMatch) {
            rating = parseFloat(valueMatch[1]);
          }
        }

        // Extract numplays
        const numplaysMatch = statsXml.match(/<numplays[^>]*>(\d+)<\/numplays>/);
        if (numplaysMatch) {
          numplays = parseInt(numplaysMatch[1], 10);
        }
      }

      // Extract comment
      const commentMatch = itemXml.match(/<comment>([\s\S]*?)<\/comment>/);
      const comment = commentMatch ? commentMatch[1].trim() : null;

      // Extract wishlist priority
      const wishlistMatch = itemXml.match(/<wishlistpriority>(\d+)<\/wishlistpriority>/);
      const wishlistPriority = wishlistMatch ? parseInt(wishlistMatch[1], 10) : null;

      if (objectId && name) {
        collection.push({
          bggId: objectId,
          name: name,
          yearPublished: yearPublished || null,
          thumbnail: thumbnail || null,
          image: image || null,
          rating: rating,
          numplays: numplays || 0,
          comment: comment || null,
          wishlistPriority: wishlistPriority || null,
          status: status,
        });
      }
    }

    if (__DEV__) {
      console.log(`[BGG Collection] Found ${collection.length} games`);
    }

    // If collection is empty and we don't have an items element, it might be a privacy issue
    // However, if we have an items element with totalitems="0", that's valid (user just has no games)
    if (collection.length === 0) {
      if (!hasItemsElement) {
        // No items element at all - likely a privacy or access issue
        throw new Error(
          'Unable to access collection. Please make sure your BGG collection is set to public and "Include me in the Gamer Database" is enabled in your privacy settings.\n\n' +
          'Go to: https://boardgamegeek.com/settings/privacy\n' +
          'And toggle "Include Me in the Gamer Database" to ON.'
        );
      } else if (totalItems === 0) {
        // Valid response with 0 items - user has no games matching the criteria
        // This is fine, return empty array
        if (__DEV__) {
          console.log('[BGG Collection] User has no games matching the criteria (own=1, subtype=boardgame)');
        }
        // Return empty array - this is a valid state (user exists but has no games)
        return collection;
      }
    }

    return collection;
  } catch (error) {
    console.error('[BGG Collection] Error:', error);
    throw error;
  }
};

// BGG API XML parsing utilities removed - BGG API is no longer used

