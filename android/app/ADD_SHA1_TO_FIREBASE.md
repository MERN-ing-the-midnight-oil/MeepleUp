# Adding SHA-1 to Firebase Console - Step by Step

## Step 1: Get the SHA-1 Fingerprint

The SHA-1 should be **40 hex characters** (20 pairs separated by colons).

Format: `XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX`

In Google Play Console, look for:
- **SHA-1 certificate fingerprint** (this is what you need)
- **SHA-256 certificate fingerprint** (longer, don't use this)

## Step 2: Add to Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **meepleup-951a1**
3. Click the gear icon ⚙️ (top left) → **Project settings**
4. Scroll down to **"Your apps"** section
5. Find your **Android app** (package: `com.meepleup.app`)
6. Scroll to **"SHA certificate fingerprints"** section
7. Click **"Add fingerprint"** button
8. Paste your SHA-1 fingerprint (format: `XX:XX:XX:XX:...`)
9. Click **Save** (or the checkmark)

## Step 3: Download Updated google-services.json

After adding the SHA-1:

1. Still in **Project settings** → **Your apps** → **Android app**
2. Click the **"Download google-services.json"** button
3. Save the file (it will download automatically)

## Step 4: Replace the File in Your Project

1. Replace the file at: `android/app/google-services.json`
2. Make sure the old file is completely replaced

## Step 5: Verify the Update

The updated `google-services.json` should have:
- An **Android OAuth client** (client_type: 1) in the `oauth_client` array
- The client should include your package name: `com.meepleup.app`

## Step 6: Rebuild Your App

After updating `google-services.json`:

```bash
eas build --platform android --profile production
```

Then upload the new build to Internal Testing track.

## Quick Checklist

- [ ] Found SHA-1 fingerprint in Play Console (40 hex characters, not SHA-256)
- [ ] Added SHA-1 to Firebase Console → Android app → SHA certificate fingerprints
- [ ] Downloaded updated `google-services.json` from Firebase
- [ ] Replaced `android/app/google-services.json` in project
- [ ] Verified `google-services.json` has Android OAuth client (client_type: 1)
- [ ] Created new build with `eas build --platform android --profile production`
- [ ] Uploaded new build to Internal Testing track









