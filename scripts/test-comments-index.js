#!/usr/bin/env node

/**
 * Test script to trigger Firestore index suggestion for comments
 * This will attempt to query comments with orderBy('createdAt', 'asc')
 * which should cause Firestore to suggest creating the required index
 */

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

// Helper function
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

async function testCommentsIndex() {
  log('Testing comments query to trigger index suggestion...', 'test');
  
  try {
    // First, let's find a gaming group with nominations
    log('Finding a gaming group with nominations...', 'info');
    const groupsSnapshot = await db.collection('gamingGroups').limit(5).get();
    
    if (groupsSnapshot.empty) {
      log('No gaming groups found. Please create a gaming group first.', 'warning');
      return;
    }
    
    let foundProposal = null;
    let groupId = null;
    
    // Find a group with at least one nomination
    for (const groupDoc of groupsSnapshot.docs) {
      groupId = groupDoc.id;
      log(`Checking group: ${groupId}`, 'info');
      
      const nominationsSnapshot = await db
        .collection('gamingGroups')
        .doc(groupId)
        .collection('nominations')
        .limit(1)
        .get();
      
      if (!nominationsSnapshot.empty) {
        foundProposal = nominationsSnapshot.docs[0];
        log(`Found proposal: ${foundProposal.id}`, 'success');
        break;
      }
    }
    
    if (!foundProposal) {
      log('No nominations found. Creating a test nomination first...', 'warning');
      
      // Get the first group
      const firstGroup = groupsSnapshot.docs[0];
      groupId = firstGroup.id;
      
      // Create a test nomination
      const testDateKey = new Date().toISOString().split('T')[0];
      const testGameId = 'test-game-123';
      const proposalId = `${testDateKey}_${testGameId}`;
      
      log(`Creating test nomination: ${proposalId}`, 'info');
      await db
        .collection('gamingGroups')
        .doc(groupId)
        .collection('nominations')
        .doc(proposalId)
        .set({
          gameId: testGameId,
          gameName: 'Test Game',
          dateKey: testDateKey,
          nominatedBy: 'test-user',
          createdAt: admin.firestore.Timestamp.now(),
        });
      
      foundProposal = { id: proposalId };
      log('Test nomination created', 'success');
    }
    
    // Now try to query comments with orderBy - this should trigger the index suggestion
    log(`Attempting to query comments for proposal: ${foundProposal.id}`, 'test');
    log('This query uses orderBy("createdAt", "asc") which requires an index.', 'info');
    
    // First, ensure we have at least one comment
    const existingComments = await db
      .collection('gamingGroups')
      .doc(groupId)
      .collection('nominations')
      .doc(foundProposal.id)
      .collection('comments')
      .limit(1)
      .get();
    
    if (existingComments.empty) {
      log('No comments found. Creating a test comment...', 'info');
      await db
        .collection('gamingGroups')
        .doc(groupId)
        .collection('nominations')
        .doc(foundProposal.id)
        .collection('comments')
        .add({
          userId: 'test-user',
          userName: 'Test User',
          text: 'This is a test comment to trigger index requirement',
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      log('Test comment created', 'success');
    }
    
    try {
      // Try the simple orderBy query first
      log('Attempting query with orderBy("createdAt", "asc")...', 'test');
      const commentsSnapshot = await db
        .collection('gamingGroups')
        .doc(groupId)
        .collection('nominations')
        .doc(foundProposal.id)
        .collection('comments')
        .orderBy('createdAt', 'asc')
        .get();
      
      log(`Query succeeded! Found ${commentsSnapshot.size} comments.`, 'success');
      log('', 'info');
      log('═══════════════════════════════════════════════════════════════', 'info');
      log('✅ SIMPLE QUERY RESULT', 'success');
      log('═══════════════════════════════════════════════════════════════', 'info');
      log('', 'info');
      log('The simple orderBy("createdAt", "asc") query succeeded!', 'success');
      log('', 'info');
      log('📝 IMPORTANT: Single-field orderBy queries do NOT require', 'info');
      log('   explicit indexes in Firestore. They work automatically.', 'info');
      log('', 'info');
      log('This means your comments feature will work without creating', 'info');
      log('any indexes for the basic query we\'re using in the code.', 'info');
      log('', 'info');
      
      // Try a composite query that would definitely require an index
      log('', 'info');
      log('═══════════════════════════════════════════════════════════════', 'info');
      log('🧪 TESTING COMPOSITE QUERY (for future use)', 'test');
      log('═══════════════════════════════════════════════════════════════', 'info');
      log('', 'info');
      log('Testing a composite query (where + orderBy) that requires an index...', 'info');
      log('This is NOT used in the current code, but shows how to trigger', 'info');
      log('Firestore index suggestions for future features.', 'info');
      log('', 'info');
      
      try {
        const compositeQuery = await db
          .collection('gamingGroups')
          .doc(groupId)
          .collection('nominations')
          .doc(foundProposal.id)
          .collection('comments')
          .where('userId', '!=', 'non-existent-user')
          .orderBy('createdAt', 'asc')
          .get();
        log(`Composite query succeeded! Found ${compositeQuery.size} comments.`, 'success');
        log('(Index already exists for this query)', 'info');
      } catch (compositeError) {
        if (compositeError.code === 9) {
          log('', 'info');
          log('⚠️  COMPOSITE QUERY REQUIRES INDEX', 'warning');
          log('═══════════════════════════════════════════════════════════════', 'info');
          log('', 'info');
          log('This composite query (where + orderBy) requires an index.', 'warning');
          log('', 'info');
          if (compositeError.message.includes('https://')) {
            const urlMatch = compositeError.message.match(/https:\/\/[^\s]+/);
            if (urlMatch) {
              log('🔗 FIRESTORE INDEX CREATION LINK:', 'warning');
              log('', 'info');
              log(urlMatch[0], 'info');
              log('', 'info');
              log('Click the link above to create the index in Firebase Console.', 'info');
              log('', 'info');
            }
          }
          log('Note: This index is only needed if you plan to use composite', 'info');
          log('queries (filtering + sorting) on comments in the future.', 'info');
          log('The current simple orderBy query does NOT need this index.', 'info');
        } else {
          log(`Composite query error: ${compositeError.message}`, 'warning');
        }
      }
      
    } catch (error) {
      if (error.code === 9) {
        // Error code 9 is "FAILED_PRECONDITION" which usually means index is needed
        log('Index required error detected!', 'warning');
        log(`Error code: ${error.code}`, 'error');
        log(`Error message: ${error.message}`, 'error');
        
        // Check if the error message contains an index link
        if (error.message && error.message.includes('index')) {
          log('', 'info');
          log('═══════════════════════════════════════════════════════════════', 'info');
          log('🔥 FIRESTORE INDEX REQUIRED 🔥', 'warning');
          log('═══════════════════════════════════════════════════════════════', 'info');
          log('', 'info');
          log('The query requires a Firestore index. Check the error message', 'info');
          log('above for a link to create the index in the Firebase Console.', 'info');
          log('', 'info');
          log('The required index should be:', 'info');
          log('  Collection: gamingGroups/{groupId}/nominations/{proposalId}/comments', 'info');
          log('  Fields: createdAt (Ascending)', 'info');
          log('', 'info');
          log('You can also create it manually in Firebase Console:', 'info');
          log('  Firestore Database → Indexes → Create Index', 'info');
          log('═══════════════════════════════════════════════════════════════', 'info');
        }
      } else {
        log(`Unexpected error: ${error.message}`, 'error');
        log(`Error code: ${error.code}`, 'error');
      }
      throw error;
    }
    
  } catch (error) {
    log(`Test failed: ${error.message}`, 'error');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testCommentsIndex()
  .then(() => {
    log('Test completed!', 'success');
    process.exit(0);
  })
  .catch((error) => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
  });

