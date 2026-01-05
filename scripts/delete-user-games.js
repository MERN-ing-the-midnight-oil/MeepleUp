#!/usr/bin/env node

/**
 * Delete User Games Script
 * Deletes all games for specific users by email address
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

// Users whose games should be deleted
const TARGET_EMAILS = [
  'bob@email.com',
  'charlie@email.com',
  'diana@email.com',
  'eve@email.com',
  'frank@email.com',
];

async function deleteUserGames() {
  console.log('\n🗑️  Delete User Games Script\n');
  console.log('Target users:');
  TARGET_EMAILS.forEach(email => console.log(`  - ${email}`));
  console.log('');

  try {
    // Find users by email
    const usersToProcess = [];
    
    for (const email of TARGET_EMAILS) {
      try {
        const user = await auth.getUserByEmail(email.toLowerCase());
        usersToProcess.push({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'N/A',
        });
        console.log(`✅ Found user: ${email} (${user.uid})`);
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          console.log(`⚠️  User not found: ${email}`);
        } else {
          console.log(`❌ Error finding user ${email}: ${error.message}`);
        }
      }
    }

    if (usersToProcess.length === 0) {
      console.log('\n❌ No users found to process.');
      return;
    }

    console.log(`\n📊 Found ${usersToProcess.length} users to process\n`);

    let totalGamesDeleted = 0;
    let usersProcessed = 0;
    let errors = 0;

    // Delete games for each user
    for (const user of usersToProcess) {
      try {
        console.log(`\nProcessing: ${user.email} (${user.displayName})`);
        
        const gamesRef = db.collection('userGames').doc(user.uid).collection('games');
        const gamesSnapshot = await gamesRef.get();
        
        if (gamesSnapshot.empty) {
          console.log(`  ✓ No games found for ${user.email}`);
          usersProcessed++;
          continue;
        }

        console.log(`  Found ${gamesSnapshot.docs.length} games to delete...`);

        // Delete games in batches (Firestore batch limit is 500)
        const batchSize = 500;
        const batches = [];
        let currentBatch = db.batch();
        let batchCount = 0;

        gamesSnapshot.docs.forEach((doc, index) => {
          currentBatch.delete(doc.ref);
          
          if ((index + 1) % batchSize === 0 || index === gamesSnapshot.docs.length - 1) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            batchCount++;
          }
        });

        // Commit all batches
        for (let i = 0; i < batches.length; i++) {
          await batches[i].commit();
          console.log(`  ✓ Deleted batch ${i + 1}/${batches.length}`);
        }

        const gamesDeleted = gamesSnapshot.docs.length;
        totalGamesDeleted += gamesDeleted;
        usersProcessed++;
        
        console.log(`  ✅ Deleted ${gamesDeleted} games for ${user.email}`);

        // Optionally delete the userGames document itself (it will be recreated if needed)
        try {
          await db.collection('userGames').doc(user.uid).delete();
          console.log(`  ✅ Deleted userGames document for ${user.email}`);
        } catch (error) {
          // Ignore if document doesn't exist
          if (error.code !== 5) { // 5 = NOT_FOUND
            console.log(`  ⚠️  Could not delete userGames document: ${error.message}`);
          }
        }

      } catch (error) {
        console.log(`  ❌ Error processing ${user.email}: ${error.message}`);
        errors++;
      }
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log(`  ✅ Users processed: ${usersProcessed}`);
    console.log(`  ✅ Total games deleted: ${totalGamesDeleted}`);
    if (errors > 0) {
      console.log(`  ❌ Errors: ${errors}`);
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

deleteUserGames()
  .then(() => {
    console.log('✨ Script complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });


