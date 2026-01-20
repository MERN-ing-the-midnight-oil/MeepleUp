#!/usr/bin/env node

/**
 * List all user names from Firebase
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

async function listUserNames() {
  console.log('\n📋 Fetching user names from Firebase...\n');
  
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
    
    // Extract user names
    const userNames = [];
    
    allUsers.forEach((user) => {
      const profile = firestoreUsers[user.uid] || {};
      const name = user.displayName || profile.name || user.email || 'N/A';
      userNames.push(name);
    });
    
    // Also include any orphaned profiles (profiles without auth accounts)
    Object.keys(firestoreUsers).forEach(uid => {
      if (!allUsers.find(u => u.uid === uid)) {
        const profile = firestoreUsers[uid];
        const name = profile.name || 'N/A';
        userNames.push(name);
      }
    });
    
    // Sort alphabetically
    userNames.sort();
    
    // Display user names
    console.log('User Names:');
    console.log('='.repeat(50));
    userNames.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });
    
    console.log('\n' + '='.repeat(50));
    console.log(`Total: ${userNames.length} users\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

listUserNames()
  .then(() => {
    console.log('✅ Complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

