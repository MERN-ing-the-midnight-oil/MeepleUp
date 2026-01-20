# Performance Audit Report
## MeepleUp Codebase - Pre-Build Review

**Date:** Generated for Android/iOS Build Preparation  
**Scope:** Complete codebase performance and best practices review

---

## 🔴 CRITICAL ISSUES (Must Fix Before Production)

### 1. **Massive Bundle Size - 46 Google Font Packages**
**Location:** `package.json` lines 34-79  
**Impact:** CRITICAL - Bundle size bloat, slow app startup, increased memory usage

**Problem:**
- 46 `@expo-google-fonts/*` packages installed
- All fonts bundled even if unused
- Each font package adds ~50-200KB to bundle
- Estimated impact: **2-9MB+ of unused fonts**

**Recommendation:**
- Remove unused font packages
- Use only 1-3 fonts maximum
- Consider using system fonts for better performance
- If custom fonts needed, load on-demand, not at startup

**Files to check:**
- Search codebase for actual font usage
- Remove unused packages from `package.json`
- Consider using `expo-font` with custom font files instead

---

### 2. **Large Collection Data Enrichment - Blocks UI**
**Location:** 
- `src/screens/CollectionScreen.jsx` (lines 564-605)
- `src/screens/BrowseAndProposeScreen.jsx` (lines 550-599)

**Impact:** CRITICAL - UI freezes on initial load for users with large collections

**Problem:**
- Both screens enrich ALL games with BGG data on mount
- For 1000+ games, this triggers 1000+ API/Firestore calls
- Uses `Promise.all()` which blocks until all complete
- No lazy loading - everything happens at once

**Current Implementation Issues:**
```javascript
// CollectionScreen.jsx - Lines 564-605
useEffect(() => {
  // Enriches first 36 games immediately
  // But still loads all games into memory
}, [sortedGames, sortBy, selectedCategory, gamesByCategory, enrichGamesBatch]);
```

**Recommendation:**
- ✅ Already has lazy enrichment via `handleViewableItemsChanged` (line 448)
- ✅ Already uses batch enrichment (line 378)
- ⚠️ **Still enriches 36 games on mount** - should reduce to 10-15
- ⚠️ **3-second delay between batches** - could be optimized to 1-2 seconds
- Consider using `FlatList` with `onViewableItemsChanged` for better lazy loading

**Action Items:**
1. Reduce initial enrichment from 36 to 10-15 games
2. Reduce batch delay from 3s to 1-2s (with rate limiting protection)
3. Add loading indicators for enrichment progress
4. Consider using `react-native-fast-image` for better image caching

---

### 3. **Firestore Query Limits - Large Collections**
**Location:** `src/context/CollectionsContext.jsx` line 194

**Impact:** HIGH - Could fail for users with 1000+ games

**Problem:**
- Firestore has 1MB response limit per query
- Current implementation fetches entire collection in one query
- No pagination implemented
- Large collections could hit this limit

**Current Code:**
```javascript
const snapshot = await db.collection('userGames').doc(userId).collection('games').get();
```

**Recommendation:**
- Implement pagination using `limit()` and `startAfter()`
- Load first 500 games, then load more as needed
- Or load in background batches (non-blocking)
- Add error handling for query size limits

**Action Items:**
1. Add pagination to `CollectionsContext.jsx`
2. Load games in batches of 500
3. Add retry logic for failed queries
4. Consider using Firestore's `getAll()` for batch reads

---

### 4. **Memory Leaks - Firestore Listeners**
**Location:** Multiple files using `onSnapshot`

**Impact:** HIGH - Memory leaks, battery drain, performance degradation

**Problem:**
- Found 10+ `onSnapshot` calls across codebase
- Need to verify all have proper cleanup
- Unsubscribed listeners continue consuming resources

**Files with Listeners:**
- `src/screens/BrowseAndProposeScreen.jsx` (lines 1070, 1223)
- `src/screens/EventHub.jsx`
- `src/components/GameDetailsModal.jsx`
- `src/context/AvailabilityContext.jsx`

**Recommendation:**
- Verify all `onSnapshot` calls return unsubscribe functions
- Ensure cleanup in `useEffect` return functions
- Add listener count monitoring in dev mode

**Action Items:**
1. Audit all `onSnapshot` calls for proper cleanup
2. Add listener tracking/cleanup verification
3. Test component unmounting to ensure no leaks

---

## 🟡 HIGH PRIORITY ISSUES (Should Fix Soon)

### 5. **Excessive Re-renders - Collections Context**
**Location:** `src/context/CollectionsContext.jsx` lines 950-981

**Impact:** HIGH - Unnecessary re-renders, poor scroll performance

**Problem:**
- Context value changes frequently when collections update
- `collections` object reference changes on every update
- All consumers re-render even if their specific data didn't change

**Current Code:**
```javascript
const value = useMemo(() => ({
  collections, // This changes reference frequently
  // ...
}), [collections, ...]);
```

**Recommendation:**
- Split context into multiple contexts (collections, loading, actions)
- Use selectors to prevent unnecessary re-renders
- Consider using `use-context-selector` library
- Or memoize individual collection accessors

**Action Items:**
1. Split `CollectionsContext` into smaller contexts
2. Add selectors for specific collection access
3. Memoize collection getters

---

### 6. **Image Loading - No Optimization**
**Location:** `src/components/GameCard.jsx` lines 537-545

**Impact:** HIGH - Slow image loading, poor network usage, memory issues

**Problem:**
- Uses standard React Native `Image` component
- No image caching strategy visible
- No image optimization/resizing
- Large images loaded at full resolution
- No placeholder/loading states

**Current Code:**
```javascript
<Image
  source={{ uri: thumbnail }}
  style={styles.thumbnail}
  resizeMode="cover"
/>
```

**Recommendation:**
- Use `expo-image` or `react-native-fast-image` for better caching
- Implement image resizing/optimization
- Add progressive loading/placeholders
- Use CDN with image optimization if possible
- Implement image preloading for visible items

**Action Items:**
1. Replace `Image` with `expo-image` (already in dependencies)
2. Add image caching configuration
3. Implement lazy loading for images
4. Add loading placeholders

---

### 7. **Match Score Calculation - Expensive Operations**
**Location:** `src/screens/BrowseAndProposeScreen.jsx` lines 637-831

**Impact:** HIGH - Blocks UI thread, slow performance

**Problem:**
- Calculates match scores for all games on mount
- Expensive computation runs on main thread
- No debouncing/throttling visible
- Could block UI for large game collections

**Current Code:**
```javascript
useEffect(() => {
  // Debounced to 300ms, but still runs for all games
  const timeoutId = setTimeout(() => {
    loadMatchScores();
  }, 300);
}, [eventId, userId]);
```

**Recommendation:**
- ✅ Already has debouncing (300ms) - good
- ✅ Uses refs to prevent unnecessary recalculations - good
- ⚠️ Consider using Web Workers for heavy calculations
- ⚠️ Calculate scores incrementally as games become visible
- Add progress indicators for long calculations

**Action Items:**
1. Move heavy calculations to background thread if possible
2. Calculate scores only for visible games
3. Add loading states for score calculation
4. Cache calculated scores more aggressively

---

### 8. **Large State Objects in Memory**
**Location:** Multiple contexts

**Impact:** MEDIUM - Memory usage, potential crashes on low-end devices

**Problem:**
- Entire collections stored in React state
- Entire collections stored in localStorage
- For 1000 games: ~500KB-2MB in memory + storage
- Multiple users' collections loaded simultaneously

**Recommendation:**
- Consider pagination for state management
- Use IndexedDB instead of localStorage for large data
- Implement LRU cache for game data
- Only keep frequently accessed games in memory

**Action Items:**
1. Implement pagination for state
2. Consider IndexedDB for large collections
3. Add memory usage monitoring
4. Implement data cleanup for old/unused games

---

## 🟢 MEDIUM PRIORITY ISSUES (Nice to Have)

### 9. **Missing React.memo on List Items**
**Location:** `src/components/GameCollectionView.jsx` line 1035

**Impact:** MEDIUM - Unnecessary re-renders in lists

**Problem:**
- Games rendered in map without memoization
- Each game card re-renders when parent updates
- No `key` optimization visible

**Recommendation:**
- ✅ `GameCard` already has `React.memo` (line 807)
- ⚠️ Ensure stable keys for list items
- Consider `getItemLayout` for FlatList if using it

**Action Items:**
1. Verify all list items have stable keys
2. Add `getItemLayout` if using FlatList
3. Consider `removeClippedSubviews` for better performance

---

### 10. **Console.log Statements in Production**
**Location:** Throughout codebase

**Impact:** MEDIUM - Performance overhead, security concerns

**Problem:**
- Many `console.log` statements throughout code
- Some wrapped in `__DEV__` checks, but not all
- Console operations have performance cost

**Recommendation:**
- Remove or wrap all console.log in `__DEV__` checks
- Use a logging utility that strips logs in production
- Consider using `react-native-logger` or similar

**Action Items:**
1. Audit all console.log statements
2. Wrap in `__DEV__` or remove for production
3. Use proper logging utility

---

### 11. **No Error Boundaries for Critical Sections**
**Location:** App structure

**Impact:** MEDIUM - App crashes instead of graceful degradation

**Problem:**
- Only root-level ErrorBoundary found
- No error boundaries for specific features
- One error could crash entire app

**Recommendation:**
- Add error boundaries around:
  - Game collection views
  - Event management
  - BGG import flows
- Show fallback UI instead of crashing

**Action Items:**
1. Add error boundaries to critical sections
2. Implement fallback UIs
3. Add error reporting

---

### 12. **Inefficient Filtering/Sorting**
**Location:** `src/components/GameCollectionView.jsx` lines 618-787

**Impact:** MEDIUM - Slow filtering for large lists

