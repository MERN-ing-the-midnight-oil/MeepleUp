#!/usr/bin/env node

/**
 * Test script for BGG Collection API
 * Tests fetching collection for user "Cryptic Colors"
 */

const https = require('https');

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

/**
 * Get BGG Bearer token from environment
 */
function getBGGToken() {
  return process.env.BGGbearerToken || 
         process.env.EXPO_PUBLIC_BGGbearerToken ||
         process.env.EXPO_PUBLIC_BGG_API_TOKEN ||
         process.env.REACT_APP_BGG_API_TOKEN ||
         null;
}

/**
 * Fetch BGG collection with retry logic for 202 responses
 */
async function fetchBGGCollection(username, options = {}) {
  const {
    own = 1,
    stats = 1,
    subtype = 'boardgame',
    maxRetries = 5,
    retryDelay = 2000,
  } = options;

  const params = new URLSearchParams({
    username: username,
    ...(own && { own: '1' }),
    ...(stats && { stats: '1' }),
    ...(subtype && { subtype }),
  });

  const url = `${BGG_API_BASE}/collection?${params.toString()}`;
  const token = getBGGToken();
  
  console.log(`Fetching: ${url}`);
  if (token) {
    console.log(`Using Bearer token (length: ${token.length})`);
  } else {
    console.warn('WARNING: No Bearer token found in environment variables');
  }
  
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const response = await fetchWithRetry(url, token);
      
      console.log(`Response Status: ${response.status}`);
      
      if (response.status === 200) {
        const xmlText = await response.text();
        console.log(`Response length: ${xmlText.length} bytes`);
        console.log(`First 500 chars:\n${xmlText.substring(0, 500)}`);
        return xmlText;
      } else if (response.status === 202) {
        // BGG is processing the request - wait and retry
        console.log(`BGG is processing request (202). Waiting ${retryDelay}ms before retry ${retries + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retries++;
      } else if (response.status === 401) {
        const body = await response.text();
        console.error(`Authentication required (401). Response: ${body || '(empty)'}`);
        if (!token) {
          throw new Error('BGG API requires Bearer token. Set BGGbearerToken in your .env file.');
        } else {
          throw new Error('BGG API authentication failed. Token may be invalid.');
        }
      } else {
        const body = await response.text();
        console.error(`Error ${response.status}: ${body || '(empty)'}`);
        throw new Error(`Failed to fetch collection: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (retries >= maxRetries - 1) {
        throw error;
      }
      console.log(`Error on attempt ${retries + 1}, retrying...`);
      retries++;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

/**
 * Fetch with Node.js https module (for testing)
 */
function fetchWithRetry(url, token = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const headers = {
      'User-Agent': 'MeepleUp-Test/1.0',
      'Accept': 'application/xml, text/xml, */*',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Create a response-like object
        const response = {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          text: async () => data,
        };
        resolve(response);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Parse BGG collection XML
 */
function parseCollectionXML(xmlText) {
  const collection = [];
  
  // Check for errors
  const errorMatch = xmlText.match(/<error[^>]*>\s*<message>([^<]+)<\/message>/);
  if (errorMatch) {
    throw new Error(errorMatch[1]);
  }
  
  // Parse items
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
    
    // Extract thumbnail and image
    const thumbnailMatch = itemXml.match(/<thumbnail>([^<]+)<\/thumbnail>/);
    const thumbnail = thumbnailMatch ? thumbnailMatch[1].trim() : null;
    
    const imageMatch = itemXml.match(/<image>([^<]+)<\/image>/);
    const image = imageMatch ? imageMatch[1].trim() : null;
    
    // Extract collection status
    const statusMatch = itemXml.match(/<status[^>]*>([\s\S]*?)<\/status>/);
    let status = {};
    if (statusMatch) {
      const statusXml = statusMatch[1];
      status.own = statusXml.includes('<own>1</own>') || statusXml.match(/<own[^>]*>1<\/own>/);
      status.prevowned = statusXml.includes('<prevowned>1</prevowned>') || statusXml.match(/<prevowned[^>]*>1<\/prevowned>/);
      status.fortrade = statusXml.includes('<fortrade>1</fortrade>') || statusXml.match(/<fortrade[^>]*>1<\/fortrade>/);
      status.want = statusXml.includes('<want>1</want>') || statusXml.match(/<want[^>]*>1<\/want>/);
      status.wanttoplay = statusXml.includes('<wanttoplay>1</wanttoplay>') || statusXml.match(/<wanttoplay[^>]*>1<\/wanttoplay>/);
      status.wanttobuy = statusXml.includes('<wanttobuy>1</wanttobuy>') || statusXml.match(/<wanttobuy[^>]*>1<\/wanttobuy>/);
      status.wishlist = statusXml.includes('<wishlist>1</wishlist>') || statusXml.match(/<wishlist[^>]*>1<\/wishlist>/);
      status.preordered = statusXml.includes('<preordered>1</preordered>') || statusXml.match(/<preordered[^>]*>1<\/preordered>/);
    }
    
    // Extract stats
    let rating = null;
    let numplays = null;
    let comment = null;
    let wishlistPriority = null;
    
    const statsMatch = itemXml.match(/<stats[^>]*>([\s\S]*?)<\/stats>/);
    if (statsMatch) {
      const statsXml = statsMatch[1];
      
      // Extract user rating
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
    if (commentMatch) {
      comment = commentMatch[1].trim();
    }
    
    // Extract wishlist priority
    const wishlistMatch = itemXml.match(/<wishlistpriority>(\d+)<\/wishlistpriority>/);
    if (wishlistMatch) {
      wishlistPriority = parseInt(wishlistMatch[1], 10);
    }
    
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
  
  return collection;
}

// Main test
async function main() {
  const username = 'Cryptic Colors';
  
  try {
    console.log(`Testing BGG Collection API for user: ${username}\n`);
    
    const xmlText = await fetchBGGCollection(username, {
      own: 1,
      stats: 1,
      subtype: 'boardgame',
    });
    
    console.log('\n--- Parsing XML ---\n');
    const collection = parseCollectionXML(xmlText);
    
    console.log(`Found ${collection.length} games in collection\n`);
    
    if (collection.length > 0) {
      console.log('First 5 games:');
      collection.slice(0, 5).forEach((game, index) => {
        console.log(`\n${index + 1}. ${game.name} (${game.yearPublished || 'N/A'})`);
        console.log(`   BGG ID: ${game.bggId}`);
        console.log(`   User Rating: ${game.rating || 'Not rated'}`);
        console.log(`   Plays: ${game.numplays || 0}`);
        console.log(`   Owned: ${game.status.own ? 'Yes' : 'No'}`);
        if (game.comment) {
          console.log(`   Comment: ${game.comment.substring(0, 50)}...`);
        }
      });
    }
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();

