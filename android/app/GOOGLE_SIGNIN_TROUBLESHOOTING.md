# Android Google Sign-In "Developer Error" Troubleshooting

## Problem
Getting "developer error" when tapping "Sign in with Google" on Android. This error typically links to GitHub troubleshooting pages.

## Root Cause
Android Google Sign-In requires:
1. **SHA-1 certificate fingerprint** registered in Firebase Console
2. **Android OAuth client** (client_type: 1) configured in Firebase with the SHA-1

The error occurs because Firebase doesn't have your app's SHA-1 fingerprint, so it can't verify the signing certificate.

## Solution

### Step 1: Get Your SHA-1 Certificate Fingerprint

#### ⚠️ IMPORTANT: For Internal Testing/Production Builds from Google Play

If you're testing an app installed from **Google Play Internal Testing** track, you **MUST** use the SHA-1 from **Google Play App Signing**, not from EAS or debug keystore. Google Play re-signs your app with their App Signing key, and that's what Firebase needs to verify.

**Get SHA-1 from Google Play Console:**

1. Go to [Google Play Console](https://play.google.com/console/)
2. Select your app: **MeepleUp**
3. Go to **Release** → **Setup** → **App integrity**
4. Scroll to **App signing key certificate** section
5. Copy the **SHA-1 certificate fingerprint** (format: `XX:XX:XX:XX:...`)
   - This is the certificate Google Play uses to sign your app for distribution
   - This is what Firebase needs to verify Google Sign-In

#### For Development/Debug Builds:
If you're testing with a debug build or local build:

```bash
# Debug keystore (default for local development)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

#### For EAS Preview Builds (Not from Play Store):
If you're testing a preview build directly from EAS (not via Play Store):

```bash
# Get SHA-1 from EAS credentials
eas credentials
```

1. Select **Android**
2. Select your project
3. Select **production** (or **preview** if that's what you're testing)
4. Copy the **SHA-1** fingerprint from the output

**OR** via EAS Dashboard:
1. Go to [expo.dev](https://expo.dev/)
2. Sign in → Select **MeepleUp** project
3. Go to **Credentials** → **Android**
4. Find your production/preview credentials
5. Copy the **SHA-1** fingerprint

### Step 2: Add SHA-1 to Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **meepleup-951a1**
3. Click the gear icon ⚙️ → **Project settings**
4. Scroll down to **Your apps** section
5. Find your **Android app** (`com.meepleup.app`)
6. Scroll to **SHA certificate fingerprints** section
7. Click **"Add fingerprint"**
8. Paste your SHA-1 fingerprint (format: `XX:XX:XX:XX:...`)
9. Click **Save**

### Step 3: Download Updated google-services.json

After adding the SHA-1, Firebase will automatically create an Android OAuth client. Download the updated `google-services.json`:

1. Still in Firebase Console → **Project settings** → **Your apps**
2. Click the **"Download google-services.json"** button
3. Save it to: `android/app/google-services.json`

### Step 4: Rebuild Your App

After updating `google-services.json`, you need to rebuild your app:

```bash
# For local build
npx expo run:android

# For EAS build
eas build --platform android --profile production
```

### Step 5: Verify the Fix

1. Uninstall the old app from your device
2. Install the newly built app
3. Try "Sign in with Google" again

## Common Issues

### Multiple SHA-1 Fingerprints
You can (and should) add **multiple** SHA-1 fingerprints to Firebase for different build scenarios:

1. **Google Play App Signing SHA-1** (for internal testing/production builds from Play Store) ⭐ **REQUIRED for your case**
2. **Debug SHA-1** (from `~/.android/debug.keystore`) - for local development
3. **EAS Production/Preview SHA-1** (from `eas credentials`) - if testing EAS builds directly

Firebase supports multiple SHA-1 fingerprints per app. Add all relevant ones to avoid issues across different build scenarios.

### Still Getting the Error?

1. **Verify you used the correct SHA-1**: For Play Store builds, you **MUST** use the **App signing key** SHA-1 from Play Console, not the upload key or EAS key.

2. **Verify** `google-services.json` was updated after adding SHA-1 (check the file modification date)

3. **Redownload** `google-services.json` from Firebase Console after adding SHA-1 - Firebase needs to regenerate the OAuth client

4. **Rebuild and republish** to Play Store:
   - After updating `google-services.json`, you need to create a new build
   - Upload the new build to Internal Testing track
   - Make sure testers install the **new version** from Play Store (not old cached version)

5. **Clear app data** or have testers uninstall/reinstall the app completely from Play Store

6. **Check logs** for the exact error message:
   ```bash
   npx react-native log-android
   # or
   adb logcat | grep -i google
   ```

7. **Verify** the package name in Firebase matches: `com.meepleup.app`

8. **Wait a few minutes** after adding SHA-1 - Firebase sometimes takes a few minutes to propagate the changes

## Quick Checklist

- [ ] Got SHA-1 fingerprint from debug keystore OR EAS credentials
- [ ] Added SHA-1 to Firebase Console → Android app → SHA certificate fingerprints
- [ ] Downloaded updated `google-services.json`
- [ ] Placed `google-services.json` at `android/app/google-services.json`
- [ ] Rebuilt the app (local or EAS)
- [ ] Uninstalled old app from device
- [ ] Installed new build
- [ ] Tried "Sign in with Google" again

## Additional Resources

- [Firebase Android Setup](https://firebase.google.com/docs/android/setup)
- [Google Sign-In for Android](https://developers.google.com/identity/sign-in/android/start-integrating)
- [EAS Credentials](https://docs.expo.dev/app-signing/managed-credentials/)

