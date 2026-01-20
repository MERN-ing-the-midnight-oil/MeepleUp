#!/usr/bin/env node

/**
 * Simulate beta test signups for testing admin notifications.
 * Creates one iOS and one Android signup in Firestore.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ firebase-service-account.json not found');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

async function run() {
  console.log('\n🧪 Simulating beta test signups...\n');

  const batch = [
    {
      email: 'ios-tester-sim@example.com',
      name: 'Jane Tester',
      platforms: ['ios'],
      status: 'pending',
      source: 'simulation',
      signupDate: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      email: 'android-tester-sim@example.com',
      platforms: ['android'],
      status: 'pending',
      source: 'simulation',
      signupDate: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  for (const data of batch) {
    const ref = await db.collection('betaSignups').add(data);
    console.log(`✅ ${data.platforms[0]} signup: ${data.email} (id: ${ref.id})`);
  }

  console.log('\n📧 Email + SMS notifications should be on the way.\n');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

