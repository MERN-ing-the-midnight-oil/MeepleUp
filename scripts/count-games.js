#!/usr/bin/env node

/**
 * Quick script to count games in Firestore
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

async function countGames() {
  try {
    console.log('\n🔍 Counting games in Firestore...\n');
    
    // Get all games
    const gamesRef = db.collection('games');
    const snapshot = await gamesRef.count().get();
    const totalCount = snapshot.data().count;
    
    console.log(`✅ Total games in Firestore: ${totalCount.toLocaleString()}\n`);
    
    // Also check how many are pre-populated
    const prePopulatedSnapshot = await gamesRef.where('prePopulated', '==', true).count().get();
    const prePopulatedCount = prePopulatedSnapshot.data().count;
    
    console.log(`📦 Pre-populated games: ${prePopulatedCount.toLocaleString()}\n`);
    
    // Get a sample of recent games
    const recentGames = await gamesRef
      .orderBy('prePopulatedAt', 'desc')
      .limit(5)
      .get();
    
    if (recentGames.size > 0) {
      console.log('📋 Sample of recently added games:');
      recentGames.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${data.name} (ID: ${doc.id}, Rank: ${data.rank || 'N/A'})`);
      });
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error counting games:', error);
    process.exit(1);
  }
}

countGames();


