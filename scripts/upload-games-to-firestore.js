/**
 * Script to upload game database from CSV to Firestore
 * Run this once to populate the Firebase database
 * 
 * Prerequisites:
 * 1. Install firebase-admin: npm install --save-dev firebase-admin
 * 2. Download your Firebase service account key:
 *    - Go to Firebase Console → Project Settings → Service Accounts
 *    - Click "Generate New Private Key"
 *    - Save it as 'firebase-service-account.json' in the project root
 * 
 * Usage: node scripts/upload-games-to-firestore.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: firebase-service-account.json not found!');
  console.error('\nTo get your service account key:');
  console.error('1. Go to https://console.firebase.google.com/');
  console.error('2. Select your project: meepleup-951a1');
  console.error('3. Go to Project Settings → Service Accounts');
  console.error('4. Click "Generate New Private Key"');
  console.error('5. Save the file as "firebase-service-account.json" in the project root');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const gamesRef = db.collection('games');

// Helper function to parse CSV line (handles quoted fields)
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

async function uploadGames() {
  // Use filtered CSV if it exists, otherwise use the full CSV
  const filteredPath = path.join(__dirname, '../src/assets/data/boardgames_ranks_filtered.csv');
  const fullPath = path.join(__dirname, '../src/assets/data/boardgames_ranks.csv');
  const csvPath = fs.existsSync(filteredPath) ? filteredPath : fullPath;
  
  if (fs.existsSync(filteredPath)) {
    console.log('📋 Using filtered CSV (top games only)');
  } else {
    console.log('📋 Using full CSV (all games)');
  }
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  console.log('📖 Reading CSV file...');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error('❌ Error: CSV file appears to be empty or invalid');
    process.exit(1);
  }

  const header = parseCSVLine(lines[0]);
  console.log('📋 Headers:', header.join(', '));
  console.log(`📊 Total games to upload: ${lines.length - 1}\n`);

  let batch = db.batch();
  let batchCount = 0;
  let totalUploaded = 0;
  const BATCH_SIZE = 500; // Firestore batch limit
  
  console.log('🚀 Starting upload...\n');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    
    if (values.length !== header.length) {
      console.warn(`⚠️  Row ${i + 1}: Expected ${header.length} columns, got ${values.length}. Skipping.`);
      continue;
    }
    
    // Build game object
    const game = {};
    let gameId = null;
    
    header.forEach((colName, index) => {
      const value = values[index] || '';
      const normalizedName = colName.toLowerCase();
      
      switch (normalizedName) {
        case 'id':
          gameId = value;
          game.id = value;
          break;
        case 'name':
          game.name = value;
          game.nameLower = value.toLowerCase(); // For case-insensitive search
          break;
        case 'yearpublished':
          game.yearPublished = value;
          break;
        case 'rank':
          game.rank = value;
          break;
        case 'bayesaverage':
          game.bayesAverage = value;
          break;
        case 'average':
          game.average = value;
          break;
        case 'usersrated':
          game.usersRated = value;
          break;
        case 'abstracts_rank':
          game.abstractsRank = value;
          break;
        case 'cgs_rank':
          game.cgsRank = value;
          break;
        case 'childrensgames_rank':
          game.childrensGamesRank = value;
          break;
        case 'familygames_rank':
          game.familyGamesRank = value;
          break;
        case 'partygames_rank':
          game.partyGamesRank = value;
          break;
        case 'strategygames_rank':
          game.strategyGamesRank = value;
          break;
        case 'thematic_rank':
          game.thematicRank = value;
          break;
        case 'wargames_rank':
          game.wargamesRank = value;
          break;
        case 'is_expansion':
          // Skip this field as it's not in the Firestore schema
          break;
      }
    });
    
    if (!gameId) {
      console.warn(`⚠️  Row ${i + 1}: No ID found. Skipping.`);
      continue;
    }
    
    const docRef = gamesRef.doc(gameId);
    batch.set(docRef, game);
    batchCount++;
    totalUploaded++;
    
    // Commit batch when it reaches the limit
    if (batchCount >= BATCH_SIZE) {
      try {
        await batch.commit();
        console.log(`✅ Uploaded batch: ${totalUploaded} games processed (${((totalUploaded / (lines.length - 1)) * 100).toFixed(1)}%)`);
        batch = db.batch();
        batchCount = 0;
      } catch (error) {
        console.error(`❌ Error uploading batch at row ${i + 1}:`, error.message);
        throw error;
      }
    }
  }
  
  // Commit final batch
  if (batchCount > 0) {
    try {
      await batch.commit();
      console.log(`✅ Uploaded final batch: ${totalUploaded} games processed`);
    } catch (error) {
      console.error('❌ Error uploading final batch:', error.message);
      throw error;
    }
  }
  
  console.log(`\n🎉 Upload complete! Total games uploaded: ${totalUploaded}`);
  console.log('\n📝 Next steps:');
  console.log('1. Go to Firestore → Indexes and create a composite index:');
  console.log('   - Collection: games');
  console.log('   - Fields: nameLower (Ascending), rank (Ascending)');
  console.log('2. Test searching for games in your app');
}

uploadGames()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Upload failed:', error);
    process.exit(1);
  });
