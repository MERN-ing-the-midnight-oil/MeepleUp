#!/usr/bin/env node

/**
 * Delete Incomplete Game Records Script
 * 
 * This script:
 * 1. Finds all incomplete game records in the master 'games' collection
 * 2. Deletes those incomplete records
 * 3. Deletes all references to those games in user collections (userGames/{userId}/games)
 * 
 * An incomplete record is defined as missing critical BGG data:
 * - Missing mechanics OR
 * - Missing categories OR
 * - Missing publishers/publisher OR
 * - Missing complexity/averageWeight
 * 
 * OR has bggDataCached: false (indicating it was saved from search results)
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
 * Check if a game record is incomplete
 */
function isGameIncomplete(gameData, gameId) {
  const missingFields = [];
  
  // Check for bggDataCached: false (indicates incomplete record from search)
  if (gameData.bggDataCached === false) {
    missingFields.push('bggDataCached:false');
  }
  
  // Check for missing mechanics
  if (!gameData.mechanics || 
      (Array.isArray(gameData.mechanics) && gameData.mechanics.length === 0) ||
      gameData.mechanics === null) {
    missingFields.push('mechanics');
  }
  
  // Check for missing categories
  if (!gameData.categories || 
      (Array.isArray(gameData.categories) && gameData.categories.length === 0) ||
      gameData.categories === null) {
    missingFields.push('categories');
  }
  
  // Check for missing publishers/publisher
  const hasPublisher = gameData.publisher || 
    (Array.isArray(gameData.publishers) && gameData.publishers.length > 0) ||
    gameData.publishers;
  if (!hasPublisher) {
    missingFields.push('publisher');
  }
  
  // Check for missing complexity/averageWeight
  if ((!gameData.complexity || gameData.complexity === null) &&
      (!gameData.averageWeight || gameData.averageWeight === null)) {
    missingFields.push('complexity');
  }
  
  return {
    isIncomplete: missingFields.length > 0,
    missingFields,
    gameId
  };
}

/**
 * Find all incomplete games in the master games collection
 */
async function findIncompleteGames() {
  console.log('\n🔍 Scanning games collection for incomplete records...\n');
  
  const incompleteGames = [];
  let totalScanned = 0;
  let completeCount = 0;
  
  try {
    const gamesRef = db.collection('games');
    let lastDoc = null;
    const batchSize = 100;
    
    // Process in batches to avoid memory issues
    while (true) {
      let query = gamesRef.orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
      
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        break;
      }
      
      snapshot.docs.forEach(doc => {
        totalScanned++;
        const gameData = doc.data();
        const gameId = doc.id;
        
        const { isIncomplete, missingFields } = isGameIncomplete(gameData, gameId);
        
        if (isIncomplete) {
          incompleteGames.push({
            id: gameId,
            name: gameData.name || 'Unknown',
            missingFields,
            bggDataCached: gameData.bggDataCached,
          });
        } else {
          completeCount++;
        }
      });
      
      // Progress indicator
      if (totalScanned % 500 === 0 || snapshot.size < batchSize) {
        console.log(`   Scanned ${totalScanned} games... (${incompleteGames.length} incomplete found so far)`);
      }
      
      if (snapshot.size < batchSize) {
        break;
      }
      
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }
    
    console.log(`\n✅ Scan complete:`);
    console.log(`   Total games scanned: ${totalScanned}`);
    console.log(`   Complete games: ${completeCount}`);
    console.log(`   Incomplete games: ${incompleteGames.length}\n`);
    
    return incompleteGames;
  } catch (error) {
    console.error('\n❌ Error scanning games:', error);
    throw error;
  }
}

/**
 * Find all user collections that reference a game
 */
async function findUserReferences(gameId) {
  const references = [];
  
  try {
    const userGamesRef = db.collection('userGames');
    const usersSnapshot = await userGamesRef.get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const gamesRef = userDoc.ref.collection('games');
      
      // Query for games with this bggId
      const gamesSnapshot = await gamesRef.where('bggId', '==', gameId).get();
      
      gamesSnapshot.docs.forEach(doc => {
        references.push({
          userId,
          gameDocId: doc.id,
          gameData: doc.data(),
        });
      });
    }
  } catch (error) {
    console.error(`   ⚠️  Error finding references for game ${gameId}:`, error.message);
  }
  
  return references;
}

/**
 * Delete a game and all its user references
 */
