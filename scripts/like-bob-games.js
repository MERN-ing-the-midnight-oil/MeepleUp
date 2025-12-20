#!/usr/bin/env node

/**
 * Like most of Bob's games (set isFavorite to true)
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

const log = (message, type = 'info') => {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
};

/**
 * Get user by email
 */
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

/**
 * Get user's current collection
 */
async function getUserCollection(userId) {
  try {
    const gamesSnapshot = await db.collection('userGames')
      .doc(userId)
      .collection('games')
      .get();
    
    const games = [];
    gamesSnapshot.forEach(doc => {
      games.push({
        id: doc.id,
        ref: doc.ref,
        data: doc.data(),
      });
    });
    
    return games;
  } catch (error) {
    log(`Error getting collection for user ${userId}: ${error.message}`, 'error');
    return [];
  }
}

async function likeBobGames() {
  log('\n🚀 Liking Bob\'s Games\n', 'info');
  
  // Find Bob
  const email = 'bob@email.com';
  log(`Finding user: ${email}`, 'info');
  
  const user = await getUserByEmail(email);
  if (!user) {
    log(`User ${email} not found!`, 'error');
    process.exit(1);
  }
  
  log(`Found: ${user.name} (${user.email})`, 'success');
  
  // Get Bob's collection
  log('\nGetting Bob\'s collection...', 'info');
  const games = await getUserCollection(user.uid);
  log(`Found ${games.length} games`, 'info');
  
  if (games.length === 0) {
    log('No games found!', 'warning');
    process.exit(0);
  }
  
  // Like most games - target 90% liked
  const targetLikePercentage = 0.90;
  const targetLikedCount = Math.floor(games.length * targetLikePercentage);
  
  // Count how many are already liked
  const alreadyLiked = games.filter(g => g.data.isFavorite === true);
  const alreadyLikedCount = alreadyLiked.length;
  const needToLike = Math.max(0, targetLikedCount - alreadyLikedCount);
  
  log(`\nCurrent status: ${alreadyLikedCount} already liked out of ${games.length} games`, 'info');
  log(`Target: ${targetLikedCount} liked (${Math.round(targetLikePercentage * 100)}%)`, 'info');
  
  let likedCount = 0;
  let errorCount = 0;
  
  if (needToLike === 0) {
    log(`Already at target! ${alreadyLikedCount} games are liked.`, 'success');
  } else {
    log(`Need to like ${needToLike} more games...`, 'info');
    
    // Get games that aren't liked yet
    const gamesNotLiked = games.filter(g => !g.data.isFavorite);
    
    // Shuffle and select games to like
    const shuffled = [...gamesNotLiked].sort(() => Math.random() - 0.5);
    const gamesToLike = shuffled.slice(0, needToLike);
    
    log(`Liking ${gamesToLike.length} games...`, 'info');
    
    // Update games in batches
    const batchSize = 500; // Firestore batch limit
    
    for (let i = 0; i < gamesToLike.length; i += batchSize) {
      const batch = db.batch();
      const batchGames = gamesToLike.slice(i, i + batchSize);
      
      for (const game of batchGames) {
        batch.update(game.ref, {
          isFavorite: true,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
      
      try {
        await batch.commit();
        likedCount += batchGames.length;
        
        if ((i + batchSize) % 50 === 0 || i + batchSize >= gamesToLike.length) {
          log(`  Processed ${Math.min(i + batchSize, gamesToLike.length)}/${gamesToLike.length} games...`, 'info');
        }
      } catch (error) {
        log(`Error updating batch: ${error.message}`, 'error');
        errorCount += batchGames.length;
      }
    }
    
    if (likedCount > 0) {
      log(`\n✅ Liked ${likedCount} new games`, 'success');
    }
    if (errorCount > 0) {
      log(`   ${errorCount} errors`, 'error');
    }
  }
  
  // Verify final count
  const finalCollection = await getUserCollection(user.uid);
  const likedGames = finalCollection.filter(g => g.data.isFavorite === true);
  log(`\n📊 Final stats: ${likedGames.length} liked out of ${finalCollection.length} total games`, 'info');
  
  log('\n✨ Done!', 'success');
}

likeBobGames()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });

