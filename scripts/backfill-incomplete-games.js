#!/usr/bin/env node

/**
 * Backfill Incomplete Games Script
 * Scans Firestore games collection for incomplete games and fetches complete data from BGG API
 * Updates Firestore with complete "thing" object data
 * Runs at a slow, friendly rate to respect BGG API limits
 */

require('dotenv').config();

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');
const https = require('https');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';
const RATE_LIMIT_MS = 3000; // 3 seconds between API calls (very friendly)

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
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a game is missing important BGG data
 */
function isGameIncomplete(gameData) {
  // Check for missing critical fields
  const missingFields = [];
  
  if (!gameData.thumbnail) missingFields.push('thumbnail');
  if (!gameData.image) missingFields.push('image');
  if (!gameData.description || gameData.description.trim().length === 0) missingFields.push('description');
  if (!gameData.mechanics || (Array.isArray(gameData.mechanics) && gameData.mechanics.length === 0)) missingFields.push('mechanics');
  if (!gameData.categories || (Array.isArray(gameData.categories) && gameData.categories.length === 0)) missingFields.push('categories');
  if (!gameData.designers || (Array.isArray(gameData.designers) && gameData.designers.length === 0)) missingFields.push('designers');
  if (!gameData.publishers || (Array.isArray(gameData.publishers) && gameData.publishers.length === 0)) missingFields.push('publishers');
  
  return {
    isIncomplete: missingFields.length > 0,
    missingFields
  };
}

/**
 * Fetch game details from BGG API
 */
async function fetchBGGGameDetails(gameId) {
  return new Promise((resolve, reject) => {
    const token = getBGGToken();
    const url = `${BGG_API_BASE}/thing?id=${gameId}&stats=1`;
    
    const options = {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          // Try without auth if 401
          if (res.statusCode === 401 && token) {
            https.get(`${url}&token=${token}`, (res2) => {
              let data2 = '';
              res2.on('data', (chunk) => data2 += chunk);
              res2.on('end', () => {
                if (res2.statusCode === 200) {
                  resolve(parseBGGXML(data2));
                } else {
                  // Try without auth
                  https.get(url, (res3) => {
                    let data3 = '';
                    res3.on('data', (chunk) => data3 += chunk);
                    res3.on('end', () => {
                      resolve(res3.statusCode === 200 ? parseBGGXML(data3) : null);
                    });
                  }).on('error', reject);
                }
              });
            }).on('error', reject);
            return;
          }
          reject(new Error(`BGG API returned status ${res.statusCode}`));
          return;
        }
        
        try {
          const gameData = parseBGGXML(data);
          resolve(gameData);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse BGG XML response (simplified regex-based parser for Node.js)
 */
function parseBGGXML(xmlText) {
  try {
    // Extract ID
    const idMatch = xmlText.match(/<item[^>]*id="(\d+)"/);
    const id = idMatch ? parseInt(idMatch[1], 10) : null;
    
    if (!id) return null;
    
    // Extract name (primary name preferred)
    const primaryNameMatch = xmlText.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
    const nameMatch = xmlText.match(/<name[^>]*value="([^"]+)"/);
    const name = primaryNameMatch ? primaryNameMatch[1] : (nameMatch ? nameMatch[1] : null);
    
    // Extract thumbnail and image
    const thumbnailMatch = xmlText.match(/<thumbnail>([^<]+)<\/thumbnail>/);
    const thumbnail = thumbnailMatch ? thumbnailMatch[1].trim() : null;
    
    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const image = imageMatch ? imageMatch[1].trim() : null;
    
    // Extract year published
    const yearMatch = xmlText.match(/<yearpublished[^>]*value="(\d+)"/);
    const yearPublished = yearMatch ? parseInt(yearMatch[1], 10) : null;
    
    // Extract description
    const descMatch = xmlText.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '') : null;
    
    // Extract statistics
    const averageMatch = xmlText.match(/<average[^>]*value="([^"]+)"/);
    const average = averageMatch ? parseFloat(averageMatch[1]) : null;
    
    const bayesAverageMatch = xmlText.match(/<bayesaverage[^>]*value="([^"]+)"/);
    const bayesAverage = bayesAverageMatch ? parseFloat(bayesAverageMatch[1]) : null;
    
    const usersRatedMatch = xmlText.match(/<usersrated[^>]*value="(\d+)"/);
    const usersRated = usersRatedMatch ? parseInt(usersRatedMatch[1], 10) : null;
    
    // Extract rank
    const rankMatch = xmlText.match(/<rank[^>]*type="subtype"[^>]*id="1"[^>]*value="(\d+)"/);
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
    
    // Extract category ranks
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
    
    // Extract playing time
    const playingTimeMatch = xmlText.match(/<playingtime[^>]*value="(\d+)"/);
    const playingTime = playingTimeMatch ? parseInt(playingTimeMatch[1], 10) : null;
    
    const minPlayTimeMatch = xmlText.match(/<minplaytime[^>]*value="(\d+)"/);
    const minPlayTime = minPlayTimeMatch ? parseInt(minPlayTimeMatch[1], 10) : null;
    
    const maxPlayTimeMatch = xmlText.match(/<maxplaytime[^>]*value="(\d+)"/);
    const maxPlayTime = maxPlayTimeMatch ? parseInt(maxPlayTimeMatch[1], 10) : null;
    
    // Extract min age
    const minAgeMatch = xmlText.match(/<minage[^>]*value="(\d+)"/);
    const minAge = minAgeMatch ? parseInt(minAgeMatch[1], 10) : null;
    
    // Extract mechanics
    const mechanics = [];
    const mechanicRegex = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]+)"/g;
    let mechanicMatch;
    while ((mechanicMatch = mechanicRegex.exec(xmlText)) !== null) {
      mechanics.push(mechanicMatch[1]);
    }
    
    // Extract categories
    const categories = [];
    const categoryRegex = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]+)"/g;
    let categoryMatch;
    while ((categoryMatch = categoryRegex.exec(xmlText)) !== null) {
      categories.push(categoryMatch[1]);
    }
    
    // Extract designers
    const designers = [];
    const designerRegex = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]+)"/g;
    let designerMatch;
    while ((designerMatch = designerRegex.exec(xmlText)) !== null) {
      designers.push(designerMatch[1]);
    }
    
    // Extract publishers
    const publishers = [];
    const publisherRegex = /<link[^>]*type="boardgamepublisher"[^>]*value="([^"]+)"/g;
    let publisherMatch;
    while ((publisherMatch = publisherRegex.exec(xmlText)) !== null) {
      publishers.push(publisherMatch[1]);
    }
    
    // Extract artists
    const artists = [];
    const artistRegex = /<link[^>]*type="boardgameartist"[^>]*value="([^"]+)"/g;
    let artistMatch;
    while ((artistMatch = artistRegex.exec(xmlText)) !== null) {
      artists.push(artistMatch[1]);
    }
    
    // Extract complexity/weight
    const complexityMatch = xmlText.match(/<averageweight[^>]*value="([^"]+)"/);
    const complexity = complexityMatch ? parseFloat(complexityMatch[1]) : null;
    
    // Extract owned count
    const ownedMatch = xmlText.match(/<owned[^>]*value="(\d+)"/);
    const ownedCount = ownedMatch ? parseInt(ownedMatch[1], 10) : null;
    
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
      strategyGamesRank,
      familyGamesRank,
      partyGamesRank,
      abstractsRank,
      thematicRank,
      wargamesRank,
      childrensGamesRank,
      cgsRank,
      mechanics: mechanics.length > 0 ? mechanics : null,
      categories: categories.length > 0 ? categories : null,
      designers: designers.length > 0 ? designers : null,
      publishers: publishers.length > 0 ? publishers : null,
      artists: artists.length > 0 ? artists : null,
      complexity,
      averageWeight: complexity,
      ownedCount,
    };
  } catch (error) {
    console.error('[Parse Error]', error);
    return null;
  }
}

