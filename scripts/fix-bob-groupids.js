#!/usr/bin/env node

/**
 * Fix Bob's groupIds array to include "Bobs MeepleUp"
 */

require('dotenv').config();

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

async function fixBobGroupIds() {
  console.log('\n🔧 Fixing Bob\'s groupIds array...\n');
  
  try {
    const bobUserId = 'THTGQb1GIkO2Uwt8dJ1zcKZ5KKG2';
    const bobsMeepleUpId = '1766552116194';
    const archivedEventId = '1766792136047';
    
    // Get Bob's user document
    const userDoc = await db.collection('users').doc(bobUserId).get();
    if (!userDoc.exists) {
      console.log('❌ Bob\'s user document does not exist!');
      return;
    }
    
    const userData = userDoc.data();
    const currentGroupIds = userData.groupIds || [];
    
    console.log('📋 Current groupIds:', currentGroupIds);
    
    // Check if "Bobs MeepleUp" is already in the array
    if (currentGroupIds.includes(bobsMeepleUpId)) {
      console.log('✅ "Bobs MeepleUp" is already in groupIds');
      return;
    }
    
    // Add "Bobs MeepleUp" to the array (keep existing ones)
    const updatedGroupIds = [...currentGroupIds];
    if (!updatedGroupIds.includes(bobsMeepleUpId)) {
      updatedGroupIds.push(bobsMeepleUpId);
    }
    
    console.log('📋 Updated groupIds:', updatedGroupIds);
    
    // Update the user document
    await db.collection('users').doc(bobUserId).update({
      groupIds: updatedGroupIds
    });
    
    console.log('✅ Successfully updated Bob\'s groupIds array!');
    console.log('   Added:', bobsMeepleUpId, '(Bobs MeepleUp)');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixBobGroupIds()
  .then(() => {
    console.log('\n✅ Fix complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

