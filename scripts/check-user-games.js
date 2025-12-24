#!/usr/bin/env node

/**
 * Check User Games Script
 * Verifies if test users have games in their Firestore collections
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
const auth = admin.auth();

async function checkUserGames() {
  console.log('\n🔍 Checking User Games in Firestore...\n');
  
  try {
    // Get all users
    const usersSnapshot = await auth.listUsers();
    const users = usersSnapshot.users;
    
    console.log(`Found ${users.length} total users\n`);
    
    let usersWithGames = 0;
    let usersWithoutGames = 0;
    let totalGames = 0;
    
    for (const user of users) {
      // Check all users, but prioritize test users
      const isTestUser = user.email && user.email.includes('@meepleup.test');
      
      try {
        const gamesSnapshot = await db
          .collection('userGames')
          .doc(user.uid)
          .collection('games')
          .get();
        
        const gameCount = gamesSnapshot.size;
        totalGames += gameCount;
        
        if (gameCount > 0) {
          usersWithGames++;
          const prefix = isTestUser ? '✅' : '✓';
          console.log(`${prefix} ${user.email || user.uid}`);
          console.log(`   Name: ${user.displayName || 'N/A'}`);
          console.log(`   Games: ${gameCount}`);
          
          // Show first 3 game titles
          if (gamesSnapshot.docs.length > 0) {
            const sampleGames = gamesSnapshot.docs.slice(0, 3).map(doc => {
              const data = doc.data();
              return data.title || data.gameName || 'Unknown';
            });
            console.log(`   Sample: ${sampleGames.join(', ')}${gameCount > 3 ? '...' : ''}`);
          }
          console.log('');
        } else {
          usersWithoutGames++;
          const prefix = isTestUser ? '❌' : '○';
          console.log(`${prefix} ${user.email || user.uid}`);
          console.log(`   Name: ${user.displayName || 'N/A'}`);
          console.log(`   Games: 0`);
          if (isTestUser) {
            console.log(`   (Test user - expected to have games)`);
          }
          console.log('');
        }
      } catch (error) {
        console.error(`⚠️  Error checking games for ${user.email || user.uid}:`, error.message);
        console.log('');
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total users checked: ${usersWithGames + usersWithoutGames}`);
    console.log(`   Users with games: ${usersWithGames}`);
    console.log(`   Users without games: ${usersWithoutGames}`);
    console.log(`   Total games: ${totalGames}`);
    console.log(`   Average games per user: ${usersWithGames > 0 ? (totalGames / usersWithGames).toFixed(1) : 0}`);
    
    if (usersWithoutGames > 0 && usersWithGames === 0) {
      console.log('\n⚠️  No users have games in Firestore.');
      console.log('   This explains why games are not showing in the app.');
      console.log('   You may need to re-run the create-test-data.js script.');
    } else if (usersWithoutGames > 0) {
      console.log('\n⚠️  Some users have no games in Firestore.');
      console.log('   This could explain why games are not showing for those users.');
    }
    
  } catch (error) {
    console.error('Error checking user games:', error);
    process.exit(1);
  }
}

checkUserGames()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

