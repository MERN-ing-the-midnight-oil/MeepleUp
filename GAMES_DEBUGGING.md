# Games Not Loading - Debugging Guide

## Current Status

Based on the diagnostic script, here's what we found:

### Users WITH Games in Firestore:
- **Bob** (`bob@email.com`): 104 games ✅
- **Frank** (`frank@email.com`): 7 games ✅

### Users WITHOUT Games in Firestore:
- **Alice** (`alice@email.com`): 0 games ❌
- **Diana** (`diana@email.com`): 0 games ❌
- **Charlie** (`charlie@email.com`): 0 games ❌
- **Eve** (`eve@email.com`): 0 games ❌
- **Rhys Smoker** (`merning.the.midnight.oil@gmail.com`): 0 games ❌

## The Problem

If you're logging in as **Alice, Diana, Charlie, or Eve**, they genuinely don't have games in Firestore. The test data script may not have populated games for all users, or the games were deleted.

## Solutions

### Option 1: Log in as a user WITH games
Try logging in as:
- **Bob** (`bob@email.com`) - has 104 games
- **Frank** (`frank@email.com`) - has 7 games

If games still don't show for these users, there's a different issue (see below).

### Option 2: Re-populate games for test users
Run the test data creation script again:
```bash
node scripts/create-test-data.js
```

This will create new test users and populate them with games. Note: This creates NEW users with timestamps, so you'll need to use the new email addresses shown in the script output.

### Option 3: Clear local storage (if games exist but aren't loading)
If you're logged in as Bob or Frank and games still don't show, local storage might be caching empty collections. 

**To clear local storage:**
1. In your React Native app, you can add a temporary button to clear storage
2. Or uninstall and reinstall the app (this clears all local storage)
3. Or add this to your code temporarily:
   ```javascript
   import storage from './utils/storage';
   storage.removeItem('meepleup_collections');
   ```

### Option 4: Check the logs
With the enhanced logging we added, when you log in you should see:
```
[Collections] Fetching games for user: {userId}
[Collections] Query result: X games found for user {userId}
[Collections] After filtering 'Unknown Game': Y games remaining
[Collections] Set Y games for user {userId}
```

If you see:
- `Query result: 0 games found` → Games don't exist in Firestore for that user
- `Query result: X games found` but `Set 0 games` → Games are being filtered out (check the "Unknown Game" filter)
- No logs at all → The sync isn't running (check if user is authenticated)

## Next Steps

1. **Check which user you're logging in as** - Make sure it's Bob or Frank
2. **Check the console logs** - Look for the `[Collections]` log messages
3. **If needed, re-run the test data script** to populate games for all users
4. **If games exist but don't load**, try clearing local storage or reinstalling the app

## Running the Diagnostic Script

To check the current state of games in Firestore:
```bash
node scripts/check-user-games.js
```

This will show you which users have games and how many.

