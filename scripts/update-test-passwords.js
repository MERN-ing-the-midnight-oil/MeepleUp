#!/usr/bin/env node

/**
 * Update Test User Passwords Script
 * Changes all test user passwords to "asdf" and lists usernames
 */

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const auth = admin.auth();

async function updateTestUserPasswords() {
  console.log('\n🔍 Finding test users...\n');
  
  try {
    // List all users
    const listUsersResult = await auth.listUsers();
    const users = listUsersResult.users;
    
    // Filter for test users (emails matching the pattern)
    const testUsers = users.filter(user => 
      user.email && user.email.match(/^test-[a-z]+-\d+@meepleup\.test$/)
    );
    
    if (testUsers.length === 0) {
      console.log('❌ No test users found.');
      return;
    }
    
    console.log(`Found ${testUsers.length} test users\n`);
    console.log('📝 Username List:');
    console.log('='.repeat(60));
    
    const newPassword = 'asdfasdf'; // Firebase requires at least 6 characters
    let successCount = 0;
    let failCount = 0;
    
    for (const user of testUsers) {
      try {
        // Extract username from email (test-{name}-{timestamp}@meepleup.test)
        const emailMatch = user.email.match(/^test-([a-z]+)-\d+@meepleup\.test$/);
        const username = emailMatch ? emailMatch[1] : 'unknown';
        
        // Update password
        await auth.updateUser(user.uid, {
          password: newPassword,
        });
        
        // Get display name from user record or email
        const displayName = user.displayName || user.email.split('@')[0];
        
        console.log(`✅ ${displayName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Password: ${newPassword}`);
        console.log(`   UID: ${user.uid}`);
        console.log('');
        
        successCount++;
      } catch (error) {
        console.log(`❌ Failed to update ${user.email}: ${error.message}`);
        failCount++;
      }
    }
    
    console.log('='.repeat(60));
    console.log(`\n✅ Successfully updated ${successCount} passwords`);
    if (failCount > 0) {
      console.log(`❌ Failed to update ${failCount} passwords`);
    }
    
    console.log('\n📋 Quick Reference:');
    console.log('='.repeat(60));
    testUsers.forEach((user, index) => {
      const emailMatch = user.email.match(/^test-([a-z]+)-\d+@meepleup\.test$/);
      const username = emailMatch ? emailMatch[1] : 'unknown';
      const displayName = user.displayName || user.email.split('@')[0];
      console.log(`${index + 1}. ${displayName} - ${user.email}`);
    });
    console.log('='.repeat(60));
    console.log(`\nAll passwords: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateTestUserPasswords()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

