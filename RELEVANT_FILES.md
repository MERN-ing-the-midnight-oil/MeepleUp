# Relevant Files for BGG Lookup Issue

## Primary Files (Most Important)

### 1. **Main Scanner Component**
**`src/components/ClaudeGameIdentifier.jsx`** - The main component that:
- Handles camera/photo capture
- Calls Claude Vision API to identify games
- Creates game candidates
- **Triggers BGG lookups via useEffect** (lines ~209-280)
- Displays game cards for user confirmation
- Calls `onAddToCollection` when user confirms games

**Key functions:**
- `beginIdentificationWorkflow()` - Processes photo and creates candidates
- `fetchBGGMetadata()` - Fetches BGG data for a game (lines 298-837)
- `useEffect` hook that watches `gameCandidates` and triggers BGG fetches

---

### 2. **BGG API Service**
**`src/services/bggApi.js`** - Direct BGG XML API calls:
- `searchBGGAPI(query, limit)` - Searches BGG by game name
- `fetchBGGGameDetails(gameId)` - Gets full game details with thumbnails
- Handles authentication and XML parsing

---

### 3. **Game Search Utility**
**`src/utils/api.js`** - Higher-level game search that tries multiple sources:
- `searchGamesByName(query, fallbackToBGG)` - Tries:
  1. Firebase Firestore (primary)
  2. Local database (fallback)
  3. BGG API (if fallbackToBGG = true)
- `getGameDetails(gameId)` - Gets game details from Firestore/Local/BGG

**Lines 350-446** - The `searchGamesByName` function that `fetchBGGMetadata` calls

---

### 4. **Collection Screen**
**`src/screens/CollectionScreen.jsx`** - Where the scanner is used:
- **Lines 317-318** - Renders `<ClaudeGameIdentifier>` component
- **Lines 102-108** - `handleAddToCollection` function
- Passes `onAddToCollection` prop to ClaudeGameIdentifier

---

## Secondary/Supporting Files

### 5. **Collections Context**
**`src/context/CollectionsContext.jsx`** - Manages user's game collection:
- `addGameToCollection(userId, gameData)` - Adds game to collection
- `removeGameFromCollection(userId, gameId)` - Removes game
- `getUserCollection(userId)` - Gets user's collection

---

### 6. **Claude Vision Service**
**`src/services/claudeVision.js`** - Calls Claude API to identify games:
- `identifyGamesFromImage()` - Sends image to Claude, gets game titles back
- This is called by `beginIdentificationWorkflow()` in ClaudeGameIdentifier

---

## Debug/Reference Files

### 7. **Debug Summary**
**`BGG_LOOKUP_DEBUG_SUMMARY.md`** - Summary of the issue and what we tried

---

## File Flow

```
1. CollectionScreen.jsx
   └─> Renders ClaudeGameIdentifier component
   
2. ClaudeGameIdentifier.jsx
   ├─> beginIdentificationWorkflow()
   │   └─> Calls claudeVision.js to identify games
   │   └─> Creates candidates in state
   │
   ├─> useEffect watches gameCandidates
   │   └─> Triggers setTimeout for each new candidate
   │   └─> Calls fetchBGGMetadata() after delay
   │
   └─> fetchBGGMetadata()
       └─> Calls api.js searchGamesByName()
           └─> Tries Firestore → Local DB → BGG API
               └─> Calls bggApi.js searchBGGAPI()
               └─> Calls bggApi.js fetchBGGGameDetails()
           
3. User confirms game
   └─> Calls onAddToCollection prop
       └─> CollectionScreen.handleAddToCollection()
           └─> CollectionsContext.addGameToCollection()
```

---

## Most Important Files for This Issue

1. **`src/components/ClaudeGameIdentifier.jsx`** - The useEffect hook (lines ~209-280) is where BGG fetches are triggered
2. **`src/components/ClaudeGameIdentifier.jsx`** - The `fetchBGGMetadata` function (lines 298-837)
3. **`src/utils/api.js`** - The `searchGamesByName` function (lines 350-446)
4. **`src/services/bggApi.js`** - The actual BGG API calls

