# Fixing Expired Firebase API Key

## Problem
Your Firebase API key has expired, causing authentication errors:
```
API key expired. Please renew the API key.
```

## Solution: Get a New API Key

### Step 1: Get Your Firebase Config from Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **meepleup-951a1**
3. Click the **gear icon** (⚙️) next to "Project Overview" → **Project settings**
4. Scroll down to **Your apps** section
5. Find your **Web app** (or click the **Web** icon `</>` if you need to add one)
6. You'll see your `firebaseConfig` object with all the values you need

### Step 2: Update Your Environment Variables

You need to create or update a `.env` file in your project root with the new API key.

1. **Create or edit `.env` file** in the project root (`/Users/rhyssmoker/bootcamp/MeepleUp/.env`)

2. **Add your Firebase configuration** (use the values from Step 1):

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your_new_api_key_here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=meepleup-951a1.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=meepleup-951a1
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=meepleup-951a1.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=177622732549
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id_here
```

**Important**: 
- Replace `your_new_api_key_here` with the actual `apiKey` from Firebase Console
- Replace `your_app_id_here` with the actual `appId` from Firebase Console
- Keep all other values as shown (or use your actual values from Firebase Console)

### Step 3: Restart Your Development Server

After updating the `.env` file, you **must restart** your development server:

1. **Stop your current server** (Ctrl+C or Cmd+C)
2. **Start it again**:
   ```bash
   npm start
   ```
   or
   ```bash
   expo start
   ```

**Note**: Environment variables are only loaded when the server starts, so a restart is required!

### Step 4: Verify It Works

1. Try to sign up or log in
2. The error should be gone
3. Authentication should work normally

## Alternative: If You Can't Find Your Web App

If you don't see a Web app in Firebase Console:

1. In **Project settings** → **Your apps** section
2. Click the **Web** icon (`</>`) to add a new web app
3. Register it with nickname: `MeepleUp Web`
4. Copy the `firebaseConfig` values
5. Use those values in your `.env` file

## Troubleshooting

### Still Getting Errors?

1. **Double-check the API key** - Make sure you copied it correctly (no extra spaces)
2. **Verify the .env file location** - It must be in the project root (same level as `package.json`)
3. **Check variable names** - Use `EXPO_PUBLIC_` prefix for Expo projects
4. **Restart the server** - Environment variables only load on startup
5. **Clear cache** - Try clearing your browser cache or restarting Expo

### Using React (not Expo)?

If you're using React instead of Expo, use `REACT_APP_` prefix:

```env
REACT_APP_FIREBASE_API_KEY=your_new_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=meepleup-951a1.firebaseapp.com
# ... etc
```

Your code already supports both prefixes, so either will work.

## Security Note

- The `.env` file should already be in `.gitignore` (don't commit it to git)
- API keys in client-side code are safe (they're meant to be public)
- Firebase has security rules to protect your data