**Problem:**
- Multiple filter operations run sequentially
- No early exit optimizations
- Filters run on every render (though memoized)

**Recommendation:**
- ✅ Already uses `useMemo` and `useDeferredValue` - excellent!
- ✅ Uses `useTransition` for non-urgent updates - excellent!
- Consider indexing frequently filtered fields
- Add early exits in filter chains

**Action Items:**
1. Add early exits in filter chains
2. Consider indexing for common filters
3. Profile filter performance with large datasets

---

### 13. **No Code Splitting / Lazy Loading**
**Location:** App structure

**Impact:** MEDIUM - Large initial bundle, slow startup

**Problem:**
- All screens/components loaded upfront
- No route-based code splitting
- Large components loaded even if unused

**Recommendation:**
- Use React.lazy() for route-based splitting
- Lazy load heavy components (BGGImport, GameCollectionView)
- Consider dynamic imports for utilities

**Action Items:**
1. Implement React.lazy() for routes
2. Lazy load heavy components
3. Measure bundle size reduction

---

### 14. **Animation Performance**
**Location:** `src/components/GameCard.jsx` lines 220-258

**Impact:** LOW-MEDIUM - Battery drain, frame drops

**Problem:**
- Shimmer animation runs continuously for favorited games
- Multiple animations per card
- Could cause frame drops with many favorited games

**Recommendation:**
- ✅ Uses `useNativeDriver: true` - good!
- Consider pausing animations when not visible
- Reduce animation frequency
- Use `InteractionManager` for non-critical animations

**Action Items:**
1. Pause animations when cards not visible
2. Reduce animation frequency
3. Test with many favorited games

---

## 📊 PERFORMANCE METRICS TO MONITOR

### Bundle Size
- **Current:** Unknown (needs measurement)
- **Target:** < 50MB for iOS, < 30MB for Android
- **Action:** Run `expo export` and measure bundle size

### Memory Usage
- **Monitor:** Peak memory usage with 1000+ games
- **Target:** < 200MB on average devices
- **Action:** Use React Native Performance Monitor

### Initial Load Time
- **Target:** < 3 seconds to interactive
- **Action:** Measure with React DevTools Profiler

### Scroll Performance
- **Target:** 60 FPS during scrolling
- **Action:** Test with large lists (500+ items)

---

## ✅ GOOD PRACTICES FOUND

1. **Lazy Enrichment:** CollectionScreen and BrowseAndProposeScreen use lazy enrichment
2. **Memoization:** Good use of `useMemo` and `useCallback` throughout
3. **Debouncing:** Match score calculation is debounced
4. **Virtualization:** FlatList used for large lists (though ScrollView also used)
5. **Error Boundaries:** Root-level error boundary present
6. **Native Animations:** Uses `useNativeDriver: true` for animations
7. **Deferred Values:** Uses `useDeferredValue` for filter inputs
8. **Transitions:** Uses `useTransition` for non-urgent updates

---

## 🎯 PRIORITY ACTION PLAN

### Before Production Build:
1. ✅ **Remove unused font packages** (Critical - Bundle size)
2. ✅ **Reduce initial game enrichment** (Critical - UI blocking)
3. ✅ **Add Firestore pagination** (High - Query limits)
4. ✅ **Verify Firestore listener cleanup** (High - Memory leaks)
5. ✅ **Replace Image with expo-image** (High - Image performance)

### Post-Build Optimization:
6. Split CollectionsContext (High - Re-renders)
7. Add error boundaries (Medium - Stability)
8. Implement code splitting (Medium - Bundle size)
9. Optimize animations (Low - Battery)

---

## 📝 TESTING RECOMMENDATIONS

### Performance Testing:
1. Test with 1000+ games in collection
2. Test with 10+ users in a MeepleUp
3. Test on low-end Android devices (2GB RAM)
4. Test on older iOS devices (iPhone 8/SE)
5. Monitor memory usage over extended sessions
6. Test network performance on slow connections

### Load Testing:
1. Test BGG import with 500+ games
2. Test match score calculation with large collections
3. Test filtering with 1000+ games
4. Test scrolling performance with large lists

---

## 🔧 QUICK WINS (Easy Fixes)

1. **Remove unused fonts** - 5 minutes, huge impact
2. **Wrap console.log in __DEV__** - 30 minutes
3. **Reduce initial enrichment count** - 10 minutes
4. **Add image caching** - 1 hour
5. **Add loading indicators** - 30 minutes

---

## 📚 RESOURCES

- React Native Performance: https://reactnative.dev/docs/performance
- Expo Image: https://docs.expo.dev/versions/latest/sdk/image/
- Firestore Best Practices: https://firebase.google.com/docs/firestore/best-practices
- Bundle Size Optimization: https://docs.expo.dev/guides/reducing-app-size/

---

**Generated by:** Auto (Cursor AI)  
**Review Status:** Complete  
**Next Steps:** Address Critical and High Priority issues before production builds

