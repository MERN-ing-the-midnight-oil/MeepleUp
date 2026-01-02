#!/usr/bin/env node

/**
 * Script to delete all games in Firestore that are missing critical data
 * Critical data: thumbnail, image, description
 * 
 * Usage:
 *   node scripts/delete-games-missing-critical-data.js --dry-run  # Preview what will be deleted
 *   node scripts/delete-games-missing-critical-data.js            # Actually delete
 */

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const GAMES_COLLECTION = 'games';
const BATCH_SIZE = 500; // Firestore batch limit

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function isMissingCriticalData(game) {
  return !game.thumbnail || game.thumbnail === '' || game.thumbnail === null ||
         !game.image || game.image === '' || game.image === null ||
         !game.description || game.description === '' || game.description === null;
}

async function findGamesToDelete() {
  console.log('🔍 Scanning all games in Firestore for missing critical data...\n');
  
  const gamesToDelete = [];
  let totalGames = 0;
  
  try {
    // Get all games (in batches to avoid memory issues)
    let lastDoc = null;
    let hasMore = true;
    
    while (hasMore) {
      let query = db.collection(GAMES_COLLECTION).limit(BATCH_SIZE);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }
      
      snapshot.forEach((doc) => {
        totalGames++;
        const game = { id: doc.id, ...doc.data() };
        
        if (isMissingCriticalData(game)) {
          gamesToDelete.push({
            id: doc.id,
            name: game.name || 'Unknown'
          });
        }
        
        lastDoc = doc;
      });
      
      // If we got fewer results than batchSize, we're done
      if (snapshot.size < BATCH_SIZE) {
        hasMore = false;
      }
      
      // Log progress
      if (totalGames % 1000 === 0) {
        console.log(`  Scanned ${totalGames} games... (found ${gamesToDelete.length} to delete)`);
      }
    }
    
    return { gamesToDelete, totalGames };
  } catch (error) {
    console.error('❌ Error scanning games:', error);
    throw error;
  }
}

async function deleteGames(gamesToDelete) {
  console.log(`\n🗑️  Deleting ${gamesToDelete.length} games...\n`);
  
  let deletedCount = 0;
  let errorCount = 0;
  
  // Delete in batches (Firestore batch limit is 500)
  for (let i = 0; i < gamesToDelete.length; i += BATCH_SIZE) {
    const batch = gamesToDelete.slice(i, i + BATCH_SIZE);
    const firestoreBatch = db.batch();
    
    batch.forEach((game) => {
      const docRef = db.collection(GAMES_COLLECTION).doc(game.id);
      firestoreBatch.delete(docRef);
    });
    
    try {
      await firestoreBatch.commit();
      deletedCount += batch.length;
      
      if (deletedCount % 500 === 0 || i + BATCH_SIZE >= gamesToDelete.length) {
        console.log(`  Deleted ${deletedCount} / ${gamesToDelete.length} games...`);
      }
    } catch (error) {
      console.error(`  ❌ Error deleting batch ${i / BATCH_SIZE + 1}:`, error.message);
      errorCount += batch.length;
    }
  }
  
  return { deletedCount, errorCount };
}

async function main() {
  try {
    // Find games to delete
    const { gamesToDelete, totalGames } = await findGamesToDelete();
    
    console.log('\n📊 Summary:');
    console.log(`  Total games scanned: ${totalGames}`);
    console.log(`  Games with missing critical data: ${gamesToDelete.length} (${((gamesToDelete.length / totalGames) * 100).toFixed(1)}%)`);
    console.log(`  Games to keep: ${totalGames - gamesToDelete.length} (${(((totalGames - gamesToDelete.length) / totalGames) * 100).toFixed(1)}%)`);
    
    if (gamesToDelete.length === 0) {
      console.log('\n✅ No games with missing critical data found. Nothing to delete!');
      process.exit(0);
    }
    
    // Show sample of games that will be deleted
    console.log(`\n📝 Sample of games that will be deleted (first 10):`);
    gamesToDelete.slice(0, 10).forEach((game, index) => {
      console.log(`  ${index + 1}. [${game.id}] ${game.name}`);
    });
    if (gamesToDelete.length > 10) {
      console.log(`  ... and ${gamesToDelete.length - 10} more`);
    }
    
    if (isDryRun) {
      console.log('\n🔍 DRY RUN MODE - No games were actually deleted');
      console.log('   Run without --dry-run flag to actually delete these games');
      process.exit(0);
    }
    
    // Confirm deletion
    console.log('\n⚠️  WARNING: This will permanently delete these games from Firestore!');
    const rl = createReadlineInterface();
    const answer = await question(rl, `Are you sure you want to delete ${gamesToDelete.length} games? (yes/no): `);
    rl.close();
    
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n❌ Deletion cancelled');
      process.exit(0);
    }
    
    // Delete games
    console.log('\n🗑️  Starting deletion...');
    const { deletedCount, errorCount } = await deleteGames(gamesToDelete);
    
    // Final summary
    console.log('\n✅ Deletion completed!');
    console.log(`  Successfully deleted: ${deletedCount} games`);
    if (errorCount > 0) {
      console.log(`  Errors: ${errorCount} games`);
    }
    console.log(`  Remaining games: ${totalGames - deletedCount}`);
    
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

