#!/usr/bin/env node

/**
 * Find email for a specific user by name
 */

require('dotenv').config();

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const auth = admin.auth();

async function findUserEmail(searchName) {
  console.log(`\n🔍 Searching for user: "${searchName}"...\n`);
  
  try {
    // Get all users from Firebase Authentication
    let allUsers = [];
    let nextPageToken;
    
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      allUsers = allUsers.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    
    // Get user profiles from Firestore
    const usersSnapshot = await db.collection('users').get();
    const firestoreUsers = {};
    usersSnapshot.docs.forEach(doc => {
      firestoreUsers[doc.id] = doc.data();
    });
    
    // Search for matching users
    const matches = [];
    
    allUsers.forEach((user) => {
      const profile = firestoreUsers[user.uid] || {};
      const name = user.displayName || profile.name || 'N/A';
      
      if (name.toLowerCase().includes(searchName.toLowerCase())) {
        matches.push({
          name: name,
          email: user.email || 'N/A',
          uid: user.uid,
          emailVerified: user.emailVerified,
        });
      }
    });
    
    // Also check orphaned profiles
    Object.keys(firestoreUsers).forEach(uid => {
      if (!allUsers.find(u => u.uid === uid)) {
        const profile = firestoreUsers[uid];
        const name = profile.name || 'N/A';
        if (name.toLowerCase().includes(searchName.toLowerCase())) {
          matches.push({
            name: name,
            email: 'N/A (orphaned profile - no auth account)',
            uid: uid,
            emailVerified: false,
          });
        }
      }
    });
    
    if (matches.length === 0) {
      console.log(`❌ No users found matching "${searchName}"`);
    } else {
      console.log(`✅ Found ${matches.length} match(es):\n`);
      matches.forEach((match, index) => {
        console.log(`${index + 1}. Name: ${match.name}`);
        console.log(`   Email: ${match.email}`);
        console.log(`   UID: ${match.uid}`);
        console.log(`   Email Verified: ${match.emailVerified ? '✓' : '✗'}`);
        console.log();
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const searchName = process.argv[2] || 'Flea Market';

findUserEmail(searchName)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

