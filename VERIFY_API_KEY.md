# Verify and Fix API Key in Google Cloud Console

Your `.env` file is already correctly configured with the new web app values. However, if you're still getting the "API key expired" error, the issue is likely in **Google Cloud Console** where the API key itself needs to be checked/enabled.

## Step 1: Check API Key Status in Google Cloud Console

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Make sure you're in project: **meepleup-951a1**

2. **Navigate to API Credentials**
   - Go to **APIs & Services** → **Credentials**
   - Find your API key (it will start with `AIzaSy...`)
   - You can search for it or look for "Browser key" or "API key"

3. **Check the Key Status**
   - Click on the API key to open its details
   - Check if it shows any warnings or restrictions

## Step 2: Enable Identity Toolkit API

The API key needs to have access to the Identity Toolkit API:

1. **Go to APIs & Services → Library**
   - Search for "Identity Toolkit API"
   - Click on it
   - Make sure it's **Enabled** (if not, click **Enable**)

2. **Check API Key Restrictions**
   - Go back to **APIs & Services → Credentials**
   - Click on your API key (the one from your Firebase web app config)
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

## Step 3: Verify HTTP Referrer Restrictions (if any)

1. Still in the API key details page
2. Check **Application restrictions**
   - If it's set to "HTTP referrers", make sure your domain is allowed
   - For development, you might want to set it to "None" temporarily
   - For production, add your actual domain

## Step 4: Restart Your Development Server

After making changes in Google Cloud Console:

1. **Stop your current server** (Ctrl+C or Cmd+C)
2. **Clear cache and restart**:
   ```bash
   expo start --clear
   ```
   or
   ```bash
   npm start
   ```

## Step 5: Test Again

1. Try to sign in or create an account
2. Check the console for the error - it should be gone now

## If Still Not Working

If you're still getting the error after the above steps:

1. **Create a completely new API key**:
   - In Google Cloud Console → **APIs & Services → Credentials**
   - Click **+ CREATE CREDENTIALS** → **API key**
   - Copy the new API key
   - Update your `.env` file with the new key
   - **Important**: You'll also need to update the web app in Firebase Console to use this new key, OR create a new web app that uses this key

2. **Alternative: Check if the key was deleted**
   - If you deleted the old web app, its API key might have been deleted too
   - You may need to create a new web app in Firebase Console to get a fresh API key

## Quick Checklist

- [ ] Identity Toolkit API is enabled in Google Cloud Console
- [ ] API key has access to Identity Toolkit API (either unrestricted or explicitly allowed)
- [ ] API key is not expired or deleted
- [ ] Development server has been restarted after any changes
- [ ] `.env` file has the correct API key value

