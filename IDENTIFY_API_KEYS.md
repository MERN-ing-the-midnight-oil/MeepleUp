# Identifying and Managing Your API Keys

## Your Current API Keys

Based on what you're seeing in Google Cloud Console:

1. **API key 4** — Dec 7, 2025 — 3 APIs
2. **Browser key (auto created by Firebase)** — Dec 7, 2025 — 24 APIs ⭐ **LIKELY THE ONE TO USE**
3. **MeepleUp (auto created by Firebase)** — Dec 4, 2025 — 4 APIs ⚠️ **OLD/COMPROMISED - CAN DELETE**
4. **iOS key (auto created by Firebase)** — iOS specific

## Which Key Should You Use?

The **"Browser key (auto created by Firebase)"** with **24 APIs** is most likely the correct one because:
- It's a "Browser key" (designed for web apps)
- It has 24 APIs enabled (comprehensive access)
- It was created Dec 7, 2025 (recent)
- Firebase auto-created it for web app usage

## Steps to Identify and Use the Right Key

### Step 1: Check Each Key's Details

1. **Go to Google Cloud Console** → **APIs & Services** → **Credentials**
2. **Click on "Browser key (auto created by Firebase)"** (the one with 24 APIs)
3. **Check the API restrictions**:
   - It should have "Identity Toolkit API" in the list
   - If it says "Don't restrict key" or has many APIs, that's fine
4. **Copy the API key value** (starts with `AIzaSy...`)

### Step 2: Test the Browser Key

1. **Update your `.env` file** with the Browser key:
   ```env
   EXPO_PUBLIC_FIREBASE_API_KEY=the_browser_key_value_here
   ```

2. **Restart your server**:
   ```bash
   expo start --clear
   ```

3. **Test authentication** - try to sign in or create an account

4. **If it works**, you've found the right key! ✅

### Step 3: Verify Identity Toolkit API is Enabled

For whichever key you use, make sure:
1. **Go to APIs & Services → Library**
2. **Search "Identity Toolkit API"**
3. **Ensure it's Enabled**

### Step 4: Delete the Old Key (After Testing)

**ONLY AFTER** you've confirmed the new key works:

1. **Go to APIs & Services → Credentials**
2. **Click on "MeepleUp (auto created by Firebase)"** (Dec 4, 2025)
3. **Click the delete/trash icon**
4. **Confirm deletion**

**Why it's safe to delete:**
- It's from Dec 4 (older)
- You have newer keys (Dec 7)
- It was compromised
- You're replacing it with a working key

## About the Other Keys

- **API key 4** (3 APIs): Might be a restricted key you created. Check if it has Identity Toolkit API.
- **iOS key**: Only needed for iOS apps, not for web/Expo web builds.

## Quick Checklist

- [ ] Identify which key is the "Browser key" with 24 APIs
- [ ] Copy that key value
- [ ] Update `.env` file with the Browser key
- [ ] Restart server and test authentication
- [ ] Verify Identity Toolkit API is enabled
- [ ] Delete old "MeepleUp" key (Dec 4) after confirming new one works

## Important Notes

- **Don't delete keys until you've tested the replacement** - you might need to revert
- **The Browser key with 24 APIs** is most likely the one Firebase created for your web app
- **All keys from the same project work** - as long as they have the right API access
- **Identity Toolkit API must be enabled** for authentication to work

