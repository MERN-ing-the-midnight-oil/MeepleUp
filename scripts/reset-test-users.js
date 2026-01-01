#!/usr/bin/env node

/**
 * Reset Test Users Script
 * Deletes existing test users and recreates them with fresh data
 * Uses email format: "bob@email.com" (lowercase)
 */

// Load environment variables from .env file
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

// Helper functions
const log = (message, type = 'info') => {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
};

// Test users configuration - using lowercase emails like "bob@email.com"
const testUsers = [
  { name: 'Alice', email: 'alice@email.com', bio: 'Board game enthusiast and event organizer' },
  { name: 'Bob', email: 'bob@email.com', bio: 'Love strategy games and game nights' },
  { name: 'Charlie', email: 'charlie@email.com', bio: 'Casual gamer, always up for a game night' },
  { name: 'Diana', email: 'diana@email.com', bio: 'Card game specialist and social gamer' },
  { name: 'Eve', email: 'eve@email.com', bio: 'Miniatures and tabletop gaming fan' },
  { name: 'Frank', email: 'frank@email.com', bio: 'Collector and game night regular' },
];

const TEST_PASSWORD = 'asdfasdf';

/**
 * Delete test users
 */
async function deleteTestUsers() {
  log('\n=== Deleting Existing Test Users ===', 'info');
  
  try {
    // List all users
    const listUsersResult = await auth.listUsers();
    const users = listUsersResult.users;
    
    // Filter for test users (matching our email pattern)
    const testUserEmails = testUsers.map(u => u.email.toLowerCase());
    const usersToDelete = users.filter(user => 
      user.email && testUserEmails.includes(user.email.toLowerCase())
    );
    
    if (usersToDelete.length === 0) {
      log('No existing test users found to delete', 'warning');
      return;
    }
    
    log(`Found ${usersToDelete.length} test users to delete`, 'info');
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const user of usersToDelete) {
      try {
        const userId = user.uid;
        
        // Delete user's games collection
        try {
          const gamesRef = db.collection('userGames').doc(userId).collection('games');
          const gamesSnapshot = await gamesRef.get();
          
          if (!gamesSnapshot.empty) {
            const batch = db.batch();
            gamesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            log(`  Deleted ${gamesSnapshot.docs.length} games for ${user.email}`, 'success');
          }
          
          // Delete the userGames document
          await db.collection('userGames').doc(userId).delete().catch(() => {});
        } catch (error) {
          log(`  Error deleting games for ${user.email}: ${error.message}`, 'warning');
        }
        
        // Delete user's profile
        try {
          await db.collection('users').doc(userId).delete();
          log(`  Deleted profile for ${user.email}`, 'success');
        } catch (error) {
          log(`  Error deleting profile for ${user.email}: ${error.message}`, 'warning');
        }
        
        // Delete any gaming groups where user is organizer or member
        try {
          const groupsQuery = await db.collection('gamingGroups')
            .where('organizerId', '==', userId)
            .get();
          
          for (const groupDoc of groupsQuery.docs) {
            await groupDoc.ref.delete();
            log(`  Deleted gaming group ${groupDoc.id} (organizer: ${user.email})`, 'success');
          }
        } catch (error) {
          log(`  Error deleting gaming groups for ${user.email}: ${error.message}`, 'warning');
        }
        
        // Delete the auth user
        await auth.deleteUser(userId);
        log(`Deleted: ${user.email}`, 'success');
        deletedCount++;
      } catch (error) {
        log(`Failed to delete ${user.email}: ${error.message}`, 'error');
        errorCount++;
      }
    }
    
    log(`Successfully deleted ${deletedCount} users`, 'success');
    if (errorCount > 0) {
      log(`Failed to delete ${errorCount} users`, 'error');
    }
    
  } catch (error) {
    log(`Error during deletion: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Create a test user
 */
async function createUser(userConfig) {
  try {
    log(`Creating user: ${userConfig.name} (${userConfig.email})`, 'info');
    
    const user = await auth.createUser({
      email: userConfig.email.toLowerCase(),
      password: TEST_PASSWORD,
      displayName: userConfig.name,
      emailVerified: true,
    });
    
    // Create user profile in Firestore
    await db.collection('users').doc(user.uid).set({
      id: user.uid,
      email: user.email,
      name: userConfig.name,
      bio: userConfig.bio,
      bggUsername: '',
      zipcode: '',
      avatarUrl: '',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      notificationPreferences: {
        meepleupChanges: true,
        eventReminders: true,
        eventReminderHours: 24,
        gameMarking: true,
        discussion: true,
        discussionEmail: false,
        discussionFrequency: 'all',
      },
      personalMatchWeights: {
        publisher: 3,
        mechanics: 3,
        category: 2,
        complexity: 1.5,
        favorite: 2,
      },
    });
    
    log(`Created user: ${userConfig.name}`, 'success');
    return { uid: user.uid, name: userConfig.name, email: user.email };
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      log(`User ${userConfig.email} already exists (shouldn't happen after deletion), skipping...`, 'warning');
      // Try to get existing user
      const existingUser = await auth.getUserByEmail(userConfig.email.toLowerCase());
      return { uid: existingUser.uid, name: userConfig.name, email: userConfig.email };
    }
    log(`Failed to create user ${userConfig.name}: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  log('\n🚀 Resetting Test Users\n', 'info');
  
  try {
    // Step 1: Delete existing test users
    await deleteTestUsers();
    
    // Small delay to ensure deletions are processed
    log('\nWaiting for deletions to complete...', 'info');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Create new test users
    log('\n=== Creating New Test Users ===', 'info');
    const createdUsers = [];
    
    for (const userConfig of testUsers) {
      try {
        const user = await createUser(userConfig);
        createdUsers.push(user);
        // Small delay between users
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        log(`Failed to create ${userConfig.name}: ${error.message}`, 'error');
      }
    }
    
    // Summary
    log('\n=== Summary ===', 'info');
    log(`Created ${createdUsers.length} users:`, 'info');
    createdUsers.forEach(user => {
      log(`  - ${user.name} (${user.email})`, 'info');
    });
    
    log('\n✨ Done!', 'success');
    log('\nLogin credentials:', 'info');
    log(`Password for all users: ${TEST_PASSWORD}`, 'info');
    log('\nTest users are ready to use. They do not have game collections.', 'info');
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    throw error;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });













