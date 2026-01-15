#!/usr/bin/env node

/**
 * Delete specific users by email or UID
 * Usage: node scripts/delete-specific-users.js
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

// Users to delete (can specify by email or UID)
const usersToDelete = [
  'merningthemidnightoil@gmail.com', // Mearn
  'tisketlist@gmail.com', // Tisket Lister
  'blueheronfamilies@gmail.com', // Blue Heron
  'fridgedoorpics@gmail.com', // Fridge Door
  'hometitlewatcher@gmail.com', // Home Title Watcher
];

async function deleteUser(userId) {
  try {
    // Delete user's games collection
    try {
      const gamesRef = db.collection('userGames').doc(userId).collection('games');
      const gamesSnapshot = await gamesRef.get();
      if (!gamesSnapshot.empty) {
        const batch = db.batch();
        gamesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`  ✓ Deleted ${gamesSnapshot.docs.length} games`);
      }
      // Delete the userGames document
      await db.collection('userGames').doc(userId).delete().catch(() => {});
    } catch (error) {
      console.log(`  ⚠️  Error deleting games: ${error.message}`);
    }
    
    // Delete user's profile
    try {
      await db.collection('users').doc(userId).delete();
      console.log(`  ✓ Deleted profile`);
    } catch (error) {
      console.log(`  ⚠️  Error deleting profile: ${error.message}`);
    }
    
    // Delete the auth user
    await auth.deleteUser(userId);
    console.log(`  ✓ Deleted auth account`);
    
    return true;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function deleteSpecificUsers() {
  console.log('\n🔍 Finding users to delete...\n');
  
  try {
    const usersToDeleteInfo = [];
    
    // Get user info for each email/UID
    for (const identifier of usersToDelete) {
      try {
        let user;
        if (identifier.includes('@')) {
          // It's an email
          user = await auth.getUserByEmail(identifier);
        } else {
          // It's a UID
          user = await auth.getUser(identifier);
        }
        
        usersToDeleteInfo.push({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'N/A',
        });
      } catch (error) {
        console.log(`⚠️  User not found: ${identifier} (${error.message})`);
      }
    }
    
    if (usersToDeleteInfo.length === 0) {
      console.log('❌ No users found to delete.');
      return;
    }
    
    console.log(`Found ${usersToDeleteInfo.length} users to delete:\n`);
    usersToDeleteInfo.forEach((user, index) => {
      console.log(`${index + 1}. ${user.displayName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   UID: ${user.uid}`);
      console.log();
    });
    
    console.log('🗑️  Deleting users...\n');
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const user of usersToDeleteInfo) {
      console.log(`Deleting: ${user.displayName} (${user.email})`);
      const success = await deleteUser(user.uid);
      if (success) {
        console.log(`✅ Successfully deleted: ${user.email}\n`);
        deletedCount++;
      } else {
        console.log(`❌ Failed to delete: ${user.email}\n`);
        errorCount++;
      }
    }
    
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total users to delete: ${usersToDeleteInfo.length}`);
    console.log(`Successfully deleted: ${deletedCount}`);
    if (errorCount > 0) {
      console.log(`Failed: ${errorCount}`);
    }
    console.log();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteSpecificUsers()
  .then(() => {
    console.log('✅ Deletion complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });




