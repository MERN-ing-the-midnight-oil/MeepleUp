#!/usr/bin/env node

/**
 * Test script to trigger the email welcome function
 * Creates a test signup in Firestore to test the email function
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: firebase-service-account.json not found');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

async function testEmailFunction() {
  console.log('🧪 Testing iOS Beta Welcome Email Function\n');
  
  // Use your email for testing
  const testEmail = 'r.smoker@gmail.com';
  
  console.log(`Creating test signup for: ${testEmail}`);
  console.log('This will trigger the sendIOSBetaWelcomeEmail function...\n');
  
  try {
    // Create a test signup document
    const testSignup = {
      email: testEmail,
      platforms: ['ios'],
      signupDate: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      source: 'test_script',
      testRun: true
    };
    
    const docRef = await db.collection('betaSignups').add(testSignup);
    console.log(`✅ Test signup created: ${docRef.id}`);
    console.log('\n📧 The Cloud Function should now send an email to:', testEmail);
    console.log('   Check your inbox (and spam folder) in a few seconds!\n');
    
    console.log('📊 To check function logs:');
    console.log('   firebase functions:log --only sendIOSBetaWelcomeEmail\n');
    
    // Wait a moment then check if email was sent
    setTimeout(async () => {
      const doc = await docRef.get();
      const data = doc.data();
      if (data.welcomeEmailSent) {
        console.log('✅ Email sent successfully! (welcomeEmailSent: true)');
      } else {
        console.log('⏳ Email status not yet updated (may take a few seconds)');
        console.log('   Check Firebase Functions logs for details');
      }
    }, 3000);
    
  } catch (error) {
    console.error('❌ Error creating test signup:', error);
    process.exit(1);
  }
}

testEmailFunction().then(() => {
  // Keep process alive for a few seconds to see the result
  setTimeout(() => process.exit(0), 5000);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

