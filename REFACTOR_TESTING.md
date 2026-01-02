# Reference-Based Refactor Testing Guide

This document describes how to test the reference-based game collection refactor.

## Overview

The refactor changes how game data is stored:
- **Before**: Full game data duplicated in each user's `userGames/{userId}/games` collection
- **After**: Only references (bggId + user-specific data) in `userGames`, full game data in main `games` collection

## Test Scripts

### 1. Quick Test (Recommended First)

Run the quick test to verify basic functionality without creating test data:

```bash
node scripts/test-reference-refactor-quick.js
```

**What it tests:**
- `batchGetGamesById` function works
- userGames collection structure
- Data separation between collections
- Detects old vs new format

**When to use:**
- Quick validation after deployment
- Checking existing data structure
- No test data needed

### 2. Comprehensive Test

Run the full test suite with detailed validation:

```bash
node scripts/test-reference-refactor.js
```

**What it tests:**
- ✅ Batch fetching games from main collection
- ✅ Storing reference-only format (new format)
- ✅ Enriching references with full game data
- ✅ Backward compatibility with old format
- ✅ Reference detection logic
- ✅ Updating user-specific fields
- ✅ Data separation verification
- ✅ Batch enrichment of multiple references
- ✅ No data duplication verification

**When to use:**
- Full validation before/after refactor
- Regression testing
- Validating migration logic

## Test Results

### Success Indicators

✅ **All tests pass** - Refactor is working correctly

⚠️ **Warnings** - Some expected scenarios (e.g., empty collections) - OK

❌ **Failures** - Issues that need to be addressed

### Expected Output

#### Quick Test
```
🧪 === QUICK REFACTOR TEST ===

🧪 Test 1: Testing batchGetGamesById...
✅ Found 3/3 games in main collection
ℹ️ Sample game: Gloomhaven

🧪 Test 2: Checking userGames collection structure...
✅ Found 15 references (new format) and 5 full data (old format)
ℹ️ Backward compatibility working: old format data detected

🧪 Test 3: Verifying data separation...
✅ Main games collection: has data
✅ userGames collection: has data
✅ Both collections exist - data separation structure is in place

✅ === QUICK TEST COMPLETE ===
```

#### Comprehensive Test
```
🧪 === REFERENCE-BASED REFACTOR TESTS ===

✅ PASSED: Setup: Ensure test games exist in main games collection
✅ PASSED: Test batchGetGamesById: Fetch multiple games
✅ PASSED: Test: Store game reference (new format) in userGames collection
✅ PASSED: Test: Enrich reference with full game data from main collection
✅ PASSED: Test: Backward compatibility with old format (full data)
✅ PASSED: Test: isReferenceOnly detection logic
✅ PASSED: Test: Update user-specific fields in reference
✅ PASSED: Test: Verify data separation between main collection and userGames
✅ PASSED: Test: Batch enrich multiple references
✅ PASSED: Test: Verify no data duplication

✅ === TEST SUMMARY ===
✅ Passed: 10
✅ Failed: 0
```

## Manual Testing Checklist

After running automated tests, verify these scenarios manually:

### 1. Adding New Games
- [ ] Import games via BGG Import
- [ ] Verify games appear in collection
- [ ] Check Firestore: `userGames/{userId}/games` should have references only
- [ ] Check Firestore: `games/{bggId}` should have full game data

### 2. Viewing Collections
- [ ] Collection screen loads games correctly
- [ ] Game details show full information
- [ ] Images/thumbnails display correctly
- [ ] User ratings/favorites display correctly

### 3. Gameplan Screen
- [ ] Aggregated games from multiple users display correctly
- [ ] Match scores calculate correctly
- [ ] No BGG API calls for existing games

### 4. Updating User Data
- [ ] Change favorite status - updates correctly
- [ ] Change user rating - updates correctly
- [ ] Change play count - updates correctly
- [ ] Updates only affect userGames collection, not main games collection

### 5. Backward Compatibility
- [ ] Existing games (old format) still display correctly
- [ ] No errors when loading old format games
- [ ] Old format games can be updated normally

## Troubleshooting

### Issue: Tests fail with "Game not found in main collection"

**Solution**: Ensure test games exist in main `games` collection. The comprehensive test will create them automatically.

### Issue: "Reference document contains full game data"

**Solution**: Check that `addGameToCollection` is storing reference-only format. Verify the code changes are deployed.

### Issue: "No games found" warnings

**Solution**: This is OK if no users have added games yet. The test will still validate the structure.

### Issue: Batch fetch returns fewer games than expected

**Solution**: Some games might not exist in main collection yet. This is expected if games haven't been imported/cached yet.

## Data Structure Verification

### Reference Format (New)
```javascript
// userGames/{userId}/games/{gameId}
{
  bggId: "174430",
  userRating: 9,
  numplays: 10,
  isFavorite: true,
  source: "bgg_import",
  addedAt: Timestamp,
  updatedAt: Timestamp
}
```

### Old Format (Backward Compatible)
```javascript
// userGames/{userId}/games/{gameId}
{
  id: "bgg_174430",
  bggId: "174430",
  title: "Gloomhaven",
  image: "https://...",
  thumbnail: "https://...",
  description: "...",
  // ... full game data ...
  userRating: 9,
  numplays: 10,
  isFavorite: true,
  // ... user-specific data ...
}
```

### Main Collection (Full Data)
```javascript
// games/{bggId}
{
  id: "174430",
  name: "Gloomhaven",
  nameLower: "gloomhaven",
  yearPublished: "2017",
  rank: "1",
  average: "8.8",
  thumbnail: "https://...",
  image: "https://...",
  description: "...",
  mechanics: [...],
  categories: [...],
  // ... all BGG data ...
}
```

## Next Steps

1. Run quick test to verify current state
2. Run comprehensive test for full validation
3. Perform manual testing checklist
4. Monitor logs for any errors in production
5. Gradually migrate old format data to new format (optional)

