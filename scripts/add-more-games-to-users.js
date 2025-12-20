#!/usr/bin/env node

/**
 * Add More Games to Test Users (Diana, Bob, Alice)
 * Adds ~100 new board game titles from BGG to each user
 * Tries to give them mostly games that the other users don't have
 */

require('dotenv').config();

const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('../firebase-service-account.json');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const auth = admin.auth();

// BGG API configuration
const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

// Helper functions
const log = (message, type = 'info') => {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪',
    debug: '🔍',
  }[type] || 'ℹ️';
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${prefix} ${message}`);
};

// Rate limiter for BGG API calls
let lastApiCallTime = 0;
const MIN_API_CALL_INTERVAL = 1500; // 1.5 seconds

async function rateLimitAPI() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;
  
  if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
    const waitTime = MIN_API_CALL_INTERVAL - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastApiCallTime = Date.now();
}

/**
 * Get BGG API bearer token
 */
function getBGGToken() {
  return process.env.EXPO_PUBLIC_BGG_API_TOKEN || 
         process.env.EXPO_PUBLIC_BGGbearerToken ||
         process.env.BGGbearerToken ||
         null;
}

/**
 * Fetch game details from BGG API by game ID
 */
async function fetchBGGGameDetails(gameId) {
  if (!gameId) {
    return null;
  }

  try {
    await rateLimitAPI();
    
    const token = getBGGToken();
    const url = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
    const headers = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    let response = await axios.get(url, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      timeout: 10000,
    });
    
    // Handle auth fallbacks
    if (response.status === 401 && token) {
      const urlWithToken = `${BGG_API_BASE}/thing?id=${gameId}&stats=1&token=${token}`;
      response = await axios.get(urlWithToken, { timeout: 10000 });
      
      if (response.status === 401 || response.status === 403) {
        const urlNoAuth = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
        response = await axios.get(urlNoAuth, { timeout: 10000 });
      }
    } else if (response.status === 401 && !token) {
      const urlNoAuth = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
      response = await axios.get(urlNoAuth, { timeout: 10000 });
    }
    
    if (response.status !== 200) {
      return null;
    }

    const xmlText = response.data;
    return parseBGGXML(xmlText);
  } catch (error) {
    log(`Error fetching game details for ID ${gameId}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Parse BGG XML response (simplified version)
 */
function parseBGGXML(xmlText) {
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
    
    // Extract min/max players
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value="(\d+)"/);
    const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : null;
    
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value="(\d+)"/);
    const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : null;
    
    // Extract playing time
    const playingTimeMatch = xmlText.match(/<playingtime[^>]*value="(\d+)"/);
    const playingTime = playingTimeMatch ? parseInt(playingTimeMatch[1], 10) : null;
    
    // Extract average rating
    const averageMatch = xmlText.match(/<average[^>]*value="([^"]+)"/);
    const average = averageMatch ? parseFloat(averageMatch[1]) : null;
    
    return {
      id,
      name,
      yearPublished,
      thumbnail,
      image,
      description,
      minPlayers,
      maxPlayers,
      playingTime,
      bggRating: average,
    };
  } catch (error) {
    log(`Error parsing XML: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  try {
    const user = await auth.getUserByEmail(email.toLowerCase());
    const userDoc = await db.collection('users').doc(user.uid).get();
    return {
      uid: user.uid,
      email: user.email,
      name: userDoc.data()?.name || user.displayName || email.split('@')[0],
    };
  } catch (error) {
    log(`Error getting user ${email}: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Get user's current collection
 */
async function getUserCollection(userId) {
  try {
    const gamesSnapshot = await db.collection('userGames')
      .doc(userId)
      .collection('games')
      .get();
    
    const games = [];
    gamesSnapshot.forEach(doc => {
      const data = doc.data();
      games.push({
        id: doc.id,
        bggId: data.bggId || data.id,
        title: data.title || data.name,
      });
    });
    
    return games;
  } catch (error) {
    log(`Error getting collection for user ${userId}: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Load board games ranks from JSON file
 */
function loadBoardGamesRanks() {
  try {
    const ranksPath = path.join(__dirname, '../public/data/boardgames_ranks.json');
    const ranksData = fs.readFileSync(ranksPath, 'utf8');
    return JSON.parse(ranksData);
  } catch (error) {
    log(`Error loading boardgames_ranks.json: ${error.message}`, 'error');
    return [];
  }
}

/**
 * Add game to user's collection
 */
async function addGameToCollection(userId, gameData) {
  try {
    // Check if game already exists (by bggId or title)
    const userGamesRef = db.collection('userGames').doc(userId).collection('games');
    
    if (gameData.bggId) {
      const existingByBggId = await userGamesRef
        .where('bggId', '==', gameData.bggId.toString())
        .limit(1)
        .get();
      
      if (!existingByBggId.empty) {
        return false; // Already exists
      }
    }
    
    // Check by title
    const existingByTitle = await userGamesRef
      .where('title', '==', gameData.title)
      .limit(1)
      .get();
    
    if (!existingByTitle.empty) {
      return false; // Already exists
    }
    
    // Add the game
    const gameDoc = {
      title: gameData.title,
      bggId: gameData.bggId ? gameData.bggId.toString() : null,
      image: gameData.image || null,
      thumbnail: gameData.thumbnail || null,
      description: gameData.description || '',
      yearPublished: gameData.yearPublished || null,
      minPlayers: gameData.minPlayers || null,
      maxPlayers: gameData.maxPlayers || null,
      playingTime: gameData.playingTime || null,
      bggRating: gameData.bggRating || null,
      source: 'script',
      addedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      isFavorite: false,
    };
    
    await userGamesRef.add(gameDoc);
    return true;
  } catch (error) {
    log(`Error adding game to collection: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Main function to add games to users
 */
async function main() {
  log('\n🚀 Adding More Games to Test Users\n', 'test');
  
  // Find users - try multiple email formats for Bob
  const userEmailVariants = {
    'diana': ['diana@meepleup.com', 'diana@email.com'],
    'bob': ['bob@email.com', 'Bob@email.com'],
    'alice': ['alice@meepleup.com', 'Alice@meepleup.com', 'alice@email.com'],
  };
  
  const users = [];
  
  log('Finding users...', 'info');
  for (const [name, emails] of Object.entries(userEmailVariants)) {
    let found = false;
    for (const email of emails) {
      const user = await getUserByEmail(email);
      if (user) {
        users.push(user);
        log(`  ✓ Found: ${user.name} (${user.email})`, 'success');
        found = true;
        break;
      }
    }
    if (!found) {
      log(`  ✗ Not found: ${name} (tried: ${emails.join(', ')})`, 'error');
    }
  }
  
  if (users.length === 0) {
    log('No users found!', 'error');
    process.exit(1);
  }
  
  // Get current collections
  log('\nGetting current collections...', 'info');
  const collections = {};
  for (const user of users) {
    const collection = await getUserCollection(user.uid);
    collections[user.uid] = collection;
    log(`  ${user.name}: ${collection.length} games`, 'info');
  }
  
  // Load board games ranks
  log('\nLoading board games ranks...', 'info');
  const allGames = loadBoardGamesRanks();
  log(`  Loaded ${allGames.length} games from ranks file`, 'success');
  
  // Create a set of all games that users already have (by BGG ID)
  const existingGameIds = new Set();
  for (const userId in collections) {
    collections[userId].forEach(game => {
      if (game.bggId) {
        existingGameIds.add(game.bggId.toString());
      }
    });
  }
  
  // Filter out games that users already have
  const availableGames = allGames.filter(game => {
    return !existingGameIds.has(game.id);
  });
  
  log(`\n${availableGames.length} games available (not in any user's collection)`, 'info');
  
  // For each user, select games that others don't have
  const targetGamesPerUser = 100;
  
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    log(`\n=== Processing ${user.name} ===`, 'test');
    
    // Get current collection count for this user
    const currentCount = collections[user.uid].length;
    const gamesNeeded = Math.max(0, targetGamesPerUser - currentCount);
    
    if (gamesNeeded === 0) {
      log(`  ${user.name} already has ${currentCount} games (target: ${targetGamesPerUser}). Skipping.`, 'info');
      continue;
    }
    
    log(`  ${user.name} currently has ${currentCount} games. Need to add ${gamesNeeded} more.`, 'info');
    
    // Get games that other users have
    const otherUsers = users.filter((_, idx) => idx !== i);
    const otherUsersGameIds = new Set();
    otherUsers.forEach(otherUser => {
      collections[otherUser.uid].forEach(game => {
        if (game.bggId) {
          otherUsersGameIds.add(game.bggId.toString());
        }
      });
    });
    
    // Prioritize games that other users don't have
    // Split available games into: unique to this user, and shared
    const uniqueGames = availableGames.filter(game => !otherUsersGameIds.has(game.id));
    const sharedGames = availableGames.filter(game => otherUsersGameIds.has(game.id));
    
    // Take mostly unique games (80% unique, 20% shared)
    // Select more games than needed to account for errors
    const buffer = Math.ceil(gamesNeeded * 0.3); // 30% buffer for errors
    const numUnique = Math.min(Math.floor(gamesNeeded * 0.8) + Math.ceil(buffer * 0.8), uniqueGames.length);
    const numShared = Math.min(gamesNeeded - Math.floor(gamesNeeded * 0.8) + Math.ceil(buffer * 0.2), sharedGames.length);
    
    // Shuffle and select games
    const shuffle = (array) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    
    const selectedUnique = shuffle(uniqueGames).slice(0, numUnique);
    const selectedShared = shuffle(sharedGames).slice(0, numShared);
    let selectedGames = [...selectedUnique, ...selectedShared];
    
    log(`  Selected ${selectedGames.length} games (${numUnique} unique, ${numShared} shared)`, 'info');
    
    // Fetch game details and add to collection
    let addedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    let gameIndex = 0;
    
    // Continue adding games until we reach the target or run out of games
    while (addedCount < gamesNeeded && gameIndex < selectedGames.length) {
      const game = selectedGames[gameIndex];
      processedCount++;
      
      // Only log every 10th game to reduce noise
      if (processedCount % 10 === 0 || processedCount === 1) {
        log(`  [${processedCount}/${selectedGames.length}] Processing: ${game.name} (ID: ${game.id}) - Added: ${addedCount}/${gamesNeeded}`, 'debug');
      }
      
      try {
        // Fetch full game details from BGG
        const gameDetails = await fetchBGGGameDetails(game.id);
        
        if (!gameDetails || !gameDetails.name) {
          errorCount++;
          gameIndex++;
          // If we're running low on games, try to get more
          if (gameIndex >= selectedGames.length && addedCount < gamesNeeded) {
            const remainingGames = availableGames.filter(g => 
              !selectedGames.some(sg => sg.id === g.id) &&
              !otherUsersGameIds.has(g.id.toString())
            );
            if (remainingGames.length > 0) {
              const moreGames = shuffle(remainingGames).slice(0, Math.min(50, remainingGames.length));
              selectedGames = [...selectedGames, ...moreGames];
              log(`  Added ${moreGames.length} more games to selection pool`, 'info');
            }
          }
          continue;
        }
        
        // Add to collection
        const added = await addGameToCollection(user.uid, {
          title: gameDetails.name,
          bggId: gameDetails.id,
          image: gameDetails.image,
          thumbnail: gameDetails.thumbnail,
          description: gameDetails.description,
          yearPublished: gameDetails.yearPublished,
          minPlayers: gameDetails.minPlayers,
          maxPlayers: gameDetails.maxPlayers,
          playingTime: gameDetails.playingTime,
          bggRating: gameDetails.bggRating,
        });
        
        if (added) {
          addedCount++;
          if (addedCount % 10 === 0 || addedCount === gamesNeeded) {
            log(`    ✓ Added ${addedCount}/${gamesNeeded}: ${gameDetails.name}`, 'success');
          }
        } else {
          skippedCount++;
        }
      } catch (error) {
        errorCount++;
        if (errorCount % 10 === 0) {
          log(`    ✗ Error count: ${errorCount} (processing ${game.name})`, 'error');
        }
      }
      
      gameIndex++;
      
      // If we're running low on games and haven't reached target, get more
      if (gameIndex >= selectedGames.length && addedCount < gamesNeeded) {
        const remainingGames = availableGames.filter(g => 
          !selectedGames.some(sg => sg.id === g.id) &&
          !otherUsersGameIds.has(g.id.toString())
        );
        if (remainingGames.length > 0) {
          const moreGames = shuffle(remainingGames).slice(0, Math.min(gamesNeeded - addedCount + 20, remainingGames.length));
          selectedGames = [...selectedGames, ...moreGames];
          log(`  Added ${moreGames.length} more games to selection pool (${addedCount}/${gamesNeeded} added so far)`, 'info');
        } else {
          log(`  ⚠️ No more games available. Added ${addedCount} out of ${gamesNeeded} needed.`, 'warning');
          break;
        }
      }
      
      // Small delay between games
      if (gameIndex < selectedGames.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const finalCount = currentCount + addedCount;
    log(`\n  ✓ ${user.name}: Added ${addedCount} games (${currentCount} → ${finalCount} total), skipped ${skippedCount}, errors ${errorCount}`, 'success');
    
    if (finalCount < targetGamesPerUser) {
      log(`  ⚠️ ${user.name} has ${finalCount} games, which is less than target of ${targetGamesPerUser}`, 'warning');
    }
    
    // Refresh this user's collection for subsequent users
    if (addedCount > 0) {
      collections[user.uid] = await getUserCollection(user.uid);
      // Update existingGameIds to include newly added games
      collections[user.uid].forEach(game => {
        if (game.bggId) {
          existingGameIds.add(game.bggId.toString());
        }
      });
      // Update availableGames to exclude newly added games
      const newAvailableGames = availableGames.filter(game => 
        !existingGameIds.has(game.id)
      );
      availableGames.length = 0;
      availableGames.push(...newAvailableGames);
    }
  }
  
  // Final summary
  log('\n=== Final Summary ===', 'test');
  for (const user of users) {
    const collection = await getUserCollection(user.uid);
    log(`  ${user.name}: ${collection.length} total games`, 'info');
  }
  
  log('\n✨ Done!', 'success');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });

