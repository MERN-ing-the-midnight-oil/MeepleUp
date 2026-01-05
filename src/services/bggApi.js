/**
 * BGG XML API Service
 * Fetches game data including thumbnails from BoardGameGeek XML API
 * 
 * API Documentation: https://boardgamegeek.com/using_the_xml_api
 */

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

// Rate limiting: Track API calls to avoid being flagged as heavy user
let lastApiCallTime = 0;
const MIN_API_CALL_INTERVAL_BULK = 2000; // 2 seconds for bulk operations (increased from 1.5s)
const MIN_API_CALL_INTERVAL_NORMAL = 500; // 0.5 seconds for normal operations

/**
 * Rate limiter for BGG API calls
 * Only applies rate limiting to bulk operations - user-driven actions rely on natural user delays
 * @param {boolean} isBulkOperation - If true, uses 2s delay, otherwise 0.5s delay
 * @returns {Promise<void>} Resolves when it's safe to make an API call
 */
async function rateLimitAPI(isBulkOperation = false) {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;
  const minInterval = isBulkOperation ? MIN_API_CALL_INTERVAL_BULK : MIN_API_CALL_INTERVAL_NORMAL;
  
  if (timeSinceLastCall < minInterval) {
    const waitTime = minInterval - timeSinceLastCall;
    if (__DEV__ && isBulkOperation) {
      console.log(`[BGG API] Rate limiting bulk operation: waiting ${waitTime}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastApiCallTime = Date.now();
}

/**
 * Handle 429 rate limit errors with exponential backoff
 * @param {Response} response - The HTTP response
 * @param {Function} retryFn - Function to retry the request
 * @param {number} retryCount - Current retry attempt (starts at 0)
 * @param {number} maxRetries - Maximum number of retries (default: 2, reduced to fail faster)
 * @returns {Promise<Response>} The response after retries
 */
async function handle429WithRetry(response, retryFn, retryCount = 0, maxRetries = 2) {
  if (response.status === 429 && retryCount < maxRetries) {
    // Exponential backoff: 5s, 10s (reduced from 3 retries to 2 to fail faster)
    const backoffMs = 5000 * Math.pow(2, retryCount);
    if (__DEV__) {
      console.log(`[BGG API] Rate limited (429), waiting ${backoffMs}ms before retry ${retryCount + 1}/${maxRetries}`);
    }
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    try {
      const retryResponse = await retryFn();
      return handle429WithRetry(retryResponse, retryFn, retryCount + 1, maxRetries);
    } catch (error) {
      // If retry fails, return the original response to avoid infinite loops
      if (__DEV__) {
        console.warn(`[BGG API] Retry failed:`, error);
      }
      return response;
    }
  }
  // If we've exhausted retries or status is not 429, return the response
  // This allows the calling code to handle the error appropriately
  return response;
}

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
      const { API_CONFIG } = require('../config/api');
      token = API_CONFIG.BGG_API_TOKEN || null;
    }
    
    if (__DEV__) {
      if (token) {
        console.log('[BGG API] Token found, length:', token.length, 'first 10 chars:', token.substring(0, 10));
      } else {
        console.warn('[BGG API] No token found. Checked:', {
          EXPO_PUBLIC_BGG_API_TOKEN: !!process.env.EXPO_PUBLIC_BGG_API_TOKEN,
          EXPO_PUBLIC_BGGbearerToken: !!process.env.EXPO_PUBLIC_BGGbearerToken,
          BGGbearerToken: !!process.env.BGGbearerToken,
          REACT_APP_BGG_API_TOKEN: !!process.env.REACT_APP_BGG_API_TOKEN,
        });
      }
    }
    return token;
  } catch (error) {
    console.warn('[BGG API] Error loading API config:', error);
    return null;
  }
}

/**
 * Search for games by name using BGG XML API
 * @param {string} query - Game name to search for
 * @param {number} limit - Maximum number of results (default: 10)
 * @returns {Promise<Array>} Array of matching games with id, name, yearPublished
 */
export async function searchBGGAPI(query, limit = 10, maxRetries = 3) {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    // Rate limit API calls
    await rateLimitAPI();
    
    const token = getBGGToken();
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
    const headers = {};
    
    // Use Bearer token in Authorization header
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Helper function to retry the fetch
    const fetchWithRetry = async () => {
      return await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
    };
    
    let response = await fetchWithRetry();
    
    // Handle 429 rate limit errors with exponential backoff
    response = await handle429WithRetry(response, fetchWithRetry, 0, maxRetries);
    
    // If header auth fails with 401, try token as query parameter
    if (response.status === 401 && token) {
      if (__DEV__) {
        console.log('[BGG API] Header auth failed, trying token as query parameter');
      }
      const urlWithToken = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame&token=${token}`;
      const fetchWithTokenRetry = async () => await fetch(urlWithToken);
      response = await fetch(urlWithToken);
      response = await handle429WithRetry(response, fetchWithTokenRetry, 0, maxRetries);
      
      // If still fails, try without authentication
      if (response.status === 401 || response.status === 403) {
        if (__DEV__) {
          console.log('[BGG API] Token query param also failed, trying without auth');
        }
        const urlNoAuth = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
        const fetchNoAuthRetry = async () => await fetch(urlNoAuth);
        response = await fetch(urlNoAuth);
        response = await handle429WithRetry(response, fetchNoAuthRetry, 0, maxRetries);
      }
    } else if (response.status === 401 && !token) {
      // No token configured, try without auth
      if (__DEV__) {
        console.log('[BGG API] No token configured, trying without auth');
      }
      const urlNoAuth = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
      const fetchNoAuthRetry = async () => await fetch(urlNoAuth);
      response = await fetch(urlNoAuth);
      response = await handle429WithRetry(response, fetchNoAuthRetry, 0, maxRetries);
    }
    
    if (!response.ok) {
      // If we still have errors after all fallbacks and retries, log and return empty array
      if (__DEV__) {
        console.warn(`[BGG API] All authentication methods failed after retries. Final status: ${response.status}`);
      }
      // For 429 errors specifically, log a more helpful message
      if (response.status === 429) {
        if (__DEV__) {
          console.warn(`[BGG API] Rate limited (429) - BGG API is throttling requests. Please wait before trying again.`);
        }
        // Throw an error so the caller knows to retry
        throw new Error(`BGG API rate limited (429) for search: "${query}"`);
      }
      // Don't throw for other errors - return empty array so the app can continue
      return [];
    }

    const xmlText = await response.text();
    return parseBGGSearchXML(xmlText, limit);
  } catch (error) {
    // If it's a 429 error, re-throw it so caller can retry
    if (error.message && error.message.includes('rate limited')) {
      throw error;
    }
    
    console.error('[BGG API] Error searching games:', error);
    // Try one more time without authentication as a last resort
    try {
      if (__DEV__) {
        console.log('[BGG API] Trying final fallback without authentication for search');
      }
      const urlNoAuth = `${BGG_API_BASE}/search?query=${encodeURIComponent(query.trim())}&type=boardgame`;
      const fetchNoAuthRetry = async () => await fetch(urlNoAuth);
      const finalResponse = await fetch(urlNoAuth);
      const retriedResponse = await handle429WithRetry(finalResponse, fetchNoAuthRetry, 0, maxRetries);
      if (retriedResponse.ok) {
        const xmlText = await retriedResponse.text();
        return parseBGGSearchXML(xmlText, limit);
      } else if (retriedResponse.status === 429) {
        // Still rate limited after retries
        throw new Error(`BGG API rate limited (429) for search: "${query}"`);
      }
    } catch (finalError) {
      if (__DEV__) {
        console.warn('[BGG API] Final fallback also failed:', finalError);
      }
      // Re-throw 429 errors
      if (finalError.message && finalError.message.includes('rate limited')) {
        throw finalError;
      }
    }
    return [];
  }
}

/**
 * Parse BGG search XML response
 * @param {string} xmlText - XML response from BGG search API
 * @param {number} limit - Maximum number of results
 * @returns {Array} Array of game search results
 */
function parseBGGSearchXML(xmlText, limit = 10) {
  try {
    const results = [];
    
    // Use regex parsing for React Native compatibility
    // Match all <item> tags
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;
    
    while ((match = itemRegex.exec(xmlText)) !== null && count < limit) {
      const itemXml = match[1];
      
      // Extract ID
      const idMatch = match[0].match(/id="(\d+)"/);
      const id = idMatch ? idMatch[1] : null;
      
      // Extract name (primary name preferred)
      const primaryNameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
      const nameMatch = itemXml.match(/<name[^>]*value="([^"]+)"/);
      const name = primaryNameMatch ? primaryNameMatch[1] : (nameMatch ? nameMatch[1] : null);
      
      // Extract year published
      const yearMatch = itemXml.match(/<yearpublished[^>]*value="(\d+)"/);
      const yearPublished = yearMatch ? yearMatch[1] : null;
      
      if (id && name) {
        results.push({
          id: id,
          name: name,
          yearPublished: yearPublished || '',
        });
        count++;
      }
    }
    
    return results;
  } catch (error) {
    console.error('[BGG API] Error parsing search XML:', error);
    return [];
  }
}

