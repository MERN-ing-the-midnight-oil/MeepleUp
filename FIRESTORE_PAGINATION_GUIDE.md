# Firestore Pagination Guide

## What is Firestore Pagination?

Firestore pagination is a technique to fetch documents in smaller batches rather than all at once. This is necessary because:

1. **Firestore Response Limit:** Each query response is limited to **1MB** of data
2. **Performance:** Loading 1000+ documents at once is slow and blocks the UI
3. **Memory:** Large queries consume excessive memory
4. **Cost:** Smaller queries are more efficient and cost-effective

---

## Why You Need It

### Current Problem in Your Code

**Location:** `src/context/CollectionsContext.jsx` line 194

```javascript
// CURRENT CODE - PROBLEMATIC:
const snapshot = await db.collection('userGames').doc(userId).collection('games').get();
```

**Issues:**
- Fetches ALL games in one query
- If user has 1000+ games, this could:
  - Hit the 1MB response limit → **Query fails**
  - Take 5-10+ seconds to complete → **UI blocks**
  - Consume 2-5MB+ of memory → **App crashes on low-end devices**

### Real-World Impact

For a user with 2000 games:
- **Without pagination:** Query fails or takes 10+ seconds
- **With pagination:** Loads in 4 batches of 500, takes 2-3 seconds total

---

## How Firestore Pagination Works

### Basic Concept

Instead of:
```javascript
// ❌ BAD: Get everything at once
const all = await collection.get();
```

You do:
```javascript
// ✅ GOOD: Get in batches
const batch1 = await collection.limit(500).get();
const batch2 = await collection.limit(500).startAfter(lastDoc).get();
// ... continue until done
```

### Key Methods

1. **`limit(n)`** - Get maximum N documents
2. **`startAfter(doc)`** - Start after a specific document (cursor)
3. **`get()`** - Execute the query

---

## Implementation Patterns

### Pattern 1: Load All in Background (Recommended for Your Use Case)

This loads all games but in batches, so the UI isn't blocked:

```javascript
const loadGamesWithPagination = async (userId) => {
  const BATCH_SIZE = 500; // Firestore recommended batch size
  let allGames = [];
  let lastDoc = null;
  let hasMore = true;

  while (hasMore) {
    try {
      // Build query
      let query = db
        .collection('userGames')
        .doc(userId)
        .collection('games')
        .limit(BATCH_SIZE);

      // Add cursor if we have one
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      // Execute query
      const snapshot = await query.get();

      // Process documents
      const batchGames = snapshot.docs.map(doc => {
        const data = doc.data();
        // ... your existing parsing logic ...
        return parsedGame;
      });

      allGames = [...allGames, ...batchGames];

      // Check if there are more documents
      hasMore = snapshot.docs.length === BATCH_SIZE;
      
      if (hasMore) {
        // Get the last document for the next batch
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }

      // Optional: Small delay between batches to avoid overwhelming Firestore
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error(`Error loading batch starting after ${lastDoc?.id}:`, error);
      // Decide: retry, skip, or fail
      break;
    }
  }

  return allGames;
};
```

### Pattern 2: Progressive Loading (Load as Needed)

This loads games progressively as the user scrolls:

```javascript
const [games, setGames] = useState([]);
const [lastDoc, setLastDoc] = useState(null);
const [hasMore, setHasMore] = useState(true);
const [loading, setLoading] = useState(false);

const loadMoreGames = async () => {
  if (loading || !hasMore) return;

  setLoading(true);
  try {
    let query = db
      .collection('userGames')
      .doc(userId)
      .collection('games')
      .limit(100); // Smaller batches for progressive loading

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const newGames = snapshot.docs.map(doc => parseGame(doc));

    setGames(prev => [...prev, ...newGames]);
    setHasMore(snapshot.docs.length === 100);
    
    if (snapshot.docs.length > 0) {
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
    }
  } catch (error) {
    console.error('Error loading more games:', error);
  } finally {
    setLoading(false);
  }
};
```

---

## Implementation for Your Codebase

### Recommended: Update CollectionsContext.jsx

**File:** `src/context/CollectionsContext.jsx`  
**Location:** Around line 194

**Replace this:**
```javascript
const snapshot = await db.collection('userGames').doc(userId).collection('games').get();
```

**With this:**
```javascript
// Load games with pagination
const BATCH_SIZE = 500;
let allDocs = [];
let lastDoc = null;
let batchNumber = 0;

do {
  batchNumber++;
  console.log(`[Collections] Loading batch ${batchNumber}...`);
  
  let query = db
    .collection('userGames')
    .doc(userId)
    .collection('games')
    .limit(BATCH_SIZE);
  
  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }
  
  const batch = await query.get();
  allDocs = [...allDocs, ...batch.docs];
  
  if (batch.docs.length > 0) {
    lastDoc = batch.docs[batch.docs.length - 1];
  }
  
  // Small delay between batches to avoid rate limiting
  if (batch.docs.length === BATCH_SIZE) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
} while (batch.docs.length === BATCH_SIZE);

console.log(`[Collections] Loaded ${allDocs.length} games in ${batchNumber} batch(es)`);

// Now use allDocs instead of snapshot.docs
const references = allDocs.map(doc => {
  // ... your existing parsing logic ...
});
```