/**
 * Update game in Firestore with complete BGG data
 */
async function updateGameInFirestore(gameId, bggData) {
  const gameRef = db.collection('games').doc(gameId.toString());
  const doc = await gameRef.get();
  
  if (!doc.exists) {
    console.log(`  ⚠️  Game ${gameId} not found in Firestore, skipping update`);
    return false;
  }
  
  const existingData = doc.data();
  const updateData = {};
  
  // Update all missing fields
  if (!existingData.thumbnail && bggData.thumbnail) {
    updateData.thumbnail = bggData.thumbnail;
  }
  if (!existingData.image && bggData.image) {
    updateData.image = bggData.image;
  }
  if ((!existingData.description || existingData.description.trim().length === 0) && bggData.description) {
    updateData.description = bggData.description;
  }
  if (bggData.mechanics) updateData.mechanics = bggData.mechanics;
  if (bggData.categories) updateData.categories = bggData.categories;
  if (bggData.designers) updateData.designers = bggData.designers;
  if (bggData.publishers) updateData.publishers = bggData.publishers;
  if (bggData.artists) updateData.artists = bggData.artists;
  
  // Update other fields if missing
  if (!existingData.minPlayers && bggData.minPlayers) updateData.minPlayers = bggData.minPlayers;
  if (!existingData.maxPlayers && bggData.maxPlayers) updateData.maxPlayers = bggData.maxPlayers;
  if (!existingData.playingTime && bggData.playingTime) updateData.playingTime = bggData.playingTime;
  if (!existingData.minPlayTime && bggData.minPlayTime) updateData.minPlayTime = bggData.minPlayTime;
  if (!existingData.maxPlayTime && bggData.maxPlayTime) updateData.maxPlayTime = bggData.maxPlayTime;
  if (!existingData.minAge && bggData.minAge) updateData.minAge = bggData.minAge;
  
  // Always update ratings (they change over time)
  if (bggData.average) updateData.average = bggData.average;
  if (bggData.bayesAverage) updateData.bayesAverage = bggData.bayesAverage;
  if (bggData.usersRated) updateData.usersRated = bggData.usersRated;
  if (bggData.rank) updateData.rank = bggData.rank;
  
  // Update category ranks
  if (bggData.strategyGamesRank) updateData.strategyGamesRank = bggData.strategyGamesRank;
  if (bggData.familyGamesRank) updateData.familyGamesRank = bggData.familyGamesRank;
  if (bggData.partyGamesRank) updateData.partyGamesRank = bggData.partyGamesRank;
  if (bggData.abstractsRank) updateData.abstractsRank = bggData.abstractsRank;
  if (bggData.thematicRank) updateData.thematicRank = bggData.thematicRank;
  if (bggData.wargamesRank) updateData.wargamesRank = bggData.wargamesRank;
  if (bggData.childrensGamesRank) updateData.childrensGamesRank = bggData.childrensGamesRank;
  if (bggData.cgsRank) updateData.cgsRank = bggData.cgsRank;
  
  // Update complexity
  if (bggData.complexity) updateData.complexity = bggData.complexity;
  if (bggData.averageWeight) updateData.averageWeight = bggData.averageWeight;
  
  // Mark as updated
  updateData.bggDataCached = true;
  updateData.bggDataCachedAt = admin.firestore.Timestamp.now();
  
  if (Object.keys(updateData).length > 0) {
    await gameRef.update(updateData);
    return true;
  }
  
  return false;
}

