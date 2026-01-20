# Beta Tester Automation Guide

This guide explains how to automate adding beta testers to iOS TestFlight.

**Note:** Android beta testing uses Google Play Internal Testing opt-in links - no automation needed. Users join directly via: https://play.google.com/apps/internaltest/4701636314391153737

## Overview

The `scripts/add-beta-testers.js` script provides a foundation for automating beta tester management. Currently, it includes placeholders that need to be implemented with the actual API integrations.

## Option 1: Use Fastlane (Recommended - Easiest for iOS)

[Fastlane](https://fastlane.tools/) is the most popular tool for automating iOS beta testing. It handles authentication and API calls for you.

**Note:** Android uses opt-in links - no Fastlane needed.

### Installation

```bash
# Install Fastlane
sudo gem install fastlane

# Or via Homebrew (macOS)
brew install fastlane
```

### iOS TestFlight (Fastlane)

1. **Set up App Store Connect API Key** (recommended over username/password):
   - Go to https://appstoreconnect.apple.com/access/api
   - Create a new API key
   - Download the `.p8` file
   - Note the Key ID and Issuer ID

2. **Add to Fastfile** (create `fastlane/Fastfile` if it doesn't exist):

```ruby
lane :add_ios_beta_tester do |options|
  email = options[:email]
  
  # Using App Store Connect API key
  api_key = app_store_connect_api_key(
    key_id: ENV["APP_STORE_CONNECT_KEY_ID"],
    issuer_id: ENV["APP_STORE_CONNECT_ISSUER_ID"],
    key_filepath: "./AuthKey.p8",
    in_house: false
  )
  
  # Add beta tester
  add_testers_to_group(
    group_name: "External Testers", # or "Internal Testers"
    email_addresses: [email],
    app_identifier: "com.meepleup.app",
    api_key: api_key
  )
end
```

3. **Usage**:
```bash
fastlane add_ios_beta_tester email:test@example.com
```

### Android Beta Testing

Android beta testing uses **Google Play Internal Testing opt-in links** - no automation needed!

Users can join directly via the opt-in URL:
- **Opt-in URL**: https://play.google.com/apps/internaltest/4701636314391153737

Simply share this link with testers (via QR code, email, or website). They click the link and join instantly - no email collection or manual addition required.

## Option 2: Use the Node.js Script (Requires Implementation)

The `scripts/add-beta-testers.js` script provides a foundation but needs API integration.

### iOS Setup

1. **Install dependencies**:
```bash
npm install @appstoreconnect/appstoreconnect
```

2. **Set up App Store Connect API**:
   - Go to https://appstoreconnect.apple.com/access/api
   - Create a new API key
   - Download the `.p8` file
   - Set environment variables:

```bash
export APP_STORE_CONNECT_KEY_ID="your-key-id"
export APP_STORE_CONNECT_ISSUER_ID="your-issuer-id"
export APP_STORE_CONNECT_PRIVATE_KEY_PATH="./AuthKey.p8"
```

3. **Implement the iOS function** in `scripts/add-beta-testers.js`:
   - Uncomment and customize the `addIOSBetaTester` function
   - You'll need your Beta Group ID(s) from App Store Connect

### Usage

```bash
# Single email, iOS
node scripts/add-beta-testers.js --platform ios --email test@example.com

# From file (one email per line, optional CSV format: email,firstName,lastName)
node scripts/add-beta-testers.js --platform ios --file testers.txt
```

**Note:** Android beta testing uses opt-in links - no script needed. Users join directly via: https://play.google.com/apps/internaltest/4701636314391153737

## Android Beta Testing (Using Opt-In Links)

**Android beta testing uses Google Play Internal Testing opt-in links** - this is the recommended approach:

1. Go to Google Play Console → Your App → Testing → Internal testing
2. Copy the "Opt-in URL" 
3. Share this URL with testers (via QR code, email, or website) - they can join themselves

**Current opt-in URL**: https://play.google.com/apps/internaltest/4701636314391153737

This doesn't require API access, automation, or email collection!

## Option 4: TestFlight Public Links (Easiest for iOS)

For iOS, you can create a public TestFlight link:

1. Go to App Store Connect → Your App → TestFlight
2. Create a public link for external testing
3. Share the link - testers can join themselves

However, this requires your app to be approved for external testing (can take 24-48 hours).

## Quick Reference: Manual Addition

### iOS TestFlight
1. Go to https://appstoreconnect.apple.com/
2. Select your app
3. Navigate to TestFlight → Users and Access
4. Click "+" → Enter email → Select Beta Group
5. Invite

### Android Google Play
**No manual addition needed!** Users join directly via the opt-in link:
- https://play.google.com/apps/internaltest/4701636314391153737

If you need to manage testers manually:
1. Go to https://play.google.com/console/
2. Select your app
3. Navigate to Testing → Internal testing
4. Click "Testers" tab → View/manage testers

## Recommended Approach

For **beta testing**, I recommend:

1. **Android**: Use Google Play Internal Testing opt-in links (easiest, no API needed)
2. **iOS**: Use Fastlane with App Store Connect API key (most reliable automation)

This gives you:
- ✅ Easy Android onboarding (just share a link)
- ✅ Automated iOS management (Fastlane handles the complexity)
- ✅ No need to manually add testers for iOS

## Testing the Script

To test if your setup works:

```bash
# Test iOS
fastlane add_ios_beta_tester email:your-test-email@example.com

# Or test the Node.js script
node scripts/add-beta-testers.js --platform ios --email your-test-email@example.com
```

**Android:** No testing needed - users join directly via the opt-in link!

## Troubleshooting

### iOS Issues

- **"Invalid API Key"**: Make sure your Key ID, Issuer ID, and .p8 file path are correct
- **"App not found"**: Verify your bundle ID matches exactly
- **"Beta group not found"**: You need to create a Beta Group in App Store Connect first

### Android Issues

**No automation issues!** Android uses opt-in links. If users can't join:
- Verify the opt-in URL is correct: https://play.google.com/apps/internaltest/4701636314391153737
- Check that Internal Testing is set up in Google Play Console
- Ensure the app has a release in the Internal Testing track

## Additional Resources

- [App Store Connect API Documentation](https://developer.apple.com/app-store-connect/api/)
- [Google Play Developer API Documentation](https://developers.google.com/android-publisher)
- [Fastlane Documentation](https://docs.fastlane.tools/)
- [TestFlight Beta Testing Guide](https://developer.apple.com/testflight/)
- [Google Play Testing Guide](https://support.google.com/googleplay/android-developer/answer/9845334)
