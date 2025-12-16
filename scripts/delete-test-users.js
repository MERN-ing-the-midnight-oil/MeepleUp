#!/usr/bin/env node

/**
 * Delete All Test Users Script
 * Deletes all users with test email addresses
 */

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const auth = admin.auth();
const db = admin.firestore();

async function deleteTestUsers() {
  console.log('\n🔍 Finding test users...\n');
  
  try {
    // List all users
    const listUsersResult = await auth.listUsers();
    const users = listUsersResult.users;
    
    // Filter for test users (emails matching the pattern)
    const testUsers = users.filter(user => 
      user.email && (
        user.email.match(/^test-[a-z]+-\d+@meepleup\.test$/) ||
        user.email.match(/@meepleup\.(test|com)$/)
      )
    );
    
    if (testUsers.length === 0) {
      console.log('❌ No test users found.');
      return;
    }
    
    console.log(`Found ${testUsers.length} test users to delete\n`);
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const user of testUsers) {
      try {
        const userId = user.uid;
        
        // Delete user's games collection
        try {
          const gamesRef = db.collection('userGames').doc(userId).collection('games');
          const gamesSnapshot = await gamesRef.get();
          const batch = db.batch();
          gamesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
          if (gamesSnapshot.docs.length > 0) {
            await batch.commit();
            console.log(`  ✓ Deleted ${gamesSnapshot.docs.length} games for ${user.email}`);
          }
          // Delete the userGames document
          await db.collection('userGames').doc(userId).delete().catch(() => {});
        } catch (error) {
          console.log(`  ⚠️ Error deleting games for ${user.email}: ${error.message}`);
        }
        
        // Delete user's profile
        try {
          await db.collection('users').doc(userId).delete();
          console.log(`  ✓ Deleted profile for ${user.email}`);
        } catch (error) {
          console.log(`  ⚠️ Error deleting profile for ${user.email}: ${error.message}`);
        }
        
        // Delete the auth user
        await auth.deleteUser(userId);
        console.log(`✅ Deleted: ${user.email}`);
        deletedCount++;
      } catch (error) {
        console.log(`❌ Failed to delete ${user.email}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Successfully deleted ${deletedCount} users`);
    if (errorCount > 0) {
      console.log(`❌ Failed to delete ${errorCount} users`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deleteTestUsers()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

