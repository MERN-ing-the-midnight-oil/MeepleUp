/**
 * Script to query Firebase for a game by name
 * Usage: node scripts/query-game.js "Game Name"
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

async function queryGame(gameName) {
  if (!gameName) {
    console.error('❌ Please provide a game name');
    console.log('Usage: node scripts/query-game.js "Game Name"');
    process.exit(1);
  }

  console.log(`🔍 Searching for game: "${gameName}"\n`);
  
  try {
    const searchTerm = gameName.toLowerCase().trim();
    
    // Query using nameLower field (case-insensitive search)
    const gamesRef = db.collection(GAMES_COLLECTION);
    
    // Try exact match first
    let query = gamesRef
      .where('nameLower', '==', searchTerm)
      .limit(10);
    
    let snapshot = await query.get();
    
    if (snapshot.empty) {
      // Try prefix match (starts with)
      const searchUpperBound = searchTerm + '\uf8ff';
      query = gamesRef
        .where('nameLower', '>=', searchTerm)
        .where('nameLower', '<=', searchUpperBound)
        .orderBy('nameLower')
        .limit(20);
      
      snapshot = await query.get();
    }
    
    if (snapshot.empty) {
      // Try contains match (more expensive, but more flexible)
      // Note: Firestore doesn't support "contains" directly, so we'll do a broader prefix search
      const firstWord = searchTerm.split(/\s+/)[0];
      const searchUpperBound = firstWord + '\uf8ff';
      query = gamesRef
        .where('nameLower', '>=', firstWord)
        .where('nameLower', '<=', searchUpperBound)
        .orderBy('nameLower')
        .limit(50);
      
      snapshot = await query.get();
      
      // Filter client-side for contains match
      if (!snapshot.empty) {
        const filteredDocs = snapshot.docs.filter(doc => {
          const nameLower = doc.data().nameLower || '';
          return nameLower.includes(searchTerm);
        });
        
        if (filteredDocs.length > 0) {
          snapshot = {
            empty: false,
            size: filteredDocs.length,
            docs: filteredDocs
          };
        }
      }
    }
    
    if (snapshot.empty) {
      console.log(`❌ No games found matching "${gameName}"`);
      return;
    }
    
    console.log(`✅ Found ${snapshot.size} game(s) matching "${gameName}":\n`);
    
    snapshot.forEach((doc, index) => {
      const game = doc.data();
      console.log(`${index + 1}. ${game.name || 'Unknown'}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   BGG ID: ${game.id || 'N/A'}`);
      console.log(`   Year Published: ${game.yearPublished || 'N/A'}`);
      console.log(`   Rank: ${game.rank || 'N/A'}`);
      console.log(`   Average Rating: ${game.average || 'N/A'}`);
      console.log(`   Users Rated: ${game.usersRated || 'N/A'}`);
      if (game.thumbnail) {
        console.log(`   Thumbnail: ${game.thumbnail.substring(0, 60)}...`);
      }
      if (game.image) {
        console.log(`   Image: ${game.image.substring(0, 60)}...`);
      }
      if (game.description) {
        const desc = game.description.substring(0, 150);
        console.log(`   Description: ${desc}${game.description.length > 150 ? '...' : ''}`);
      }
      console.log('');
    });
    
    // Show full JSON for first result
    if (snapshot.size > 0) {
      const firstGame = snapshot.docs[0].data();
      console.log('\n📄 Full data for first result:');
      console.log(JSON.stringify({ id: snapshot.docs[0].id, ...firstGame }, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error querying game:', error);
    throw error;
  }
}

// Get game name from command line arguments
const gameName = process.argv[2] || 'Islebound';

// Run the script
queryGame(gameName)
  .then(() => {
    console.log('\n✅ Query completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });

