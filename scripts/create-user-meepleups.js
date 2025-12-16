#!/usr/bin/env node

/**
 * Create Meepleups for Each User and Join Everyone to Alice's
 */

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

// Generate a random join code (3 words)
const generateJoinCode = () => {
  const wordList1 = [
    'lovely', 'ugly', 'strange', 'weird', 'odd', 'bright', 'dull', 'dim', 'clever', 'silly',
    'wise', 'calm', 'wild', 'gentle', 'fierce', 'kind', 'cruel', 'brave', 'timid', 'bold',
  ];
  const wordList2 = [
    'red', 'blue', 'green', 'gold', 'golden', 'silver', 'black', 'white', 'grey', 'gray',
    'brown', 'pink', 'purple', 'yellow', 'orange', 'beige', 'tan', 'bronze', 'copper', 'amber',
  ];
  const wordList3 = [
    'robot', 'drone', 'mech', 'cyborg', 'alien', 'beast', 'dragon', 'wizard', 'witch', 'mage',
    'knight', 'dwarf', 'elf', 'orc', 'troll', 'goblin', 'ghost', 'demon', 'angel', 'titan',
  ];
  
  const word1 = wordList1[Math.floor(Math.random() * wordList1.length)];
  const word2 = wordList2[Math.floor(Math.random() * wordList2.length)];
  const word3 = wordList3[Math.floor(Math.random() * wordList3.length)];
  
  return `${word1} ${word2} ${word3}`;
};

async function getUserByEmail(email) {
  try {
    const user = await auth.getUserByEmail(email.toLowerCase());
    const userDoc = await db.collection('users').doc(user.uid).get();
    return {
      uid: user.uid,
      email: user.email,
      name: userDoc.data()?.name || user.displayName || email.split('@')[0],
    };
  } catch (error) {
    log(`Error getting user ${email}: ${error.message}`, 'error');
    return null;
  }
}

async function createMeepleup(organizer, meepleupName, description) {
  try {
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 7); // 7 days from now
    eventDate.setHours(18, 0, 0, 0); // 6 PM
    
    const endDate = new Date(eventDate);
    endDate.setHours(22, 0, 0, 0); // 10 PM
    
    const joinCode = generateJoinCode();
    
    const eventData = {
      name: meepleupName,
      organizerId: organizer.uid,
      organizerName: organizer.name,
      description: description,
      location: {
        name: 'Local Game Cafe',
        address: '123 Main St',
      },
      joinCode: joinCode,
      joinCodes: [joinCode],
      privacy: 'private',
      scheduledFor: admin.firestore.Timestamp.fromDate(eventDate),
      eventDates: [
        {
          date: admin.firestore.Timestamp.fromDate(eventDate),
          startTime: admin.firestore.Timestamp.fromDate(eventDate),
          endTime: admin.firestore.Timestamp.fromDate(endDate),
          location: 'Local Game Cafe',
          exactLocation: '123 Main St',
          note: '',
        },
      ],
      usualStartTime: admin.firestore.Timestamp.fromDate(new Date(2000, 0, 1, 18, 0, 0)),
      usualEndTime: admin.firestore.Timestamp.fromDate(new Date(2000, 0, 1, 22, 0, 0)),
      memberIds: [organizer.uid],
      memberCount: 1,
      isActive: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      createdBy: organizer.uid,
      rsvpSettings: {
        enabled: true,
        allowMaybe: true,
        attendanceLimit: null,
      },
    };
    
    const eventRef = await db.collection('gamingGroups').add(eventData);
    
    // Create organizer member document
    await db.collection('gamingGroups')
      .doc(eventRef.id)
      .collection('members')
      .doc(organizer.uid)
      .set({
        userId: organizer.uid,
        userName: organizer.name,
        userAvatarUrl: '',
        role: 'organizer',
        joinedAt: admin.firestore.Timestamp.now(),
        rsvpStatus: null,
        rsvpStatuses: {},
      });
    
    log(`✓ Created meepleup: ${meepleupName} (Join Code: ${joinCode})`, 'success');
    return { id: eventRef.id, joinCode, name: meepleupName };
  } catch (error) {
    log(`✗ Failed to create meepleup for ${organizer.name}: ${error.message}`, 'error');
    throw error;
  }
}

