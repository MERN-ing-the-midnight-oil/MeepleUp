# Critical Performance Fixes - Quick Reference

## 🚨 MUST FIX BEFORE PRODUCTION BUILDS

### 1. Remove Unused Font Packages (5 minutes)
**Impact:** Reduces bundle size by 2-9MB

**Action:**
```bash
# Check which fonts are actually used
grep -r "fontFamily\|font-family" src/ --include="*.jsx" --include="*.js" --include="*.css"

# Remove unused packages from package.json
# Keep only 1-3 fonts maximum
```

**Files:** `package.json` lines 34-79

---

### 2. Reduce Initial Game Enrichment (10 minutes)
**Impact:** Prevents UI blocking on app startup

**Files to modify:**
- `src/screens/CollectionScreen.jsx` line 590
- `src/screens/BrowseAndProposeScreen.jsx` (if similar pattern exists)

**Change:**
```javascript
// BEFORE:
const initialEnrichCount = itemsPerPage * 2; // 36 games

// AFTER:
const initialEnrichCount = 10; // Only 10 games initially
```

---

### 3. Add Firestore Pagination (1-2 hours)
**Impact:** Prevents query failures for large collections

**File:** `src/context/CollectionsContext.jsx` line 194

**Change:**
```javascript
// BEFORE:
const snapshot = await db.collection('userGames').doc(userId).collection('games').get();

// AFTER:
const BATCH_SIZE = 500;
let lastDoc = null;
let allGames = [];

do {
  let query = db.collection('userGames').doc(userId).collection('games').limit(BATCH_SIZE);
  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }
  const batch = await query.get();
  allGames = [...allGames, ...batch.docs];
  lastDoc = batch.docs[batch.docs.length - 1];
} while (batch.docs.length === BATCH_SIZE);
```

---

### 4. Verify Firestore Listener Cleanup (30 minutes)
**Impact:** Prevents memory leaks

**Files to check:**
- `src/screens/BrowseAndProposeScreen.jsx` lines 1070, 1223
- `src/screens/EventHub.jsx`
- `src/components/GameDetailsModal.jsx`
- `src/context/AvailabilityContext.jsx`

**Pattern to verify:**
```javascript
useEffect(() => {
  const unsubscribe = db.collection(...).onSnapshot(...);
  return () => unsubscribe(); // ✅ Must have cleanup
}, [dependencies]);
```

---

### 5. Replace Image with expo-image (1 hour)
**Impact:** Better image caching and performance

**File:** `src/components/GameCard.jsx` line 538

**Change:**
```javascript
// BEFORE:
import { Image } from 'react-native';

// AFTER:
import { Image } from 'expo-image';

// Add caching:
<Image
  source={{ uri: thumbnail }}
  style={styles.thumbnail}
  contentFit="cover"
  cachePolicy="memory-disk"
  transition={200}
/>
```

---

## 📋 CHECKLIST

- [ ] Remove unused font packages (46 → 1-3)
- [ ] Reduce initial enrichment from 36 to 10 games
- [ ] Add Firestore pagination for large collections
- [ ] Verify all Firestore listeners have cleanup
- [ ] Replace Image with expo-image
- [ ] Wrap console.log in __DEV__ checks
- [ ] Test with 1000+ games
- [ ] Test on low-end devices
- [ ] Measure bundle size before/after

---

## 🧪 TESTING CHECKLIST

- [ ] App loads in < 3 seconds with 1000 games
- [ ] No memory leaks after 30 minutes of use
- [ ] Smooth scrolling (60 FPS) with 500+ games
- [ ] Images load quickly and cache properly
- [ ] No UI blocking during game enrichment
- [ ] Firestore queries don't fail with large collections

---

**See PERFORMANCE_AUDIT_REPORT.md for full details**

