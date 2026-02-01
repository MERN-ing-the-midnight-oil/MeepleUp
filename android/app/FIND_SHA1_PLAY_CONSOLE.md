# How to Find SHA-1 in Google Play Console (Step-by-Step)

## Location: App Integrity → App Signing

1. **You're already in the right place!** You're at:
   - **App integrity** → **App signing** section

2. **Look for "App signing key certificate"** section:
   - In the **App signing** section, scroll down to find **"App signing key certificate"** or **"App signing key"**
   - This shows the certificate that Google Play uses to sign your app

3. **Find the SHA-1 fingerprint**:
   - Under "App signing key certificate", you should see:
     - **SHA-1 certificate fingerprint**: `XX:XX:XX:XX:...`
     - **SHA-256 certificate fingerprint**: `XX:XX:XX:XX:...`
   - Copy the **SHA-1** one (that's what Firebase needs)

## Visual Guide

The App signing section should show something like:

```
App signing
Signing by Google Play

App signing key certificate
SHA-1 certificate fingerprint:  AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12
SHA-256 certificate fingerprint: AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90
```

## If You Don't See the SHA-1

1. **Try clicking "Show more" or expanding the App signing section**
2. **Look for tabs or sections** like:
   - "App signing key certificate"
   - "Certificate details"
   - "Signing certificate"
3. **Check if there's a download button** - sometimes the certificate is shown in a downloadable format

## Alternative: Check Upload Key Certificate

Sometimes you'll see two certificates:
1. **App signing key certificate** (Google Play's key) - ⭐ **USE THIS ONE**
2. **Upload key certificate** (your upload key) - Don't use this for Play Store builds

Make sure you copy the SHA-1 from the **App signing key certificate**, not the upload key.

## After You Have the SHA-1

1. Copy the SHA-1 fingerprint (format: `XX:XX:XX:XX:...`)
2. Go to [Firebase Console](https://console.firebase.google.com/)
3. Project: **meepleup-951a1**
4. ⚙️ → **Project settings** → **Your apps** → **Android app** (`com.meepleup.app`)
5. Scroll to **SHA certificate fingerprints**
6. Click **"Add fingerprint"**
7. Paste the SHA-1 and save
8. Download updated `google-services.json`
9. Replace `android/app/google-services.json` in your project









