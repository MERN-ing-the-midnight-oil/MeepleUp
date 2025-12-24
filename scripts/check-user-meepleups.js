#!/usr/bin/env node

/**
 * Check User MeepleUps Script
 * Verifies if users have MeepleUps (gaming groups) in Firestore
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

async function checkUserMeepleUps() {
  console.log('\n🔍 Checking User MeepleUps in Firestore...\n');
  
  try {
    // Get all users
    const usersSnapshot = await auth.listUsers();
    const users = usersSnapshot.users;
    
    console.log(`Found ${users.length} total users\n`);
    
    // First, let's check all MeepleUps and see who's in them
    console.log('=== All MeepleUps in Firestore ===\n');
    const allGroupsSnapshot = await db.collection('gamingGroups').get();
    const allGroups = allGroupsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    console.log(`Total MeepleUps found: ${allGroups.length}\n`);
    
    if (allGroups.length === 0) {
      console.log('⚠️  No MeepleUps found in Firestore at all!');
      console.log('   This explains why MeepleUps are not showing in the app.');
      return;
    }
    
    // Show all MeepleUps
    for (const group of allGroups) {
      const isActive = group.isActive !== false && !group.deletedAt;
      const status = isActive ? '✅ Active' : '❌ Archived';
      
      console.log(`${status} ${group.name || 'Unnamed MeepleUp'}`);
      console.log(`   ID: ${group.id}`);
      console.log(`   Organizer: ${group.organizerId || 'N/A'}`);
      console.log(`   Member IDs: ${(group.memberIds || []).length} members`);
      
      if (group.memberIds && group.memberIds.length > 0) {
        console.log(`   Members: ${group.memberIds.slice(0, 5).join(', ')}${group.memberIds.length > 5 ? '...' : ''}`);
      }
      
      // Get organizer email if possible
      try {
        if (group.organizerId) {
          const organizer = users.find(u => u.uid === group.organizerId);
          if (organizer) {
            console.log(`   Organizer Email: ${organizer.email || organizer.uid}`);
          }
        }
      } catch (e) {
        // Ignore errors
      }
      
      console.log('');
    }
    
    // Now check each user's MeepleUps
    console.log('\n=== MeepleUps per User ===\n');
    
    let usersWithMeepleUps = 0;
    let usersWithoutMeepleUps = 0;
    let totalMemberships = 0;
    
    for (const user of users) {
      const userId = user.uid;
      console.log(`Checking user: ${user.email || user.uid} (UID: ${userId})`);
      
      // Find MeepleUps where user is organizer or in memberIds
      const asOrganizer = allGroups.filter(g => g.organizerId === userId);
      const asMember = allGroups.filter(g => 
        g.memberIds && Array.isArray(g.memberIds) && g.memberIds.includes(userId)
      );
      
      // Combine and deduplicate
      const userMeepleUps = [];
      const seenIds = new Set();
      
      [...asOrganizer, ...asMember].forEach(g => {
        if (!seenIds.has(g.id)) {
          userMeepleUps.push(g);
          seenIds.add(g.id);
        }
      });
      
      // Filter to only active MeepleUps
      const activeMeepleUps = userMeepleUps.filter(g => 
        g.isActive !== false && !g.deletedAt
      );
      
      totalMemberships += activeMeepleUps.length;
      
      if (activeMeepleUps.length > 0) {
        usersWithMeepleUps++;
        console.log(`✅ ${user.email || user.uid}`);
        console.log(`   Name: ${user.displayName || 'N/A'}`);
        console.log(`   UID: ${userId}`);
        console.log(`   Active MeepleUps: ${activeMeepleUps.length}`);
        
        activeMeepleUps.forEach(meepleup => {
          const role = meepleup.organizerId === userId ? 'Organizer' : 'Member';
          console.log(`     - ${meepleup.name || 'Unnamed'} (${role})`);
        });
        console.log('');
      } else {
        usersWithoutMeepleUps++;
        // Show all users without MeepleUps
        console.log(`❌ ${user.email || user.uid}`);
        console.log(`   Name: ${user.displayName || 'N/A'}`);
        console.log(`   UID: ${userId}`);
        console.log(`   Active MeepleUps: 0`);
        
        // Check if there are any MeepleUps with similar organizer IDs (for debugging)
        const similarOrganizers = allGroups.filter(g => 
          g.organizerId && g.organizerId.substring(0, 10) === userId.substring(0, 10)
        );
        if (similarOrganizers.length > 0) {
          console.log(`   ⚠️  Found ${similarOrganizers.length} MeepleUps with similar organizer IDs (first 10 chars match)`);
        }
        console.log('');
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total MeepleUps in Firestore: ${allGroups.length}`);
    console.log(`   Active MeepleUps: ${allGroups.filter(g => g.isActive !== false && !g.deletedAt).length}`);
    console.log(`   Users with MeepleUps: ${usersWithMeepleUps}`);
    console.log(`   Users without MeepleUps: ${usersWithoutMeepleUps}`);
    console.log(`   Total memberships: ${totalMemberships}`);
    
    if (usersWithoutMeepleUps > 0 && usersWithMeepleUps === 0) {
      console.log('\n⚠️  No users have active MeepleUps.');
      console.log('   This explains why MeepleUps are not showing in the app.');
      console.log('   You may need to re-run the create-test-data.js script.');
    } else if (usersWithoutMeepleUps > 0) {
      console.log('\n⚠️  Some users have no MeepleUps.');
      console.log('   This could explain why MeepleUps are not showing for those users.');
    }
    
  } catch (error) {
    console.error('Error checking user MeepleUps:', error);
    process.exit(1);
  }
}

checkUserMeepleUps()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

