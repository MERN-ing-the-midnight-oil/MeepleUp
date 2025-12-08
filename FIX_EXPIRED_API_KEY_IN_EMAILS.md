# Fixing Expired API Key in Email Verification Links

## Problem
Email verification links contain an expired API key, causing errors when clicked:
```
API key expired. Please renew the API key.
```

The link structure is correct, but the embedded API key has expired.

## Root Cause
Firebase embeds the API key from your **project settings** into email verification links. Even if you update your `.env` file, Firebase will continue using the old key in emails until you update the project settings.

## Solution: Update API Key in Firebase Project

### Option 1: Check API Key Status in Google Cloud Console (Recommended)

1. **Go to Google Cloud Console**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Select your project: **meepleup-951a1**

2. **Navigate to API Credentials**
   - Go to **APIs & Services** → **Credentials**
   - Find your API key (look for "Browser key" or search for API keys in the credentials list)
   - Check its status:
     - If it shows "Expired" or "Restricted", you need to fix it
     - If it's deleted, you need to create a new one

3. **Fix the API Key**
   - **If expired**: Click on the key → Check "API restrictions" → Make sure "Identity Toolkit API" is enabled
   - **If deleted**: You'll need to create a new web app in Firebase (see Option 2)

### Option 2: Create a New Web App in Firebase (If API Key Was Deleted) ⭐ RECOMMENDED

**Why you need a new web app:**
- When you register a web app in Firebase, it creates a **specific API key** tied to that app
- If you delete that API key in Google Cloud Console, the web app still references it
- Creating a new API key in Google Cloud Console doesn't automatically update the web app
- **You need a new web app registration to get a new API key that's properly linked**

**Yes, you'll get a new App ID**, but that's fine - you can have multiple web apps in the same Firebase project.

1. **Go to Firebase Console**
   - Visit [Firebase Console](https://console.firebase.google.com/)
   - Select project: **meepleup-951a1**

2. **Add a New Web App**
   - Click ⚙️ → **Project settings**
   - Scroll to **Your apps** section
   - Click the **Web** icon (`</>`) to add a new web app
   - Register it (you can name it "MeepleUp Web 2" or similar)
   - **Copy the ENTIRE `firebaseConfig` object** - you'll need ALL values:
     ```javascript
     {
       apiKey: "AIzaSy...",           // NEW API KEY
       authDomain: "meepleup-951a1.firebaseapp.com",  // Same
       projectId: "meepleup-951a1",  // Same
       storageBucket: "meepleup-951a1.appspot.com",  // Same
       messagingSenderId: "177622732549",  // Same
       appId: "1:177622732549:web:NEW_ID_HERE"  // NEW APP ID
     }
     ```

3. **Update Your .env File**
   - Update `EXPO_PUBLIC_FIREBASE_API_KEY` with the **new API key** from step 2
   - Update `EXPO_PUBLIC_FIREBASE_APP_ID` with the **new app ID** from step 2
   - Keep other values the same (authDomain, projectId, storageBucket, messagingSenderId)

4. **Restart Your Server**
   ```bash
   # Stop server (Ctrl+C)
   expo start --clear
   ```

5. **Test with New Verification Email**
   - Create a new test account or resend verification email
   - The new email will have the new API key in the link
   - **Old verification emails will still have the expired key** - ignore those

### Option 3: Enable/Re-enable Identity Toolkit API

Sometimes the API key expires because the API isn't enabled:

1. **Go to Google Cloud Console**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Select project: **meepleup-951a1**

2. **Enable Identity Toolkit API**
   - Go to **APIs & Services** → **Library**
   - Search for "Identity Toolkit API"
   - Click on it and make sure it's **Enabled**
   - If it's not enabled, click **Enable**

3. **Check API Key Restrictions**
   - Go to **APIs & Services** → **Credentials**
   - Find your API key
   - Click on it
   - Under "API restrictions", make sure:
     - Either "Don't restrict key" is selected, OR
     - "Restrict key" is selected AND "Identity Toolkit API" is in the list

## Verify the Fix

After updating:

1. **Create a new test account** (or use an existing unverified one)
2. **Request a new verification email**
3. **Check the verification link** - it should have a different API key
4. **Click the link** - it should work without the expired key error

## Important Notes

- **Old verification emails will still have the expired key** - you need to request NEW verification emails after fixing the API key
- **The API key in your `.env` file** should match the one in Firebase project settings
- **Both must be valid** for everything to work correctly

## Quick Check: Is Your Current API Key Valid?

1. Check your `.env` file - what's the value of `EXPO_PUBLIC_FIREBASE_API_KEY`?
2. Compare it to the API key in the verification link (extract it from the URL)
3. If they're different, Firebase is using an old key from project settings
4. If they're the same, the key itself needs to be renewed in Google Cloud Console