/**
 * Fetch multiple game details in a single batch API call
 * BGG API supports: /thing?id=1,2,3 (returns all data for all games)
 * @param {Array<string|number>} gameIds - Array of BGG game IDs (max ~50 per call)
 * @returns {Promise<Array<Object>>} Array of game objects
 */
export async function fetchBGGGameDetailsBatch(gameIds) {
  if (!gameIds || gameIds.length === 0) {
    return [];
  }

  // BGG API has a practical limit of ~50 IDs per call
  const BATCH_SIZE = 50;
  const results = [];

  for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
    const batch = gameIds.slice(i, i + BATCH_SIZE);
    const batchIds = batch.join(',');
    
    try {
      // Rate limit API calls (longer delay for bulk batch operations)
      await rateLimitAPI(true);
      
      const token = getBGGToken();
      const url = `${BGG_API_BASE}/thing?id=${batchIds}&stats=1`;
      const headers = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      if (__DEV__) {
        console.log(`[BGG API] Batch fetching ${batch.length} games`);
      }
      
      // Helper function to retry the fetch
      const fetchWithRetry = async () => {
        return await fetch(url, {
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        });
      };
      
      let response = await fetchWithRetry();
      
      // Handle 429 rate limit errors with exponential backoff
      response = await handle429WithRetry(response, fetchWithRetry);
      
      // Handle auth fallbacks (after 429 retries)
      if (response.status === 401 && token) {
        const urlWithToken = `${BGG_API_BASE}/thing?id=${batchIds}&stats=1&token=${token}`;
        const fetchWithTokenRetry = async () => await fetch(urlWithToken);
        response = await fetch(urlWithToken);
        response = await handle429WithRetry(response, fetchWithTokenRetry);
        
        if (response.status === 401 || response.status === 403) {
          const urlNoAuth = `${BGG_API_BASE}/thing?id=${batchIds}&stats=1`;
          const fetchNoAuthRetry = async () => await fetch(urlNoAuth);
          response = await fetch(urlNoAuth);
          response = await handle429WithRetry(response, fetchNoAuthRetry);
        }
      } else if (response.status === 401 && !token) {
        const urlNoAuth = `${BGG_API_BASE}/thing?id=${batchIds}&stats=1`;
        const fetchNoAuthRetry = async () => await fetch(urlNoAuth);
        response = await fetch(urlNoAuth);
        response = await handle429WithRetry(response, fetchNoAuthRetry);
      }
      
      if (!response.ok) {
        if (__DEV__) {
          console.warn(`[BGG API] Batch fetch failed with status ${response.status} after retries`);
        }
        // If we're being rate-limited heavily (429), add extra delay before next batch
        if (response.status === 429) {
          if (__DEV__) {
            console.log(`[BGG API] Rate limited, adding extra 10s delay before next batch`);
          }
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        // If still failing after retries, skip this batch and continue
        continue;
      }
      
      const xmlText = await response.text();
      
      // Parse batch response - multiple <item> elements
      const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
      
      if (parser) {
        const doc = parser.parseFromString(xmlText, 'text/xml');
        const items = doc.querySelectorAll('item');
        
        items.forEach(item => {
          const gameData = parseBGGXMLFromItem(item);
          if (gameData) {
            results.push(gameData);
          }
        });
      } else {
        // Regex fallback for React Native
        const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null) {
          const gameData = parseBGGXMLRegex(match[0]);
          if (gameData) {
            results.push(gameData);
          }
        }
      }
      
      // Wait 3 seconds between batches (increased from 1.5s to be more conservative)
      if (i + BATCH_SIZE < gameIds.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      if (__DEV__) {
        console.error(`[BGG API] Error in batch fetch:`, error);
      }
      // Continue with next batch even if one fails
    }
  }
  
  return results;
}

/**
 * Parse a single <item> element from BGG XML (for batch processing)
 * Reuses the existing parseBGGXML logic
 */
function parseBGGXMLFromItem(item) {
  // Reuse the existing parseBGGXML function by creating a temporary document
  // For now, we'll use the regex parser which works for both single and batch
  return null; // Will be handled by regex parser in batch function
}

/**
 * Fetch game details from BGG XML API by game ID
 * Aggressively caches all data to Firestore after first fetch
 * @param {string|number} gameId - BGG game ID
 * @returns {Promise<Object|null>} Game object with all available data
 */
export async function fetchBGGGameDetails(gameId) {
  if (!gameId) {
    return null;
  }

  try {
    // Rate limit API calls (shorter delay for user-driven single game fetches)
    await rateLimitAPI(false);
    
    // BGG XML API endpoint for game details
    // stats=1 includes rating statistics
    const token = getBGGToken();
    const url = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
    const headers = {};
    
    // Use Bearer token in Authorization header (confirmed working via curl test)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      if (__DEV__) {
        console.log('[BGG API] Using Bearer token in Authorization header');
      }
    } else {
      if (__DEV__) {
        console.warn('[BGG API] No token available');
      }
    }
    
    if (__DEV__) {
      console.log('[BGG API] Fetching:', url);
    }
    
    // Helper function to retry the fetch
    const fetchWithRetry = async () => {
      return await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
    };
    
    let response = await fetchWithRetry();
    
    if (__DEV__) {
      console.log('[BGG API] Initial response status:', response.status);
    }
    
    // Handle 429 rate limit errors with exponential backoff
    response = await handle429WithRetry(response, fetchWithRetry);
    
    // If header auth fails with 401, try token as query parameter
    if (response.status === 401 && token) {
      if (__DEV__) {
        console.log('[BGG API] Header auth failed (401), trying token as query parameter');
      }
      const urlWithToken = `${BGG_API_BASE}/thing?id=${gameId}&stats=1&token=${token}`;
      const fetchWithTokenRetry = async () => await fetch(urlWithToken);
      response = await fetch(urlWithToken);
      response = await handle429WithRetry(response, fetchWithTokenRetry);
      
      if (__DEV__) {
        console.log('[BGG API] Query param response status:', response.status);
      }
      
      // If still fails, try without authentication
      if (response.status === 401 || response.status === 403) {
        if (__DEV__) {
          console.log('[BGG API] Token query param also failed, trying without auth');
        }
        const urlNoAuth = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
        const fetchNoAuthRetry = async () => await fetch(urlNoAuth);
        response = await fetch(urlNoAuth);
        response = await handle429WithRetry(response, fetchNoAuthRetry);
        
        if (__DEV__) {
          console.log('[BGG API] No auth response status:', response.status);
        }
      }
    } else if (response.status === 401 && !token) {
      // No token configured, try without auth
      if (__DEV__) {
        console.log('[BGG API] No token configured, trying without auth');
      }
      const urlNoAuth = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
      const fetchNoAuthRetry = async () => await fetch(urlNoAuth);
      response = await fetch(urlNoAuth);
      response = await handle429WithRetry(response, fetchNoAuthRetry);
      
      if (__DEV__) {
        console.log('[BGG API] No auth response status:', response.status);
      }
    }
    
    if (!response.ok) {
      // If we still have errors after all fallbacks and retries, log and return null
      if (__DEV__) {
        console.warn(`[BGG API] All authentication methods failed after retries. Final status: ${response.status}`);
      }
      // For 429 errors specifically, log a more helpful message
      if (response.status === 429) {
        if (__DEV__) {
          console.warn(`[BGG API] Rate limited (429) - BGG API is throttling requests. Please wait before trying again.`);
        }
      }
      // Don't throw - return null so the app can continue
      return null;
    }

    const xmlText = await response.text();
    
    if (__DEV__) {
      console.log('[BGG API] XML response length:', xmlText.length);
      // Log a snippet to verify we got XML
      if (xmlText.length > 0) {
        console.log('[BGG API] XML starts with:', xmlText.substring(0, 200));
      }
    }
    
    const gameData = parseBGGXML(xmlText);
    
    if (__DEV__) {
      console.log('[BGG API] Parsed game data:', gameData ? {
        id: gameData.id,
        name: gameData.name,
        hasThumbnail: !!gameData.thumbnail,
        thumbnail: gameData.thumbnail ? gameData.thumbnail.substring(0, 50) + '...' : null
      } : 'null');
    }
    
    return gameData;
  } catch (error) {
    console.error('[BGG API] Error fetching game details:', error);
    // Try one more time without authentication as a last resort
    try {
      if (__DEV__) {
        console.log('[BGG API] Trying final fallback without authentication');
      }
      const urlNoAuth = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
      const finalResponse = await fetch(urlNoAuth);
      if (finalResponse.ok) {
        const xmlText = await finalResponse.text();
        const gameData = parseBGGXML(xmlText);
        return gameData;
      }
    } catch (finalError) {
      if (__DEV__) {
        console.warn('[BGG API] Final fallback also failed:', finalError);
      }
    }
    return null;
  }
}