/**
 * Main function to backfill incomplete games
 */
async function backfillIncompleteGames() {
  console.log('\n🔄 Starting Backfill of Incomplete Games...\n');
  
  try {
    // Get all games from Firestore
    console.log('📋 Fetching all games from Firestore...');
    const gamesSnapshot = await db.collection('games').get();
    const totalGames = gamesSnapshot.size;
    console.log(`   Found ${totalGames} total games\n`);
    
    // Check each game for completeness
    const incompleteGames = [];
    let completeCount = 0;
    
    console.log('🔍 Checking games for missing data...\n');
    
    for (const doc of gamesSnapshot.docs) {
      const gameData = doc.data();
      const gameId = doc.id;
      const gameName = gameData.name || gameData.title || 'Unknown';
      
      const { isIncomplete, missingFields } = isGameIncomplete(gameData);
      
      if (isIncomplete) {
        incompleteGames.push({
          id: gameId,
          name: gameName,
          missingFields
        });
      } else {
        completeCount++;
      }
    }
    
    console.log(`✅ Complete games: ${completeCount}`);
    console.log(`⚠️  Incomplete games: ${incompleteGames.length}\n`);
    
    if (incompleteGames.length === 0) {
      console.log('🎉 All games are complete! No backfill needed.\n');
      return;
    }
    
    // Show summary of missing fields
    const missingFieldCounts = {};
    incompleteGames.forEach(game => {
      game.missingFields.forEach(field => {
        missingFieldCounts[field] = (missingFieldCounts[field] || 0) + 1;
      });
    });
    
    console.log('📊 Missing fields summary:');
    Object.entries(missingFieldCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        console.log(`   ${field}: ${count} games`);
      });
    console.log('');
    
    // Ask for confirmation
    console.log(`⚠️  About to fetch ${incompleteGames.length} games from BGG API`);
    console.log(`   Rate limit: ${RATE_LIMIT_MS / 1000} seconds between calls`);
    console.log(`   Estimated time: ~${Math.ceil((incompleteGames.length * RATE_LIMIT_MS) / 1000 / 60)} minutes\n`);
    
    // Process incomplete games
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < incompleteGames.length; i++) {
      const game = incompleteGames[i];
      const progress = `[${i + 1}/${incompleteGames.length}]`;
      
      console.log(`${progress} Processing: ${game.name} (ID: ${game.id})`);
      console.log(`   Missing: ${game.missingFields.join(', ')}`);
      
      try {
        // Rate limit: wait before each API call (except the first one)
        if (i > 0) {
          await sleep(RATE_LIMIT_MS);
        }
        
        // Fetch from BGG API
        const bggData = await fetchBGGGameDetails(game.id);
        
        if (!bggData) {
          console.log(`   ❌ Failed to fetch BGG data`);
          failCount++;
          continue;
        }
        
        // Update Firestore
        const updated = await updateGameInFirestore(game.id, bggData);
        
        if (updated) {
          console.log(`   ✅ Updated with complete BGG data`);
          successCount++;
        } else {
          console.log(`   ⏭️  No updates needed (data already present)`);
          skipCount++;
        }
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        failCount++;
      }
      
      console.log('');
    }
    
    // Summary
    console.log('\n📊 Backfill Summary:');
    console.log(`   ✅ Successfully updated: ${successCount}`);
    console.log(`   ⏭️  Skipped (no updates needed): ${skipCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📦 Total processed: ${incompleteGames.length}\n`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
backfillIncompleteGames()
  .then(() => {
    console.log('✨ Backfill complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

