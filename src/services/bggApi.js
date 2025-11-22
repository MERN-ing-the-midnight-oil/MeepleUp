/**
 * BGG XML API Service
 * Fetches game data including thumbnails from BoardGameGeek XML API
 * 
 * API Documentation: https://boardgamegeek.com/using_the_xml_api
 */

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

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
export async function searchBGGAPI(query, limit = 10) {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    const token = getBGGToken();
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
    const headers = {};
    
    // Use Bearer token in Authorization header
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    let response = await fetch(url, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    
    // If header auth fails with 401, try token as query parameter
    if (response.status === 401 && token) {
      if (__DEV__) {
        console.log('[BGG API] Header auth failed, trying token as query parameter');
      }
      const urlWithToken = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame&token=${token}`;
      response = await fetch(urlWithToken);
      
      // If still fails, try without authentication
      if (response.status === 401 || response.status === 403) {
        if (__DEV__) {
          console.log('[BGG API] Token query param also failed, trying without auth');
        }
        const urlNoAuth = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
        response = await fetch(urlNoAuth);
      }
    } else if (response.status === 401 && !token) {
      // No token configured, try without auth
      if (__DEV__) {
        console.log('[BGG API] No token configured, trying without auth');
      }
      const urlNoAuth = `${BGG_API_BASE}/search?query=${encodedQuery}&type=boardgame`;
      response = await fetch(urlNoAuth);
    }
    
    if (!response.ok) {
      // If we still have errors after all fallbacks, log and return empty array
      if (__DEV__) {
        console.warn(`[BGG API] All authentication methods failed. Final status: ${response.status}`);
      }
      // Don't throw - return empty array so the app can continue
      return [];
    }

    const xmlText = await response.text();
    return parseBGGSearchXML(xmlText, limit);
  } catch (error) {
    console.error('[BGG API] Error searching games:', error);
    // Try one more time without authentication as a last resort
    try {
      if (__DEV__) {
        console.log('[BGG API] Trying final fallback without authentication for search');
      }
      const urlNoAuth = `${BGG_API_BASE}/search?query=${encodeURIComponent(query.trim())}&type=boardgame`;
      const finalResponse = await fetch(urlNoAuth);
      if (finalResponse.ok) {
        const xmlText = await finalResponse.text();
        return parseBGGSearchXML(xmlText, limit);
      }
    } catch (finalError) {
      if (__DEV__) {
        console.warn('[BGG API] Final fallback also failed:', finalError);
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
 * Fetch game details from BGG XML API by game ID
 * @param {string|number} gameId - BGG game ID
 * @returns {Promise<Object|null>} Game object with thumbnail, image, and other details
 */
export async function fetchBGGGameDetails(gameId) {
  if (!gameId) {
    return null;
  }

  try {
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
    
    let response = await fetch(url, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    
    if (__DEV__) {
      console.log('[BGG API] Initial response status:', response.status);
    }
    
    // If header auth fails with 401, try token as query parameter
    if (response.status === 401 && token) {
      if (__DEV__) {
        console.log('[BGG API] Header auth failed (401), trying token as query parameter');
      }
      const urlWithToken = `${BGG_API_BASE}/thing?id=${gameId}&stats=1&token=${token}`;
      response = await fetch(urlWithToken);
      
      if (__DEV__) {
        console.log('[BGG API] Query param response status:', response.status);
      }
      
      // If still fails, try without authentication
      if (response.status === 401 || response.status === 403) {
        if (__DEV__) {
          console.log('[BGG API] Token query param also failed, trying without auth');
        }
        const urlNoAuth = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
        response = await fetch(urlNoAuth);
        
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
      response = await fetch(urlNoAuth);
      
      if (__DEV__) {
        console.log('[BGG API] No auth response status:', response.status);
      }
    }
    
    if (!response.ok) {
      // If we still have errors after all fallbacks, log and return null
      if (__DEV__) {
        console.warn(`[BGG API] All authentication methods failed. Final status: ${response.status}`);
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
    
    if (statsElement) {
      const ratingsElement = statsElement.querySelector('ratings');
      if (ratingsElement) {
        const averageElement = ratingsElement.querySelector('average');
        const bayesAverageElement = ratingsElement.querySelector('bayesaverage');
        const usersRatedElement = ratingsElement.querySelector('usersrated');
        
        average = averageElement ? averageElement.getAttribute('value') : null;
        bayesAverage = bayesAverageElement ? bayesAverageElement.getAttribute('value') : null;
        usersRated = usersRatedElement ? usersRatedElement.getAttribute('value') : null;
        
        // Extract rank
        const rankElement = ratingsElement.querySelector('ranks rank[type="subtype"][id="1"]');
        if (rankElement) {
          rank = rankElement.getAttribute('value');
        }
      }
    }
    
    // Extract min/max players
    const minPlayersElement = item.querySelector('minplayers');
    const maxPlayersElement = item.querySelector('maxplayers');
    const minPlayers = minPlayersElement ? minPlayersElement.getAttribute('value') : null;
    const maxPlayers = maxPlayersElement ? maxPlayersElement.getAttribute('value') : null;
    
    // Extract playing time
    const playingTimeElement = item.querySelector('playingtime');
    const playingTime = playingTimeElement ? playingTimeElement.getAttribute('value') : null;
    
    // Extract min age
    const minAgeElement = item.querySelector('minage');
    const minAge = minAgeElement ? minAgeElement.getAttribute('value') : null;

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
      minAge: minAge ? parseInt(minAge, 10) : null,
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
    
    // Extract rank (boardgame rank, id="1")
    const rankMatch = xmlText.match(/<rank[^>]*type="subtype"[^>]*id="1"[^>]*value="(\d+)"/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
    
    // Extract min/max players
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value="(\d+)"/);
    const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : null;
    
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value="(\d+)"/);
    const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : null;
    
    // Extract playing time
    const playingTimeMatch = xmlText.match(/<playingtime[^>]*value="(\d+)"/);
    const playingTime = playingTimeMatch ? parseInt(playingTimeMatch[1], 10) : null;
    
    // Extract min age
    const minAgeMatch = xmlText.match(/<minage[^>]*value="(\d+)"/);
    const minAge = minAgeMatch ? parseInt(minAgeMatch[1], 10) : null;

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
      minAge,
    };
  } catch (error) {
    console.error('[BGG API] Error in regex parsing:', error);
    return null;
  }
}