async function deleteGameAndReferences(game, dryRun = true) {
  const gameId = game.id;
  const gameName = game.name;
  
  try {
    // Find all user references
    const references = await findUserReferences(gameId);
    
    if (dryRun) {
      console.log(`   [DRY RUN] Would delete: ${gameName} (ID: ${gameId})`);
      console.log(`   [DRY RUN] Missing fields: ${game.missingFields.join(', ')}`);
      console.log(`   [DRY RUN] Would delete ${references.length} user references`);
      return { deleted: false, referencesCount: references.length };
    }
    
    // Delete from master games collection
    await db.collection('games').doc(gameId).delete();
    
    // Delete all user references
    let deletedRefs = 0;
    for (const ref of references) {
      try {
        await db.collection('userGames').doc(ref.userId)
          .collection('games').doc(ref.gameDocId).delete();
        deletedRefs++;
      } catch (error) {
        console.error(`     ⚠️  Error deleting reference for user ${ref.userId}:`, error.message);
      }
    }
    
    console.log(`   ✅ Deleted: ${gameName} (ID: ${gameId})`);
    console.log(`   ✅ Deleted ${deletedRefs} user references`);
    
    return { deleted: true, referencesCount: deletedRefs };
  } catch (error) {
    console.error(`   ❌ Error deleting game ${gameId}:`, error.message);
    return { deleted: false, error: error.message, referencesCount: 0 };
  }
}

/**
 * Main function
 */
async function deleteIncompleteGames() {
  console.log('\n🗑️  Delete Incomplete Game Records Script\n');
  console.log('This script will:');
  console.log('1. Find incomplete games in the master "games" collection');
  console.log('2. Delete those incomplete games');
  console.log('3. Delete all references to those games in user collections\n');
  
  try {
    // Find incomplete games
    const incompleteGames = await findIncompleteGames();
    
    if (incompleteGames.length === 0) {
      console.log('🎉 No incomplete games found! All games are complete.\n');
      return;
    }
    
    // Show summary
    console.log('📊 Incomplete Games Summary:');
    const missingFieldCounts = {};
    incompleteGames.forEach(game => {
      game.missingFields.forEach(field => {
        missingFieldCounts[field] = (missingFieldCounts[field] || 0) + 1;
      });
    });
    
    Object.entries(missingFieldCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        console.log(`   ${field}: ${count} games`);
      });
    console.log('');
    
    // Show sample incomplete games
    console.log('📋 Sample incomplete games (first 10):');
    incompleteGames.slice(0, 10).forEach((game, idx) => {
      console.log(`   ${idx + 1}. ${game.name} (ID: ${game.id})`);
      console.log(`      Missing: ${game.missingFields.join(', ')}`);
      console.log(`      bggDataCached: ${game.bggDataCached}`);
    });
    if (incompleteGames.length > 10) {
      console.log(`   ... and ${incompleteGames.length - 10} more\n`);
    } else {
      console.log('');
    }
    
    // DRY RUN first
    console.log('🔍 DRY RUN - Checking user references...\n');
    let totalReferences = 0;
    
    for (let i = 0; i < incompleteGames.length; i++) {
      const game = incompleteGames[i];
      const result = await deleteGameAndReferences(game, true);
      totalReferences += result.referencesCount;
      
      if ((i + 1) % 50 === 0 || i === incompleteGames.length - 1) {
        console.log(`   Processed ${i + 1}/${incompleteGames.length} games...`);
      }
    }
    
    console.log(`\n📊 DRY RUN Summary:`);
    console.log(`   Incomplete games found: ${incompleteGames.length}`);
    console.log(`   Total user references: ${totalReferences}`);
    console.log(`   Total deletions: ${incompleteGames.length} games + ${totalReferences} references\n`);
    
    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('⚠️  Are you sure you want to DELETE these incomplete games? (yes/no): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Deletion cancelled.\n');
      return;
    }
    
    // Perform actual deletion
    console.log('\n🗑️  Deleting incomplete games...\n');
    
    let deletedGames = 0;
    let deletedReferences = 0;
    let failedGames = 0;
    
    for (let i = 0; i < incompleteGames.length; i++) {
      const game = incompleteGames[i];
      const result = await deleteGameAndReferences(game, false);
      
      if (result.deleted) {
        deletedGames++;
        deletedReferences += result.referencesCount;
      } else {
        failedGames++;
      }
      
      // Progress indicator
      if ((i + 1) % 50 === 0 || i === incompleteGames.length - 1) {
        console.log(`   Progress: ${i + 1}/${incompleteGames.length} games processed...`);
      }
    }
    
    // Final summary
    console.log('\n📊 Deletion Summary:');
    console.log(`   ✅ Games deleted: ${deletedGames}`);
    console.log(`   ✅ User references deleted: ${deletedReferences}`);
    console.log(`   ❌ Failed deletions: ${failedGames}`);
    console.log(`   📦 Total processed: ${incompleteGames.length}\n`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
deleteIncompleteGames()
  .then(() => {
    console.log('✨ Script complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

