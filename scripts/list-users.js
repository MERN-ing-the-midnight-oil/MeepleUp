#!/usr/bin/env node

/**
 * List all users from Firebase Authentication and Firestore
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

async function listUsers() {
  console.log('\n📋 Fetching all users from Firebase...\n');
  
  try {
    // Get all users from Firebase Authentication
    let allUsers = [];
    let nextPageToken;
    
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      allUsers = allUsers.concat(listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    
    console.log(`✅ Found ${allUsers.length} users in Firebase Authentication\n`);
    
    // Get user profiles from Firestore
    const usersSnapshot = await db.collection('users').get();
    const firestoreUsers = {};
    usersSnapshot.docs.forEach(doc => {
      firestoreUsers[doc.id] = doc.data();
    });
    
    console.log(`✅ Found ${usersSnapshot.size} user profiles in Firestore\n`);
    
    // Display users in a table-like format
    console.log('='.repeat(120));
    console.log('USER LIST');
    console.log('='.repeat(120));
    console.log();
    
    allUsers.forEach((user, index) => {
      const profile = firestoreUsers[user.uid] || {};
      const email = user.email || 'N/A';
      const name = user.displayName || profile.name || 'N/A';
      const emailVerified = user.emailVerified ? '✓' : '✗';
      const createdAt = user.metadata.creationTime 
        ? new Date(user.metadata.creationTime).toLocaleDateString()
        : 'N/A';
      const lastSignIn = user.metadata.lastSignInTime
        ? new Date(user.metadata.lastSignInTime).toLocaleDateString()
        : 'Never';
      
      console.log(`${index + 1}. ${name}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Email: ${email} (Verified: ${emailVerified})`);
      console.log(`   Created: ${createdAt}`);
      console.log(`   Last Sign In: ${lastSignIn}`);
      
      if (profile.bggUsername) {
        console.log(`   BGG Username: ${profile.bggUsername}`);
      }
      
      if (profile.zipcode) {
        console.log(`   Zipcode: ${profile.zipcode}`);
      }
      
      if (profile.groupIds && profile.groupIds.length > 0) {
        console.log(`   Groups: ${profile.groupIds.length}`);
      }
      
      console.log();
    });
    
    // Summary statistics
    const usersWithProfiles = allUsers.filter(u => firestoreUsers[u.uid]).length;
    const usersWithoutProfiles = allUsers.filter(u => !firestoreUsers[u.uid]).length;
    const orphanedProfiles = Object.keys(firestoreUsers).filter(uid => !allUsers.find(u => u.uid === uid)).length;
    
    console.log('='.repeat(120));
    console.log('SUMMARY');
    console.log('='.repeat(120));
    console.log(`Total users in Firebase Auth: ${allUsers.length}`);
    console.log(`Total profiles in Firestore: ${Object.keys(firestoreUsers).length}`);
    console.log(`Users with profiles: ${usersWithProfiles}`);
    console.log(`Users without profiles: ${usersWithoutProfiles}`);
    if (orphanedProfiles > 0) {
      console.log(`⚠️  Orphaned profiles (no auth account): ${orphanedProfiles}`);
    }
    console.log(`Email verified: ${allUsers.filter(u => u.emailVerified).length}`);
    console.log(`Email not verified: ${allUsers.filter(u => !u.emailVerified).length}`);
    
    // Users created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = allUsers.filter(u => {
      const created = new Date(u.metadata.creationTime);
      return created > thirtyDaysAgo;
    });
    console.log(`Users created in last 30 days: ${recentUsers.length}`);
    
    // Users who signed in in last 30 days
    const activeUsers = allUsers.filter(u => {
      if (!u.metadata.lastSignInTime) return false;
      const lastSignIn = new Date(u.metadata.lastSignInTime);
      return lastSignIn > thirtyDaysAgo;
    });
    console.log(`Active users (signed in last 30 days): ${activeUsers.length}`);
    
    console.log();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

listUsers()
  .then(() => {
    console.log('✅ List complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

