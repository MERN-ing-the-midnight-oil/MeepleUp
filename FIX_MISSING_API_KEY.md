# Fix: API Key Not Showing in Google Cloud Console

## Problem
You created a new web app in Firebase Console and got an API key (`AIzaSyCRFcOxaLQGYPlXCC9kij_BETlpTLkYimk`), but this key doesn't appear in Google Cloud Console. You only see an old API key (`AIzaSyC5YC920Ga3Ds14tXMmNGVw-5i3So9LIAM`).

## Solution: Use the Existing API Key

Since the new API key from Firebase Console isn't showing up in Google Cloud Console, we'll use the existing one you can see.

### Step 1: Update Your .env File

Change your `.env` file to use the existing API key:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyC5YC920Ga3Ds14tXMmNGVw-5i3So9LIAM
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=meepleup-951a1.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=meepleup-951a1
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=meepleup-951a1.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=177622732549
EXPO_PUBLIC_FIREBASE_APP_ID=1:177622732549:web:734792a7d3d5b0a942716c
```

**Note**: Keep the new App ID (`1:177622732549:web:734792a7d3d5b0a942716c`) from your new web app, but use the existing API key.

### Step 2: Enable Identity Toolkit API

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select project: **meepleup-951a1**

2. **Enable Identity Toolkit API**
   - Go to **APIs & Services** → **Library**
   - Search for "Identity Toolkit API"
   - Click on it
   - Make sure it's **Enabled** (if not, click **Enable**)

### Step 3: Configure the API Key

1. **Go to APIs & Services → Credentials**
2. **Click on the API key**: `AIzaSyC5YC920Ga3Ds14tXMmNGVw-5i3So9LIAM`
3. **Check API restrictions**:
   - Under **API restrictions**, you have two options:
     
     **Option A: Don't restrict key** (Easiest for development)
     - Select "Don't restrict key"
     - Click **Save**
     
     **Option B: Restrict key** (More secure)
     - Select "Restrict key"
     - Under "API restrictions", select "Restrict key"
     - Make sure **Identity Toolkit API** is in the list of allowed APIs
     - If it's not, click "Select APIs" and add "Identity Toolkit API"
     - Click **Save**

### Step 4: Restart Your Development Server

After updating the `.env` file:

1. **Stop your current server** (Ctrl+C or Cmd+C)
2. **Clear cache and restart**:
   ```bash
   expo start --clear
   ```

### Step 5: Test

1. Try to sign in or create an account
2. The "API key expired" error should be gone!

## Alternative: Create a New API Key Manually

If you prefer to create a fresh API key:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select project: **meepleup-951a1**

2. **Create New API Key**
   - Go to **APIs & Services** → **Credentials**
   - Click **+ CREATE CREDENTIALS** → **API key**
   - Copy the new API key

3. **Configure the New Key**
   - Click on the new API key to edit it
   - Under **API restrictions**:
     - Either "Don't restrict key" (for development)
     - OR "Restrict key" and add "Identity Toolkit API"
   - Click **Save**

4. **Update Your .env File**
   - Replace `EXPO_PUBLIC_FIREBASE_API_KEY` with the new key

5. **Restart Your Server**
   ```bash
   expo start --clear
   ```

## Why This Happens

Sometimes when you create a new web app in Firebase Console, the API key it references might:
- Not be created yet in Google Cloud Console
- Be a shared key that's managed differently
- Take time to propagate

Using an existing API key from Google Cloud Console is perfectly fine - as long as it has access to the Identity Toolkit API, it will work with your Firebase project.

## Important Notes

- **The App ID stays the same**: Keep using `1:177622732549:web:734792a7d3d5b0a942716c` from your new web app
- **API keys are project-wide**: Any valid API key from your Google Cloud project will work with any web app in that Firebase project
- **Identity Toolkit API must be enabled**: This is the key requirement for authentication to work

