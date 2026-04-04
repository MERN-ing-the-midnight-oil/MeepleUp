#!/usr/bin/env node

/**
 * List emails collected on the maintenance landing page (maintenanceNotify collection).
 *
 * Usage (from project root):
 *   node scripts/list-maintenance-notify.js
 *
 * Requires firebase-service-account.json in the project root.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ firebase-service-account.json not found in project root');
  console.log('   Download from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

async function main() {
  const snapshot = await db.collection('maintenanceNotify').orderBy('createdAt', 'asc').get();
  const docs = [];
  snapshot.forEach((doc) => {
    const d = doc.data();
    docs.push({
      id: doc.id,
      email: d.email || '(no email)',
      createdAt: d.createdAt ? d.createdAt.toDate().toISOString() : null,
    });
  });

  console.log(`maintenanceNotify: ${docs.length} signup(s)\n`);
  if (docs.length === 0) {
    console.log('No emails were collected while the maintenance page was up.');
    return;
  }
  docs.forEach((d, i) => {
    console.log(`${i + 1}. ${d.email}  (${d.createdAt})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
