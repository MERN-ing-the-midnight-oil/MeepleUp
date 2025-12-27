# Strategy: Handling Large BGG Collections with Critical Fields

## Problem Statement
- Many "Enriched" fields (categories, star ratings/BGG average) are **critical** for app functionality
- Basic imported fields are missing important data needed for categorical sorting
- Users need to sort by Star Rating and A-Z **immediately** after import
- Title lookup needed in both user library and super-collection
- Must handle large collections (2000+ games) without overwhelming BGG API

## Current State Analysis

### Basic (Imported) Fields Available Immediately:
- ✅ `title` (name) - available from BGG collection XML
- ✅ `thumbnail` - available from BGG collection XML
- ✅ `yearPublished` - available from BGG collection XML
- ✅ `bggId` - available from BGG collection XML

### Critical Enriched Fields Needed:
- ⚠️ **Categories** - Required for categorical sorting
- ⚠️ **Star Rating (BGG average)** - Required for rating sort
- ⚠️ **Complexity, mechanics, etc.** - Nice to have but not critical

## Recommended Solutions

### 1. Title Search/Filter (Client-Side - Immediate)
**Implementation:**
- Add search input field above game list in both CollectionScreen and BrowseAndProposeScreen
- Filter games client-side on `title` field (case-insensitive)
- Works immediately - no API calls needed
- Filter happens before enrichment, so works on all games

**UI:**
```
[Search: _______________]
```

**Code Pattern:**
```javascript
const [searchQuery, setSearchQuery] = useState('');
const filteredGames = useMemo(() => {
  if (!searchQuery.trim()) return sortedGames;
  const query = searchQuery.toLowerCase().trim();
  return sortedGames.filter(game => 
    (game.title || '').toLowerCase().includes(query)
  );
}, [sortedGames, searchQuery]);
```

### 2. Priority Enrichment Strategy for Large Collections

#### Phase 1: Initial Load (Immediate Display)
- Display all games immediately with basic fields (title, thumbnail)
- Show placeholder/default values for missing enriched data:
  - Star Rating: Show "No rating" or empty stars
  - Category: Show "Uncategorized" group

#### Phase 2: View-Based Priority Enrichment
When user selects a sort mode, prioritize enrichment based on view:

**A-Z Sort (Title):**
- Low priority - enrichment happens lazily on scroll
- Games already have titles, sorting works immediately

**Star Rating Sort:**
- Enrich first 2-3 pages (40-60 games) immediately
- Show games with ratings first, unrated games at end
- Continue enriching on scroll (visible items + next page)

**Category Sort:**
- **Critical**: Need categories for ALL games to sort properly
- Two options:
  - Option A: Enrich all games before showing categories (batch in background)
  - Option B: Show "Uncategorized" group and enrich progressively
- Recommend Option B for better UX (shows something immediately)

#### Phase 3: Progressive Enrichment on Scroll
- Enrich visible items + next page (prefetch)
- Batch size: 50 games per batch
- Delay between batches: 3 seconds (respect rate limits)

### 3. Enhanced Enrichment Trigger on Sort Change

**Current Issue:** Switching to category/rating sort doesn't trigger immediate enrichment

**Solution:**
```javascript
useEffect(() => {
  if (sortBy === 'category' || sortBy === 'rating') {
    // Enrich visible items + next 2 pages immediately
    const gamesToEnrich = sortedGames
      .slice(0, ITEMS_PER_PAGE * 3) // 3 pages ahead
      .map(game => game.bggId || game.id)
      .filter(id => id && !bggDataCache[id]);
    
    if (gamesToEnrich.length > 0) {
      enrichGamesBatch(gamesToEnrich);
    }
  }
}, [sortBy, sortedGames]);
```

### 4. Fallback Display Strategy

**For Star Rating Sort:**
- Games with BGG rating: Sort by rating (highest first)
- Games without BGG rating: Show at end, sorted by title
- Display: "Rating: ⭐⭐⭐⭐ (8.5)" or "Rating: Not rated"

**For Category Sort:**
- Games with category: Sort into category groups
- Games without category: Show in "Uncategorized" group at end
- Continue enriching "Uncategorized" games in background
- Move games to correct category as enrichment completes

### 5. Batch Size & Rate Limiting Recommendations

**Current Settings:**
- Batch size: 50 games (BGG API limit)
- Delay between batches: 3 seconds

**Optimization for Large Collections:**
- First page (immediate view): Enrich 60 games (visible + next page)
- Subsequent batches: 50 games per batch
- Delay: 3 seconds between batches
- Max concurrent: 1 batch at a time

**For Category View:**
- More aggressive: Enrich all games in smaller batches (20 games)
- Delay: 2 seconds between batches
- Background enrichment continues even when user scrolls

### 6. User Experience Enhancements

**Loading States:**
- Show "Enriching game data..." indicator when enrichment is active
- Show count: "Loading ratings for 47 games..."
- Allow user to cancel background enrichment if needed

**Progressive Display:**
- Games appear immediately with basic info
- Thumbnails load progressively
- Ratings/categories appear as enrichment completes
- Smooth transitions when data becomes available

## Implementation Priority

1. **HIGH**: Title search/filter (immediate, no API)
2. **HIGH**: Priority enrichment on sort change (category/rating)
3. **MEDIUM**: Enhanced fallback display (show "Uncategorized", "Not rated")
4. **MEDIUM**: Loading indicators for enrichment
5. **LOW**: Cancel enrichment functionality

## Code Changes Needed

### CollectionScreen.jsx
1. Add search input state and UI
2. Add filteredGames useMemo
3. Enhance enrichment trigger on sortBy change
4. Update category grouping to handle "Uncategorized"
5. Update rating sort to handle missing ratings

### BrowseAndProposeScreen.jsx
1. Add search input state and UI
2. Add filteredGames useMemo
3. Similar enrichment enhancements

### BGGImport.jsx
- Already optimized (only fetches 500 games initially)
- Consider reducing to 200-300 for faster initial import

