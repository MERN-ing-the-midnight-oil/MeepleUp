# BGG API Architecture & Caching Strategy

## Overview
This document describes how the app manages BGG API calls and builds a partial copy of the BGG database in Firestore to minimize API usage.

## Architecture Principles

1. **Firestore First**: Always check Firestore before making BGG API calls
2. **Progressive Caching**: Cache search results immediately, then fetch full details when needed
3. **Minimize API Calls**: Never make duplicate BGG API calls for the same game
4. **Non-blocking Caching**: Cache operations don't block the UI

## Data Flow

### Search Flow (`searchGamesByName`)
```
User searches for game
  ↓
Check Firestore (gameDatabase.searchGamesByName)
  ↓
If found → Return results
If not found → Call BGG API (if fallbackToBGG=true)
  ↓
Cache search results to Firestore (non-blocking)
  ↓
Return results to user
```

### Game Details Flow (`getGameDetails`)
```
User requests game details by ID
  ↓
Check Firestore (gameDatabase.getGameById)
  ↓
If found:
  - Has thumbnail/image? → Return immediately
  - Missing thumbnail/image? → Fetch from BGG API, cache, return
If not found:
  - Fetch from BGG API
  - Cache full details to Firestore
  - Return to user
```

## Key Functions

### `searchGamesByName(query, fallbackToBGG)`
- **Location**: `src/utils/api.js`
- **Behavior**:
  - Checks Firestore first
  - If no results and `fallbackToBGG=true`, calls BGG API
  - **NEW**: Automatically caches BGG API search results to Firestore
- **Returns**: Array of game objects with `id`, `name`, `yearPublished`

### `getGameDetails(gameId)`
- **Location**: `src/utils/api.js`
- **Behavior**:
  - Checks Firestore first
  - If game exists but missing thumbnail/image, fetches from BGG API
  - If game doesn't exist, fetches full details from BGG API
  - **Always caches** BGG API data to Firestore
- **Returns**: Full game object with all details

### `cacheBGGSearchResults(searchResults)`
- **Location**: `src/services/gameDatabase.js`
- **Behavior**:
  - **Fetches FULL DETAILS** from BGG API for ALL search results
  - Caches complete game information including:
    - Thumbnails and full images
    - Descriptions
    - Star ratings (average, bayesAverage)
    - Publication dates
    - Player counts, playing time, age
    - Category ranks
    - All other fields the app uses
  - Processes in batches of 3 with 1-second delays to respect BGG API rate limits
  - Skips games that already have full details cached
- **Purpose**: Ensures ALL game data is cached so NO additional BGG API calls are needed in the future

### `updateGameWithBGGData(gameId, bggData)`
- **Location**: `src/services/gameDatabase.js`
- **Behavior**:
  - Creates new game document if it doesn't exist
  - Updates existing document with missing fields
  - Marks document with `bggDataCached: true` and timestamp
- **Purpose**: Caches full game details from BGG API

## Improvements Made

### 1. Search Results Caching
**Before**: BGG API search results were not cached, causing repeated API calls for the same games.

**After**: `searchGamesByName` now automatically caches search results to Firestore using `cacheBGGSearchResults()`. This means:
- First search for "Catan" → BGG API call + cache
- Second search for "Catan" → Found in Firestore, no API call

### 2. Unified Search Flow
**Before**: `ClaudeGameIdentifier` called `searchGamesByName` with `fallbackToBGG=false`, then manually called BGG API, bypassing caching.

**After**: `ClaudeGameIdentifier` now uses `searchGamesByName(query, true)`, which:
- Checks Firestore first
- Falls back to BGG API if needed
- Automatically caches results
- All in one unified flow

### 3. Consistent Detail Fetching
**Before**: Some code paths called `fetchBGGGameDetails` directly, bypassing Firestore cache.

**After**: All code paths now use `getGameDetails`, which:
- Checks Firestore first
- Only calls BGG API if needed
- Always caches results
- Ensures no duplicate API calls

## Caching Strategy

### Search Results (FULL DETAILS)
- **Cached Fields**: **EVERYTHING** - thumbnails, images, descriptions, ratings, publication dates, player counts, playing time, age, category ranks, and all other fields
- **When**: Immediately after BGG API search - fetches full details for all results
- **Purpose**: Complete game information cached so no additional BGG API calls are ever needed

### Full Game Details
- **Cached Fields**: All fields including thumbnails, images, ratings, descriptions, etc.
- **When**: When `getGameDetails` is called and game is fetched from BGG API
- **Purpose**: Complete game information available for future use

### Cache Updates
- **Ratings/Ranks**: Updated when available (they change over time)
- **Missing Fields**: Filled in when BGG API provides them
- **Never Overwrites**: Only updates missing/null fields

## Best Practices

1. **Always use `getGameDetails`** instead of `fetchBGGGameDetails` directly
2. **Use `searchGamesByName(query, true)`** to enable BGG fallback and caching
3. **Don't bypass the caching layer** - it's designed to minimize API calls
4. **Trust the cache** - if a game is in Firestore, use it

## Monitoring

To verify the caching is working:
1. Check Firestore console for `games` collection
2. Look for `bggDataCached: true` and `searchResultCached: true` fields
3. Monitor BGG API call frequency (should decrease over time)
4. Check console logs for `[Game Database]` and `[Game Search]` messages

## Future Improvements

1. **Batch Detail Fetching**: When multiple games need details, batch the Firestore checks
2. **Cache Warming**: Pre-populate Firestore with popular games
3. **Cache Invalidation**: Strategy for refreshing stale data (ratings change over time)
4. **Analytics**: Track cache hit rates and API call reduction

