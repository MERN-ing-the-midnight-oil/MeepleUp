# Google Services Setup

## Security Note

The `google-services.json` file contains Firebase API keys and is **NOT committed to git** for security reasons.

## Setup Instructions

### For Local Development

1. Download `google-services.json` from Firebase Console:
   - Go to Firebase Console → Project Settings → Your Apps
   - Select your Android app (`com.meepleup.app`)
   - Click "Download google-services.json"

2. Place the file at: `android/app/google-services.json`

### For EAS Builds

Your app primarily uses **environment variables** for Firebase configuration (`EXPO_PUBLIC_FIREBASE_API_KEY`, etc.), which are set via EAS secrets. The `google-services.json` file is only needed for certain native Android Firebase features.

For EAS builds, you can either:
- Use EAS Build Secrets (recommended - already configured)
- Or download the file and place it before building

## Important Security Steps

1. **Revoke the old leaked key** in Google Cloud Console
2. **Generate a new API key** with proper restrictions:
   - Android app restrictions (package name: `com.meepleup.app`)
   - SHA-1 certificate fingerprint restrictions
   - API restrictions (only Firebase APIs needed)

3. The new key will be in the downloaded `google-services.json` file

## Template

See `google-services.json.template` for the file structure (with placeholder values).

