#!/usr/bin/env node

/**
 * Process Beta Signups Script
 * 
 * This script reads pending beta signups from Firestore and:
 * 1. Exports them to a testers.txt file for Fastlane
 * 2. Optionally runs Fastlane to add iOS testers
 * 3. Updates the signup status in Firestore
 * 
 * Usage:
 *   node scripts/process-beta-signups.js              # List pending signups
 *   node scripts/process-beta-signups.js --export    # Export to testers.txt
 *   node scripts/process-beta-signups.js --add-ios   # Export and add to TestFlight
 *   node scripts/process-beta-signups.js --mark-done # Mark exported as 'invited'
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: firebase-service-account.json not found');
  console.log('   Download it from Firebase Console → Project Settings → Service Accounts');
  console.log('   Save it as: firebase-service-account.json in the project root');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

async function getPendingSignups() {
  const snapshot = await db.collection('betaSignups')
    .where('status', '==', 'pending')
    .get();
  
  const signups = [];
  snapshot.forEach(doc => {
    signups.push({ id: doc.id, ...doc.data() });
  });
  
  // Sort by signupDate in JavaScript (ascending)
  signups.sort((a, b) => {
    const dateA = a.signupDate ? a.signupDate.toDate() : new Date(0);
    const dateB = b.signupDate ? b.signupDate.toDate() : new Date(0);
    return dateA - dateB;
  });
  
  return signups;
}

async function getAllSignups() {
  const snapshot = await db.collection('betaSignups')
    .orderBy('signupDate', 'desc')
    .get();
  
  const signups = [];
  snapshot.forEach(doc => {
    signups.push({ id: doc.id, ...doc.data() });
  });
  
  return signups;
}

async function updateSignupStatus(signupId, status) {
  await db.collection('betaSignups').doc(signupId).update({
    status: status,
    processedDate: admin.firestore.FieldValue.serverTimestamp()
  });
}

function exportToFile(signups, platform = null) {
  const filtered = platform 
    ? signups.filter(s => s.platforms && s.platforms.includes(platform))
    : signups;
  
  const filename = platform ? `testers-${platform}.txt` : 'testers.txt';
  const filepath = path.join(__dirname, '..', filename);
  
  const content = filtered.map(s => s.email).join('\n');
  fs.writeFileSync(filepath, content);
  
  console.log(`✅ Exported ${filtered.length} emails to ${filename}`);
  return filepath;
}

async function main() {
  const args = process.argv.slice(2);
  
  const shouldExport = args.includes('--export') || args.includes('-e');
  const shouldAddIOS = args.includes('--add-ios') || args.includes('-i');
  const shouldMarkDone = args.includes('--mark-done') || args.includes('-m');
  const showAll = args.includes('--all') || args.includes('-a');
  
  console.log('\n🎮 MeepleUp Beta Signup Processor\n');
  
  // Get signups
  const signups = showAll ? await getAllSignups() : await getPendingSignups();
  
  if (signups.length === 0) {
    console.log('📭 No pending beta signups found.\n');
    process.exit(0);
  }
  
  // Display signups
  console.log(`📋 ${showAll ? 'All' : 'Pending'} Beta Signups (${signups.length}):\n`);
  console.log('─'.repeat(70));
  
  signups.forEach((signup, index) => {
    const date = signup.signupDate ? signup.signupDate.toDate().toLocaleDateString() : 'N/A';
    const platforms = signup.platforms ? signup.platforms.join(', ') : 'both';
    const status = signup.status || 'pending';
    console.log(`${index + 1}. ${signup.email}`);
    console.log(`   Platforms: ${platforms} | Status: ${status} | Date: ${date}`);
  });
  
  console.log('─'.repeat(70));
  console.log('');
  
  // Export to file
  if (shouldExport || shouldAddIOS) {
    const iosSignups = signups.filter(s => 
      s.status === 'pending' && 
      (!s.platforms || s.platforms.includes('ios'))
    );
    
    if (iosSignups.length > 0) {
      const filepath = exportToFile(iosSignups, 'ios');
      console.log(`   File: ${filepath}\n`);
    } else {
      console.log('📭 No pending iOS signups to export.\n');
    }
  }
  
  // Add to TestFlight
  if (shouldAddIOS) {
    const iosSignups = signups.filter(s => 
      s.status === 'pending' && 
      (!s.platforms || s.platforms.includes('ios'))
    );
    
    if (iosSignups.length > 0) {
      console.log('🚀 Adding testers to TestFlight via Fastlane...\n');
      
      try {
        // Check if environment variables are set
        if (!process.env.APP_STORE_CONNECT_KEY_ID) {
          console.log('⚠️  Environment variables not set. Run:');
          console.log('   export APP_STORE_CONNECT_KEY_ID="4H83DR5N6N"');
          console.log('   export APP_STORE_CONNECT_ISSUER_ID="bd6fdb18-f6ac-4296-b842-28ba1a1a5ce7"');
          console.log('   export APP_STORE_CONNECT_PRIVATE_KEY_PATH="/Users/rhyssmoker/bootcamp/MeepleUp/fastlane/AuthKey.p8"');
          console.log('');
        }
        
        const projectRoot = path.join(__dirname, '..');
        
        // Add each tester
        for (const signup of iosSignups) {
          console.log(`   Adding: ${signup.email}`);
          try {
            execSync(
              `fastlane add_ios_beta_tester email:${signup.email}`,
              { 
                cwd: projectRoot,
                stdio: 'inherit',
                env: {
                  ...process.env,
                  APP_STORE_CONNECT_KEY_ID: process.env.APP_STORE_CONNECT_KEY_ID || '4H83DR5N6N',
                  APP_STORE_CONNECT_ISSUER_ID: process.env.APP_STORE_CONNECT_ISSUER_ID || 'bd6fdb18-f6ac-4296-b842-28ba1a1a5ce7',
                  APP_STORE_CONNECT_PRIVATE_KEY_PATH: process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH || '/Users/rhyssmoker/bootcamp/MeepleUp/fastlane/AuthKey.p8'
                }
              }
            );
            
            // Mark as invited
            await updateSignupStatus(signup.id, 'invited');
            console.log(`   ✅ ${signup.email} added and marked as invited\n`);
          } catch (error) {
            console.error(`   ❌ Failed to add ${signup.email}: ${error.message}\n`);
          }
        }
        
        console.log('✅ Done processing iOS testers!\n');
      } catch (error) {
        console.error('❌ Error running Fastlane:', error.message);
        console.log('\nMake sure Fastlane is installed and environment variables are set.\n');
      }
    }
  }
  
  // Mark as done
  if (shouldMarkDone) {
    console.log('📝 Marking pending signups as "invited"...\n');
    
    const pendingSignups = signups.filter(s => s.status === 'pending');
    
    for (const signup of pendingSignups) {
      await updateSignupStatus(signup.id, 'invited');
      console.log(`   ✅ ${signup.email} marked as invited`);
    }
    
    console.log(`\n✅ Marked ${pendingSignups.length} signups as invited.\n`);
  }
  
  // Show usage if no action taken
  if (!shouldExport && !shouldAddIOS && !shouldMarkDone) {
    console.log('Usage:');
    console.log('  node scripts/process-beta-signups.js              # List pending signups');
    console.log('  node scripts/process-beta-signups.js --all        # List all signups');
    console.log('  node scripts/process-beta-signups.js --export     # Export to testers-ios.txt');
    console.log('  node scripts/process-beta-signups.js --add-ios    # Add iOS testers to TestFlight');
    console.log('  node scripts/process-beta-signups.js --mark-done  # Mark all pending as invited');
    console.log('');
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
