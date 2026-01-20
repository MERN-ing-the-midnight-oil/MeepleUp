#!/usr/bin/env node

/**
 * Beta Tester Management Script
 * 
 * This script helps automate adding beta testers to:
 * - iOS TestFlight (via App Store Connect API)
 * 
 * Note: Android beta testing uses Google Play Internal Testing opt-in links
 * (no automation needed - users join directly via the opt-in URL)
 * 
 * Prerequisites:
 * - For iOS: App Store Connect API key (https://appstoreconnect.apple.com/access/api)
 * 
 * Usage:
 *   node scripts/add-beta-testers.js --platform ios --email test@example.com
 *   node scripts/add-beta-testers.js --platform ios --file testers.txt
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration (should be set via environment variables or .env file)
const CONFIG = {
  ios: {
    // App Store Connect API Key ID
    keyId: process.env.APP_STORE_CONNECT_KEY_ID,
    // Path to the .p8 private key file
    issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID,
    // App Store Connect API issuer ID
    privateKeyPath: process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH || './AuthKey.p8',
    // Your app's bundle ID
    bundleId: process.env.IOS_BUNDLE_ID || 'com.meepleup.app',
  },
};

/**
 * Add tester to iOS TestFlight
 * 
 * Note: App Store Connect API requires JWT authentication
 * You'll need to install the @appstoreconnect/appstoreconnect library
 * npm install @appstoreconnect/appstoreconnect
 */
async function addIOSBetaTester(email, firstName = '', lastName = '') {
  console.log(`📱 Adding ${email} to iOS TestFlight...`);
  
  try {
    // This is a placeholder - you'll need to implement using App Store Connect API
    // Example using @appstoreconnect/appstoreconnect:
    /*
    const { AppStoreConnectAPI } = require('@appstoreconnect/appstoreconnect');
    
    const api = new AppStoreConnectAPI({
      issuerId: CONFIG.ios.issuerId,
      keyId: CONFIG.ios.keyId,
      privateKey: fs.readFileSync(CONFIG.ios.privateKeyPath, 'utf8'),
    });
    
    // First, find the app
    const appsResponse = await api.apps.list({
      filter: { bundleId: CONFIG.ios.bundleId },
    });
    
    if (!appsResponse.data || appsResponse.data.length === 0) {
      throw new Error(`App with bundle ID ${CONFIG.ios.bundleId} not found`);
    }
    
    const app = appsResponse.data[0];
    
    // Create or find beta tester
    const testersResponse = await api.betaTesters.create({
      email,
      firstName,
      lastName,
      relationships: {
        betaGroups: {
          data: [/* beta group IDs */]
        }
      }
    });
    
    console.log(`✅ Successfully added ${email} to iOS TestFlight`);
    */
    
    console.log(`⚠️  iOS TestFlight integration not yet implemented.`);
    console.log(`   Please add ${email} manually via App Store Connect:`);
    console.log(`   https://appstoreconnect.apple.com/apps -> Your App -> TestFlight -> Users and Access`);
    console.log(`   Or use Fastlane: fastlane add_testers email:${email}`);
    
  } catch (error) {
    console.error(`❌ Error adding iOS beta tester:`, error.message);
    throw error;
  }
}


/**
 * Parse email from line (handles CSV format: email,firstName,lastName)
 */
function parseEmailLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  
  const parts = trimmed.split(',').map(p => p.trim());
  return {
    email: parts[0],
    firstName: parts[1] || '',
    lastName: parts[2] || '',
  };
}

/**
 * Read emails from file
 */
async function readEmailsFromFile(filePath) {
  const emails = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    const parsed = parseEmailLine(line);
    if (parsed) {
      emails.push(parsed);
    }
  }
  
  return emails;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  let platform = null;
  let email = null;
  let fileName = null;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' || args[i] === '-p') {
      platform = args[++i];
    } else if (args[i] === '--email' || args[i] === '-e') {
      email = args[++i];
    } else if (args[i] === '--file' || args[i] === '-f') {
      fileName = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Beta Tester Management Script

Usage:
  node scripts/add-beta-testers.js [options]

Options:
  --platform, -p <platform>   Platform: 'ios' (Android uses opt-in links, no automation needed)
  --email, -e <email>          Single email address to add
  --file, -f <file>            File containing emails (one per line, optional CSV: email,firstName,lastName)
  --help, -h                   Show this help message

Environment Variables:
  APP_STORE_CONNECT_KEY_ID              App Store Connect API Key ID
  APP_STORE_CONNECT_ISSUER_ID           App Store Connect API Issuer ID
  APP_STORE_CONNECT_PRIVATE_KEY_PATH    Path to .p8 private key file
  IOS_BUNDLE_ID                         iOS app bundle ID (default: com.meepleup.app)

Examples:
  node scripts/add-beta-testers.js --platform ios --email test@example.com
  node scripts/add-beta-testers.js --platform ios --file testers.txt

Note: Android beta testing uses Google Play Internal Testing opt-in links.
      Users join directly via: https://play.google.com/apps/internaltest/4701636314391153737
      `);
      process.exit(0);
    }
  }
  
  if (!platform) {
    console.error('❌ Error: --platform is required (ios)');
    console.error('   Note: Android uses opt-in links - no automation needed');
    process.exit(1);
  }
  
  if (platform !== 'ios') {
    console.error('❌ Error: Only "ios" platform is supported');
    console.error('   Android beta testing uses opt-in links - no automation needed');
    console.error('   Users join directly via: https://play.google.com/apps/internaltest/4701636314391153737');
    process.exit(1);
  }
  
  if (!email && !fileName) {
    console.error('❌ Error: Either --email or --file is required');
    process.exit(1);
  }
  
  // Collect emails
  const testers = [];
  
  if (email) {
    testers.push({ email, firstName: '', lastName: '' });
  } else if (fileName) {
    const filePath = path.isAbsolute(fileName) ? fileName : path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Error: File not found: ${filePath}`);
      process.exit(1);
    }
    const emails = await readEmailsFromFile(filePath);
    testers.push(...emails);
  }
  
  if (testers.length === 0) {
    console.error('❌ Error: No valid emails found');
    process.exit(1);
  }
  
  console.log(`\n📋 Processing ${testers.length} tester(s)...\n`);
  
  // Process each tester
  for (const tester of testers) {
    console.log(`\n👤 Processing: ${tester.email}`);
    await addIOSBetaTester(tester.email, tester.firstName, tester.lastName);
    console.log(''); // Empty line for readability
  }
  
  console.log('\n✅ Done!\n');
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { addIOSBetaTester };
