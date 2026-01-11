# BGG Game Search Issues - Analysis & Recommendations

## Problem Statement
Real BGG games are not being found consistently during game import/search flow, even though they exist in BGG.

## Root Causes Identified

### 1. **No Query Normalization (HIGH PRIORITY)**
**Location**: `src/services/bggApi.js` - `searchBGGAPI()` function (line 121)

**Issue**: The search query is only trimmed (`query.trim()`), but BGG's XML API search endpoint is sensitive to:
- Special characters (apostrophes, colons, hyphens, ampersands)
- Punctuation (commas, periods, parentheses, brackets)
- Articles ("The", "A", "An" at the beginning)
- Multiple spaces
- Accented characters

**Example Failures**:
- "Catan: Explorers & Pirates" might fail due to colon and ampersand
- "The Settlers of Catan" might fail if "The" causes issues
- "Ticket to Ride: Europe" might fail due to colon

**Current Code**:
```javascript
const encodedQuery = encodeURIComponent(query.trim());
```

### 2. **No Fallback Query Strategies (HIGH PRIORITY)**
**Location**: `src/services/bggApi.js` - `searchBGGAPI()` function

**Issue**: When BGG returns empty results, the code immediately returns `[]` without trying alternative query formats. Many games would be found if we tried:
- Removing punctuation
- Removing articles
- Trying partial queries (first N words)
- Removing special characters

### 3. **BGG XML API Search Limitations**
**Known Limitations**:
- Uses exact word matching (not fuzzy search)
- Minimum character requirements (usually 3+)
- May be sensitive to word order
- Doesn't handle all special characters gracefully
- Limited to 50 results per query (you're using 50, which is good)

### 4. **Empty Results Treated as "Doesn't Exist"**
**Location**: `src/utils/api.js` - `searchGamesByName()` function (lines 473-485)

**Issue**: When BGG returns an empty array, the code immediately returns it without retrying with normalized queries:
```javascript
if (bggResults && bggResults.length > 0) {
  return bggResults;
} else {
  // No results - BGG successfully returned empty array (game doesn't exist)
  // Don't retry - accept it immediately
  return [];
}
```

### 5. **Rate Limiting May Mask Real Failures**
While your rate limiting is comprehensive, temporary API hiccups might be treated as "no results" instead of retriable errors.

## Recommended Solutions

### Solution 1: Add Query Normalization Function
Create a utility function to normalize queries before searching:

```javascript
/**
 * Normalize game search query for BGG API
 * BGG search is sensitive to special characters and formatting
 */
function normalizeBGGQuery(query) {
  if (!query) return '';
  
  let normalized = query.trim();
  
  // Remove leading articles (The, A, An)
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');
  
  // Normalize whitespace (multiple spaces to single)
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Keep the query as-is for first attempt (BGG might handle it)
  // But we'll have fallback variants
  
  return normalized.trim();
}

/**
 * Generate query variants for fallback searches
 */
function generateQueryVariants(query) {
  const variants = [];
  const normalized = normalizeBGGQuery(query);
  
  // Variant 1: Original normalized query
  variants.push(normalized);
  
  // Variant 2: Remove common punctuation (but keep spaces)
  const noPunctuation = normalized.replace(/[.,;:!?()[\]{}'"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noPunctuation !== normalized && noPunctuation.length >= 3) {
    variants.push(noPunctuation);
  }
  
  // Variant 3: Remove special characters (ampersands, etc.)
  const noSpecial = normalized.replace(/[&]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noSpecial !== normalized && noSpecial.length >= 3) {
    variants.push(noSpecial);
  }
  
  // Variant 4: First 3-5 words only (for long titles)
  const words = normalized.split(/\s+/);
  if (words.length > 5) {
    const firstWords = words.slice(0, 5).join(' ');
    if (firstWords !== normalized && firstWords.length >= 3) {
      variants.push(firstWords);
    }
  }
  
  // Remove duplicates and empty strings
  return [...new Set(variants.filter(v => v && v.length >= 3))];
}
```

### Solution 2: Implement Query Variant Fallbacks
Modify `searchBGGAPI` to try query variants if the first attempt returns no results:

```javascript
export async function searchBGGAPI(query, limit = 10, maxRetries = 3) {
  if (!query || !query.trim()) {
    return [];
  }

  const variants = generateQueryVariants(query);
  let lastError = null;
  
  // Try each variant until we get results
  for (const variant of variants) {
    try {
      const results = await searchBGGAPIWithQuery(variant, limit, maxRetries);
      if (results && results.length > 0) {
        logger.debug(`[BGG API] Found ${results.length} results with query variant: "${variant}"`);
        return results;
      }
    } catch (error) {
      lastError = error;
      // If rate limited, throw immediately (don't try other variants)
      if (error.message && error.message.includes('rate limited')) {
        throw error;
      }
      // For other errors, try next variant
      continue;
    }
  }
  
  // All variants failed - return empty array
  logger.warn(`[BGG API] No results found for query "${query}" after trying ${variants.length} variants`);
  return [];
}
```

### Solution 3: Improve Logging
Add detailed logging to track which queries fail and why:

```javascript
logger.debug('[BGG API] Search query variants:', {
  original: query,
  variants: variants,
  variantCount: variants.length
});
```

## Implementation Priority

1. **IMMEDIATE**: Add query normalization (Solution 1) - This will fix the majority of issues
2. **HIGH**: Implement query variant fallbacks (Solution 2) - This catches edge cases
3. **MEDIUM**: Improve logging to track failure patterns
4. **LOW**: Consider caching failed queries to avoid repeated attempts

## Testing Recommendations

Test with these problematic queries:
- "Catan: Explorers & Pirates"
- "The Settlers of Catan"
- "Ticket to Ride: Europe"
- "D&D: The Legend of Drizzt"
- "Betrayal at House on the Hill"
- Games with apostrophes: "King of Tokyo"
- Games with hyphens: "Ticket-to-Ride"

## Additional Considerations

1. **BGG Collection Import**: This uses BGG IDs directly, so it should work fine. The issue is primarily with text-based searches.

2. **Firestore Cache**: Your Firestore caching strategy is good, but ensure that normalized queries can still find cached games.

3. **User Experience**: Consider showing users that you're trying different query formats if the first attempt fails.

## Related Code Locations

- `src/services/bggApi.js` - `searchBGGAPI()` function (line 111)
- `src/utils/api.js` - `searchGamesByName()` function (line 359)
- Query normalization should be added to `src/services/bggApi.js` or `src/utils/` as a utility

