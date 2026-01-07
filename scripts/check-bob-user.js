#!/usr/bin/env node

/**
 * Check Bob's User Document and MeepleUps
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

async function checkBob() {
  console.log('\n🔍 Checking Bob\'s User Document and MeepleUps...\n');
  
  try {
    const bobEmail = 'bob@email.com';
    const bobUserId = 'THTGQb1GIkO2Uwt8dJ1zcKZ5KKG2';
    
    // Get Bob's user document
    const userDoc = await db.collection('users').doc(bobUserId).get();
    if (!userDoc.exists) {
      console.log('❌ Bob\'s user document does not exist!');
      return;
    }
    
    const userData = userDoc.data();
    console.log('📋 Bob\'s User Document:');
    console.log('   Email:', userData.email || 'N/A');
    console.log('   Name:', userData.name || 'N/A');
    console.log('   groupIds:', userData.groupIds || []);
    console.log('   groupIds count:', (userData.groupIds || []).length);
    console.log('');
    
    // Check "Bobs MeepleUp" (ID: 1766552116194)
    const bobsMeepleUpId = '1766552116194';
    console.log(`🔍 Checking "Bobs MeepleUp" (ID: ${bobsMeepleUpId})...`);
    
    const meepleUpDoc = await db.collection('gamingGroups').doc(bobsMeepleUpId).get();
    if (!meepleUpDoc.exists) {
      console.log('❌ "Bobs MeepleUp" does not exist in gamingGroups!');
      return;
    }
    
    const meepleUpData = meepleUpDoc.data();
    console.log('📋 "Bobs MeepleUp" Data:');
    console.log('   Name:', meepleUpData.name);
    console.log('   organizerId:', meepleUpData.organizerId);
    console.log('   isActive:', meepleUpData.isActive);
    console.log('   deletedAt:', meepleUpData.deletedAt || 'null');
    console.log('   memberIds:', meepleUpData.memberIds || []);
    console.log('');
    
    // Check members collection
    console.log('🔍 Checking members collection...');
    const membersSnapshot = await db.collection('gamingGroups')
      .doc(bobsMeepleUpId)
      .collection('members')
      .get();
    
    console.log(`   Members count: ${membersSnapshot.docs.length}`);
    membersSnapshot.docs.forEach(doc => {
      const memberData = doc.data();
      console.log(`   - Member ID: ${doc.id}, userId: ${memberData.userId}, role: ${memberData.role}`);
    });
    
    // Check if Bob is in the memberIds array
    const isInMemberIds = (meepleUpData.memberIds || []).includes(bobUserId);
    console.log('');
    console.log('🔍 Analysis:');
    console.log(`   Is Bob in memberIds array? ${isInMemberIds ? '✅ YES' : '❌ NO'}`);
    console.log(`   Is Bob's userId in groupIds? ${(userData.groupIds || []).includes(bobsMeepleUpId) ? '✅ YES' : '❌ NO'}`);
    console.log(`   Is Bob the organizer? ${meepleUpData.organizerId === bobUserId ? '✅ YES' : '❌ NO'}`);
    
    if (!isInMemberIds && meepleUpData.organizerId === bobUserId) {
      console.log('');
      console.log('⚠️  ISSUE FOUND: Bob is the organizer but not in memberIds array!');
    }
    
    if (!(userData.groupIds || []).includes(bobsMeepleUpId)) {
      console.log('');
      console.log('⚠️  ISSUE FOUND: "Bobs MeepleUp" is NOT in Bob\'s groupIds array!');
      console.log('   This is why it\'s not showing up in the app.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkBob()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

