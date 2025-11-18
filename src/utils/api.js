import axios from 'axios';
import { API_CONFIG } from '../config/api';
import * as bggLocalDB from './bggLocalDB';

// RapidAPI Barcode Lookup configuration
const RAPIDAPI_BARCODE_BASE = 'https://barcodes-lookup.p.rapidapi.com';

// GameUPC API configuration
const GAMEUPC_BASE = 'https://api.gameupc.com/test';

/**
 * Clean the scanner title by removing common board game terms
 * This helps when searching BoardGameGeek API
 * @param {string} title - The title from the barcode scanner
 * @returns {string} - Cleaned title without "Board Game", "Board", "Game" words
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
 */
export const searchGameByBarcode = async (barcode) => {
  if (!barcode || !barcode.trim()) {
    throw new Error('Barcode is required');
  }

  const cleanBarcode = barcode.trim().replace(/[\s-]/g, '');
  let primaryResult = null;
  let primaryError = null;

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

  // Otherwise, try GameUPC as fallback
  try {
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
 * Priority: Firebase Firestore -> Local DB
 * Returns empty array if no results found
 */
export const searchGamesByName = async (query) => {
  try {
    if (__DEV__) {
      console.log('[Game Search] Searching for:', query);
    }

    // Try Firebase Firestore first (if available)
    try {
      const { searchGamesByName: searchFirestore } = await import('../services/gameDatabase');
      
      // Add timeout wrapper in case Firestore hangs
      const firestorePromise = searchFirestore(query, 10);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Firestore search timeout')), 6000);
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
 * Priority: Firebase Firestore -> Local DB
 */
export const getGameDetails = async (gameId) => {
  try {
    if (__DEV__) {
      console.log('[Game Details] Fetching game:', gameId);
    }

    // Try Firebase Firestore first
    try {
      const { getGameById: getFirestoreGame } = await import('../services/gameDatabase');
      const firestoreGame = await getFirestoreGame(gameId);
      
      if (firestoreGame) {
        if (__DEV__) {
          console.log(`[Firestore] Found game: ${firestoreGame.name}`);
        }
        // Format to match BGG API response format
        return {
          id: firestoreGame.id,
          name: firestoreGame.name,
          yearPublished: firestoreGame.yearPublished || '',
          rank: firestoreGame.rank || '',
          bayesAverage: firestoreGame.bayesAverage || '',
          average: firestoreGame.average || '',
          usersRated: firestoreGame.usersRated || '',
          thumbnail: null,
          image: null,
        };
      }
    } catch (firestoreError) {
      if (__DEV__) {
        console.log('[Firestore] Not available, trying local DB');
      }
    }

    // Fallback: Local database
    try {
      const localGame = await bggLocalDB.getGameById(gameId);
      if (localGame) {
        if (__DEV__) {
          console.log(`[Local DB] Found game: ${localGame.name}`);
        }
        return bggLocalDB.parseBGGGameDetails(localGame);
      }
    } catch (localError) {
      // Local DB not available
    }

    if (__DEV__) {
      console.warn('[Game Details] Game not found:', gameId);
    }
    return null;
  } catch (error) {
    console.error('[Game Details] Error:', error);
    return null;
  }
};

/**
 * Generate a random join code for events
 */
export const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Validate join code format
 */
export const validateJoinCode = (code) => {
  return /^[A-Z0-9]{6}$/.test(code);
};

/**
 * Fetch BGG collection for a user
 * NOTE: BGG API is no longer used. This function is deprecated.
 * @deprecated BGG API integration has been removed
 */
export const fetchBGGCollection = async () => {
  throw new Error('BGG collection import is no longer available. Please add games manually or use the camera feature.');
};

// BGG API XML parsing utilities removed - BGG API is no longer used