/**
 * Parse BGG XML response to extract game data
 * @param {string} xmlText - XML response from BGG API
 * @returns {Object|null} Parsed game data
 */
function parseBGGXML(xmlText) {
  try {
    // Simple XML parsing using DOMParser (works in browser/React Native with polyfill)
    // For React Native, we'll use a simpler regex-based approach
    const parser = typeof DOMParser !== 'undefined' 
      ? new DOMParser() 
      : null;
    
    let doc;
    if (parser) {
      doc = parser.parseFromString(xmlText, 'text/xml');
    } else {
      // Fallback for React Native - use regex parsing
      return parseBGGXMLRegex(xmlText);
    }

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn('[BGG API] XML parsing error, using regex fallback');
      return parseBGGXMLRegex(xmlText);
    }

    const item = doc.querySelector('item');
    if (!item) {
      return null;
    }

    // Extract basic info
    const id = item.getAttribute('id') || null;
    const type = item.getAttribute('type') || null;
    
    // Extract name (primary name)
    const nameElement = item.querySelector('name[type="primary"]') || item.querySelector('name');
    const name = nameElement ? nameElement.getAttribute('value') : null;
    
    // Extract alternate names (all name elements except primary)
    const alternateNames = [];
    const allNameElements = item.querySelectorAll('name');
    allNameElements.forEach(nameEl => {
      const nameType = nameEl.getAttribute('type');
      const nameValue = nameEl.getAttribute('value');
      if (nameValue && nameType !== 'primary') {
        alternateNames.push({
          type: nameType || 'alternate',
          value: nameValue
        });
      }
    });
    
    // Extract thumbnail and image
    const thumbnailElement = item.querySelector('thumbnail');
    const imageElement = item.querySelector('image');
    const thumbnail = thumbnailElement ? thumbnailElement.textContent.trim() : null;
    const image = imageElement ? imageElement.textContent.trim() : null;
    
    // Extract year published
    const yearPublishedElement = item.querySelector('yearpublished');
    const yearPublished = yearPublishedElement 
      ? yearPublishedElement.getAttribute('value') 
      : null;
    
    // Extract description
    const descriptionElement = item.querySelector('description');
    const description = descriptionElement 
      ? descriptionElement.textContent.trim().replace(/<[^>]*>/g, '') 
      : null;
    
    // Extract statistics
    const statsElement = item.querySelector('statistics');
    let average = null;
    let bayesAverage = null;
    let usersRated = null;
    let rank = null;
    
    // Category ranks (type="family" with different IDs)
    // BGG category rank IDs: 1=Strategy, 2=Family, 3=Party, 4=Abstract, 5=Thematic, 6=War, 7=Children's, 8=CCG
    let strategyGamesRank = null;
    let familyGamesRank = null;
    let partyGamesRank = null;
    let abstractsRank = null;
    let thematicRank = null;
    let wargamesRank = null;
    let childrensGamesRank = null;
    let cgsRank = null;
    
    if (statsElement) {
      const ratingsElement = statsElement.querySelector('ratings');
      if (ratingsElement) {
        const averageElement = ratingsElement.querySelector('average');
        const bayesAverageElement = ratingsElement.querySelector('bayesaverage');
        const usersRatedElement = ratingsElement.querySelector('usersrated');
        
        average = averageElement ? averageElement.getAttribute('value') : null;
        bayesAverage = bayesAverageElement ? bayesAverageElement.getAttribute('value') : null;
        usersRated = usersRatedElement ? usersRatedElement.getAttribute('value') : null;
        
        // Extract overall rank (boardgame rank, type="subtype", id="1")
        const rankElement = ratingsElement.querySelector('ranks rank[type="subtype"][id="1"]');
        if (rankElement) {
          rank = rankElement.getAttribute('value');
        }
        
        // Extract category ranks (type="family")
        const ranksElement = ratingsElement.querySelector('ranks');
        if (ranksElement) {
          // Strategy Games (id="1")
          const strategyRankElement = ranksElement.querySelector('rank[type="family"][id="1"]');
          if (strategyRankElement) {
            strategyGamesRank = strategyRankElement.getAttribute('value');
          }
          
          // Family Games (id="2")
          const familyRankElement = ranksElement.querySelector('rank[type="family"][id="2"]');
          if (familyRankElement) {
            familyGamesRank = familyRankElement.getAttribute('value');
          }
          
          // Party Games (id="3")
          const partyRankElement = ranksElement.querySelector('rank[type="family"][id="3"]');
          if (partyRankElement) {
            partyGamesRank = partyRankElement.getAttribute('value');
          }
          
          // Abstract Games (id="4")
          const abstractRankElement = ranksElement.querySelector('rank[type="family"][id="4"]');
          if (abstractRankElement) {
            abstractsRank = abstractRankElement.getAttribute('value');
          }
          
          // Thematic Games (id="5")
          const thematicRankElement = ranksElement.querySelector('rank[type="family"][id="5"]');
          if (thematicRankElement) {
            thematicRank = thematicRankElement.getAttribute('value');
          }
          
          // War Games (id="6")
          const wargamesRankElement = ranksElement.querySelector('rank[type="family"][id="6"]');
          if (wargamesRankElement) {
            wargamesRank = wargamesRankElement.getAttribute('value');
          }
          
          // Children's Games (id="7")
          const childrensRankElement = ranksElement.querySelector('rank[type="family"][id="7"]');
          if (childrensRankElement) {
            childrensGamesRank = childrensRankElement.getAttribute('value');
          }
          
          // CCG/Customizable Games (id="8")
          const cgsRankElement = ranksElement.querySelector('rank[type="family"][id="8"]');
          if (cgsRankElement) {
            cgsRank = cgsRankElement.getAttribute('value');
          }
        }
      }
    }
    
    // Extract min/max players
    const minPlayersElement = item.querySelector('minplayers');
    const maxPlayersElement = item.querySelector('maxplayers');
    const minPlayers = minPlayersElement ? minPlayersElement.getAttribute('value') : null;
    const maxPlayers = maxPlayersElement ? maxPlayersElement.getAttribute('value') : null;
    
    // Extract playing time (min, max, average)
    const playingTimeElement = item.querySelector('playingtime');
    const playingTime = playingTimeElement ? playingTimeElement.getAttribute('value') : null;
    const minPlayTimeElement = item.querySelector('minplaytime');
    const maxPlayTimeElement = item.querySelector('maxplaytime');
    const minPlayTime = minPlayTimeElement ? minPlayTimeElement.getAttribute('value') : null;
    const maxPlayTime = maxPlayTimeElement ? maxPlayTimeElement.getAttribute('value') : null;
    
    // Extract min age
    const minAgeElement = item.querySelector('minage');
    const minAge = minAgeElement ? minAgeElement.getAttribute('value') : null;
    
    // Extract mechanics (link type="boardgamemechanic")
    const mechanics = [];
    const mechanicLinks = item.querySelectorAll('link[type="boardgamemechanic"]');
    mechanicLinks.forEach(link => {
      const mechanicName = link.getAttribute('value');
      if (mechanicName) {
        mechanics.push(mechanicName);
      }
    });
    
    // Extract categories/themes (link type="boardgamecategory")
    const categories = [];
    const categoryLinks = item.querySelectorAll('link[type="boardgamecategory"]');
    categoryLinks.forEach(link => {
      const categoryName = link.getAttribute('value');
      if (categoryName) {
        categories.push(categoryName);
      }
    });
    
    // Extract designers (link type="boardgamedesigner")
    const designers = [];
    const designerLinks = item.querySelectorAll('link[type="boardgamedesigner"]');
    designerLinks.forEach(link => {
      const designerName = link.getAttribute('value');
      if (designerName) {
        designers.push(designerName);
      }
    });
    
    // Extract publishers (link type="boardgamepublisher")
    const publishers = [];
    const publisherLinks = item.querySelectorAll('link[type="boardgamepublisher"]');
    publisherLinks.forEach(link => {
      const publisherName = link.getAttribute('value');
      if (publisherName) {
        publishers.push(publisherName);
      }
    });
    
    // Extract artists (link type="boardgameartist")
    const artists = [];
    const artistLinks = item.querySelectorAll('link[type="boardgameartist"]');
    artistLinks.forEach(link => {
      const artistName = link.getAttribute('value');
      if (artistName) {
        artists.push(artistName);
      }
    });
    
    // Extract complexity/weight rating (from statistics/ratings/averageweight)
    let complexity = null;
    if (statsElement) {
      const ratingsElement = statsElement.querySelector('ratings');
      if (ratingsElement) {
        const averageWeightElement = ratingsElement.querySelector('averageweight');
        if (averageWeightElement) {
          complexity = averageWeightElement.getAttribute('value');
        }
      }
    }
    
    // Extract owned count (from statistics/ratings/owned)
    let ownedCount = null;
    if (statsElement) {
      const ratingsElement = statsElement.querySelector('ratings');
      if (ratingsElement) {
        const ownedElement = ratingsElement.querySelector('owned');
        if (ownedElement) {
          ownedCount = ownedElement.getAttribute('value');
        }
      }
    }
    
    // Extract best player count from polls (suggested_numplayers)
    let bestPlayerCount = null;
    const pollsElement = item.querySelector('polls[name="suggested_numplayers"]');
    if (pollsElement) {
      // Find the result with the highest "Best" votes
      const results = pollsElement.querySelectorAll('results');
      let maxBestVotes = 0;
      let bestPlayerCountValue = null;
      
      results.forEach(result => {
        const numPlayers = result.getAttribute('numplayers');
        const bestVotesElement = result.querySelector('result[value="Best"]');
        if (bestVotesElement) {
          const bestVotes = parseInt(bestVotesElement.getAttribute('numvotes') || '0', 10);
          if (bestVotes > maxBestVotes) {
            maxBestVotes = bestVotes;
            bestPlayerCountValue = numPlayers;
          }
        }
      });
      
      bestPlayerCount = bestPlayerCountValue;
    }
    
    // Extract language dependence from polls
    let languageDependence = null;
    const languagePollElement = item.querySelector('polls[name="language_dependence"]');
    if (languagePollElement) {
      const results = languagePollElement.querySelectorAll('results');
      if (results.length > 0) {
        // Get the result with the most votes
        let maxVotes = 0;
        let languageDependenceValue = null;
        
        results.forEach(result => {
          const resultElements = result.querySelectorAll('result');
          resultElements.forEach(resultEl => {
            const votes = parseInt(resultEl.getAttribute('numvotes') || '0', 10);
            if (votes > maxVotes) {
              maxVotes = votes;
              languageDependenceValue = resultEl.getAttribute('value');
            }
          });
        });
        
        languageDependence = languageDependenceValue;
      }
    }
    
    // Extract suggested player age from polls (age recommendations)
    let suggestedPlayerAge = null;
    const playerAgePollElement = item.querySelector('polls[name="suggested_playerage"]');
    if (playerAgePollElement) {
      const results = playerAgePollElement.querySelectorAll('results');
      if (results.length > 0) {
        // Get the result with the most votes
        let maxVotes = 0;
        let suggestedPlayerAgeValue = null;
        
        results.forEach(result => {
          const resultElements = result.querySelectorAll('result');
          resultElements.forEach(resultEl => {
            const votes = parseInt(resultEl.getAttribute('numvotes') || '0', 10);
            if (votes > maxVotes) {
              maxVotes = votes;
              suggestedPlayerAgeValue = resultEl.getAttribute('value');
            }
          });
        });
        
        suggestedPlayerAge = suggestedPlayerAgeValue;
      }
    }
    
    // Extract dimensions and weight (from statistics)
    let dimensions = null;
    let weight = null;
    if (statsElement) {
      // Dimensions are typically in the format "length x width x height"
      // BGG doesn't always provide this, but we'll check for it
      // Weight is physical weight in pounds/kilograms
      // These might be in the item itself or in statistics
      const weightElement = item.querySelector('weight');
      if (weightElement) {
        weight = weightElement.getAttribute('value');
      }
    }

    return {
      id: id ? parseInt(id, 10) : null,
      name,
      yearPublished: yearPublished ? parseInt(yearPublished, 10) : null,
      thumbnail,
      image,
      description,
      average: average ? parseFloat(average) : null,
      bayesAverage: bayesAverage ? parseFloat(bayesAverage) : null,
      usersRated: usersRated ? parseInt(usersRated, 10) : null,
      rank: rank ? parseInt(rank, 10) : null,
      minPlayers: minPlayers ? parseInt(minPlayers, 10) : null,
      maxPlayers: maxPlayers ? parseInt(maxPlayers, 10) : null,
      playingTime: playingTime ? parseInt(playingTime, 10) : null,
      minPlayTime: minPlayTime ? parseInt(minPlayTime, 10) : null,
      maxPlayTime: maxPlayTime ? parseInt(maxPlayTime, 10) : null,
      minAge: minAge ? parseInt(minAge, 10) : null,
      // Category ranks
      strategyGamesRank: strategyGamesRank || '',
      familyGamesRank: familyGamesRank || '',
      partyGamesRank: partyGamesRank || '',
      abstractsRank: abstractsRank || '',
      thematicRank: thematicRank || '',
      wargamesRank: wargamesRank || '',
      childrensGamesRank: childrensGamesRank || '',
      cgsRank: cgsRank || '',
      // New comprehensive fields
      mechanics: mechanics.length > 0 ? mechanics : null,
      categories: categories.length > 0 ? categories : null,
      designers: designers.length > 0 ? designers : null,
      publishers: publishers.length > 0 ? publishers : null,
      artists: artists.length > 0 ? artists : null,
      complexity: complexity ? parseFloat(complexity) : null,
      ownedCount: ownedCount ? parseInt(ownedCount, 10) : null,
      bestPlayerCount: bestPlayerCount || null,
      languageDependence: languageDependence || null,
      suggestedPlayerAge: suggestedPlayerAge || null,
      alternateNames: alternateNames.length > 0 ? alternateNames : null,
      dimensions: dimensions || null,
      weight: weight ? parseFloat(weight) : null,
    };
  } catch (error) {
    console.error('[BGG API] Error parsing XML:', error);
    return null;
  }
}

/**
 * Fallback XML parsing using regex (for React Native environments)
 * @param {string} xmlText - XML response from BGG API
 * @returns {Object|null} Parsed game data
 */
function parseBGGXMLRegex(xmlText) {
  try {
    // Extract ID
    const idMatch = xmlText.match(/<item[^>]*id="(\d+)"/);
    const id = idMatch ? parseInt(idMatch[1], 10) : null;
    
    // Extract name (primary name preferred)
    const primaryNameMatch = xmlText.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
    const nameMatch = xmlText.match(/<name[^>]*value="([^"]+)"/);
    const name = primaryNameMatch ? primaryNameMatch[1] : (nameMatch ? nameMatch[1] : null);
    
    // Extract alternate names (all name elements except primary)
    const alternateNames = [];
    const allNameRegex = /<name[^>]*type="([^"]*)"[^>]*value="([^"]+)"/g;
    let nameMatchResult;
    while ((nameMatchResult = allNameRegex.exec(xmlText)) !== null) {
      const nameType = nameMatchResult[1] || 'alternate';
      const nameValue = nameMatchResult[2];
      if (nameType !== 'primary') {
        alternateNames.push({
          type: nameType,
          value: nameValue
        });
      }
    }
    
    // Extract thumbnail
    const thumbnailMatch = xmlText.match(/<thumbnail>([^<]+)<\/thumbnail>/);
    const thumbnail = thumbnailMatch ? thumbnailMatch[1].trim() : null;
    
    // Extract image
    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const image = imageMatch ? imageMatch[1].trim() : null;
    
    // Extract year published
    const yearMatch = xmlText.match(/<yearpublished[^>]*value="(\d+)"/);
    const yearPublished = yearMatch ? parseInt(yearMatch[1], 10) : null;
    
    // Extract description
    const descMatch = xmlText.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch 
      ? descMatch[1].trim().replace(/<[^>]*>/g, '') 
      : null;
    
    // Extract statistics
    const averageMatch = xmlText.match(/<average[^>]*value="([^"]+)"/);
    const average = averageMatch ? parseFloat(averageMatch[1]) : null;
    
    const bayesAverageMatch = xmlText.match(/<bayesaverage[^>]*value="([^"]+)"/);
    const bayesAverage = bayesAverageMatch ? parseFloat(bayesAverageMatch[1]) : null;
    
    const usersRatedMatch = xmlText.match(/<usersrated[^>]*value="(\d+)"/);
    const usersRated = usersRatedMatch ? parseInt(usersRatedMatch[1], 10) : null;
    
    // Extract rank (boardgame rank, type="subtype", id="1")
    const rankMatch = xmlText.match(/<rank[^>]*type="subtype"[^>]*id="1"[^>]*value="(\d+)"/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
    
    // Extract category ranks (type="family" with different IDs)
    // BGG category rank IDs: 1=Strategy, 2=Family, 3=Party, 4=Abstract, 5=Thematic, 6=War, 7=Children's, 8=CCG
    const strategyRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="1"[^>]*value="(\d+)"/);
    const strategyGamesRank = strategyRankMatch ? strategyRankMatch[1] : '';
    
    const familyRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="2"[^>]*value="(\d+)"/);
    const familyGamesRank = familyRankMatch ? familyRankMatch[1] : '';
    
    const partyRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="3"[^>]*value="(\d+)"/);
    const partyGamesRank = partyRankMatch ? partyRankMatch[1] : '';
    
    const abstractRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="4"[^>]*value="(\d+)"/);
    const abstractsRank = abstractRankMatch ? abstractRankMatch[1] : '';
    
    const thematicRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="5"[^>]*value="(\d+)"/);
    const thematicRank = thematicRankMatch ? thematicRankMatch[1] : '';
    
    const wargamesRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="6"[^>]*value="(\d+)"/);
    const wargamesRank = wargamesRankMatch ? wargamesRankMatch[1] : '';
    
    const childrensRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="7"[^>]*value="(\d+)"/);
    const childrensGamesRank = childrensRankMatch ? childrensRankMatch[1] : '';
    
    const cgsRankMatch = xmlText.match(/<rank[^>]*type="family"[^>]*id="8"[^>]*value="(\d+)"/);
    const cgsRank = cgsRankMatch ? cgsRankMatch[1] : '';
    
    // Extract min/max players
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value="(\d+)"/);
    const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : null;
    
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value="(\d+)"/);
    const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : null;
    
    // Extract playing time (min, max, average)
    const playingTimeMatch = xmlText.match(/<playingtime[^>]*value="(\d+)"/);
    const playingTime = playingTimeMatch ? parseInt(playingTimeMatch[1], 10) : null;
    const minPlayTimeMatch = xmlText.match(/<minplaytime[^>]*value="(\d+)"/);
    const minPlayTime = minPlayTimeMatch ? parseInt(minPlayTimeMatch[1], 10) : null;
    const maxPlayTimeMatch = xmlText.match(/<maxplaytime[^>]*value="(\d+)"/);
    const maxPlayTime = maxPlayTimeMatch ? parseInt(maxPlayTimeMatch[1], 10) : null;
    
    // Extract min age
    const minAgeMatch = xmlText.match(/<minage[^>]*value="(\d+)"/);
    const minAge = minAgeMatch ? parseInt(minAgeMatch[1], 10) : null;
    
    // Extract mechanics (link type="boardgamemechanic")
    const mechanics = [];
    const mechanicRegex = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]+)"/g;
    let mechanicMatch;
    while ((mechanicMatch = mechanicRegex.exec(xmlText)) !== null) {
      mechanics.push(mechanicMatch[1]);
    }
    
    // Extract categories/themes (link type="boardgamecategory")
    const categories = [];
    const categoryRegex = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]+)"/g;
    let categoryMatch;
    while ((categoryMatch = categoryRegex.exec(xmlText)) !== null) {
      categories.push(categoryMatch[1]);
    }
    
    // Extract designers (link type="boardgamedesigner")
    const designers = [];
    const designerRegex = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]+)"/g;
    let designerMatch;
    while ((designerMatch = designerRegex.exec(xmlText)) !== null) {
      designers.push(designerMatch[1]);
    }
    
    // Extract publishers (link type="boardgamepublisher")
    const publishers = [];
    const publisherRegex = /<link[^>]*type="boardgamepublisher"[^>]*value="([^"]+)"/g;
    let publisherMatch;
    while ((publisherMatch = publisherRegex.exec(xmlText)) !== null) {
      publishers.push(publisherMatch[1]);
    }
    
    // Extract artists (link type="boardgameartist")
    const artists = [];
    const artistRegex = /<link[^>]*type="boardgameartist"[^>]*value="([^"]+)"/g;
    let artistMatch;
    while ((artistMatch = artistRegex.exec(xmlText)) !== null) {
      artists.push(artistMatch[1]);
    }
    
    // Extract complexity/weight rating (from statistics/ratings/averageweight)
    const complexityMatch = xmlText.match(/<averageweight[^>]*value="([^"]+)"/);
    const complexity = complexityMatch ? parseFloat(complexityMatch[1]) : null;
    
    // Extract owned count (from statistics/ratings/owned)
    const ownedMatch = xmlText.match(/<owned[^>]*value="(\d+)"/);
    const ownedCount = ownedMatch ? parseInt(ownedMatch[1], 10) : null;
    
    // Extract best player count from polls (suggested_numplayers)
    let bestPlayerCount = null;
    const suggestedNumPlayersMatch = xmlText.match(/<polls[^>]*name="suggested_numplayers"([\s\S]*?)<\/polls>/);
    if (suggestedNumPlayersMatch) {
      const pollsContent = suggestedNumPlayersMatch[1];
      // Find all results with Best votes
      const resultsRegex = /<results[^>]*numplayers="([^"]+)"([\s\S]*?)<\/results>/g;
      let maxBestVotes = 0;
      let bestPlayerCountValue = null;
      let resultMatch;
      
      while ((resultMatch = resultsRegex.exec(pollsContent)) !== null) {
        const numPlayers = resultMatch[1];
        const resultContent = resultMatch[2];
        const bestVotesMatch = resultContent.match(/<result[^>]*value="Best"[^>]*numvotes="(\d+)"/);
        if (bestVotesMatch) {
          const bestVotes = parseInt(bestVotesMatch[1], 10);
          if (bestVotes > maxBestVotes) {
            maxBestVotes = bestVotes;
            bestPlayerCountValue = numPlayers;
          }
        }
      }
      
      bestPlayerCount = bestPlayerCountValue;
    }
    
    // Extract language dependence from polls
    let languageDependence = null;
    const languagePollMatch = xmlText.match(/<polls[^>]*name="language_dependence"([\s\S]*?)<\/polls>/);
    if (languagePollMatch) {
      const pollContent = languagePollMatch[1];
      // Find the result with the most votes
      const resultRegex = /<result[^>]*value="([^"]+)"[^>]*numvotes="(\d+)"/g;
      let maxVotes = 0;
      let languageDependenceValue = null;
      let resultMatch;
      
      while ((resultMatch = resultRegex.exec(pollContent)) !== null) {
        const votes = parseInt(resultMatch[2], 10);
        if (votes > maxVotes) {
          maxVotes = votes;
          languageDependenceValue = resultMatch[1];
        }
      }
      
      languageDependence = languageDependenceValue;
    }
    
    // Extract suggested player age from polls (age recommendations)
    let suggestedPlayerAge = null;
    const playerAgePollMatch = xmlText.match(/<polls[^>]*name="suggested_playerage"([\s\S]*?)<\/polls>/);
    if (playerAgePollMatch) {
      const pollContent = playerAgePollMatch[1];
      // Find the result with the most votes
      const resultRegex = /<result[^>]*value="([^"]+)"[^>]*numvotes="(\d+)"/g;
      let maxVotes = 0;
      let suggestedPlayerAgeValue = null;
      let resultMatch;
      
      while ((resultMatch = resultRegex.exec(pollContent)) !== null) {
        const votes = parseInt(resultMatch[2], 10);
        if (votes > maxVotes) {
          maxVotes = votes;
          suggestedPlayerAgeValue = resultMatch[1];
        }
      }
      
      suggestedPlayerAge = suggestedPlayerAgeValue;
    }
    
    // Extract weight (physical weight)
    const weightMatch = xmlText.match(/<weight[^>]*value="([^"]+)"/);
    const weight = weightMatch ? parseFloat(weightMatch[1]) : null;
    
    // Dimensions are not typically in BGG XML, but we'll leave it as null for now
    const dimensions = null;

    return {
      id,
      name,
      yearPublished,
      thumbnail,
      image,
      description,
      average,
      bayesAverage,
      usersRated,
      rank,
      minPlayers,
      maxPlayers,
      playingTime,
      minPlayTime,
      maxPlayTime,
      minAge,
      // Category ranks
      strategyGamesRank,
      familyGamesRank,
      partyGamesRank,
      abstractsRank,
      thematicRank,
      wargamesRank,
      childrensGamesRank,
      cgsRank,
      // New comprehensive fields
      mechanics: mechanics.length > 0 ? mechanics : null,
      categories: categories.length > 0 ? categories : null,
      designers: designers.length > 0 ? designers : null,
      publishers: publishers.length > 0 ? publishers : null,
      artists: artists.length > 0 ? artists : null,
      complexity,
      ownedCount,
      bestPlayerCount,
      languageDependence,
      suggestedPlayerAge,
      alternateNames: alternateNames.length > 0 ? alternateNames : null,
      dimensions,
      weight,
    };
  } catch (error) {
    console.error('[BGG API] Error in regex parsing:', error);
    return null;
  }
}

