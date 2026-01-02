/**
 * Script to check all games in Firestore for missing critical data
 * Critical data: thumbnail, image, description
 */

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const GAMES_COLLECTION = 'games';

async function checkGamesMissingCriticalData() {
  console.log('🔍 Checking all games in Firestore for missing critical data...\n');
  
  let totalGames = 0;
  let missingThumbnail = 0;
  let missingImage = 0;
  let missingDescription = 0;
  let missingAnyCritical = 0;
  const gamesMissingData = [];
  
  try {
    // Get all games (in batches to avoid memory issues)
    const batchSize = 500;
    let lastDoc = null;
    let hasMore = true;
    
    while (hasMore) {
      let query = db.collection(GAMES_COLLECTION).limit(batchSize);
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
        
        const missingFields = [];
        let isMissingCritical = false;
        
        // Check for missing thumbnail
        if (!game.thumbnail || game.thumbnail === '' || game.thumbnail === null) {
          missingThumbnail++;
          missingFields.push('thumbnail');
          isMissingCritical = true;
        }
        
        // Check for missing image
        if (!game.image || game.image === '' || game.image === null) {
          missingImage++;
          missingFields.push('image');
          isMissingCritical = true;
        }
        
        // Check for missing description
        if (!game.description || game.description === '' || game.description === null) {
          missingDescription++;
          missingFields.push('description');
          isMissingCritical = true;
        }
        
        if (isMissingCritical) {
          missingAnyCritical++;
          gamesMissingData.push({
            id: game.id,
            name: game.name || 'Unknown',
            missingFields
          });
        }
        
        lastDoc = doc;
      });
      
      // If we got fewer results than batchSize, we're done
      if (snapshot.size < batchSize) {
        hasMore = false;
      }
      
      // Log progress
      if (totalGames % 1000 === 0) {
        console.log(`  Processed ${totalGames} games...`);
      }
    }
    
    // Print summary
    console.log('\n📊 Summary:');
    console.log(`  Total games: ${totalGames}`);
    console.log(`  Games missing thumbnail: ${missingThumbnail} (${((missingThumbnail / totalGames) * 100).toFixed(1)}%)`);
    console.log(`  Games missing image: ${missingImage} (${((missingImage / totalGames) * 100).toFixed(1)}%)`);
    console.log(`  Games missing description: ${missingDescription} (${((missingDescription / totalGames) * 100).toFixed(1)}%)`);
    console.log(`  Games missing ANY critical data: ${missingAnyCritical} (${((missingAnyCritical / totalGames) * 100).toFixed(1)}%)`);
    
    // Print detailed list (limited to first 50 for readability)
    if (gamesMissingData.length > 0) {
      console.log(`\n⚠️  Games Missing Critical Data (showing first ${Math.min(50, gamesMissingData.length)}):`);
      gamesMissingData.slice(0, 50).forEach((game, index) => {
        console.log(`  ${index + 1}. [${game.id}] ${game.name}`);
        console.log(`     Missing: ${game.missingFields.join(', ')}`);
      });
      
      if (gamesMissingData.length > 50) {
        console.log(`  ... and ${gamesMissingData.length - 50} more games missing critical data`);
      }
      
      // Save full list to file
      const fs = require('fs');
      const filename = `games-missing-critical-data-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify(gamesMissingData, null, 2));
      console.log(`\n💾 Full list saved to: ${filename}`);
    } else {
      console.log('\n✅ All games have critical data!');
    }
    
  } catch (error) {
    console.error('❌ Error checking games:', error);
    throw error;
  }
}

// Run the script
checkGamesMissingCriticalData()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

