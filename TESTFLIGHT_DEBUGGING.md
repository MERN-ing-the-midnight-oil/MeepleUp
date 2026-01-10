# TestFlight Debugging Guide

## How to Get TestFlight Logs

### Option 1: Using Xcode Console (Recommended)
1. **Connect your iPhone to your Mac** (same WiFi works, but USB is more reliable)
2. Open **Xcode** on your Mac
3. Go to **Window → Devices and Simulators** (Shift+Cmd+2)
4. Select your iPhone from the left sidebar
5. Click **Open Console** button at the bottom
6. **Launch the app on your iPhone** from TestFlight
7. Watch the console for errors - they will appear in real-time
8. Look for:
   - `❌ FIREBASE INIT ERROR` - Missing Firebase configuration
   - `Error:` or `ERROR:` - Any JavaScript errors
   - Red error messages

### Option 2: Using Console.app
1. Open **Console.app** on your Mac (search for "Console" in Spotlight)
2. Select your iPhone from the left sidebar (under Devices)
3. Filter by your app name "MeepleUp" or search for "error"
4. Launch the app and watch for errors

### Option 3: View Crash Logs in Xcode
1. Connect iPhone to Mac
2. Open Xcode → **Window → Devices and Simulators**
3. Select your iPhone
4. Click **View Device Logs** button
5. Look for recent crash logs or console logs from your app

## Common Issues and Solutions

### Issue: Blank White Screen

**Most Likely Cause: Missing Firebase Environment Variables**

The app requires Firebase configuration to run. If environment variables aren't set in your EAS build, Firebase initialization fails and the app shows a blank screen.

**Solution: Set EAS Secrets**

You need to set environment variables for EAS builds using EAS secrets:

```bash
# Set Firebase environment variables
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value "your-api-key"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "your-auth-domain"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "your-project-id"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "your-storage-bucket"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "your-sender-id"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_APP_ID --value "your-app-id"
```

**Check existing secrets:**
```bash
eas secret:list
```

### Issue: Firebase Configuration Error

If you see an error screen saying "Configuration Error", Firebase environment variables are missing or incorrect.

**What to do:**
1. Check EAS secrets are set: `eas secret:list`
2. Verify the values are correct (from your Firebase project settings)
3. Rebuild the app after setting secrets: `eas build --platform ios --profile production`

### Issue: Still Getting Blank Screen

1. **Check Xcode Console** (see Option 1 above) for the actual error
2. **Look for the error message** - it will tell you what's wrong
3. Common causes:
   - Missing Firebase config (see above)
   - Network issues (Firebase can't connect)
   - Invalid Firebase credentials
   - Missing native dependencies

## Setting Up Environment Variables for EAS Builds

### Step 1: Get Firebase Config Values

From your Firebase Console:
1. Go to Project Settings → General
2. Scroll to "Your apps" section
3. Click on your iOS app (or add one if missing)
4. Copy the config values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

### Step 2: Set EAS Secrets

Run these commands (replace values with your actual Firebase config):

```bash
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value "AIzaSy..."
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "your-project.firebaseapp.com"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "your-project-id"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "your-project.appspot.com"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "123456789"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_APP_ID --value "1:123456789:ios:abc123"
```

### Step 3: Rebuild

After setting secrets, rebuild your app:

```bash
eas build --platform ios --profile production
```

## Debugging Tips

### Enable Production Logging

The app now logs errors even in production builds. Check:
- Xcode Console (see Option 1)
- Look for messages prefixed with `❌` or `ERROR`

### Test Locally First

Before building for TestFlight, test locally:
```bash
# Make sure environment variables are set in .env file
# Then run locally
expo start --ios
```

If it works locally but not in TestFlight, the issue is likely missing EAS secrets.

### Check Build Logs

After building, check EAS build logs:
1. Go to https://expo.dev/accounts/rhyssmoker/projects/meepleup/builds
2. Click on your latest build
3. Check for any errors during the build process

## What We Fixed

1. **Added graceful error handling** - App now shows an error screen instead of blank screen
2. **Added production logging** - Errors are logged to console even in production
3. **Fixed Firebase initialization** - Errors are caught and displayed instead of crashing
4. **Added error screen** - Users see a helpful error message instead of blank screen

## Next Steps

1. **Set EAS secrets** for Firebase configuration (see above)
2. **Rebuild** the app: `eas build --platform ios --profile production`
3. **Test in TestFlight** - You should either see:
   - App working correctly, OR
   - An error screen with helpful information (instead of blank screen)
4. **Check Xcode Console** if still having issues to see the actual error

