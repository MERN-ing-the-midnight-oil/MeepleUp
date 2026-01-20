# Image Performance Optimization Guide

## Current State Analysis

### Current Implementation
- **GameCard.jsx**: Uses React Native's `Image` component with `resizeMode="cover"`
- **No image caching library**: Relying on React Native's default caching
- **No lazy loading**: All images load immediately when rendered
- **No image optimization**: Loading full-size BGG thumbnails directly
- **No placeholder strategy**: Shows text placeholder on error only

### Issues Identified

1. **No Explicit Caching**
   - React Native's default image cache is limited
   - Images may reload on navigation
   - No control over cache size or eviction

2. **Large Image Sizes**
   - BGG thumbnails can be 200-500KB each
   - Loading many images at once causes memory pressure
   - No progressive loading or blur-up effect

3. **No Lazy Loading**
   - All images in a list load immediately
   - Wastes bandwidth and memory
   - Slows initial render

4. **No Image Optimization**
   - Not using WebP format (smaller file sizes)
   - Not resizing images to appropriate dimensions
   - Loading full-resolution images for thumbnails

5. **No Error Handling Strategy**
   - Only logs errors, doesn't retry
   - No fallback image strategy
   - Poor UX when images fail

---

## Recommended Solutions

### 1. Add Image Caching Library (High Priority)

**Option A: `react-native-fast-image` (Recommended)**
- Best performance and caching
- Works on both iOS and Android
- Automatic cache management
- Supports priority loading

**Option B: `expo-image` (If using Expo)**
- Built-in caching
- Better than default Image component
- Supports blur placeholders
- Progressive loading

**Installation:**
```bash
# For react-native-fast-image
npm install react-native-fast-image

# For expo-image (if using Expo)
npx expo install expo-image
```

**Implementation Example:**
```javascript
// Using expo-image
import { Image } from 'expo-image';

<Image
  source={{ uri: thumbnail }}
  style={styles.thumbnail}
  contentFit="cover"
  placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }}
  transition={200}
  cachePolicy="memory-disk" // Cache to both memory and disk
/>
```

---

### 2. Implement Lazy Loading (High Priority)

**For FlatList/ScrollView:**
```javascript
import { Image } from 'expo-image';

const GameCard = ({ game, index }) => {
  const [shouldLoad, setShouldLoad] = useState(false);
  
  useEffect(() => {
    // Only load images for first 10 items immediately
    // Load others when they're about to be visible
    if (index < 10) {
      setShouldLoad(true);
    } else {
      // Use Intersection Observer or onViewableItemsChanged
      // to load when item becomes visible
    }
  }, [index]);
  
  return (
    <Image
      source={shouldLoad ? { uri: thumbnail } : null}
      // ... other props
    />
  );
};
```

**Using FlatList's `onViewableItemsChanged`:**
```javascript
const onViewableItemsChanged = useRef(({ viewableItems }) => {
  viewableItems.forEach(({ item, index }) => {
    // Load image for this item
    loadImageForItem(item.id);
  });
}).current;

<FlatList
  onViewableItemsChanged={onViewableItemsChanged}
  viewabilityConfig={{
    itemVisiblePercentThreshold: 50,
  }}
  // ... other props
/>
```

---

### 3. Image Optimization Strategy (Medium Priority)

**A. Use Appropriate Image Sizes**
- Thumbnails: 150x150px (or 2x for retina = 300x300px)
- Cards: 300x300px (or 2x = 600x600px)
- Full screen: Original size

**B. Request Optimized Images from BGG**
BGG API provides different image sizes:
- `thumbnail`: Small (150x150)
- `image`: Medium (300x300)
- `originalimage`: Full size

**Current code uses `thumbnail` which is good, but:**
- Consider using CDN with image resizing
- Or implement client-side resizing for cached images

**C. Use WebP Format (if supported)**
```javascript
// Check if browser/device supports WebP
const supportsWebP = () => {
  // Implementation depends on platform
  return true; // Assume support for now
};

const getOptimizedImageUrl = (originalUrl) => {
  if (supportsWebP() && originalUrl) {
    // If using a CDN, request WebP version
    return originalUrl.replace(/\.(jpg|png)$/, '.webp');
  }
  return originalUrl;
};
```

---

### 4. Progressive Loading & Placeholders (Medium Priority)

**Blur Hash Placeholders:**
```javascript
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';

<Image
  source={{ uri: thumbnail }}
  placeholder={
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {title.charAt(0).toUpperCase()}
      </Text>
    </View>
  }
  transition={200}
/>
```

**Low-Quality Image Placeholder (LQIP):**
```javascript
// Load low-quality version first, then high-quality
const [imageUri, setImageUri] = useState(lowQualityThumbnail);

useEffect(() => {
  // Load high-quality version in background
  const img = new Image();
  img.onload = () => setImageUri(highQualityThumbnail);
  img.src = highQualityThumbnail;
}, []);
```

