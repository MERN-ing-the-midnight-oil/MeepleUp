# Firebase Game Database Setup

## Overview

The game database (170,854 games, 64MB) is now hosted in Firebase Firestore instead of being bundled with the app. This prevents app crashes and allows for better scalability.

## Architecture

**Search Priority:**
1. Firebase Firestore (primary)
2. BGG API (fallback)

## Setup Steps

### Option 1: Use the Upload Script (Recommended)

The easiest way to upload the game database is using the provided Node.js script:

1. **Get your Firebase Service Account Key:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project: **meepleup-951a1**
   - Go to **Project Settings** → **Service Accounts** tab
   - Click **"Generate New Private Key"**
   - Save the downloaded JSON file as `firebase-service-account.json` in the project root directory

2. **Run the upload script:**
   ```bash
   node scripts/upload-games-to-firestore.js
   ```

3. **Wait for upload to complete:**
   - The script will process all 170,854 games in batches of 500
   - This may take 10-20 minutes depending on your connection
   - Progress will be shown in the console

**Note:** The Firebase Console does not have a direct CSV import feature. You must use a script or Cloud Function to upload the data.

### Option 2: Use Cloud Functions (For Production)

Create a Cloud Function to handle the upload:

```javascript
// functions/index.js
const admin = require('firebase-admin');
admin.initializeApp();

exports.uploadGames = functions.https.onRequest(async (req, res) => {
  // Read CSV and upload to Firestore in batches
  // This handles the 64MB file efficiently
});
```

### Option 3: Client-Side Upload Script (For Development)

1. Create a temporary admin page in your app
2. Use the CSV file to upload games in batches
3. Remove the page after upload

## Firestore Collection Structure

**Collection:** `games`

**Document Structure:**
```javascript
{
  id: "233015",                    // BGG ID (used as document ID)
  name: "Imperius",                // Game name
  nameLower: "imperius",           // Lowercase for case-insensitive search
  yearPublished: "2018",
  rank: "6850",
  average: "6.53938",
  bayesAverage: "5.66709",
  usersRated: "471",
  abstractsRank: "",
  cgsRank: "",
  childrensGamesRank: "",
  familyGamesRank: "",
  partyGamesRank: "",
  strategyGamesRank: "",
  thematicRank: "",
  wargamesRank: ""
}
```

## Firestore Indexes Required

Create a composite index for case-insensitive search:

**Collection:** `games`
**Fields:**
- `nameLower` (Ascending)
- `rank` (Ascending)

To create:
1. Go to Firestore → Indexes
2. Click "Create Index"
3. Add the fields above

## Current Status

✅ Code updated to use Firestore (with fallbacks)
⏳ Data upload needed
⏳ Firestore indexes need to be created

## Testing

Once data is uploaded:

1. Search for "Imperius" - should find it in Firestore
2. If Firestore is empty, it will fall back to BGG API
3. Check console logs to see which source is being used

## Next Steps

1. **Get your Firebase Service Account Key** (see Option 1 above)
2. **Run the upload script:** `node scripts/upload-games-to-firestore.js`
3. **Create Firestore indexes** for efficient searching (see below)
4. **Test searches** to ensure everything works
5. **Remove the large JSON file** from the app bundle (optional, but recommended)

## Local Database Removed

The local database (bggLocalDB.js) has been removed from the codebase. The app now uses:
- **Firestore** (primary) → **BGG API** (fallback)

The JSON file `src/assets/data/boardgames_ranks.json` can be kept for the upload script, but it's no longer bundled with the app.

