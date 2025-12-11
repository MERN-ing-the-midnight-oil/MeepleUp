#!/usr/bin/env node

/**
 * Comprehensive CRUD Testing Script for MeepleUp
 * Tests all functionality from APP_FEATURES_CHECKLIST.md
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
const auth = admin.auth();

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
    testResults.failed.push({ name, error: error.message });
    log(`FAILED: ${name} - ${error.message}`, 'error');
    return false;
  }
};

// Test users
let testUsers = {
  organizer: null,
  member1: null,
  member2: null,
  stranger: null,
};

// Test data
let testEventId = null;
let testGameIds = [];
let testPostId = null;

// ============================================================================
// 1. AUTHENTICATION & USER CREATION
// ============================================================================

async function testAuthentication() {
  log('\n=== 1. AUTHENTICATION & USER CREATION ===', 'test');

  // Create test users
  await test('Create organizer user', async () => {
    const user = await auth.createUser({
      email: `test-organizer-${Date.now()}@meepleup.test`,
      password: 'TestPassword123!',
      displayName: 'Test Organizer',
      emailVerified: true,
    });
    testUsers.organizer = user;
    
    // Create user profile in Firestore
    await db.collection('users').doc(user.uid).set({
      name: 'Test Organizer',
      email: user.email,
      bio: 'I organize game nights',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log(`Created organizer: ${user.uid}`, 'success');
  });

  await test('Create member1 user', async () => {
    const user = await auth.createUser({
      email: `test-member1-${Date.now()}@meepleup.test`,
      password: 'TestPassword123!',
      displayName: 'Test Member 1',
      emailVerified: true,
    });
    testUsers.member1 = user;
    
    await db.collection('users').doc(user.uid).set({
      name: 'Test Member 1',
      email: user.email,
      bio: 'I love board games',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log(`Created member1: ${user.uid}`, 'success');
  });

  await test('Create member2 user', async () => {
    const user = await auth.createUser({
      email: `test-member2-${Date.now()}@meepleup.test`,
      password: 'TestPassword123!',
      displayName: 'Test Member 2',
      emailVerified: true,
    });
    testUsers.member2 = user;
    
    await db.collection('users').doc(user.uid).set({
      name: 'Test Member 2',
      email: user.email,
      bio: 'Board game enthusiast',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log(`Created member2: ${user.uid}`, 'success');
  });

  await test('Create stranger user', async () => {
    const user = await auth.createUser({
      email: `test-stranger-${Date.now()}@meepleup.test`,
      password: 'TestPassword123!',
      displayName: 'Test Stranger',
      emailVerified: true,
    });
    testUsers.stranger = user;
    
    await db.collection('users').doc(user.uid).set({
      name: 'Test Stranger',
      email: user.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    log(`Created stranger: ${user.uid}`, 'success');
  });

  await test('Read user profiles', async () => {
    for (const [role, user] of Object.entries(testUsers)) {
      if (!user) continue;
      const doc = await db.collection('users').doc(user.uid).get();
      if (!doc.exists) {
        throw new Error(`User profile not found for ${role}`);
      }
      log(`  ✓ Profile exists for ${role}`, 'success');
    }
  });
}

// ============================================================================
// 2. GAME COLLECTIONS CRUD
// ============================================================================

async function testGameCollections() {
  log('\n=== 2. GAME COLLECTIONS CRUD ===', 'test');

  const dummyGames = [
    {
      title: 'Catan',
      bggId: '13',
      yearPublished: 1995,
      minPlayers: 3,
      maxPlayers: 4,
      playingTime: 60,
      bggRating: 7.2,
      description: 'A strategy board game',
      image: 'https://cf.geekdo-images.com/thumb/img/0S6pH2UT-mONnKZo4iQwFDqnbQM=/fit-in/200x150/pic2419375.jpg',
      categories: ['Strategy', 'Family'],
    },
    {
      title: 'Ticket to Ride',
      bggId: '9209',
      yearPublished: 2004,
      minPlayers: 2,
      maxPlayers: 5,
      playingTime: 30,
      bggRating: 7.4,
      description: 'A railway adventure game',
      image: 'https://cf.geekdo-images.com/thumb/img/0S6pH2UT-mONnKZo4iQwFDqnbQM=/fit-in/200x150/pic2419375.jpg',
      categories: ['Family', 'Strategy'],
    },
    {
      title: 'Wingspan',
      bggId: '266192',
      yearPublished: 2019,
      minPlayers: 1,
      maxPlayers: 5,
      playingTime: 70,
      bggRating: 8.1,
      description: 'A bird-collection engine-building game',
      image: 'https://cf.geekdo-images.com/thumb/img/0S6pH2UT-mONnKZo4iQwFDqnbQM=/fit-in/200x150/pic2419375.jpg',
      categories: ['Strategy', 'Thematic'],
    },
  ];

  await test('Add games to organizer collection', async () => {
    if (!testUsers.organizer) throw new Error('Organizer user not created');
    
    for (const game of dummyGames) {
      const gameRef = db.collection('userGames')
        .doc(testUsers.organizer.uid)
        .collection('games')
        .doc();
      
      const gameData = {
        ...game,
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isFavorite: false,
        source: 'manual',
      };
      
      await gameRef.set(gameData);
      testGameIds.push(gameRef.id);
      log(`  ✓ Added ${game.title} to organizer collection`, 'success');
    }
  });

  await test('Add games to member1 collection', async () => {
    if (!testUsers.member1) throw new Error('Member1 user not created');
    
    // Add first two games to member1
    for (const game of dummyGames.slice(0, 2)) {
      const gameRef = db.collection('userGames')
        .doc(testUsers.member1.uid)
        .collection('games')
        .doc();
      
      await gameRef.set({
        ...game,
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isFavorite: false,
        source: 'manual',
      });
      log(`  ✓ Added ${game.title} to member1 collection`, 'success');
    }
  });

  await test('Read game collections', async () => {
    for (const [role, user] of Object.entries(testUsers)) {
      if (!user || role === 'stranger') continue;
      
      const snapshot = await db.collection('userGames')
        .doc(user.uid)
        .collection('games')
        .get();
      
      log(`  ✓ ${role} has ${snapshot.size} games`, 'success');
      
      // Only organizer and member1 should have games (we added games to them)
      if (snapshot.empty && (role === 'organizer' || role === 'member1')) {
        throw new Error(`No games found for ${role} (expected to have games)`);
      }
    }
  });

  await test('Update game (mark as favorite)', async () => {
    if (!testUsers.organizer || testGameIds.length === 0) {
      throw new Error('No games to update');
    }
    
    const gameId = testGameIds[0];
    await db.collection('userGames')
      .doc(testUsers.organizer.uid)
      .collection('games')
      .doc(gameId)
      .update({
        isFavorite: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    
    const updated = await db.collection('userGames')
      .doc(testUsers.organizer.uid)
      .collection('games')
      .doc(gameId)
      .get();
    
    if (!updated.data().isFavorite) {
      throw new Error('Game favorite status not updated');
    }
    log(`  ✓ Marked game as favorite`, 'success');
  });

  await test('Delete game from collection', async () => {
    if (!testUsers.organizer || testGameIds.length < 2) {
      throw new Error('Not enough games to delete');
    }
    
    const gameIdToDelete = testGameIds[testGameIds.length - 1];
    await db.collection('userGames')
      .doc(testUsers.organizer.uid)
      .collection('games')
      .doc(gameIdToDelete)
      .delete();
    
    const deleted = await db.collection('userGames')
      .doc(testUsers.organizer.uid)
      .collection('games')
      .doc(gameIdToDelete)
      .get();
    
    if (deleted.exists) {
      throw new Error('Game was not deleted');
    }
    log(`  ✓ Deleted game from collection`, 'success');
    testGameIds.pop(); // Remove from array
  });
}

// ============================================================================
// 3. EVENTS CRUD
// ============================================================================

async function testEvents() {
  log('\n=== 3. EVENTS CRUD ===', 'test');

  await test('Create event (gamingGroup)', async () => {
    if (!testUsers.organizer) throw new Error('Organizer user not created');
    
    const joinCode = `test ${Math.random().toString(36).substring(7)} ${Math.random().toString(36).substring(7)}`;
    const now = new Date();
    const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    
    const eventData = {
      name: 'Test Game Night',
      organizerId: testUsers.organizer.uid,
      description: 'A test game night event',
      location: {
        name: 'Test Brewery',
        address: '123 Test St, Test City',
      },
      joinCode: joinCode,
      memberIds: [testUsers.organizer.uid],
      eventDates: [
        {
          date: admin.firestore.Timestamp.fromDate(futureDate),
          startTime: admin.firestore.Timestamp.fromDate(new Date(futureDate.setHours(18, 0, 0, 0))),
          endTime: admin.firestore.Timestamp.fromDate(new Date(futureDate.setHours(22, 0, 0, 0))),
          location: 'Test Brewery',
          exactLocation: '123 Test St, Test City',
        },
      ],
      usualStartTime: admin.firestore.Timestamp.fromDate(new Date(2000, 0, 1, 18, 0, 0)),
      usualEndTime: admin.firestore.Timestamp.fromDate(new Date(2000, 0, 1, 22, 0, 0)),
      scheduledFor: admin.firestore.Timestamp.fromDate(futureDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true,
      rsvpSettings: {
        enabled: true,
        allowMaybe: true,
        attendanceLimit: null,
      },
    };
    
    const eventRef = await db.collection('gamingGroups').add(eventData);
    testEventId = eventRef.id;
    
    // Create organizer member document
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.organizer.uid)
      .set({
        userId: testUsers.organizer.uid,
        role: 'organizer',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        rsvpStatus: null,
        rsvpStatuses: {},
      });
    
    log(`  ✓ Created event: ${testEventId}`, 'success');
  });

  await test('Read event', async () => {
    if (!testEventId) throw new Error('Event not created');
    
    const eventDoc = await db.collection('gamingGroups').doc(testEventId).get();
    if (!eventDoc.exists) {
      throw new Error('Event not found');
    }
    
    const data = eventDoc.data();
    if (data.name !== 'Test Game Night') {
      throw new Error('Event name mismatch');
    }
    log(`  ✓ Event read successfully: ${data.name}`, 'success');
  });

  await test('Update event (edit description)', async () => {
    if (!testEventId) throw new Error('Event not created');
    
    await db.collection('gamingGroups').doc(testEventId).update({
      description: 'Updated test game night description',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const updated = await db.collection('gamingGroups').doc(testEventId).get();
    if (updated.data().description !== 'Updated test game night description') {
      throw new Error('Event description not updated');
    }
    log(`  ✓ Event updated successfully`, 'success');
  });

  await test('Join event (add member)', async () => {
    if (!testEventId || !testUsers.member1) {
      throw new Error('Event or member not available');
    }
    
    // Add member to memberIds array
    await db.collection('gamingGroups').doc(testEventId).update({
      memberIds: admin.firestore.FieldValue.arrayUnion(testUsers.member1.uid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Create member document
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member1.uid)
      .set({
        userId: testUsers.member1.uid,
        role: 'member',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        rsvpStatus: null,
        rsvpStatuses: {},
      });
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    if (!event.data().memberIds.includes(testUsers.member1.uid)) {
      throw new Error('Member not added to event');
    }
    log(`  ✓ Member joined event`, 'success');
  });

  await test('Add second member', async () => {
    if (!testEventId || !testUsers.member2) {
      throw new Error('Event or member2 not available');
    }
    
    await db.collection('gamingGroups').doc(testEventId).update({
      memberIds: admin.firestore.FieldValue.arrayUnion(testUsers.member2.uid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member2.uid)
      .set({
        userId: testUsers.member2.uid,
        role: 'member',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        rsvpStatus: null,
        rsvpStatuses: {},
      });
    
    log(`  ✓ Second member joined event`, 'success');
  });
}

// ============================================================================
// 4. RSVP FUNCTIONALITY
// ============================================================================

async function testRSVPs() {
  log('\n=== 4. RSVP FUNCTIONALITY ===', 'test');

  await test('Set RSVP status (Going)', async () => {
    if (!testEventId || !testUsers.member1) {
      throw new Error('Event or member not available');
    }
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const eventDates = event.data().eventDates || [];
    if (eventDates.length === 0) {
      throw new Error('No event dates found');
    }
    
    const firstDate = eventDates[0].date.toDate().toISOString().split('T')[0];
    
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member1.uid)
      .update({
        rsvpStatus: 'going', // Legacy field
        rsvpStatuses: {
          [firstDate]: 'going',
        },
        rsvpUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    
    const member = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member1.uid)
      .get();
    
    if (member.data().rsvpStatus !== 'going') {
      throw new Error('RSVP status not set to going');
    }
    log(`  ✓ Set RSVP to Going`, 'success');
  });

  await test('Update RSVP status (Maybe)', async () => {
    if (!testEventId || !testUsers.member2) {
      throw new Error('Event or member not available');
    }
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const eventDates = event.data().eventDates || [];
    const firstDate = eventDates[0].date.toDate().toISOString().split('T')[0];
    
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member2.uid)
      .update({
        rsvpStatus: 'maybe',
        rsvpStatuses: {
          [firstDate]: 'maybe',
        },
        rsvpUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    
    const member = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member2.uid)
      .get();
    
    if (member.data().rsvpStatus !== 'maybe') {
      throw new Error('RSVP status not set to maybe');
    }
    log(`  ✓ Set RSVP to Maybe`, 'success');
  });

  await test('Update RSVP settings', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    await db.collection('gamingGroups').doc(testEventId).update({
      'rsvpSettings.enabled': true,
      'rsvpSettings.allowMaybe': true,
      'rsvpSettings.attendanceLimit': 10,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const rsvpSettings = event.data().rsvpSettings;
    
    if (!rsvpSettings.enabled || !rsvpSettings.allowMaybe || rsvpSettings.attendanceLimit !== 10) {
      throw new Error('RSVP settings not updated correctly');
    }
    log(`  ✓ Updated RSVP settings`, 'success');
  });
}

// ============================================================================
// 5. DISCUSSION POSTS & COMMENTS
// ============================================================================

async function testDiscussion() {
  log('\n=== 5. DISCUSSION POSTS & COMMENTS ===', 'test');

  await test('Create discussion post', async () => {
    if (!testEventId || !testUsers.member1) {
      throw new Error('Event or member not available');
    }
    
    const postData = {
      userId: testUsers.member1.uid,
      content: 'Looking forward to game night! What games should we play?',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    const postRef = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .add(postData);
    
    testPostId = postRef.id;
    log(`  ✓ Created discussion post: ${testPostId}`, 'success');
  });

  await test('Read discussion posts', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    const posts = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .orderBy('createdAt', 'desc')
      .get();
    
    if (posts.empty) {
      throw new Error('No posts found');
    }
    log(`  ✓ Found ${posts.size} post(s)`, 'success');
  });

  await test('Update discussion post', async () => {
    if (!testEventId || !testPostId || !testUsers.member1) {
      throw new Error('Post or member not available');
    }
    
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .doc(testPostId)
      .update({
        content: 'Updated: Looking forward to game night! What games should we play? I can bring Catan!',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    
    const post = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .doc(testPostId)
      .get();
    
    if (!post.data().content.includes('Updated:')) {
      throw new Error('Post content not updated');
    }
    log(`  ✓ Updated discussion post`, 'success');
  });

  await test('Create comment on post', async () => {
    if (!testEventId || !testPostId || !testUsers.member2) {
      throw new Error('Post or member not available');
    }
    
    const commentData = {
      userId: testUsers.member2.uid,
      content: 'I vote for Wingspan!',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .doc(testPostId)
      .collection('comments')
      .add(commentData);
    
    const comments = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .doc(testPostId)
      .collection('comments')
      .get();
    
    if (comments.empty) {
      throw new Error('Comment not created');
    }
    log(`  ✓ Created comment on post`, 'success');
  });

  await test('Delete comment', async () => {
    if (!testEventId || !testPostId) {
      throw new Error('Post not available');
    }
    
    const comments = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .doc(testPostId)
      .collection('comments')
      .get();
    
    if (comments.empty) {
      log('  ⚠️ No comments to delete', 'warning');
      return;
    }
    
    const commentId = comments.docs[0].id;
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .doc(testPostId)
      .collection('comments')
      .doc(commentId)
      .delete();
    
    const deleted = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('posts')
      .doc(testPostId)
      .collection('comments')
      .doc(commentId)
      .get();
    
    if (deleted.exists) {
      throw new Error('Comment was not deleted');
    }
    log(`  ✓ Deleted comment`, 'success');
  });
}

// ============================================================================
// 6. PROFILE UPDATES
// ============================================================================

async function testProfileUpdates() {
  log('\n=== 6. PROFILE UPDATES ===', 'test');

  await test('Update user profile (name, bio)', async () => {
    if (!testUsers.member1) throw new Error('Member1 not available');
    
    await db.collection('users').doc(testUsers.member1.uid).update({
      name: 'Updated Test Member 1',
      bio: 'Updated bio: I really love board games!',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const profile = await db.collection('users').doc(testUsers.member1.uid).get();
    if (profile.data().name !== 'Updated Test Member 1') {
      throw new Error('Profile name not updated');
    }
    log(`  ✓ Updated profile name and bio`, 'success');
  });

  await test('Update notification preferences', async () => {
    if (!testUsers.member1) throw new Error('Member1 not available');
    
    const preferences = {
      meepleupChanges: true,
      meepleupChangesEmail: true,
      eventReminders: true,
      eventReminderHours: 48,
      discussion: true,
      discussionEmail: false,
      discussionFrequency: 'daily',
    };
    
    await db.collection('users').doc(testUsers.member1.uid).update({
      notificationPreferences: preferences,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const profile = await db.collection('users').doc(testUsers.member1.uid).get();
    const prefs = profile.data().notificationPreferences;
    
    if (prefs.eventReminderHours !== 48 || prefs.discussionFrequency !== 'daily') {
      throw new Error('Notification preferences not updated');
    }
    log(`  ✓ Updated notification preferences`, 'success');
  });
}

// ============================================================================
// 7. EVENT ARCHIVING
// ============================================================================

async function testEventArchiving() {
  log('\n=== 7. EVENT ARCHIVING ===', 'test');

  await test('Archive event', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    await db.collection('gamingGroups').doc(testEventId).update({
      isActive: false,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    if (event.data().isActive !== false) {
      throw new Error('Event not archived');
    }
    log(`  ✓ Archived event`, 'success');
  });

  await test('Unarchive event', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    await db.collection('gamingGroups').doc(testEventId).update({
      isActive: true,
      deletedAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    if (event.data().isActive !== true) {
      throw new Error('Event not unarchived');
    }
    log(`  ✓ Unarchived event`, 'success');
  });
}

// ============================================================================
// 8. LEAVE EVENT
// ============================================================================

async function testLeaveEvent() {
  log('\n=== 8. LEAVE EVENT ===', 'test');

  await test('Member leaves event', async () => {
    if (!testEventId || !testUsers.member2) {
      throw new Error('Event or member not available');
    }
    
    // Remove from memberIds array
    await db.collection('gamingGroups').doc(testEventId).update({
      memberIds: admin.firestore.FieldValue.arrayRemove(testUsers.member2.uid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Delete member document
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member2.uid)
      .delete();
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    if (event.data().memberIds.includes(testUsers.member2.uid)) {
      throw new Error('Member not removed from event');
    }
    log(`  ✓ Member left event`, 'success');
  });
}

// ============================================================================
// 9. CONTACT REQUESTS (Strangers)
// ============================================================================

async function testContactRequests() {
  log('\n=== 9. CONTACT REQUESTS (Strangers) ===', 'test');

  await test('Create contact request from stranger', async () => {
    if (!testEventId || !testUsers.stranger) {
      throw new Error('Event or stranger not available');
    }
    
    const contactRequest = {
      id: `contact_${Date.now()}`,
      name: 'Test Stranger',
      email: testUsers.stranger.email,
      message: 'Hi! I would like to join your game night. I love board games!',
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
    };
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const contactRequests = event.data().contactRequests || [];
    contactRequests.push(contactRequest);
    
    await db.collection('gamingGroups').doc(testEventId).update({
      contactRequests: contactRequests,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const updated = await db.collection('gamingGroups').doc(testEventId).get();
    const requests = updated.data().contactRequests || [];
    
    if (requests.length === 0) {
      throw new Error('Contact request not added');
    }
    log(`  ✓ Created contact request`, 'success');
  });

  await test('Read contact requests', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const contactRequests = event.data().contactRequests || [];
    
    if (contactRequests.length === 0) {
      throw new Error('No contact requests found');
    }
    log(`  ✓ Found ${contactRequests.length} contact request(s)`, 'success');
  });

  await test('Update contact request status (responded)', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const contactRequests = event.data().contactRequests || [];
    
    if (contactRequests.length === 0) {
      log('  ⚠️ No contact requests to update', 'warning');
      return;
    }
    
    contactRequests[0].status = 'responded';
    contactRequests[0].respondedAt = admin.firestore.Timestamp.now();
    
    await db.collection('gamingGroups').doc(testEventId).update({
      contactRequests: contactRequests,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const updated = await db.collection('gamingGroups').doc(testEventId).get();
    const requests = updated.data().contactRequests || [];
    
    if (requests[0].status !== 'responded') {
      throw new Error('Contact request status not updated');
    }
    log(`  ✓ Updated contact request status to responded`, 'success');
  });
}

// ============================================================================
// 10. GAME PROPOSALS/NOMINATIONS
// ============================================================================

async function testGameProposals() {
  log('\n=== 10. GAME PROPOSALS/NOMINATIONS ===', 'test');

  await test('Create game proposal', async () => {
    if (!testEventId || !testUsers.member1 || testGameIds.length === 0) {
      throw new Error('Event, member, or games not available');
    }
    
    const proposalData = {
      gameId: testGameIds[0],
      gameTitle: 'Catan',
      proposedBy: testUsers.member1.uid,
      nominatedBy: testUsers.member1.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    const proposalRef = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('nominations')
      .add(proposalData);
    
    log(`  ✓ Created game proposal: ${proposalRef.id}`, 'success');
  });

  await test('Read game proposals', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    const proposals = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('nominations')
      .get();
    
    if (proposals.empty) {
      throw new Error('No game proposals found');
    }
    log(`  ✓ Found ${proposals.size} game proposal(s)`, 'success');
  });

  await test('Delete game proposal', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    const proposals = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('nominations')
      .get();
    
    if (proposals.empty) {
      log('  ⚠️ No proposals to delete', 'warning');
      return;
    }
    
    const proposalId = proposals.docs[0].id;
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('nominations')
      .doc(proposalId)
      .delete();
    
    const deleted = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('nominations')
      .doc(proposalId)
      .get();
    
    if (deleted.exists) {
      throw new Error('Proposal was not deleted');
    }
    log(`  ✓ Deleted game proposal`, 'success');
  });
}

// ============================================================================
// 11. MULTIPLE EVENT DATES & RSVPs
// ============================================================================

async function testMultipleEventDates() {
  log('\n=== 11. MULTIPLE EVENT DATES & RSVPs ===', 'test');

  await test('Add multiple event dates', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const existingDates = event.data().eventDates || [];
    
    const now = new Date();
    const date2 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now
    const date3 = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // 21 days from now
    
    const newDates = [
      {
        date: admin.firestore.Timestamp.fromDate(date2),
        startTime: admin.firestore.Timestamp.fromDate(new Date(date2.setHours(18, 0, 0, 0))),
        endTime: admin.firestore.Timestamp.fromDate(new Date(date2.setHours(22, 0, 0, 0))),
        location: 'Test Brewery',
        exactLocation: '123 Test St, Test City',
      },
      {
        date: admin.firestore.Timestamp.fromDate(date3),
        startTime: admin.firestore.Timestamp.fromDate(new Date(date3.setHours(19, 0, 0, 0))),
        endTime: admin.firestore.Timestamp.fromDate(new Date(date3.setHours(23, 0, 0, 0))),
        location: 'Test Brewery',
        exactLocation: '123 Test St, Test City',
      },
    ];
    
    await db.collection('gamingGroups').doc(testEventId).update({
      eventDates: [...existingDates, ...newDates],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const updated = await db.collection('gamingGroups').doc(testEventId).get();
    const dates = updated.data().eventDates || [];
    
    if (dates.length < 3) {
      throw new Error('Multiple dates not added');
    }
    log(`  ✓ Added multiple event dates (total: ${dates.length})`, 'success');
  });

  await test('Set different RSVPs for different dates', async () => {
    if (!testEventId || !testUsers.member1) {
      throw new Error('Event or member not available');
    }
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const eventDates = event.data().eventDates || [];
    
    if (eventDates.length < 2) {
      log('  ⚠️ Not enough dates for this test', 'warning');
      return;
    }
    
    const date1 = eventDates[0].date.toDate().toISOString().split('T')[0];
    const date2 = eventDates[1].date.toDate().toISOString().split('T')[0];
    
    await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member1.uid)
      .update({
        rsvpStatuses: {
          [date1]: 'going',
          [date2]: 'maybe',
        },
        rsvpUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    
    const member = await db.collection('gamingGroups')
      .doc(testEventId)
      .collection('members')
      .doc(testUsers.member1.uid)
      .get();
    
    const rsvpStatuses = member.data().rsvpStatuses || {};
    if (rsvpStatuses[date1] !== 'going' || rsvpStatuses[date2] !== 'maybe') {
      throw new Error('Different RSVPs for different dates not set correctly');
    }
    log(`  ✓ Set different RSVPs for different dates`, 'success');
  });
}

// ============================================================================
// 12. REGENERATE JOIN CODE
// ============================================================================

async function testRegenerateJoinCode() {
  log('\n=== 12. REGENERATE JOIN CODE ===', 'test');

  await test('Regenerate join code', async () => {
    if (!testEventId) throw new Error('Event not available');
    
    const event = await db.collection('gamingGroups').doc(testEventId).get();
    const oldJoinCode = event.data().joinCode;
    
    const newJoinCode = `new ${Math.random().toString(36).substring(7)} ${Math.random().toString(36).substring(7)}`;
    
    await db.collection('gamingGroups').doc(testEventId).update({
      joinCode: newJoinCode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const updated = await db.collection('gamingGroups').doc(testEventId).get();
    const currentJoinCode = updated.data().joinCode;
    
    if (currentJoinCode === oldJoinCode) {
      throw new Error('Join code not regenerated');
    }
    if (currentJoinCode !== newJoinCode) {
      throw new Error('Join code not updated correctly');
    }
    log(`  ✓ Regenerated join code: ${newJoinCode}`, 'success');
  });
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  log('\n🚀 Starting Comprehensive CRUD Testing for MeepleUp\n', 'test');
  
  try {
    await testAuthentication();
    await testGameCollections();
    await testEvents();
    await testRSVPs();
    await testDiscussion();
    await testProfileUpdates();
    await testEventArchiving();
    await testLeaveEvent();
    await testContactRequests();
    await testGameProposals();
    await testMultipleEventDates();
    await testRegenerateJoinCode();
    
    // Print summary
    log('\n=== TEST SUMMARY ===', 'test');
    log(`✅ Passed: ${testResults.passed.length}`, 'success');
    log(`❌ Failed: ${testResults.failed.length}`, testResults.failed.length > 0 ? 'error' : 'success');
    log(`⚠️  Warnings: ${testResults.warnings.length}`, testResults.warnings.length > 0 ? 'warning' : 'success');
    
    if (testResults.failed.length > 0) {
      log('\n=== FAILED TESTS ===', 'error');
      testResults.failed.forEach(({ name, error }) => {
        log(`  ${name}: ${error}`, 'error');
      });
    }
    
    // Cleanup option (commented out for safety)
    // Uncomment to clean up test data after testing
    /*
    log('\n🧹 Cleaning up test data...', 'test');
    if (testEventId) {
      await db.collection('gamingGroups').doc(testEventId).delete();
    }
    for (const user of Object.values(testUsers)) {
      if (user) {
        await auth.deleteUser(user.uid);
      }
    }
    log('✓ Cleanup complete', 'success');
    */
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runAllTests()
  .then(() => {
    log('\n✨ Testing complete!', 'success');
    process.exit(testResults.failed.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });

