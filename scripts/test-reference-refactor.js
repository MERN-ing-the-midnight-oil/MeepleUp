#!/usr/bin/env node

/**
 * Test script for reference-based game collection refactor
 * Tests:
 * - batchGetGamesById functionality
 * - Storing games with references (new format)
 * - Enriching references with full game data
 * - Backward compatibility with old format
 * - Data structure verification
 */

const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
};

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

const test = async (name, fn) => {
  try {
    log(`Testing: ${name}`, 'test');
    await fn();
    testResults.passed.push(name);
    log(`PASSED: ${name}`, 'success');
    return true;
  } catch (error) {
    testResults.failed.push({ name, error: error.message, stack: error.stack });
    log(`FAILED: ${name} - ${error.message}`, 'error');
    if (error.stack) {
      console.log('  Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
    return false;
  }
};

// Test data
const TEST_USER_ID = `test-user-refactor-${Date.now()}`;
const TEST_GAME_IDS = ['174430', '167791', '266524']; // Gloomhaven, Terraforming Mars, Wingspan
let cleanupTasks = [];

// Cleanup function
const cleanup = async () => {
  log('\n=== CLEANUP ===', 'test');
  for (const task of cleanupTasks) {
    try {
      await task();
      log(`Cleaned up: ${task.name || 'task'}`, 'success');
    } catch (error) {
      log(`Cleanup failed: ${error.message}`, 'warning');
    }
  }
};

// Register cleanup on exit
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('exit', async () => {
  await cleanup();
});

// ============================================================================
// Helper function to simulate batchGetGamesById (since we can't import it directly)
// ============================================================================

async function batchGetGamesById(gameIds) {
  if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
    return new Map();
  }

  const gamesRef = db.collection('games');
  const gameMap = new Map();
  
  // Process in batches
  const BATCH_SIZE = 20;
  
  for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
    const batch = gameIds.slice(i, i + BATCH_SIZE);
    
    const docPromises = batch.map(async (gameId) => {
      try {
        const docRef = gamesRef.doc(gameId.toString());
        const doc = await docRef.get();
        return doc;
      } catch (err) {
        console.warn(`Error fetching game ${gameId}:`, err);
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

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
  log('\n=== REFERENCE-BASED REFACTOR TESTS ===\n', 'test');

  // Test 1: Verify games exist in main collection (or create test games)
  await test('Setup: Ensure test games exist in main games collection', async () => {
    for (const gameId of TEST_GAME_IDS) {
      const gameRef = db.collection('games').doc(gameId);
      const gameDoc = await gameRef.get();
      
      if (!gameDoc.exists) {
        // Create minimal test game
        await gameRef.set({
          id: gameId,
          name: `Test Game ${gameId}`,
          nameLower: `test game ${gameId}`.toLowerCase(),
          yearPublished: '2020',
          rank: '100',
          average: '8.0',
          bayesAverage: '7.5',
          usersRated: '1000',
          thumbnail: null,
          image: null,
          bggDataCached: true,
          bggDataCachedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        log(`Created test game ${gameId} in main collection`, 'info');
      } else {
        log(`Game ${gameId} already exists in main collection`, 'info');
      }
    }
  });

  // Test 2: Test batchGetGamesById function
  await test('Test batchGetGamesById: Fetch multiple games', async () => {
    const gameMap = await batchGetGamesById(TEST_GAME_IDS);
    
    if (gameMap.size !== TEST_GAME_IDS.length) {
      throw new Error(`Expected ${TEST_GAME_IDS.length} games, got ${gameMap.size}`);
    }
    
    for (const gameId of TEST_GAME_IDS) {
      if (!gameMap.has(gameId)) {
        throw new Error(`Game ${gameId} not found in batch fetch results`);
      }
      
      const game = gameMap.get(gameId);
      if (!game.name && !game.id) {
        throw new Error(`Game ${gameId} data is incomplete`);
      }
    }
    
    log(`Successfully batch-fetched ${gameMap.size} games`, 'success');
  });

  // Test 3: Store reference-only format in userGames
  await test('Test: Store game reference (new format) in userGames collection', async () => {
    const testGameId = TEST_GAME_IDS[0];
    const gameDocId = `bgg_${testGameId}`;
    
    const referenceData = {
      bggId: testGameId,
      userRating: 9,
      numplays: 10,
      isFavorite: true,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'test_import',
    };
    
    await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .set(referenceData);
    
    // Verify it was stored
    const doc = await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .get();
    
    if (!doc.exists) {
      throw new Error('Reference document was not created');
    }
    
    const data = doc.data();
    
    // Verify it's reference-only format (no full game data)
    if (data.title || data.image || data.description || data.name) {
      throw new Error('Reference document contains full game data (should be reference-only)');
    }
    
    // Verify it has reference fields
    if (!data.bggId || data.bggId !== testGameId) {
      throw new Error('Reference document missing or has incorrect bggId');
    }
    
    if (data.userRating !== 9 || data.numplays !== 10 || data.isFavorite !== true) {
      throw new Error('Reference document missing user-specific fields');
    }
    
    log(`Successfully stored reference for game ${testGameId}`, 'success');
    
    // Register cleanup
    cleanupTasks.push(async () => {
      await db.collection('userGames').doc(TEST_USER_ID)
        .collection('games').doc(gameDocId)
        .delete();
    });
  });

  // Test 4: Enrich reference with full game data
  await test('Test: Enrich reference with full game data from main collection', async () => {
    const testGameId = TEST_GAME_IDS[0];
    const gameDocId = `bgg_${testGameId}`;
    
    // Read reference
    const refDoc = await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .get();
    
    if (!refDoc.exists) {
      throw new Error('Reference document not found');
    }
    
    const refData = refDoc.data();
    
    // Fetch full game data
    const gameMap = await batchGetGamesById([refData.bggId]);
    const fullGameData = gameMap.get(refData.bggId);
    
    if (!fullGameData) {
      throw new Error(`Full game data not found for bggId ${refData.bggId}`);
    }
    
    // Merge reference with full game data
    const enrichedGame = {
      ...fullGameData,
      id: gameDocId,
      title: fullGameData.name,
      bggId: refData.bggId,
      userRating: refData.userRating || null,
      numplays: refData.numplays || null,
      isFavorite: refData.isFavorite || false,
      addedAt: refData.addedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      source: refData.source || 'unknown',
      updatedAt: refData.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    };
    
    // Verify enriched game has both full data and user-specific data
    if (!enrichedGame.name && !enrichedGame.title) {
      throw new Error('Enriched game missing name/title');
    }
    
    if (enrichedGame.userRating !== 9 || enrichedGame.numplays !== 10) {
      throw new Error('Enriched game missing user-specific data');
    }
    
    log(`Successfully enriched reference with full game data`, 'success');
  });

  // Test 5: Backward compatibility - old format (full data)
  await test('Test: Backward compatibility with old format (full data)', async () => {
    const testGameId = TEST_GAME_IDS[1];
    const gameDocId = `bgg_${testGameId}`;
    
    // Store old format (full data)
    const oldFormatData = {
      id: gameDocId,
      title: 'Test Game Old Format',
      bggId: testGameId,
      image: 'https://example.com/image.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
      description: 'Test description',
      yearPublished: 2020,
      minPlayers: 2,
      maxPlayers: 4,
      playingTime: 90,
      bggRating: 8.5,
      userRating: 8,
      numplays: 5,
      isFavorite: false,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'old_format_test',
      mechanics: ['Deck Building'],
      categories: ['Strategy'],
      publisher: 'Test Publisher',
      complexity: 3.5,
      averageWeight: 3.5,
    };
    
    await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .set(oldFormatData);
    
    // Read it back
    const doc = await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .get();
    
    if (!doc.exists) {
      throw new Error('Old format document was not created');
    }
    
    const data = doc.data();
    
    // Verify it has full data (old format)
    if (!data.title || !data.bggId) {
      throw new Error('Old format document missing expected fields');
    }
    
    // Verify it's NOT reference-only (has full game data)
    const isReferenceOnly = data.bggId && !data.title && !data.image && !data.thumbnail && !data.name;
    if (isReferenceOnly) {
      throw new Error('Old format document was incorrectly identified as reference-only');
    }
    
    log(`Successfully stored and verified old format data`, 'success');
    
    // Register cleanup
    cleanupTasks.push(async () => {
      await db.collection('userGames').doc(TEST_USER_ID)
        .collection('games').doc(gameDocId)
        .delete();
    });
  });

  // Test 6: Test isReferenceOnly detection logic
  await test('Test: isReferenceOnly detection logic', async () => {
    // Reference-only format
    const referenceData = {
      bggId: '12345',
      userRating: 8,
      isFavorite: true,
    };
    
    const isRef1 = referenceData.bggId && !referenceData.title && !referenceData.image && !referenceData.thumbnail && !referenceData.name;
    if (!isRef1) {
      throw new Error('Reference-only data was not correctly identified');
    }
    
    // Old format (full data)
    const oldFormatData = {
      bggId: '12345',
      title: 'Test Game',
      image: 'https://example.com/image.jpg',
      userRating: 8,
    };
    
    const isRef2 = oldFormatData.bggId && !oldFormatData.title && !oldFormatData.image && !oldFormatData.thumbnail && !oldFormatData.name;
    if (isRef2) {
      throw new Error('Old format data was incorrectly identified as reference-only');
    }
    
    log(`Successfully tested isReferenceOnly detection logic`, 'success');
  });

  // Test 7: Update user-specific fields in reference
  await test('Test: Update user-specific fields in reference', async () => {
    const testGameId = TEST_GAME_IDS[0];
    const gameDocId = `bgg_${testGameId}`;
    
    // Update user-specific fields
    const updates = {
      userRating: 10,
      numplays: 15,
      isFavorite: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .set(updates, { merge: true });
    
    // Verify update
    const doc = await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .get();
    
    const data = doc.data();
    
    if (data.userRating !== 10 || data.numplays !== 15 || data.isFavorite !== false) {
      throw new Error('User-specific fields were not updated correctly');
    }
    
    // Verify it's still reference-only (no full game data added)
    if (data.title || data.image || data.description || data.name) {
      throw new Error('Update added full game data (should remain reference-only)');
    }
    
    log(`Successfully updated user-specific fields in reference`, 'success');
  });

  // Test 8: Verify data separation (main collection vs userGames)
  await test('Test: Verify data separation between main collection and userGames', async () => {
    const testGameId = TEST_GAME_IDS[0];
    const gameDocId = `bgg_${testGameId}`;
    
    // Get from main collection
    const mainGameDoc = await db.collection('games').doc(testGameId).get();
    const mainGameData = mainGameDoc.data();
    
    // Get from userGames collection
    const userGameDoc = await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games').doc(gameDocId)
      .get();
    const userGameData = userGameDoc.data();
    
    // Verify main collection has full game data
    if (!mainGameData.name && !mainGameData.title) {
      throw new Error('Main collection missing game name');
    }
    
    // Verify userGames collection has only reference data
    if (userGameData.title || userGameData.image || userGameData.name) {
      throw new Error('userGames collection contains full game data (should be reference-only)');
    }
    
    // Verify userGames has user-specific data
    if (userGameData.userRating === undefined || userGameData.isFavorite === undefined) {
      throw new Error('userGames collection missing user-specific fields');
    }
    
    log(`Successfully verified data separation`, 'success');
  });

  // Test 9: Batch enrich multiple references
  await test('Test: Batch enrich multiple references', async () => {
    // Create multiple references
    const testGames = TEST_GAME_IDS.map(gameId => ({
      id: `bgg_${gameId}`,
      bggId: gameId,
      userRating: Math.floor(Math.random() * 10) + 1,
      numplays: Math.floor(Math.random() * 20),
      isFavorite: Math.random() > 0.5,
      source: 'batch_test',
    }));
    
    // Store references
    for (const game of testGames) {
      await db.collection('userGames').doc(TEST_USER_ID)
        .collection('games').doc(game.id)
        .set({
          bggId: game.bggId,
          userRating: game.userRating,
          numplays: game.numplays,
          isFavorite: game.isFavorite,
          source: game.source,
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      
      cleanupTasks.push(async () => {
        await db.collection('userGames').doc(TEST_USER_ID)
          .collection('games').doc(game.id)
          .delete();
      });
    }
    
    // Batch fetch full game data
    const bggIds = testGames.map(g => g.bggId);
    const gameMap = await batchGetGamesById(bggIds);
    
    if (gameMap.size !== testGames.length) {
      throw new Error(`Expected ${testGames.length} games, got ${gameMap.size}`);
    }
    
    // Enrich all references
    const enrichedGames = testGames.map(ref => {
      const fullGameData = gameMap.get(ref.bggId);
      if (!fullGameData) {
        throw new Error(`Full game data not found for ${ref.bggId}`);
      }
      return {
        ...fullGameData,
        id: ref.id,
        title: fullGameData.name,
        bggId: ref.bggId,
        userRating: ref.userRating,
        numplays: ref.numplays,
        isFavorite: ref.isFavorite,
        source: ref.source,
      };
    });
    
    // Verify enriched games
    for (const enriched of enrichedGames) {
      if (!enriched.name && !enriched.title) {
        throw new Error(`Enriched game ${enriched.bggId} missing name/title`);
      }
      if (enriched.userRating === undefined) {
        throw new Error(`Enriched game ${enriched.bggId} missing user-specific data`);
      }
    }
    
    log(`Successfully batch-enriched ${enrichedGames.length} references`, 'success');
  });

  // Test 10: Verify no data duplication
  await test('Test: Verify no data duplication between collections', async () => {
    const testGameId = TEST_GAME_IDS[0];
    
    // Count documents
    const mainGamesSnapshot = await db.collection('games')
      .where(admin.firestore.FieldPath.documentId(), '==', testGameId)
      .get();
    
    const userGamesSnapshot = await db.collection('userGames').doc(TEST_USER_ID)
      .collection('games')
      .where('bggId', '==', testGameId)
      .get();
    
    // Main collection should have 1 document (the game)
    if (mainGamesSnapshot.size !== 1) {
      throw new Error(`Expected 1 game in main collection, found ${mainGamesSnapshot.size}`);
    }
    
    // userGames should have reference documents (one per user who owns it)
    // For our test, we should have at least 1
    if (userGamesSnapshot.size < 1) {
      throw new Error('No reference found in userGames collection');
    }
    
    // Verify the reference doesn't duplicate full game data
    const refDoc = userGamesSnapshot.docs[0];
    const refData = refDoc.data();
    
    // Check that reference doesn't have full game data fields
    const fullDataFields = ['title', 'name', 'image', 'thumbnail', 'description', 'minPlayers', 'maxPlayers', 'mechanics', 'categories'];
    const hasFullData = fullDataFields.some(field => refData[field] !== undefined && refData[field] !== null);
    
    if (hasFullData) {
      throw new Error('Reference document contains full game data (duplication detected)');
    }
    
    log(`Successfully verified no data duplication`, 'success');
  });

  // Print summary
  log('\n=== TEST SUMMARY ===', 'test');
  log(`Passed: ${testResults.passed.length}`, 'success');
  log(`Failed: ${testResults.failed.length}`, testResults.failed.length > 0 ? 'error' : 'success');
  
  if (testResults.failed.length > 0) {
    log('\nFailed tests:', 'error');
    testResults.failed.forEach(({ name, error }) => {
      log(`  - ${name}: ${error}`, 'error');
    });
  }
  
  if (testResults.warnings.length > 0) {
    log('\nWarnings:', 'warning');
    testResults.warnings.forEach(warning => {
      log(`  - ${warning}`, 'warning');
    });
  }
  
  // Cleanup
  await cleanup();
  
  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  cleanup().then(() => process.exit(1));
});

