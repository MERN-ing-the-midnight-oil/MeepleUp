# BGG API Search Behavior Analysis

## Problem Summary

You're seeing false "BGG says that [game] does not exist in their database" messages for games that actually exist in BGG. This document explains when the code "gives up" vs "keeps trying" and how it handles different BGG API responses.

## When Does the Code "Give Up" vs "Keep Trying"?

### Keep Trying (Retries):
1. **Rate-limited errors (HTTP 429)**: 
   - Retries up to **20 times** in `gameSearch.js` (line 77)
   - Retries up to **30 times** in `api.js` (line 418)
   - Uses exponential backoff: 10s, 20s, 40s, 80s, 160s... (capped at 80s)
   - Will keep retrying until successful response OR max retries exhausted

2. **Network/authentication errors**:
   - Retries up to **3 times** for non-rate-limit errors (line 411 in `gameSearch.js`)
   - Falls back through authentication methods: Bearer token → query param token → no auth

3. **Title cleaning fallback**:
   - If cleaned title returns no results, tries original title once (lines 167-172 in `gameSearch.js`)

### Give Up (Stops Trying):
1. **Successful API call with empty results**:
   - If HTTP status is 200 (successful) and XML parsing returns empty array
   - **IMMEDIATELY** treats as "game doesn't exist" 
   - Shows alert: `"BGG says "[game]" doesn't exist in their database"`
   - Location: `gameSearch.js` lines 190-198

2. **10-second timeout**:
   - If a single game search takes > 10 seconds, auto-skips to retry bucket (line 100 in `gameSearch.js`)

3. **Non-rate-limit errors after 3 retries**:
   - Saves to pending retries for later

## What Responses Does the Code Handle?

The code responds to these BGG API scenarios:

### 1. HTTP 200 Success with Results
- XML contains `<item>` tags
- Parsed into array of game objects
- Returns results array (not empty)

### 2. HTTP 200 Success with Empty Results
- XML response is valid but contains **no `<item>` tags**
- `parseBGGSearchXML()` returns empty array `[]`
- **Problem**: Code assumes this means "game definitely doesn't exist"
- **Reality**: Could mean:
  - Search query didn't match (title variation, spelling, punctuation)
  - Game exists but search is too specific
  - BGG search is fuzzy and might miss some variations

### 3. HTTP 429 Rate Limited
- Retries with exponential backoff
- Throws error after max retries so caller can continue retrying

### 4. HTTP 401/403 Authentication Errors
- Tries multiple authentication methods:
  1. Bearer token in Authorization header
  2. Token as query parameter
  3. No authentication
- Falls back gracefully

### 5. Other HTTP Errors (4xx, 5xx)
- After retries exhausted, returns empty array
- Logs warning but doesn't throw

## Does BGG API Distinguish "Doesn't Exist" vs "Can't Find"?

**NO** - The BGG API does **NOT** distinguish between these scenarios:

- ✅ **"Game definitely doesn't exist"** → Returns HTTP 200 with empty XML (no `<item>` tags)
- ⚠️ **"Search didn't find it"** (exists but query didn't match) → Returns HTTP 200 with empty XML (no `<item>` tags)

**Both scenarios return the same response structure:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<items total="0" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
</items>
```

The BGG API search is fuzzy/substring-based, but it can still miss games due to:
- Spelling variations
- Punctuation differences
- Title formatting
- Word order differences
- Special characters

## The Root Cause

The issue occurs in `gameSearch.js` lines 190-198:

```javascript
if (!searchResults || searchResults.length === 0) {
  performanceStats.gamesNotFound++;
  console.warn(`${logPrefix} ⚠️ No search results returned for "${gameTitle}" - BGG says this game doesn't exist (successful API call with no results after retries)`);
  // Alert user that BGG says this title doesn't exist
  Alert.alert(
    'Game Not Found',
    `BGG says "${gameTitle}" doesn't exist in their database.`,
    [{ text: 'OK' }]
  );
}
```

**Problem**: This triggers immediately after a successful API call (HTTP 200) that returns empty results. The code assumes empty results = game doesn't exist, but it could just mean the search query didn't match.

## Current Flow

1. Clean title (remove parenthetical text)
2. Search with cleaned title
3. If no results, try original title (once)
4. If still no results → **Immediately show "doesn't exist" alert**

**Missing**: No attempt to:
- Try partial matches (remove words one at a time)
- Try different search strategies
- Suggest "game might exist but search didn't find it"

## Recommendations

1. **Change the alert message** to be less definitive:
   - Instead of: "BGG says [game] doesn't exist"
   - Use: "BGG search didn't find [game]. It may still exist with a different title."

2. **Add retry strategies**:
   - Try removing articles (The, A, An)
   - Try splitting on common separators (:, -, /)
   - Try searching with fewer words
   - Try searching with just the first word or first two words

3. **Don't show alert immediately**:
   - Instead, add to "pending retries" with a note
   - Let user manually search or try different spelling

4. **Log the exact query used**:
   - Help debug which queries are failing
   - Track false negatives

## Key Code Locations

- Alert shown: `src/utils/gameSearch.js:194-198`
- Empty results check: `src/utils/gameSearch.js:190`
- Retry logic: `src/utils/gameSearch.js:83-458`
- BGG API search: `src/services/bggApi.js:111-212`
- XML parsing: `src/services/bggApi.js:220-261`
- Search wrapper: `src/utils/api.js:359-561`