async function joinMeepleup(eventId, user) {
  try {
    // Check if user is already a member
    const memberDoc = await db.collection('gamingGroups')
      .doc(eventId)
      .collection('members')
      .doc(user.uid)
      .get();
    
    if (memberDoc.exists) {
      log(`  ${user.name} is already a member`, 'info');
      return;
    }
    
    // Add to memberIds array
    await db.collection('gamingGroups').doc(eventId).update({
      memberIds: admin.firestore.FieldValue.arrayUnion(user.uid),
      memberCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    // Create member document
    await db.collection('gamingGroups')
      .doc(eventId)
      .collection('members')
      .doc(user.uid)
      .set({
        userId: user.uid,
        userName: user.name,
        userAvatarUrl: '',
        role: 'member',
        joinedAt: admin.firestore.Timestamp.now(),
        rsvpStatus: null,
        rsvpStatuses: {},
      });
    
    log(`  ✓ ${user.name} joined`, 'success');
  } catch (error) {
    log(`  ✗ Failed to add ${user.name}: ${error.message}`, 'error');
  }
}

async function main() {
  log('\n🚀 Creating Meepleups for Each User\n', 'info');
  
  // Get all users
  const userEmails = ['alice@meepleup.com', 'bob@meepleup.com', 'charlie@meepleup.com', 
                      'diana@meepleup.com', 'eve@meepleup.com', 'frank@meepleup.com'];
  
  log('Fetching users...', 'info');
  const users = [];
  for (const email of userEmails) {
    const user = await getUserByEmail(email);
    if (user) {
      users.push(user);
      log(`  ✓ Found: ${user.name}`, 'info');
    }
  }
  
  if (users.length === 0) {
    log('No users found!', 'error');
    process.exit(1);
  }
  
  // Find Alice
  const alice = users.find(u => u.email.toLowerCase() === 'alice@meepleup.com');
  if (!alice) {
    log('Alice not found!', 'error');
    process.exit(1);
  }
  
  // Create meepleups for each user
  log('\n=== Creating Meepleups ===', 'info');
  const meepleups = [];
  let aliceMeepleupId = null;
  
  for (const user of users) {
    const meepleupName = `${user.name}'s Game Night`;
    const description = `Join ${user.name} for a fun night of board games! All skill levels welcome.`;
    
    try {
      const meepleup = await createMeepleup(user, meepleupName, description);
      meepleups.push({ ...meepleup, organizer: user.name });
      
      if (user.email.toLowerCase() === 'alice@meepleup.com') {
        aliceMeepleupId = meepleup.id;
      }
    } catch (error) {
      log(`Failed to create meepleup for ${user.name}`, 'error');
    }
  }
  
  // Have everyone join Alice's meepleup
  if (aliceMeepleupId) {
    log(`\n=== Joining Everyone to ${alice.name}'s Meepleup ===`, 'info');
    const otherUsers = users.filter(u => u.uid !== alice.uid);
    
    for (const user of otherUsers) {
      await joinMeepleup(aliceMeepleupId, user);
    }
  }
  
  // Summary
  log('\n=== Summary ===', 'info');
  log(`Created ${meepleups.length} meepleups:`, 'info');
  meepleups.forEach(meepleup => {
    log(`  - ${meepleup.name} (Join Code: ${meepleup.joinCode})`, 'info');
  });
  
  if (aliceMeepleupId) {
    const aliceEvent = await db.collection('gamingGroups').doc(aliceMeepleupId).get();
    const memberIds = aliceEvent.data()?.memberIds || [];
    log(`\n${alice.name}'s meepleup has ${memberIds.length} members`, 'info');
  }
  
  log('\n✨ Done!', 'success');
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

