import axios from 'axios';
import { API_CONFIG } from '../config/api';
import * as bggLocalDB from './bggLocalDB';

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
        const bggDetails = await getGameDetails(barcodeResult.bggId);
        return {
          ...barcodeResult,
          bggMatch: true,
          bggName: barcodeResult.bggName,
          bggDetails: bggDetails,
        };
      } catch (bggError) {
        console.warn('Failed to get BGG details for GameUPC verified game:', bggError);
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
      const bggResults = await searchGamesByName(barcodeResult.cleanedTitle);
      
      if (bggResults && bggResults.length > 0) {
        // Get detailed info for the first (most relevant) result
        const topResult = bggResults[0];
        const bggDetails = await getGameDetails(topResult.id);
        
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
      console.warn('BGG search failed, returning barcode result only:', bggError);
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
      console.log('GameUPC API Response:', response.data);
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
      console.log('Primary Barcode API Response:', response.data);
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
    console.warn('Primary barcode lookup failed, trying GameUPC fallback:', error);
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
 * Priority: Firebase Firestore -> Local DB -> BGG API (if fallbackToBGG is true)
 * @param {string} query - Game name to search for
 * @param {boolean} fallbackToBGG - If true, fall back to BGG API when backend returns no results
 * @returns {Promise<Array>} Array of matching games
 */
export const searchGamesByName = async (query, fallbackToBGG = false) => {
  try {
    if (__DEV__) {
      console.log('[Game Search] Searching for:', query);
    }

    // Try Firebase Firestore first (if available)
    try {
      const { searchGamesByName: searchFirestore } = await import('../services/gameDatabase');
      
      // Add timeout wrapper in case Firestore hangs
      // Reduced timeout from 6s to 4s for faster failure
      const firestorePromise = searchFirestore(query, 50);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Firestore search timeout')), 4000);
      });
      
      const firestoreResults = await Promise.race([firestorePromise, timeoutPromise]);
      
      if (__DEV__) {
        console.log('[Firestore] Query completed, results:', firestoreResults ? firestoreResults.length : 'null');
      }
      
      if (firestoreResults && firestoreResults.length > 0) {
        if (__DEV__) {
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
        return formatted;
      } else {
        // Firestore returned empty array - return it explicitly
        if (__DEV__) {
          console.log('[Firestore] No results found, returning empty array');
        }
        return [];
      }
    } catch (firestoreError) {
      if (__DEV__) {
        console.log('[Firestore] Not available or error, trying local DB:', firestoreError.message);
      }
      // Don't throw - fall through to local DB
    }

    // Fallback: Try local database (if still bundled)
    try {
      const localResults = await bggLocalDB.searchGamesByName(query, 10);
      if (localResults && localResults.length > 0) {
        if (__DEV__) {
          console.log(`[Local DB] Found ${localResults.length} games`);
        }
        return bggLocalDB.parseBGGSearchResponse(localResults);
      }
    } catch (localError) {
      if (__DEV__) {
        console.log('[Local DB] Not available:', localError.message);
      }
    }

    // No results found in backend - try BGG API if fallback is enabled
    if (fallbackToBGG) {
      if (__DEV__) {
        console.log('[Game Search] No results in backend, trying BGG API...');
      }
      try {
        const { searchBGGAPI } = await import('../services/bggApi');
        const bggResults = await searchBGGAPI(query, 50);
        if (bggResults && bggResults.length > 0) {
          if (__DEV__) {
            console.log(`[BGG API] Found ${bggResults.length} games`);
          }
          return bggResults;
        }
      } catch (bggError) {
        if (__DEV__) {
          console.warn('[BGG API] Search failed:', bggError);
        }
      }
    }

    // No results found
    if (__DEV__) {
      console.log('[Game Search] No results found, returning empty array');
    }
    return [];
  } catch (error) {
    console.error('[Game Search] Error:', error);
    return [];
  }
};

/**
 * Get detailed game information by BGG ID
 * Priority: Firebase Firestore -> Local DB -> BGG API
 * BGG API is used to fetch thumbnails/images when not available in Firestore
 */
export const getGameDetails = async (gameId) => {
  try {
    if (__DEV__) {
      console.log('[Game Details] Fetching game:', gameId);
    }

    let gameData = null;
    let hasThumbnail = false;

    // Try Firebase Firestore first
    try {
      const { getGameById: getFirestoreGame } = await import('../services/gameDatabase');
      const firestoreGame = await getFirestoreGame(gameId);
      
      if (firestoreGame) {
        if (__DEV__) {
          console.log(`[Firestore] Found game: ${firestoreGame.name}`);
        }
        // Format to match BGG API response format
        gameData = {
          id: firestoreGame.id,
          name: firestoreGame.name,
          yearPublished: firestoreGame.yearPublished || '',
          rank: firestoreGame.rank || '',
          bayesAverage: firestoreGame.bayesAverage || '',
          average: firestoreGame.average || '',
          usersRated: firestoreGame.usersRated || '',
          thumbnail: firestoreGame.thumbnail || null,
          image: firestoreGame.image || null,
          minPlayers: firestoreGame.minPlayers || null,
          maxPlayers: firestoreGame.maxPlayers || null,
          playingTime: firestoreGame.playingTime || null,
          minAge: firestoreGame.minAge || null,
          description: firestoreGame.description || null,
        };
        hasThumbnail = !!(gameData.thumbnail || gameData.image);
      }
    } catch (firestoreError) {
      if (__DEV__) {
        console.log('[Firestore] Not available, trying local DB');
      }
    }

    // Fallback: Local database
    if (!gameData) {
      try {
        const localGame = await bggLocalDB.getGameById(gameId);
        if (localGame) {
          if (__DEV__) {
            console.log(`[Local DB] Found game: ${localGame.name}`);
          }
          gameData = bggLocalDB.parseBGGGameDetails(localGame);
          hasThumbnail = !!(gameData?.thumbnail || gameData?.image);
        }
      } catch (localError) {
        // Local DB not available
      }
    }

    // If we have game data but no thumbnail, fetch from BGG API
    if (gameData && !hasThumbnail) {
      try {
        if (__DEV__) {
          console.log('[BGG API] Fetching thumbnail for game:', gameId);
        }
        const { fetchBGGGameDetails } = await import('../services/bggApi');
        const bggData = await fetchBGGGameDetails(gameId);
        
        if (bggData) {
          // Merge BGG API data (thumbnails) with existing game data
          gameData.thumbnail = bggData.thumbnail || gameData.thumbnail || null;
          gameData.image = bggData.image || gameData.image || null;
          
          // Also update other fields if they're missing
          if (!gameData.minPlayers && bggData.minPlayers) gameData.minPlayers = bggData.minPlayers;
          if (!gameData.maxPlayers && bggData.maxPlayers) gameData.maxPlayers = bggData.maxPlayers;
          if (!gameData.playingTime && bggData.playingTime) gameData.playingTime = bggData.playingTime;
          if (!gameData.minAge && bggData.minAge) gameData.minAge = bggData.minAge;
          if (!gameData.description && bggData.description) gameData.description = bggData.description;
          
          if (__DEV__) {
            console.log('[BGG API] Successfully fetched thumbnail:', gameData.thumbnail ? 'yes' : 'no');
          }
        }
      } catch (bggError) {
        if (__DEV__) {
          console.warn('[BGG API] Failed to fetch thumbnail:', bggError);
        }
      }
    }

    // If no game data found at all, try BGG API as last resort
    if (!gameData) {
      try {
        if (__DEV__) {
          console.log('[BGG API] Game not in database, fetching from BGG API');
        }
        const { fetchBGGGameDetails } = await import('../services/bggApi');
        const bggData = await fetchBGGGameDetails(gameId);
        
        if (bggData) {
          gameData = {
            id: bggData.id,
            name: bggData.name,
            yearPublished: bggData.yearPublished || '',
            rank: bggData.rank || '',
            bayesAverage: bggData.bayesAverage || '',
            average: bggData.average || '',
            usersRated: bggData.usersRated || '',
            thumbnail: bggData.thumbnail || null,
            image: bggData.image || null,
            minPlayers: bggData.minPlayers || null,
            maxPlayers: bggData.maxPlayers || null,
            playingTime: bggData.playingTime || null,
            minAge: bggData.minAge || null,
            description: bggData.description || null,
          };
        }
      } catch (bggError) {
        if (__DEV__) {
          console.warn('[BGG API] Failed to fetch game:', bggError);
        }
      }
    }

    if (!gameData) {
      if (__DEV__) {
        console.warn('[Game Details] Game not found:', gameId);
      }
      return null;
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
import { wordlist } from './wordlist';

export const generateJoinCode = () => {
  const words = [];
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * wordlist.length);
    words.push(wordlist[randomIndex]);
  }
  return words.join(' ');
};

/**
 * Validate join code format - expects 3 lowercase words separated by spaces or hyphens
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
        console.log('[BGG Collection] Token found, length:', token.length, 'first 10 chars:', token.substring(0, 10));
      } else {
        console.warn('[BGG Collection] No token found. Checked:', {
          EXPO_PUBLIC_BGG_API_TOKEN: !!process.env.EXPO_PUBLIC_BGG_API_TOKEN,
          EXPO_PUBLIC_BGGbearerToken: !!process.env.EXPO_PUBLIC_BGGbearerToken,
          BGGbearerToken: !!process.env.BGGbearerToken,
          REACT_APP_BGG_API_TOKEN: !!process.env.REACT_APP_BGG_API_TOKEN,
        });
      }
    }
    return token;
  } catch (error) {
    console.warn('[BGG Collection] Error loading API config:', error);
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
    maxRetries = 5,
    retryDelay = 2000,
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
      console.log('[BGG Collection] URL:', url);
    }

    // Retry logic for 202 responses
    let retries = 0;
    let xmlText = null;
    
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
        break;
      } else if (response.status === 202) {
        // BGG is processing the request - wait and retry
        if (__DEV__) {
          console.log(`[BGG Collection] BGG is processing request (202). Waiting ${retryDelay}ms before retry...`);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retries++;
      } else if (response.status === 401) {
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
      if (errorMessage.toLowerCase().includes('invalid username')) {
        throw new Error(`Invalid username: "${username.trim()}". Please check the username and try again.`);
      }
      
      // Check for privacy/access related errors
      const lowerErrorMessage = errorMessage.toLowerCase();
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
      }
    }

    return collection;
  } catch (error) {
    console.error('[BGG Collection] Error:', error);
    throw error;
  }
};

// BGG API XML parsing utilities removed - BGG API is no longer used

