#!/usr/bin/env node

/**
 * List All MeepleUps Script
 * Lists all meepleups (gaming groups) in Firestore and their owners
 */

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

async function listAllMeepleUps() {
  console.log('\n📋 Listing All MeepleUps and Their Owners...\n');
  
  try {
    // Get all users to look up organizer emails/names
    const usersSnapshot = await auth.listUsers();
    const usersMap = new Map();
    usersSnapshot.users.forEach(user => {
      usersMap.set(user.uid, {
        email: user.email || 'N/A',
        displayName: user.displayName || 'N/A',
        uid: user.uid
      });
    });
    
    // Get all gaming groups (meepleups)
    const groupsSnapshot = await db.collection('gamingGroups').get();
    const groups = groupsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    console.log(`Total MeepleUps found: ${groups.length}\n`);
    
    if (groups.length === 0) {
      console.log('⚠️  No MeepleUps found in Firestore.');
      return;
    }
    
    // Sort by creation date (newest first)
    groups.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
      const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
      return dateB - dateA;
    });
    
    // Display each meepleup
    console.log('=== All MeepleUps ===\n');
    
    let activeCount = 0;
    let archivedCount = 0;
    
    groups.forEach((group, index) => {
      const isActive = group.isActive !== false && !group.deletedAt;
      const status = isActive ? '✅ Active' : '❌ Archived';
      const statusIcon = isActive ? '✅' : '❌';
      
      if (isActive) activeCount++;
      else archivedCount++;
      
      console.log(`${index + 1}. ${statusIcon} ${group.name || 'Unnamed MeepleUp'}`);
      console.log(`   Status: ${status}`);
      console.log(`   ID: ${group.id}`);
      
      // Get organizer info
      if (group.organizerId) {
        const organizer = usersMap.get(group.organizerId);
        if (organizer) {
          console.log(`   Owner: ${organizer.email} (${organizer.displayName})`);
          console.log(`   Owner UID: ${organizer.uid}`);
        } else {
          console.log(`   Owner UID: ${group.organizerId} (user not found in auth)`);
        }
      } else {
        console.log(`   Owner: N/A (no organizerId set)`);
      }
      
      // Show member count
      const memberCount = group.memberIds ? (Array.isArray(group.memberIds) ? group.memberIds.length : 0) : 0;
      console.log(`   Members: ${memberCount}`);
      
      // Show creation date
      if (group.createdAt) {
        const createdDate = group.createdAt.toDate ? group.createdAt.toDate() : new Date(group.createdAt);
        console.log(`   Created: ${createdDate.toLocaleString()}`);
      }
      
      // Show join code if available
      if (group.joinCode) {
        console.log(`   Join Code: ${group.joinCode}`);
      }
      
      // Show location if available
      if (group.location?.name || group.location?.address) {
        console.log(`   Location: ${group.location.name || ''} ${group.location.address || ''}`.trim());
      }
      
      console.log('');
    });
    
    // Summary
    console.log('📊 Summary:');
    console.log(`   Total MeepleUps: ${groups.length}`);
    console.log(`   Active: ${activeCount}`);
    console.log(`   Archived: ${archivedCount}`);
    console.log(`   Total Users: ${usersMap.size}`);
    
  } catch (error) {
    console.error('❌ Error listing MeepleUps:', error);
    process.exit(1);
  }
}

listAllMeepleUps()
  .then(() => {
    console.log('\n✅ List complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