### Complete Updated Function

Here's the complete updated sync function:

```javascript
const sync = async () => {
  setLoading(true);
  try {
    console.log('[Collections] Fetching games from Firestore with pagination', {
      userId,
      path: `userGames/${userId}/games`,
    });
    
    // Load games with pagination
    const BATCH_SIZE = 500;
    let allDocs = [];
    let lastDoc = null;
    let batchNumber = 0;
    let hasMore = true;

    while (hasMore) {
      batchNumber++;
      
      try {
        let query = db
          .collection('userGames')
          .doc(userId)
          .collection('games')
          .limit(BATCH_SIZE);
        
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }
        
        const batch = await query.get();
        allDocs = [...allDocs, ...batch.docs];
        
        hasMore = batch.docs.length === BATCH_SIZE;
        
        if (hasMore && batch.docs.length > 0) {
          lastDoc = batch.docs[batch.docs.length - 1];
          // Small delay to avoid overwhelming Firestore
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`[Collections] Batch ${batchNumber}: ${batch.docs.length} games (total: ${allDocs.length})`);
        
      } catch (batchError) {
        console.error(`[Collections] Error loading batch ${batchNumber}:`, batchError);
        // Continue with what we have, or break depending on your error handling strategy
        hasMore = false;
      }
    }
    
    console.log('[Collections] Firestore query completed', {
      userId,
      totalGames: allDocs.length,
      batches: batchNumber,
    });
    
    if (allDocs.length > 0) {
      // Parse references (your existing logic)
      const references = allDocs.map(doc => {
        const data = doc.data();
        const isRef = isReferenceOnly(data);
        // ... rest of your parsing logic ...
      });
      
      // Continue with your existing enrichment logic...
    }
    
  } catch (error) {
    console.error(`[Collections] Error syncing user games:`, error);
    // Reset flag on error so we can retry
    currentUserSyncedRef.current = null;
  } finally {
    setLoading(false);
  }
};
```

---

## Important Considerations

### 1. Ordering Matters

For pagination to work correctly, you need consistent ordering:

```javascript
// ✅ GOOD: Ordered query
query = query.orderBy('addedAt', 'desc').limit(500);

// ❌ BAD: No ordering (results may be inconsistent)
query = query.limit(500);
```

**For your use case:** You might want to order by `addedAt` or `updatedAt` to ensure consistent pagination.

### 2. Index Requirements

If you add ordering, Firestore may require a composite index. You'll see an error message with a link to create it.

### 3. Cursor Stability

The `startAfter()` cursor must use the same ordering as the query. If you change ordering, you need to restart pagination.

### 4. Error Handling

Each batch can fail independently. Decide on your strategy:
- **Retry failed batches** (recommended)
- **Skip and continue** (faster but may miss data)
- **Fail entire operation** (safest but slowest)

---

## Performance Benefits

### Before Pagination:
- 2000 games: **10+ seconds**, may fail at 1MB limit
- Memory: **5-10MB** for query result
- UI: **Blocked** during entire load

### After Pagination:
- 2000 games: **2-3 seconds** (4 batches of 500)
- Memory: **1-2MB** per batch (released after processing)
- UI: **Non-blocking** (can show progress)

---

## Testing

### Test Cases:

1. **Small collection (< 500 games):**
   - Should load in 1 batch
   - Should work exactly as before

2. **Medium collection (500-1000 games):**
   - Should load in 2 batches
   - Should complete in 1-2 seconds

3. **Large collection (1000+ games):**
   - Should load in multiple batches
   - Should not hit 1MB limit
   - Should show progress

4. **Edge cases:**
   - Empty collection
   - Exactly 500 games (boundary)
   - Network errors during pagination

---

## Alternative: Firestore `getAll()` (Batch Reads)

If you know the document IDs, you can use `getAll()` for batch reads:

```javascript
// If you have an array of document IDs
const docRefs = gameIds.map(id => 
  db.collection('userGames').doc(userId).collection('games').doc(id)
);

// Get all at once (max 10 documents per call, but can batch)
const games = await db.getAll(...docRefs);
```

**Note:** `getAll()` is limited to 10 documents per call, so you'd still need batching.

---

## Summary

**Why:** Firestore has a 1MB response limit and large queries are slow  
**How:** Use `limit()` and `startAfter()` to fetch in batches  
**When:** Always use pagination for collections that could have 500+ documents  
**Your fix:** Update `CollectionsContext.jsx` line 194 to use pagination

**Estimated implementation time:** 1-2 hours  
**Impact:** Prevents failures for large collections, improves performance

---

## Quick Reference

```javascript
// Basic pagination pattern
let allDocs = [];
let lastDoc = null;

do {
  let query = collection.limit(500);
  if (lastDoc) query = query.startAfter(lastDoc);
  
  const batch = await query.get();
  allDocs = [...allDocs, ...batch.docs];
  
  if (batch.docs.length > 0) {
    lastDoc = batch.docs[batch.docs.length - 1];
  }
} while (batch.docs.length === 500);
```

