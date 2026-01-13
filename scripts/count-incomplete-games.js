#!/usr/bin/env node

/**
 * Count Incomplete Games Script
 * Quickly counts how many games in Firestore are missing important BGG data
 */

require('dotenv').config();

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

/**
 * Check if a game is missing important BGG data
 */
function isGameIncomplete(gameData) {
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
 * Count incomplete games
 */
async function countIncompleteGames() {
  console.log('\n🔍 Counting Incomplete Games in Firestore...\n');
  
  try {
    // Get all games from Firestore
    console.log('📋 Fetching all games from Firestore...');
    const gamesSnapshot = await db.collection('games').get();
    const totalGames = gamesSnapshot.size;
    console.log(`   Found ${totalGames} total games\n`);
    
    // Check each game for completeness
    const incompleteGames = [];
    let completeCount = 0;
    const missingFieldCounts = {};
    
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
        
        // Count missing fields
        missingFields.forEach(field => {
          missingFieldCounts[field] = (missingFieldCounts[field] || 0) + 1;
        });
      } else {
        completeCount++;
      }
    }
    
    // Summary
    console.log('📊 Results:');
    console.log(`   ✅ Complete games: ${completeCount}`);
    console.log(`   ⚠️  Incomplete games: ${incompleteGames.length}`);
    console.log(`   📦 Total games: ${totalGames}\n`);
    
    if (incompleteGames.length > 0) {
      console.log('📊 Missing fields breakdown:');
      Object.entries(missingFieldCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([field, count]) => {
          const percentage = ((count / totalGames) * 100).toFixed(1);
          console.log(`   ${field}: ${count} games (${percentage}%)`);
        });
      console.log('');
      
      // Show some examples
      console.log('📝 Sample incomplete games (first 10):');
      incompleteGames.slice(0, 10).forEach((game, index) => {
        console.log(`   ${index + 1}. ${game.name} (ID: ${game.id})`);
        console.log(`      Missing: ${game.missingFields.join(', ')}`);
      });
      if (incompleteGames.length > 10) {
        console.log(`   ... and ${incompleteGames.length - 10} more\n`);
      }
    } else {
      console.log('🎉 All games are complete!\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
countIncompleteGames()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });







