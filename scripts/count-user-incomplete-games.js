#!/usr/bin/env node

/**
 * Count Incomplete Games in User Collections
 * Finds games that users actually have in their collections but are missing BGG data
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
 * Count incomplete games in user collections
 */
async function countUserIncompleteGames() {
  console.log('\n🔍 Counting Incomplete Games in User Collections...\n');
  
  try {
    // Get all users
    console.log('👥 Fetching all users...');
    const usersSnapshot = await auth.listUsers();
    const users = usersSnapshot.users;
    console.log(`   Found ${users.length} users\n`);
    
    // Collect all unique game IDs from user collections
    const userGameIds = new Set();
    const userGameMap = new Map(); // gameId -> { count: number, users: Set }
    
    console.log('📋 Scanning user collections...');
    let usersWithGames = 0;
    let totalUserGames = 0;
    
    for (const user of users) {
      try {
        const gamesSnapshot = await db
          .collection('userGames')
          .doc(user.uid)
          .collection('games')
          .get();
        
        if (gamesSnapshot.size > 0) {
          usersWithGames++;
          totalUserGames += gamesSnapshot.size;
          
          gamesSnapshot.docs.forEach(doc => {
            const gameData = doc.data();
            const gameId = gameData.bggId || gameData.id;
            
            if (gameId) {
              const gameIdStr = gameId.toString();
              userGameIds.add(gameIdStr);
              
              if (!userGameMap.has(gameIdStr)) {
                userGameMap.set(gameIdStr, { count: 0, users: new Set() });
              }
              const entry = userGameMap.get(gameIdStr);
              entry.count++;
              entry.users.add(user.uid);
            }
          });
        }
      } catch (error) {
        console.warn(`   ⚠️  Error scanning games for user ${user.uid}: ${error.message}`);
      }
    }
    
    console.log(`   Users with games: ${usersWithGames}`);
    console.log(`   Total user-game entries: ${totalUserGames}`);
    console.log(`   Unique games in collections: ${userGameIds.size}\n`);
    
    // Check which of these games are incomplete in Firestore
    console.log('🔍 Checking Firestore for incomplete data...\n');
    
    const incompleteGames = [];
    let completeCount = 0;
    let notInFirestore = 0;
    const missingFieldCounts = {};
    
    // Process in batches to avoid overwhelming Firestore
    const batchSize = 100;
    const gameIdArray = Array.from(userGameIds);
    
    for (let i = 0; i < gameIdArray.length; i += batchSize) {
      const batch = gameIdArray.slice(i, i + batchSize);
      
      // Fetch games from Firestore
      const gameRefs = batch.map(id => db.collection('games').doc(id));
      const gameDocs = await Promise.all(gameRefs.map(ref => ref.get()));
      
      gameDocs.forEach((doc, index) => {
        const gameId = batch[index];
        const gameInfo = userGameMap.get(gameId);
        
        if (!doc.exists) {
          notInFirestore++;
          incompleteGames.push({
            id: gameId,
            name: 'Not in Firestore',
            missingFields: ['all'],
            userCount: gameInfo.count,
            affectedUsers: gameInfo.users.size
          });
        } else {
          const gameData = doc.data();
          const gameName = gameData.name || gameData.title || 'Unknown';
          
          const { isIncomplete, missingFields } = isGameIncomplete(gameData);
          
          if (isIncomplete) {
            incompleteGames.push({
              id: gameId,
              name: gameName,
              missingFields,
              userCount: gameInfo.count,
              affectedUsers: gameInfo.users.size
            });
            
            // Count missing fields
            missingFields.forEach(field => {
              missingFieldCounts[field] = (missingFieldCounts[field] || 0) + 1;
            });
          } else {
            completeCount++;
          }
        }
      });
      
      // Progress indicator
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= gameIdArray.length) {
        console.log(`   Checked ${Math.min(i + batchSize, gameIdArray.length)}/${gameIdArray.length} games...`);
      }
    }
    
    // Summary
    console.log('\n📊 Results:');
    console.log(`   ✅ Complete games: ${completeCount}`);
    console.log(`   ⚠️  Incomplete games: ${incompleteGames.length}`);
    console.log(`   ❌ Not in Firestore: ${notInFirestore}`);
    console.log(`   📦 Total unique games in collections: ${userGameIds.size}\n`);
    
    if (incompleteGames.length > 0) {
      console.log('📊 Missing fields breakdown (for games users actually have):');
      Object.entries(missingFieldCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([field, count]) => {
          const percentage = ((count / incompleteGames.length) * 100).toFixed(1);
          console.log(`   ${field}: ${count} games (${percentage}% of incomplete)`);
        });
      console.log('');
      
      // Show games affecting most users
      const sortedByUsers = [...incompleteGames]
        .filter(g => g.id !== 'Not in Firestore')
        .sort((a, b) => b.affectedUsers - a.affectedUsers)
        .slice(0, 20);
      
      if (sortedByUsers.length > 0) {
        console.log('📝 Top incomplete games by number of affected users (first 20):');
        sortedByUsers.forEach((game, index) => {
          console.log(`   ${index + 1}. ${game.name} (ID: ${game.id})`);
          console.log(`      Affects ${game.affectedUsers} users, ${game.userCount} total instances`);
          console.log(`      Missing: ${game.missingFields.join(', ')}`);
        });
        console.log('');
      }
      
      // Calculate total affected user-game instances
      const totalAffectedInstances = incompleteGames.reduce((sum, game) => sum + game.userCount, 0);
      console.log(`📈 Impact:`);
      console.log(`   Total user-game instances affected: ${totalAffectedInstances}`);
      console.log(`   Unique users affected: ${new Set(incompleteGames.flatMap(g => Array.from(userGameMap.get(g.id)?.users || []))).size}\n`);
    } else {
      console.log('🎉 All games in user collections are complete!\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Get auth reference
const auth = admin.auth();

// Run the script
countUserIncompleteGames()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });



