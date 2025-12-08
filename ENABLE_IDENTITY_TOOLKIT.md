# Enable Identity Toolkit API for Your Project

Your API key 4 already has the right API restrictions (Identity Toolkit API, Firebase Installations API, Firebase Remote Config API). The issue is likely that **Identity Toolkit API needs to be enabled at the project level**.

## Step 1: Enable Identity Toolkit API

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Make sure you're in project: **meepleup-951a1**

2. **Navigate to API Library**
   - Go to **APIs & Services** → **Library**

3. **Search for Identity Toolkit API**
   - In the search bar, type: **"Identity Toolkit API"**
   - Click on the result

4. **Enable the API**
   - If it shows **"ENABLE"** button, click it
   - If it shows **"MANAGE"** or is already enabled, that's good
   - Wait a few seconds for it to enable

## Step 2: Verify Your API Key is Working

Since your API key 4 already has Identity Toolkit API in its restrictions, it should work once the API is enabled at the project level.

1. **Restart your development server**:
   ```bash
   expo start --clear
   ```

2. **Test authentication**:
   - Try to sign in or create an account
   - The "API key expired" error should be gone!

## Step 3: If Still Not Working

If you're still getting errors after enabling Identity Toolkit API:

1. **Check API Key Status**
   - Go to **APIs & Services** → **Credentials**
   - Click on "API key 4" (ending in `qmkp88`)
   - Verify it's not expired or deleted
   - Check if there are any warnings

2. **Try the Browser Key Instead**
   - The "Browser key (auto created by Firebase)" with 24 APIs might be more reliable
   - It has broader access and is specifically created for web apps
   - Update your `.env` file with that key instead

3. **Check Application Restrictions**
   - In the API key details, check **Application restrictions**
   - If it's set to "HTTP referrers", make sure your domain/localhost is allowed
   - For development, you might want to set it to "None"

## Why This Should Work

Your API key 4 has:
- ✅ Identity Toolkit API (required for Firebase Auth)
- ✅ Firebase Installations API (Firebase SDK needs this)
- ✅ Firebase Remote Config API (if you use Remote Config)

This is exactly what you need! The only missing piece was likely the project-level API enablement.

## Quick Checklist

- [ ] Identity Toolkit API is enabled at project level (APIs & Services → Library)
- [ ] API key 4 has Identity Toolkit API in its restrictions (already done ✅)
- [ ] Development server has been restarted
- [ ] Test authentication - should work now!

