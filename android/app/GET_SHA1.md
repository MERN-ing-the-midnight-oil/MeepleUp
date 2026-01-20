# How to Get Your Android App's SHA-1 Certificate Fingerprint

## Method 1: Using EAS CLI (Easiest - For Production Builds)

If you're using EAS to build your app, get the SHA-1 from your EAS credentials:

```bash
eas credentials
```

1. Select **Android**
2. Select your project (should be pre-selected)
3. Select **production** (or preview, depending on which key you want)
4. The SHA-1 fingerprint will be displayed in the credentials output

## Method 2: Using EAS Dashboard (Web)

1. Go to [expo.dev](https://expo.dev/)
2. Sign in and select your project **MeepleUp**
3. Go to **Credentials** → **Android**
4. Find your production/preview credentials
5. The SHA-1 fingerprint is shown in the credential details

## Method 3: For Local Development (Debug Keystore)

If you need the SHA-1 for local development/debugging:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Look for the line that says:
```
SHA1: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
```

## Method 4: From Firebase Console (If Already Configured)

If you've previously added your SHA-1 to Firebase:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **meepleup-951a1**
3. Go to **Project Settings** → **Your apps** → Android app
4. Scroll down to **SHA certificate fingerprints** section
5. Your SHA-1 will be listed there

## Important Notes

- **Production builds** (for Play Store): Use the SHA-1 from your production keystore (EAS credentials)
- **Preview/Development builds**: Use the SHA-1 from your preview keystore (EAS credentials)
- **Local debugging**: Use the debug keystore SHA-1 (Method 3)

If you're restricting the Firebase API key for production use, you'll want to add **both**:
1. The production SHA-1 (from EAS credentials)
2. The debug SHA-1 (if you want Firebase to work in local development)

You can add multiple SHA-1 fingerprints to the same API key restriction in Google Cloud Console.


