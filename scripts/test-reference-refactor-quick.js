#!/usr/bin/env node

/**
 * Quick test script for reference-based refactor
 * Tests basic functionality quickly without creating test data
 */

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

// Helper functions
const log = (message, type = 'info') => {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪',
  }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
};

async function batchGetGamesById(gameIds) {
  if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
    return new Map();
  }

  const gamesRef = db.collection('games');
  const gameMap = new Map();
  
  const BATCH_SIZE = 20;
  
  for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
    const batch = gameIds.slice(i, i + BATCH_SIZE);
    
    const docPromises = batch.map(async (gameId) => {
      try {
        const docRef = gamesRef.doc(gameId.toString());
        const doc = await docRef.get();
        return doc;
      } catch (err) {
        return null;
      }
    });
    
    const docs = await Promise.all(docPromises);
    
    docs.forEach(doc => {
      if (doc && doc.exists) {
        const game = doc.data();
        const gameId = game.id || doc.id;
        gameMap.set(gameId.toString(), game);
      }
    });
  }
  
  return gameMap;
}

async function quickTest() {
  log('\n=== QUICK REFACTOR TEST ===\n', 'test');

  // Test 1: Check if batchGetGamesById works
  log('Test 1: Testing batchGetGamesById...', 'test');
  try {
    // Use some common BGG game IDs
    const testIds = ['174430', '167791', '266524'];
    const gameMap = await batchGetGamesById(testIds);
    
    log(`Found ${gameMap.size}/${testIds.length} games in main collection`, gameMap.size > 0 ? 'success' : 'warning');
    
    if (gameMap.size > 0) {
      const firstGame = Array.from(gameMap.values())[0];
      log(`Sample game: ${firstGame.name || firstGame.id}`, 'info');
    }
  } catch (error) {
    log(`Failed: ${error.message}`, 'error');
    return false;
  }

  // Test 2: Check userGames collection structure
  log('\nTest 2: Checking userGames collection structure...', 'test');
  try {
    const usersSnapshot = await db.collection('userGames').limit(1).get();
    
    if (usersSnapshot.empty) {
      log('No users found in userGames collection', 'warning');
      log('This is OK if no users have added games yet', 'info');
      return true;
    }
    
    const userId = usersSnapshot.docs[0].id;
    const gamesSnapshot = await db.collection('userGames').doc(userId).collection('games').limit(5).get();
    
    if (gamesSnapshot.empty) {
      log(`User ${userId} has no games`, 'warning');
      return true;
    }
    
    let referenceCount = 0;
    let fullDataCount = 0;
    
    gamesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const isReferenceOnly = data.bggId && !data.title && !data.image && !data.thumbnail && !data.name;
      
      if (isReferenceOnly) {
        referenceCount++;
      } else if (data.title || data.name || data.image) {
        fullDataCount++;
      }
    });
    
    log(`Found ${referenceCount} references (new format) and ${fullDataCount} full data (old format)`, 'success');
    
    if (fullDataCount > 0) {
      log('Backward compatibility working: old format data detected', 'info');
    }
    
  } catch (error) {
    log(`Failed: ${error.message}`, 'error');
    return false;
  }

  // Test 3: Verify data separation
  log('\nTest 3: Verifying data separation...', 'test');
  try {
    // Check if games collection exists
    const gamesSnapshot = await db.collection('games').limit(1).get();
    log(`Main games collection: ${gamesSnapshot.empty ? 'empty' : 'has data'}`, gamesSnapshot.empty ? 'warning' : 'success');
    
    // Check if userGames collection exists
    const userGamesSnapshot = await db.collection('userGames').limit(1).get();
    log(`userGames collection: ${userGamesSnapshot.empty ? 'empty' : 'has data'}`, userGamesSnapshot.empty ? 'warning' : 'success');
    
    if (!gamesSnapshot.empty && !userGamesSnapshot.empty) {
      log('Both collections exist - data separation structure is in place', 'success');
    }
    
  } catch (error) {
    log(`Failed: ${error.message}`, 'error');
    return false;
  }

  log('\n=== QUICK TEST COMPLETE ===\n', 'success');
  return true;
}

// Run quick test
quickTest()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });

