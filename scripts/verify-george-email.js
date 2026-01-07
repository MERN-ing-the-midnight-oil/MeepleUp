#!/usr/bin/env node

/**
 * Verify George's Email Script
 * Marks george@email.com as verified in Firebase Authentication
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

async function verifyGeorgeEmail() {
  const email = 'george@email.com';
  
  try {
    log(`Looking up user with email: ${email}`, 'info');
    
    // Get user by email
    const user = await auth.getUserByEmail(email.toLowerCase());
    
    log(`Found user: ${user.uid} (${user.email})`, 'info');
    log(`Current emailVerified status: ${user.emailVerified}`, 'info');
    
    if (user.emailVerified) {
      log('Email is already verified!', 'warning');
      return;
    }
    
    // Update user to mark email as verified
    await auth.updateUser(user.uid, {
      emailVerified: true,
    });
    
    log(`Successfully verified email for ${email}`, 'success');
    
    // Verify the update
    const updatedUser = await auth.getUser(user.uid);
    log(`Updated emailVerified status: ${updatedUser.emailVerified}`, 'success');
    
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      log(`User with email ${email} not found. Please create the account first.`, 'error');
    } else {
      log(`Error: ${error.message}`, 'error');
      console.error(error);
    }
    throw error;
  }
}

async function main() {
  log('\n🚀 Verifying George\'s Email\n', 'info');
  
  try {
    await verifyGeorgeEmail();
    log('\n✨ Done!', 'success');
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
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

