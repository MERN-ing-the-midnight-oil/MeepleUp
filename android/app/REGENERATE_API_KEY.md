# How to Generate a New Firebase API Key for Android

## Option 1: Download Fresh google-services.json (Easiest)

Firebase automatically generates API keys for your apps. The easiest way is to download a fresh `google-services.json` file:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **meepleup-951a1**
3. Click the gear icon ⚙️ → **Project settings**
4. Scroll down to **Your apps** section
5. Find your Android app (package: `com.meepleup.app`)
6. Click **"Download google-services.json"**
7. Save the file to: `android/app/google-services.json`

The file will contain a new API key that Firebase automatically manages.

## Option 2: Manually Create API Key in Google Cloud Console

If you need to manually create and manage the key:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **meepleup-951a1**
3. Navigate to **APIs & Services** → **Credentials**
4. Click **"+ CREATE CREDENTIALS"** → **"API key"**
5. A new API key will be created
6. **IMPORTANT**: Click **"Restrict key"** immediately and configure:

### Restrictions to Apply:

#### Application restrictions:
- Select **"Android apps"**
- Click **"Add an item"**
- Package name: `com.meepleup.app`
- SHA-1 certificate fingerprint: Add your signing certificate SHA-1 (you can find this in your EAS build settings or local keystore)

#### API restrictions:
- Select **"Restrict key"**
- Choose only these APIs:
  - Firebase Installations API
  - Firebase Realtime Database API (if used)
  - Cloud Firestore API (if used)
  - Firebase Cloud Messaging API (if used)
  - Other Firebase APIs you actually use

7. Click **"Save"**

### After Creating the Key:

You'll need to update your `google-services.json` file manually OR download a fresh one from Firebase Console (Option 1 is easier).

## Getting Your SHA-1 Fingerprint

If you need your app's SHA-1 fingerprint for restrictions:

### For EAS Builds:
- Check your EAS build configuration
- Or use: `eas credentials` to view certificate details

### For Local Development:
```bash
# Debug keystore (default)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Or for release keystore (if you have one)
keytool -list -v -keystore path/to/your/keystore.jks -alias your-key-alias
```

Look for the "SHA1" line in the output.

## Important Security Notes

- **Always restrict API keys** by Android app package name and SHA-1 fingerprint
- Restrict to only the APIs you actually use
- The key in `google-services.json` is a client-side key, so it will be visible in your app bundle, but restrictions prevent unauthorized use
- Never commit `google-services.json` to git (already configured in `.gitignore`)

