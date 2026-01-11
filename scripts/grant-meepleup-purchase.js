#!/usr/bin/env node

/**
 * Grant MeepleUp Purchase Script
 * Adds a test purchase record to user documents in Firestore
 * Useful for testing without setting up actual IAP products
 * 
 * Usage:
 *   node scripts/grant-meepleup-purchase.js <userEmail> [userEmail2] ...
 *   node scripts/grant-meepleup-purchase.js --all
 *   node scripts/grant-meepleup-purchase.js --remove <userEmail>
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

// Product ID for meepleup purchase
const MEEPLEUP_PRODUCT_ID = 'com.rhyssmoker.meepleup.create';

/**
 * Grant purchase to a user by user ID
 */
async function grantPurchaseToUser(userId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      log(`User document not found for userId: ${userId}`, 'warning');
      return false;
    }
    
    const userData = userDoc.data();
    const existingPurchases = userData.meepleupPurchases || [];
    
    // Check if user already has a verified purchase
    const hasVerifiedPurchase = existingPurchases.some(
      p => p.verified === true && p.productId === MEEPLEUP_PRODUCT_ID
    );
    
    if (hasVerifiedPurchase) {
      log(`User ${userId} already has a verified purchase`, 'info');
      return true;
    }
    
    // Create purchase record
    const purchaseRecord = {
      productId: MEEPLEUP_PRODUCT_ID,
      platform: 'ios',
      verified: true,
      purchasedAt: admin.firestore.Timestamp.now(),
      createdAt: admin.firestore.Timestamp.now(),
    };
    
    // Add to existing purchases array
    const updatedPurchases = [...existingPurchases, purchaseRecord];
    
    await userRef.update({
      meepleupPurchases: updatedPurchases,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    log(`Granted purchase to user: ${userId}`, 'success');
    return true;
  } catch (error) {
    log(`Error granting purchase to user ${userId}: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Grant purchase to user by email
 */
async function grantPurchaseByEmail(email) {
  try {
    // Find user by email
    const user = await auth.getUserByEmail(email);
    return await grantPurchaseToUser(user.uid);
  } catch (error) {
    log(`Error finding user with email ${email}: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Remove purchase from a user
 */
async function removePurchaseFromUser(userId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      log(`User document not found for userId: ${userId}`, 'warning');
      return false;
    }
    
    const userData = userDoc.data();
    const existingPurchases = userData.meepleupPurchases || [];
    
    // Filter out purchases for this product
    const updatedPurchases = existingPurchases.filter(
      p => !(p.verified === true && p.productId === MEEPLEUP_PRODUCT_ID)
    );
    
    await userRef.update({
      meepleupPurchases: updatedPurchases,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    log(`Removed purchase from user: ${userId}`, 'success');
    return true;
  } catch (error) {
    log(`Error removing purchase from user ${userId}: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Grant purchase to all users (for testing)
 */
async function grantPurchaseToAllUsers() {
  try {
    log('\n=== Granting Purchase to All Users ===', 'info');
    
    const usersSnapshot = await db.collection('users').get();
    log(`Found ${usersSnapshot.size} users`, 'info');
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const existingPurchases = userData.meepleupPurchases || [];
      
      // Check if user already has a verified purchase
      const hasVerifiedPurchase = existingPurchases.some(
        p => p.verified === true && p.productId === MEEPLEUP_PRODUCT_ID
      );
      
      if (hasVerifiedPurchase) {
        skipCount++;
        continue;
      }
      
      const success = await grantPurchaseToUser(userId);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }
    
    log(`\n=== Summary ===`, 'info');
    log(`Granted: ${successCount}`, 'success');
    log(`Skipped (already had purchase): ${skipCount}`, 'info');
    log(`Errors: ${errorCount}`, errorCount > 0 ? 'error' : 'info');
  } catch (error) {
    log(`Error granting purchases to all users: ${error.message}`, 'error');
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('Usage:', 'info');
    log('  Grant purchase to specific users:', 'info');
    log('    node scripts/grant-meepleup-purchase.js <userEmail> [userEmail2] ...', 'info');
    log('  Grant purchase to all users:', 'info');
    log('    node scripts/grant-meepleup-purchase.js --all', 'info');
    log('  Remove purchase from a user:', 'info');
    log('    node scripts/grant-meepleup-purchase.js --remove <userEmail>', 'info');
    process.exit(1);
  }
  
  if (args[0] === '--all') {
    await grantPurchaseToAllUsers();
  } else if (args[0] === '--remove') {
    if (args.length < 2) {
      log('Error: --remove requires an email address', 'error');
      process.exit(1);
    }
    const email = args[1];
    try {
      const user = await auth.getUserByEmail(email);
      await removePurchaseFromUser(user.uid);
    } catch (error) {
      log(`Error: ${error.message}`, 'error');
      process.exit(1);
    }
  } else {
    // Grant purchase to specified users
    log('\n=== Granting Purchase to Specified Users ===', 'info');
    let successCount = 0;
    let errorCount = 0;
    
    for (const email of args) {
      const success = await grantPurchaseByEmail(email);
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
    }
    
    log(`\n=== Summary ===`, 'info');
    log(`Granted: ${successCount}`, 'success');
    log(`Errors: ${errorCount}`, errorCount > 0 ? 'error' : 'info');
  }
  
  process.exit(0);
}

// Run the script
main().catch((error) => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});

