# Android Build Guide for Google Play

This guide covers common issues and requirements for your first Android build submission to Google Play.

## Pre-Build Checklist

### ✅ Configuration Review

Your current setup looks good:
- ✅ **App Bundle format**: `app-bundle` configured in `eas.json` (required for Google Play)
- ✅ **Version management**: `versionCode: 20`, `versionName: "1.0.2"` (aligned)
- ✅ **Package name**: `com.meepleup.app` (consistent)
- ✅ **Permissions**: Properly declared in `app.json`
- ✅ **Privacy Policy**: Exists at `docs/privacy-policy.html`

### ⚠️ Potential Issues to Address

## 1. **Missing Google Services Configuration File**

**Issue**: You have `GoogleService-Info.plist` for iOS, but no `google-services.json` for Android.

**Impact**: Firebase services (Auth, Firestore, etc.) won't work on Android if this is missing.

**Solution**:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Project Settings → Your apps → Android app
4. Download `google-services.json`
5. Place it at: `android/app/google-services.json`
6. Add to `app.json`:
   ```json
   "android": {
     "googleServicesFile": "./google-services.json",
     // ... rest of config
   }
   ```

## 2. **EAS Build Credentials (Keystore)**

**Issue**: First-time builds need signing credentials.

**What happens**: EAS will automatically generate a keystore on first build, OR you can pre-generate one.

**Recommended approach** (let EAS handle it):
- Run: `eas build --platform android --profile production`
- EAS will prompt to generate credentials
- **IMPORTANT**: Back up the credentials when prompted
- Save the keystore password and key password securely

**Manual approach** (if you prefer):
```bash
eas credentials
# Follow prompts to generate Android keystore
```

## 3. **App Icon Requirements**

**Current**: Using single icon file `./assets/images/app-icon.png`

**Google Play Requirements**:
- ✅ Adaptive icon configured (good!)
- ⚠️ **Verify icon sizes**: Should be at least 512x512px
- ⚠️ **Transparent background**: Adaptive icons need transparent/clear foreground

**Check**: Ensure your icon at `./assets/images/app-icon.png` is:
- High resolution (512x512 or larger)
- Properly formatted (PNG)
- Looks good on transparent background

## 4. **Version Code Management**

**Current**: `versionCode: 20` in `app.json` and `build.gradle`

**Important Rules**:
- ✅ Versions must **always increase** for each upload
- ✅ Version codes must be integers
- ✅ Current setup (20) is fine, but remember to increment for future releases

**Future updates**: Increment `versionCode` in `app.json` → `android.versionCode` (EAS will sync to `build.gradle`)

## 5. **Target SDK Version**

**Issue**: Google Play requires apps to target recent Android versions.

**Current**: Using Expo SDK 54 defaults (likely Android 14/API 34)

**Verify**: Check what Expo SDK 54 uses. If outdated:
- Google Play now requires targeting Android 13 (API 33) or higher for new apps
- Expo SDK 54 should be fine, but verify in build logs

## 6. **ProGuard/R8 Configuration**

**Current**: `minifyEnabled` is disabled by default (`enableMinifyInReleaseBuilds: false`)

**Recommendation**: 
- For first build, keep minification **disabled** (current setting)
- After successful build, consider enabling for smaller app size
- If you enable it, you'll need ProGuard rules for native modules

**If you enable minification later**, add rules to `android/app/proguard-rules.pro`:
```proguard
# Keep React Native classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }

# Keep Firebase classes
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
```

## 7. **Build Type: App Bundle vs APK**

**Current**: Correctly using `app-bundle` ✅

**Why this matters**: 
- Google Play **requires** App Bundles (AAB) for new apps
- APKs are only for internal testing
- Your `eas.json` is correctly configured

## Google Play Console Requirements

### Required Before First Submission

1. **App Signing Key**
   - EAS will generate this automatically
   - Google will manage app signing (Play App Signing)
   - You just need upload key (EAS handles this)

2. **Store Listing Assets**
   - App name: "MeepleUp" ✅
   - Short description (80 chars)
   - Full description (4000 chars)
   - Feature graphic (1024 x 500px)
   - Screenshots (at least 2, up to 8)
     - Phone: 16:9 or 9:16, min 320px, max 3840px
     - Tablet: Same requirements
   - App icon: 512x512px (you have this ✅)
   - Privacy Policy URL: `https://meepleup.com/privacy-policy.html` (verify this works)

3. **Content Rating**
   - Complete questionnaire
   - Usually takes 24-48 hours

4. **Privacy Policy**
   - ✅ You have one at `docs/privacy-policy.html`
   - ⚠️ **Verify it's publicly accessible** at your domain
   - Required URL field in Play Console

5. **App Access (if restricted)**
   - Your app appears to be public, so this may not apply
   - If you have closed testing, set up test groups

6. **Data Safety Form**
   - Declare data collection practices
   - Based on your permissions, you collect:
     - Location data
     - Camera/photos
     - Audio recordings
     - User-generated content
   - Complete the form accurately

### Permissions You're Using

Your declared permissions:
- `CAMERA` - Required justification
- `RECORD_AUDIO` - Required justification  
- `ACCESS_COARSE_LOCATION` - Required justification
- `ACCESS_FINE_LOCATION` - Required justification

**In Play Console**, you'll need to provide:
- **Why each permission is needed**
- **How data is used**
- Examples:
  - Camera: "To scan board game barcodes and identify games using AI vision"
  - Location: "To find nearby game events and match users by location"
  - Audio: "For optional audio narration when taking photos"

## Common Build Errors & Solutions

### ⚠️ **CRITICAL: expo-in-app-purchases Compatibility Issue**

**Error**: `cannot find symbol: class ExportedModule` in `expo-in-app-purchases`

**Issue**: `expo-in-app-purchases@14.6.0` is **incompatible with Expo SDK 54**. The package uses deprecated Expo modules APIs that were removed in SDK 54.

**Status**: This is a known compatibility issue. The package needs to be updated by the Expo team to support SDK 54's new module system.

**Solutions** (in order of preference):

1. **Check for Package Update** (Recommended):
   ```bash
   npm view expo-in-app-purchases versions --json
   ```
   Check if there's a newer version that supports SDK 54. As of writing, version 14.6.0 is the latest but may not support SDK 54 yet.

2. **Check Expo GitHub/Issues**:
   - Check [Expo GitHub Issues](https://github.com/expo/expo/issues) for `expo-in-app-purchases` and SDK 54
   - Look for updates or workarounds

3. **Temporary Workaround** (if IAP is not critical for first release):
   - Consider temporarily removing or conditionally using `expo-in-app-purchases` if it's not essential for your first Android release
   - You can add it back once the package is updated

4. **Monitor for Updates**:
   - This will likely be fixed in a future `expo-in-app-purchases` update
   - Watch the Expo releases for SDK 54 compatible versions

**Note**: Your existing patch file (`patches/expo-in-app-purchases+14.6.0.patch`) only patches build.gradle, not the Java source code compatibility issue.

### Error: "google-services.json not found"
**Solution**: Download from Firebase Console and place in `android/app/`

### Error: "Keystore not found" or "Signing configuration"
**Solution**: EAS will handle this automatically on first build, or run `eas credentials`

### Error: "SDK version mismatch"
**Solution**: Run `npx expo install --fix` to align dependencies with Expo SDK 54

### Error: "Duplicate resources" or "Resource conflict"
**Solution**: Clean build:
```bash
cd android
./gradlew clean
cd ..
```

### Error: "Metro bundler issues"
**Solution**: Clear cache:
```bash
npx expo start --clear
# Or
rm -rf node_modules/.cache
```

### Error: "Build timeout" or "Out of memory"
**Solution**: EAS builds should handle this, but if building locally:
- Increase Gradle memory in `android/gradle.properties`
- Your current setting: `-Xmx2048m` (2GB) should be sufficient

## Recommended Build Process

### Step 1: Pre-Build Verification
```bash
# Check EAS CLI is installed and up to date
npm install -g eas-cli
eas --version

# Login to EAS
eas login

# Verify project is linked
eas whoami
```

### Step 2: Download Google Services File
- Get `google-services.json` from Firebase Console
- Place in `android/app/`
- Add to `app.json` (if not using Expo's automatic detection)

### Step 3: Test Build Locally (Optional)
```bash
# Build preview APK locally to catch issues
eas build --platform android --profile preview --local
```

### Step 4: Production Build
```bash
# This will prompt for credential generation if first time
eas build --platform android --profile production
```

### Step 5: Submit to Play Console
```bash
# After successful build
eas submit --platform android
```

Or manually:
1. Download the `.aab` file from EAS
2. Upload to Google Play Console → Production → Create new release
3. Fill in release notes
4. Review and publish (or save as draft)

## Version Management Strategy

**Current State**:
- `app.json`: `version: "1.0.2"`, `versionCode: 20`
- `package.json`: `version: "1.0.0"` ⚠️ **Mismatch** (cosmetic only, but consider aligning)

**For future releases**:
1. Update `app.json`:
   ```json
   "version": "1.0.3",  // User-facing version
   "android": {
     "versionCode": 21  // Increment by 1
   }
   ```
2. EAS will sync `versionCode` to `build.gradle` automatically
3. Always increment `versionCode`, even for patches

## Testing Before Submission

1. **Internal Testing Track** (Recommended first):
   ```bash
   eas build --platform android --profile preview
   ```
   - Upload to Internal Testing in Play Console
   - Test on real devices
   - Share with team/testers

2. **Production Build**:
   ```bash
   eas build --platform android --profile production
   ```
   - Only after internal testing passes
   - Upload to Production track

## Post-Build Checklist

- [ ] Build completed successfully
- [ ] Download `.aab` file
- [ ] Test on at least one physical Android device (if possible)
- [ ] Verify all Firebase services work
- [ ] Check app icon displays correctly
- [ ] Verify permissions work as expected
- [ ] Privacy policy URL is accessible
- [ ] All store listing assets prepared
- [ ] Content rating questionnaire completed
- [ ] Data safety form completed
- [ ] Release notes prepared

## Quick Reference

**Build command**:
```bash
eas build --platform android --profile production
```

**Check build status**:
```bash
eas build:list
```

**View build logs**:
```bash
eas build:view [BUILD_ID]
```

**Submit to Play Store**:
```bash
eas submit --platform android
```

## Support Resources

- [EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Firebase Android Setup](https://firebase.google.com/docs/android/setup)

## Notes

- First build may take 15-20 minutes
- EAS provides free builds on their servers (no local setup needed)
- Google Play review typically takes 1-3 days for new apps
- You can save builds as drafts in Play Console before publishing

Good luck with your first Android build! 🚀


