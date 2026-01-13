#!/usr/bin/env node

/**
 * Delete orphaned user profiles from Firestore
 * Orphaned profiles are user documents in Firestore that don't have corresponding Firebase Authentication accounts
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

async function deleteOrphanedProfiles() {
  console.log('\n🔍 Finding orphaned user profiles...\n');
  
  try {
    // Get all users from Firebase Authentication
    let allUsers = [];
    let nextPageToken;
    
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      allUsers = allUsers.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    
    const authUserIds = new Set(allUsers.map(u => u.uid));
    console.log(`✅ Found ${allUsers.length} users in Firebase Authentication\n`);
    
    // Get all user profiles from Firestore
    const usersSnapshot = await db.collection('users').get();
    console.log(`✅ Found ${usersSnapshot.size} user profiles in Firestore\n`);
    
    // Find orphaned profiles (profiles without auth accounts)
    const orphanedProfiles = [];
    usersSnapshot.docs.forEach(doc => {
      if (!authUserIds.has(doc.id)) {
        orphanedProfiles.push({
          id: doc.id,
          data: doc.data(),
        });
      }
    });
    
    if (orphanedProfiles.length === 0) {
      console.log('✅ No orphaned profiles found. All profiles have corresponding auth accounts.\n');
      return;
    }
    
    // Display orphaned profiles
    console.log('='.repeat(120));
    console.log(`ORPHANED PROFILES (${orphanedProfiles.length})`);
    console.log('='.repeat(120));
    console.log();
    
    orphanedProfiles.forEach((profile, index) => {
      const data = profile.data;
      console.log(`${index + 1}. ${data.name || 'Unnamed'}`);
      console.log(`   UID: ${profile.id}`);
      console.log(`   Email: ${data.email || 'N/A'}`);
      if (data.bggUsername) {
        console.log(`   BGG Username: ${data.bggUsername}`);
      }
      if (data.createdAt) {
        const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        console.log(`   Created: ${createdAt.toLocaleDateString()}`);
      }
      console.log();
    });
    
    // Delete orphaned profiles
    console.log('🗑️  Deleting orphaned profiles...\n');
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const profile of orphanedProfiles) {
      try {
        await db.collection('users').doc(profile.id).delete();
        console.log(`✅ Deleted: ${profile.data.name || 'Unnamed'} (${profile.id})`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Error deleting ${profile.id}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log();
    console.log('='.repeat(120));
    console.log('SUMMARY');
    console.log('='.repeat(120));
    console.log(`Total orphaned profiles found: ${orphanedProfiles.length}`);
    console.log(`Successfully deleted: ${deletedCount}`);
    if (errorCount > 0) {
      console.log(`Errors: ${errorCount}`);
    }
    console.log();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteOrphanedProfiles()
  .then(() => {
    console.log('✅ Cleanup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });



