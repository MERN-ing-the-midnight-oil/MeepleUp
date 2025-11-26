/**
 * ARCHIVED: Barcode Scanning API Functions
 * 
 * This file contains barcode scanning functionality that has been archived.
 * These functions are preserved for potential future use but are not currently
 * active in the codebase.
 * 
 * Archived: [Date]
 * Reason: Feature not being used going forward, but preserved for potential future use
 */

import axios from 'axios';
import { API_CONFIG } from '../../config/api';

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
        // Note: getGameDetails would need to be imported from utils/api
        // const bggDetails = await getGameDetails(barcodeResult.bggId);
        return {
          ...barcodeResult,
          bggMatch: true,
          bggName: barcodeResult.bggName,
          // bggDetails: bggDetails,
        };
      } catch (bggError) {
        console.warn('Failed to get BGG details for GameUPC verified game:', bggError);
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
    // Note: searchGamesByName would need to be imported from utils/api
    // try {
    //   const bggResults = await searchGamesByName(barcodeResult.cleanedTitle);
    //   ...
    // }
    
    return barcodeResult;
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