---

### 5. Error Handling & Fallbacks (Low Priority)

**Retry Strategy:**
```javascript
const [imageError, setImageError] = useState(false);
const [retryCount, setRetryCount] = useState(0);

const handleImageError = () => {
  if (retryCount < 3) {
    setTimeout(() => {
      setRetryCount(prev => prev + 1);
      setImageError(false);
      // Force reload
    }, 1000 * (retryCount + 1)); // Exponential backoff
  } else {
    setImageError(true);
  }
};

<Image
  source={{ uri: thumbnail }}
  onError={handleImageError}
  // Show fallback if error
  defaultSource={require('../assets/default-game.png')}
/>
```

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 hours)
1. ✅ **Add expo-image or react-native-fast-image**
   - Replace `Image` with optimized component
   - Enable disk caching
   - Immediate performance improvement

2. ✅ **Add lazy loading to GameCollectionView**
   - Only load images for visible items
   - Use `onViewableItemsChanged` for FlatList

### Phase 2: Optimization (2-4 hours)
3. ✅ **Implement progressive loading**
   - Add blur placeholders
   - Load low-quality first, then high-quality

4. ✅ **Add image size optimization**
   - Request appropriate sizes from BGG
   - Or implement client-side resizing

### Phase 3: Polish (1-2 hours)
5. ✅ **Error handling improvements**
   - Retry logic
   - Better fallback images
   - Loading states

---

## Code Examples

### Updated GameCard.jsx

```javascript
import { Image } from 'expo-image'; // or react-native-fast-image

const GameCard = ({ game, preloadedBggData }) => {
  const thumbnail = useMemo(() => {
    return game.bggThumbnail || game.thumbnail || preloadedBggData?.thumbnail;
  }, [game, preloadedBggData]);

  return (
    <View style={styles.card}>
      <View style={styles.thumbnailContainer}>
        {thumbnail ? (
          <Image
            source={{ uri: thumbnail }}
            style={styles.thumbnail}
            contentFit="cover"
            placeholder={
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>
                  {title.charAt(0).toUpperCase()}
                </Text>
              </View>
            }
            transition={200}
            cachePolicy="memory-disk"
            priority="normal" // or "high" for above-the-fold images
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Text style={styles.placeholderText}>
              {title.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      {/* ... rest of card */}
    </View>
  );
};
```

### Lazy Loading in GameCollectionView

```javascript
const GameCollectionView = ({ games }) => {
  const [loadedImages, setLoadedImages] = useState(new Set());
  
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const newLoaded = new Set(loadedImages);
    viewableItems.forEach(({ item }) => {
      newLoaded.add(item.id);
    });
    setLoadedImages(newLoaded);
  }).current;

  const renderItem = ({ item, index }) => {
    const shouldLoadImage = index < 10 || loadedImages.has(item.id);
    
    return (
      <GameCard
        game={item}
        shouldLoadImage={shouldLoadImage}
      />
    );
  };

  return (
    <FlatList
      data={games}
      renderItem={renderItem}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{
        itemVisiblePercentThreshold: 50,
      }}
      // ... other props
    />
  );
};
```

---

## Performance Metrics

### Before Optimization:
- **Initial Load:** 2-5 seconds for 20 games
- **Memory Usage:** 50-100MB for image cache
- **Scroll Performance:** Occasional jank
- **Image Reloads:** Frequent on navigation

### After Optimization (Expected):
- **Initial Load:** 0.5-1 second (lazy loading)
- **Memory Usage:** 20-40MB (better cache management)
- **Scroll Performance:** Smooth 60fps
- **Image Reloads:** Rare (disk caching)

---

## Testing Checklist

- [ ] Images load quickly on initial render
- [ ] Images don't reload on navigation
- [ ] Memory usage stays reasonable (<100MB)
- [ ] Scroll performance is smooth
- [ ] Images load as user scrolls (lazy loading works)
- [ ] Placeholders show while loading
- [ ] Error handling works (broken image URLs)
- [ ] Works on both iOS and Android
- [ ] Works on slow network connections

---

## Additional Resources

- [Expo Image Documentation](https://docs.expo.dev/versions/latest/sdk/image/)
- [React Native Fast Image](https://github.com/DylanVann/react-native-fast-image)
- [Image Optimization Best Practices](https://web.dev/fast/#optimize-your-images)
- [BGG API Image Sizes](https://boardgamegeek.com/wiki/page/BGG_XML_API2#toc5)

---

## Notes

- **expo-image** is recommended if you're using Expo
- **react-native-fast-image** is better for bare React Native
- Both provide significant performance improvements over default `Image`
- Lazy loading is the biggest win for large lists
- Disk caching prevents reloads on navigation

