# Quick Fix: Expired Firebase API Key

## Current Issue
Your Firebase API key has expired. The error you're seeing:
```
API key expired. Please renew the API key.
```

## Quick Solution (5 minutes)

### Step 1: Get New API Key from Firebase Console

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com/
   - Select project: **meepleup-951a1**

2. **Get Your Web App Configuration**
   - Click the **gear icon** (⚙️) next to "Project Overview"
   - Click **Project settings**
   - Scroll down to **Your apps** section
   - Find your **Web app** (or click `</>` to add a new one if needed)
   - You'll see the `firebaseConfig` object with all values

3. **Copy the New API Key**
   - Look for `apiKey: "AIzaSy..."` in the config
   - Copy the entire API key value

### Step 2: Update Your .env File

1. **Open `.env` file** in your project root
2. **Replace the API key**:
   ```env
   EXPO_PUBLIC_FIREBASE_API_KEY=your_new_api_key_from_firebase_console
   ```
3. **Also check/update the App ID** if it changed:
   ```env
   EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id_from_firebase_console
   ```
4. **Save the file**

### Step 3: Restart Your Development Server

**IMPORTANT**: Environment variables only load when the server starts!

1. **Stop your current server** (Ctrl+C or Cmd+C)
2. **Start it again**:
   ```bash
   npm start
   ```
   or
   ```bash
   expo start --clear
   ```

### Step 4: Verify It Works

1. Check the console output - you should see:
   ```
   🔍 Environment Variable Check:
     EXPO_PUBLIC_FIREBASE_API_KEY: AIzaSy... ✅
   ✅ Firebase API Key loaded: AIzaSy...
   ```

2. Try to sign in or create an account - the error should be gone!

## If You Need to Create a New Web App

If you can't find your web app or the API key is still expired:

1. In **Project settings** → **Your apps** section
2. Click the **Web** icon (`</>`) to add a new web app
3. Register it (name it "MeepleUp Web" or similar)
4. Copy the **entire** `firebaseConfig` object
5. Update your `.env` file with:
   - `EXPO_PUBLIC_FIREBASE_API_KEY` (new key)
   - `EXPO_PUBLIC_FIREBASE_APP_ID` (new app ID)
   - Keep other values the same (authDomain, projectId, etc.)

## Troubleshooting

### Still Getting Errors?

1. **Double-check the API key** - Make sure you copied it correctly (no extra spaces)
2. **Verify .env file location** - Must be in project root (same level as `package.json`)
3. **Restart the server** - Environment variables only load on startup
4. **Clear cache**: `expo start --clear`
5. **Check Google Cloud Console**:
   - Go to https://console.cloud.google.com/
   - Select project: **meepleup-951a1**
   - Go to **APIs & Services** → **Credentials**
   - Find your API key and make sure:
     - It's not expired
     - "Identity Toolkit API" is enabled in API restrictions

## Need Help?

If you're still having issues:
1. Check the console for the exact error message
2. Verify your `.env` file has the correct format (no quotes around values)
3. Make sure you restarted the server after updating `.env`

