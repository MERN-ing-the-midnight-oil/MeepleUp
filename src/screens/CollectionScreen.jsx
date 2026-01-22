import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Image, useWindowDimensions, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import Button from '../components/common/Button';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ClaudeGameIdentifier from '../components/ClaudeGameIdentifier';
import TextListGameIdentifier from '../components/TextListGameIdentifier';
import GameCollectionView from '../components/GameCollectionView';
import BGGImport from '../components/BGGImport';
import PoweredByBGG from '../components/PoweredByBGG';
import Modal from '../components/common/Modal';
import { getGames } from '../utils/api';
import { getStarRating } from '../utils/gameBadges';
import { theme, commonStyles } from '../utils/theme';
import { retryPendingGameSearches } from '../utils/retryPendingGames';

// All game categories in order (for legacy code - GameCollectionView now handles this)
const ALL_CATEGORIES = ['Strategy', 'Family', 'Party', 'War', 'Thematic', 'Abstract', 'Children', 'CCG', 'Other'];

const CollectionScreen = () => {
  console.log('[CollectionScreen] Component rendering');
  
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { collections, getUserCollection, addGameToCollection, removeGameFromCollection, updateGameInCollection, loading, initialised } = useCollections();
  const [activeView, setActiveView] = useState('menu'); // 'menu', 'import'
  const [sortBy, setSortBy] = useState('category'); // 'rating', 'category', 'title'
  const [categorySortPreference, setCategorySortPreference] = useState({}); // { 'Strategy': 'rating' | 'title', ... }
  const [selectedCategory, setSelectedCategory] = useState(null); // null = all categories, or specific category name
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showTextListModal, setShowTextListModal] = useState(false);
  const [showBGGImportModal, setShowBGGImportModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // Title search query
  const [categoriesDetermined, setCategoriesDetermined] = useState(false); // Track if we've determined categories
  
  // Refs to maintain scroll position when sort changes
  const flatListRef = useRef(null);
  const scrollViewRef = useRef(null);
  const scrollPositionRef = useRef(0);
  const inventoryHeaderRef = useRef(null);
  const inventoryHeaderY = useRef(0);
  
  // Handler to change sort while preserving scroll position
  const handleSortChange = useCallback((newSortBy) => {
    // Update sort - scroll position is already tracked in scrollPositionRef via onScroll
    setSortBy(newSortBy);
    // Reset selected category when switching away from category view
    if (newSortBy !== 'category') {
      setSelectedCategory(null);
    }
  }, []);
  
  // Restore scroll position after sort changes
  // Use useLayoutEffect to restore synchronously before paint, preventing visible jumps
  useLayoutEffect(() => {
    // Only restore if we have a saved position > 0 (not at top)
    if (scrollPositionRef.current <= 0) return;
    
    // Restore synchronously before paint to prevent visible jump
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ 
        offset: scrollPositionRef.current, 
        animated: false 
      });
    }
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ 
        y: scrollPositionRef.current, 
        animated: false 
      });
    }
    
    // Backup restore after paint in case the above didn't work
    requestAnimationFrame(() => {
      if (flatListRef.current && scrollPositionRef.current > 0) {
        flatListRef.current.scrollToOffset({ 
          offset: scrollPositionRef.current, 
          animated: false 
        });
      }
      if (scrollViewRef.current && scrollPositionRef.current > 0) {
        scrollViewRef.current.scrollTo({ 
          y: scrollPositionRef.current, 
          animated: false 
        });
      }
    });
  }, [sortBy]);
  
  // Track scroll position
  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
    if (offsetY >= 0) {
      scrollPositionRef.current = offsetY;
    }
  }, []);

  // Scroll to inventory section after import
  const scrollToInventory = useCallback(() => {
    // Wait a bit for the UI to update with new games
    setTimeout(() => {
      // For ScrollView (category view), use the stored Y position
      if (scrollViewRef.current && inventoryHeaderY.current > 0) {
        const scrollOffset = Math.max(0, inventoryHeaderY.current - 50); // 50px offset for visibility
        scrollViewRef.current.scrollTo({ 
          y: scrollOffset, 
          animated: true 
        });
      }
      
      // For FlatList, the header is always visible, but we can scroll to show the first games
      // The inventory header Y position is relative to the ListHeaderComponent
      // We'll scroll by that amount to ensure the inventory section is visible
      if (flatListRef.current && inventoryHeaderY.current > 0) {
        // For FlatList, scroll to show the inventory header area
        // Since header is always visible, we scroll by the header's internal position
        // to ensure the games list below is visible
        const scrollOffset = Math.max(0, inventoryHeaderY.current);
        flatListRef.current.scrollToOffset({ 
          offset: scrollOffset, 
          animated: true 
        });
      }
    }, 500); // Small delay to ensure games are rendered
  }, []);
  
  // Always use 3 columns to match "propose a game" layout
  const numColumns = useMemo(() => {
    return 3; // Always 3 columns - cards will be ~32% width
  }, []);
  
  // Calculate card width percentage - use slightly less than 32% to account for spacing
  // With 3 cards at 31% each = 93%, leaving 7% for 2 gaps (3.5% per gap)
  const cardWidthPercent = useMemo(() => {
    return '31%'; // Slightly less than 32% to ensure 3 cards fit per row with proper spacing
  }, []);
  
  // Responsive icon size - larger on bigger screens
  const iconSize = width > 768 ? 72 : 64;
  // First two icons are 30% larger, then 20% larger again (1.3 * 1.2 = 1.56)
  const largeIconSize = width > 768 ? Math.round(72 * 1.56) : Math.round(64 * 1.56);
  // Much larger icon for gamescanner button (2.5x base, then 40% bigger = 3.5x)
  const gamescannerIconSize = width > 768 ? Math.round(72 * 3.5) : Math.round(64 * 3.5);
  
  const userIdentifier = user?.uid || user?.id;
  console.log('[CollectionScreen] User identifier:', {
    found: !!userIdentifier,
    userId: userIdentifier,
    email: user?.email,
    userObject: user ? { uid: user.uid, id: user.id, email: user.email } : null,
  });
  
  // Memoize rawCollection to prevent infinite loops - only recalculate when collections or userIdentifier changes
  const rawCollection = useMemo(() => {
    if (!userIdentifier) {
      console.log('[CollectionScreen] No userIdentifier, returning empty collection');
      return [];
    }
    const collection = collections[userIdentifier] || [];
    console.log('[CollectionScreen] Raw collection from memo', {
      userId: userIdentifier,
      collectionLength: collection.length,
      hasCollections: !!collections[userIdentifier],
      allUserIds: Object.keys(collections),
    });
    return collection;
  }, [collections, userIdentifier]);
  console.log('[CollectionScreen] Raw collection length:', rawCollection.length, {
    userId: userIdentifier,
    email: user?.email,
  });
  
  const [bggDataCache, setBggDataCache] = useState({}); // { gameId: bggData }
  const enrichingRef = useRef(false); // Prevent concurrent enrichment
  const enrichedGameIdsRef = useRef(new Set()); // Track which games have been enriched (use ref to avoid dependency issues)
  
  // Component mount/unmount logging
  useEffect(() => {
    console.log('[CollectionScreen] Component mounted');
    
    // Retry pending game searches when screen loads
    const handlePendingRetries = async () => {
      try {
        console.log('[CollectionScreen] Checking for pending game retries...');
        const result = await retryPendingGameSearches(addGameToCollection);
        
        if (result.successCount > 0) {
          console.log('[CollectionScreen] Successfully retried', result.successCount, 'games');
          Alert.alert(
            'Games Added!',
            `We found and added ${result.successCount} game${result.successCount !== 1 ? 's' : ''} from your previous search:\n\n${result.addedGames.join(', ')}`,
            [{ text: 'OK' }]
          );
        } else if (result.failedCount > 0) {
          console.log('[CollectionScreen]', result.failedCount, 'games still pending (not found)');
        }
      } catch (error) {
        console.error('[CollectionScreen] Error retrying pending games:', error);
        // Don't show error to user - this is a background operation
      }
    };
    
    // Run retry check after a short delay to let the screen render
    const timeoutId = setTimeout(handlePendingRetries, 1000);
    
    return () => {
      clearTimeout(timeoutId);
      console.log('[CollectionScreen] Component unmounting');
    };
  }, [addGameToCollection]);

  // Helper to enrich a single game with BGG data
  const enrichGame = useCallback(async (game) => {
    const gameId = game.bggId || game.id;
    if (!gameId || enrichedGameIdsRef.current.has(gameId)) {
      return null; // Already enriched or no ID
    }

    try {
      // Check if already in cache
      if (bggDataCache[gameId]) {
        enrichedGameIdsRef.current.add(gameId);
        const cached = bggDataCache[gameId];
        if (__DEV__) {
          console.log(`[CollectionScreen] Using cached BGG data for ${gameId}:`, {
            hasThumbnail: !!cached.thumbnail,
            thumbnail: cached.thumbnail ? cached.thumbnail.substring(0, 50) + '...' : null,
          });
        }
        return cached;
      }

      const bggData = await getGames(gameId);
      if (bggData) {
        if (__DEV__) {
          console.log(`[CollectionScreen] Enriched game ${gameId} (${game.title || 'unknown'}):`, {
            hasThumbnail: !!bggData.thumbnail,
            thumbnail: bggData.thumbnail ? bggData.thumbnail.substring(0, 50) + '...' : null,
            hasImage: !!bggData.image,
            keys: Object.keys(bggData),
          });
        }
        // Update cache
        setBggDataCache(prev => ({ ...prev, [gameId]: bggData }));
        enrichedGameIdsRef.current.add(gameId);
        return bggData;
      } else {
        if (__DEV__) {
          console.warn(`[CollectionScreen] ⚠️ No BGG data returned for game ${gameId} (${game.title || 'unknown'})`);
        }
      }
    } catch (error) {
      console.error(`[CollectionScreen] Error enriching game ${gameId}:`, error);
    }
    return null;
  }, [bggDataCache]);

  // Sort collection without enrichment (fast, immediate)
  const sortedGames = useMemo(() => {
    if (!rawCollection || rawCollection.length === 0) return [];
    
    const sorted = [...rawCollection].sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      // For rating/category sort, we'll use cached BGG data if available
      // Otherwise fall back to title sort
      if (sortBy === 'rating') {
        const aId = a.bggId || a.id;
        const bId = b.bggId || b.id;
        const aBgg = aId ? bggDataCache[aId] : null;
        const bBgg = bId ? bggDataCache[bId] : null;
        const aRating = aBgg?.average ? getStarRating(aBgg.average) : 0;
        const bRating = bBgg?.average ? getStarRating(bBgg.average) : 0;
        if (aRating !== bRating) {
          return bRating - aRating;
        }
        // Fallback to title if ratings are same or unavailable
        return (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'category') {
        // Games should already have category rank fields when stored
        // Check game object first, then fall back to bggDataCache (for thumbnails only)
        const aHasCategoryRanks = a.strategyGamesRank !== undefined || a.familyGamesRank !== undefined || a.partyGamesRank !== undefined;
        const bHasCategoryRanks = b.strategyGamesRank !== undefined || b.familyGamesRank !== undefined || b.partyGamesRank !== undefined;
        const aEffective = aHasCategoryRanks ? a : (a.bggId ? bggDataCache[a.bggId] : null);
        const bEffective = bHasCategoryRanks ? b : (b.bggId ? bggDataCache[b.bggId] : null);
        const getCategory = (data) => {
          if (!data) return 'Other';
          return data.strategyGamesRank ? 'Strategy' :
                 data.familyGamesRank ? 'Family' :
                 data.partyGamesRank ? 'Party' :
                 data.wargamesRank ? 'War' :
                 data.thematicRank ? 'Thematic' :
                 data.abstractsRank ? 'Abstract' :
                 data.childrensGamesRank ? 'Children' :
                 data.cgsRank ? 'CCG' : 'Other';
        };
        const catA = getCategory(aEffective);
        const catB = getCategory(bEffective);
        if (catA !== catB) {
          return catA.localeCompare(catB);
        }
        // Within same category, sort by rating
        const aRating = aEffective?.average ? getStarRating(aEffective.average) : (a.bggRating ? getStarRating(a.bggRating) : 0);
        const bRating = bEffective?.average ? getStarRating(bEffective.average) : (b.bggRating ? getStarRating(b.bggRating) : 0);
        if (aRating !== bRating) {
          return bRating - aRating;
        }
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

    return sorted;
  }, [rawCollection, sortBy, bggDataCache]);

  // Enrich games with BGG data from cache (for thumbnails/images)
  // Categories come from game object directly (games are stored with category rank fields)
  // bggDataCache is only used for thumbnails/images, not for categories
  const enrichedGames = useMemo(() => {
    return sortedGames.map(game => {
      const gameId = game.bggId || game.id;
      const bggData = gameId ? bggDataCache[gameId] : null;
      
      // Helper to get category from rank fields (check game object first, then bggData)
      const getCategoryFromRanks = (data) => {
        if (!data) return 'Other';
        return data.strategyGamesRank ? 'Strategy' :
               data.familyGamesRank ? 'Family' :
               data.partyGamesRank ? 'Party' :
               data.wargamesRank ? 'War' :
               data.thematicRank ? 'Thematic' :
               data.abstractsRank ? 'Abstract' :
               data.childrensGamesRank ? 'Children' :
               data.cgsRank ? 'CCG' : 'Other';
      };
      
      // For categories: use game object first (games are stored with category ranks)
      // For thumbnails/images: use bggData from cache if available
      const hasCategoryRanks = game.strategyGamesRank !== undefined || game.familyGamesRank !== undefined || game.partyGamesRank !== undefined;
      const effectiveBggData = hasCategoryRanks ? game : (bggData || null);
      
      if (effectiveBggData) {
        const rating = effectiveBggData.average ? getStarRating(effectiveBggData.average) : (game.bggRating ? getStarRating(game.bggRating) : 0);
        const primaryCategory = getCategoryFromRanks(effectiveBggData);
        
        return {
          ...game,
          _bggData: bggData || effectiveBggData, // Store bggData if available, otherwise store game data
          _rating: rating,
          _primaryCategory: primaryCategory,
        };
      }
      
      return {
        ...game,
        _rating: 0,
        _primaryCategory: 'Other',
      };
    });
  }, [sortedGames, bggDataCache]);

  // Filter games by search query (client-side, works on basic title field)
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) {
      return enrichedGames;
    }
    const query = searchQuery.toLowerCase().trim();
    return enrichedGames.filter(game => {
      const title = (game.title || '').toLowerCase();
      return title.includes(query);
    });
  }, [enrichedGames, searchQuery]);

  // Lazy enrichment: Enrich games in batches
  const enrichGamesBatch = useCallback(async (gameIdsToEnrich) => {
    if (enrichingRef.current) return; // Already enriching
    if (gameIdsToEnrich.length === 0) return;

    enrichingRef.current = true;
    
    try {
      const gamesToEnrich = gameIdsToEnrich
        .map(id => rawCollection.find(g => (g.bggId || g.id) === id))
        .filter(Boolean);

      // Enrich in batches of 50 (BGG API limit) to minimize API calls
      // Conservative approach: longer delays between batches to be gentle on BGG API
      const BATCH_SIZE = 50;
      for (let i = 0; i < gamesToEnrich.length; i += BATCH_SIZE) {
        const batch = gamesToEnrich.slice(i, i + BATCH_SIZE);
        
        // Enrich all games in batch and collect results
        const enrichResults = await Promise.all(
          batch.map(async (game) => {
            const gameId = game.bggId || game.id;
            if (!gameId || enrichedGameIdsRef.current.has(gameId)) {
              return null; // Already enriched or no ID
            }

            try {
              // Check if already in cache
              if (bggDataCache[gameId]) {
                enrichedGameIdsRef.current.add(gameId);
                return { gameId, bggData: bggDataCache[gameId] };
              }

              const bggData = await getGames(gameId);
              if (bggData) {
                enrichedGameIdsRef.current.add(gameId);
                return { gameId, bggData };
              }
            } catch (error) {
              console.error(`[CollectionScreen] Error enriching game ${gameId}:`, error);
            }
            return null;
          })
        );

        // Batch update cache once per batch to reduce re-renders
        const cacheUpdates = enrichResults
          .filter(result => result !== null)
          .reduce((acc, { gameId, bggData }) => {
            acc[gameId] = bggData;
            return acc;
          }, {});

        if (Object.keys(cacheUpdates).length > 0) {
          setBggDataCache(prev => ({ ...prev, ...cacheUpdates }));
        }
        
        // Conservative delay between batches (3 seconds) to be gentle on BGG API
        if (i + BATCH_SIZE < gamesToEnrich.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    } catch (error) {
      console.error('[CollectionScreen] Error in enrichGamesBatch:', error);
    } finally {
      enrichingRef.current = false;
    }
  }, [rawCollection, bggDataCache]);

  // Handle visible items changed for lazy enrichment
  // Conservative: Only enrich visible items + one page ahead (since we have pagination)
  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length === 0) return;
    
    // Enrich visible items
    const gameIdsToEnrich = viewableItems
      .map(({ item }) => item?.bggId || item?.id)
      .filter(id => id && !enrichedGameIdsRef.current.has(id));
    
    if (gameIdsToEnrich.length > 0) {
      // Pre-enrich only one page ahead (conservative - respect BGG API)
      // With 3 columns and ~6 rows visible = ~18 items per "page"
      const maxIndex = Math.max(...viewableItems.map(v => v.index || 0), 0);
      const itemsPerPage = 18; // Conservative estimate: 3 cols × 6 rows
      const nextPageStart = maxIndex + 1;
      const nextPageEnd = nextPageStart + itemsPerPage;
      
      const preEnrichGames = sortedGames.slice(nextPageStart, nextPageEnd);
      const preEnrichIds = preEnrichGames
        .map(g => g.bggId || g.id)
        .filter(id => id && !enrichedGameIdsRef.current.has(id));
      
      const allIdsToEnrich = [...new Set([...gameIdsToEnrich, ...preEnrichIds])];
      if (allIdsToEnrich.length > 0) {
        enrichGamesBatch(allIdsToEnrich);
      }
    }
  }, [sortedGames, enrichGamesBatch]);

  // Check if we have category data - games should already have category rank fields when stored
  const hasCategoryData = useMemo(() => {
    if (sortBy !== 'category' || sortedGames.length === 0) return true;
    
    // Check if games have category rank fields (they should be stored with games from import)
    const gamesWithCategories = sortedGames.filter(game => 
      game.strategyGamesRank !== undefined || 
      game.familyGamesRank !== undefined || 
      game.partyGamesRank !== undefined ||
      game.wargamesRank !== undefined ||
      game.thematicRank !== undefined ||
      game.abstractsRank !== undefined ||
      game.childrensGamesRank !== undefined ||
      game.cgsRank !== undefined
    );
    
    // If at least 10% of games have category data, we can determine categories
    return gamesWithCategories.length >= Math.min(10, sortedGames.length * 0.1);
  }, [sortedGames, sortBy]);

  // Determine categories immediately - games should already have category rank fields
  useEffect(() => {
    if (sortedGames.length === 0) {
      setCategoriesDetermined(false);
      return;
    }

    // If we're in category view, check if we have category data
    if (sortBy === 'category' && selectedCategory === null) {
      // Games should already have category rank fields when stored
      // Mark as determined immediately if we have category data
      setCategoriesDetermined(hasCategoryData);
      return;
    }

    // For non-category view, mark as determined
    if (sortBy !== 'category') {
      setCategoriesDetermined(true);
    }
  }, [sortedGames, sortBy, selectedCategory, hasCategoryData]);

  // Group games by category when sortBy is 'category'
  const gamesByCategory = useMemo(() => {
    if (sortBy !== 'category') {
      return {};
    }

    const grouped = {};
    ALL_CATEGORIES.forEach(cat => {
      grouped[cat] = [];
    });
    // Add "Uncategorized" group for games without category data
    grouped['Uncategorized'] = [];

    // Use filteredGames instead of sortedCollection to respect search query
    filteredGames.forEach(game => {
      const category = game._primaryCategory || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(game);
    });

    // Sort each category based on user preference
    [...ALL_CATEGORIES, 'Uncategorized'].forEach(cat => {
      const games = grouped[cat] || [];
      const sortMode = categorySortPreference[cat] || 'rating';
      
      games.sort((a, b) => {
        if (sortMode === 'rating') {
          const aRating = a._rating || 0;
          const bRating = b._rating || 0;
          if (aRating !== bRating) {
            return bRating - aRating;
          }
          // Fallback to title sort if ratings are same
          return (a.title || '').localeCompare(b.title || '');
        } else {
          // title sort (A-Z)
          return (a.title || '').localeCompare(b.title || '');
        }
      });
    });

    return grouped;
  }, [filteredGames, sortBy, categorySortPreference]);

  // Enrich games for thumbnails (not for category determination - games already have categories)
  useEffect(() => {
    if (sortedGames.length === 0) return;

    // For category view with selected category, enrich games in that category
    if (sortBy === 'category' && selectedCategory !== null && gamesByCategory) {
      const categoryGames = gamesByCategory[selectedCategory] || [];
      if (categoryGames.length === 0) return;

      // Enrich first page of games for thumbnails
      const itemsPerPage = 18; // 3 cols × 6 rows
      const gamesToEnrich = categoryGames.slice(0, itemsPerPage);
      const gameIdsToEnrich = gamesToEnrich
        .map(g => g.bggId || g.id)
        .filter(id => id && !enrichedGameIdsRef.current.has(id));

      if (gameIdsToEnrich.length > 0) {
        // Small delay to avoid conflicts
        const enrichmentTimer = setTimeout(() => {
          enrichGamesBatch(gameIdsToEnrich);
        }, 500);

        return () => clearTimeout(enrichmentTimer);
      }
    } else if (sortBy !== 'category') {
      // For non-category views (rating/title), enrich first page for thumbnails
      const itemsPerPage = 18; // 3 cols × 6 rows
      const initialEnrichCount = 10; // Only 10 games initially for faster load
      const gamesToEnrich = sortedGames.slice(0, initialEnrichCount);
      const gameIdsToEnrich = gamesToEnrich
        .map(g => g.bggId || g.id)
        .filter(id => id && !enrichedGameIdsRef.current.has(id));

      if (gameIdsToEnrich.length > 0) {
        // Delay to avoid conflicts with import process
        const enrichmentTimer = setTimeout(() => {
          enrichGamesBatch(gameIdsToEnrich);
        }, 2000);

        return () => clearTimeout(enrichmentTimer);
      }
    }
  }, [sortedGames, sortBy, selectedCategory, gamesByCategory, enrichGamesBatch]);

  // Reset categoriesDetermined when sortBy changes to category
  useEffect(() => {
    if (sortBy === 'category') {
      setCategoriesDetermined(false);
    } else {
      setCategoriesDetermined(true);
    }
  }, [sortBy]);

  // Toggle category sort preference
  const toggleCategorySort = useCallback((category) => {
    setCategorySortPreference(prev => {
      const current = prev[category] || 'rating';
      return {
        ...prev,
        [category]: current === 'rating' ? 'title' : 'rating'
      };
    });
  }, []);

  const handleAddToCollection = (gameData) => {
    console.log('[CollectionScreen] handleAddToCollection called for:', gameData.title || gameData.id);
    if (userIdentifier) {
      try {
        addGameToCollection(userIdentifier, gameData);
        // Don't show alert for each game - too many alerts
        // The user will see the games in their collection
      } catch (addError) {
        console.error('[CollectionScreen] Error in addGameToCollection:', addError);
        throw addError;
      }
    } else {
      console.warn('[CollectionScreen] handleAddToCollection: No userIdentifier');
    }
  };

  const handleRemoveFromCollection = (gameId) => {
    console.log('[CollectionScreen] handleRemoveFromCollection called for:', gameId);
    if (userIdentifier) {
      removeGameFromCollection(userIdentifier, gameId);
    } else {
      console.warn('[CollectionScreen] handleRemoveFromCollection: No userIdentifier');
    }
  };

  const handleDoneIdentifying = () => {
    console.log('[CollectionScreen] handleDoneIdentifying called');
    // After identifying games, close results modal
    setShowResultsModal(false);
  };

  const handleOpenCamera = () => {
    console.log('[CollectionScreen] handleOpenCamera called');
    setShowCameraModal(true);
  };

  const handleCameraModalClose = () => {
    console.log('[CollectionScreen] handleCameraModalClose called');
    setShowCameraModal(false);
    // Don't open results modal - games will be shown in the camera modal itself
  };

  const handleResultsModalClose = () => {
    console.log('[CollectionScreen] handleResultsModalClose called');
    setShowResultsModal(false);
  };

  const handleDeleteGame = useCallback((gameId) => {
    console.log('[CollectionScreen] handleDeleteGame called for:', gameId);
    Alert.alert(
      'Delete Game?',
      'Are you sure you want to remove this game from your collection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (userIdentifier) {
              removeGameFromCollection(userIdentifier, gameId);
            }
          },
        },
      ]
    );
  }, [userIdentifier, removeGameFromCollection]);

  // Show menu when no specific view is active
  const showMenu = activeView === 'menu';

  // AI Camera Scanner Button - vertical layout with large gamescanner icon
  const renderInventoryButton = () => (
    <Pressable
      style={styles.menuOption}
      onPress={handleOpenCamera}
    >
      <View style={styles.gamescannerButtonContent}>
        <Image 
          source={require('../../assets/images/gamescanner.png')}
          style={[styles.gamescannerIcon, { width: gamescannerIconSize, height: gamescannerIconSize }]}
          resizeMode="contain"
        />
        <Text style={styles.gamescannerButtonTitle}>Import game titles with Image recognition</Text>
      </View>
    </Pressable>
  );

  // Text List Import Button
  const renderTextListButton = () => (
    <Pressable
      style={styles.menuOption}
      onPress={() => setShowTextListModal(true)}
    >
      <View style={styles.menuOptionContent}>
        <Text style={styles.menuOptionIcon}>📝</Text>
        <View style={styles.menuOptionText}>
          <Text style={styles.menuOptionTitle}>Import game titles by typing or dictating, or pasting them from another source</Text>
        </View>
        <Text style={styles.menuOptionArrow}>→</Text>
      </View>
    </Pressable>
  );

  const renderHeader = () => {
    console.log('[CollectionScreen] renderHeader called');
    
    // Calculate logo width to fit screen with comfortable margins (40px on each side)
    const logoContainerWidth = Math.max(width - 80, 200); // Min 200px, max screen width - 80px margins
    
    console.log('[CollectionScreen] renderHeader: rendering header content');
    return (
      <>
        <View style={styles.bggLogoTopContainer}>
          <PoweredByBGG size="auto" containerWidth={logoContainerWidth} />
        </View>
        <View style={styles.menuContainer}>
          <Text style={styles.menuTitle}>
            {filteredGames.length === 0 
              ? 'Please choose a method to create a games inventory. A games inventory will allow your group members to see what you have in common and discuss what to play at the next get-together.'
              : 'Add more games to your collection using any of these methods:'}
          </Text>
          
          {renderInventoryButton()}

          <Text style={styles.orDivider}>OR</Text>

          {renderTextListButton()}

          <Text style={styles.orDivider}>OR</Text>

          <Pressable
            style={styles.menuOption}
            onPress={() => {
              if (filteredGames.length > 0) {
                setShowBGGImportModal(true);
              } else {
                setActiveView('import');
              }
            }}
          >
            <View style={styles.menuOptionContent}>
              <Image 
                source={require('../../assets/images/BGGDownload.png')}
                style={[styles.menuOptionImageIcon, { width: iconSize, height: iconSize }]}
                resizeMode="contain"
              />
              <View style={styles.menuOptionText}>
                <Text style={styles.menuOptionTitle}>Import by Board Game Geek Username</Text>
              </View>
              <Text style={styles.menuOptionArrow}>→</Text>
            </View>
          </Pressable>
        </View>

        {/* Inventory title will be shown by GameCollectionView */}

        {filteredGames.length === 0 && loading && (
          <View style={styles.emptyCollection}>
            <Text style={styles.emptyTitle}>Loading your games...</Text>
            <ActivityIndicator size="large" color={theme.colors.meepleRed} style={{ marginTop: 20 }} />
          </View>
        )}
      </>
    );
  };

  // Memoize header component to prevent re-renders
  // Always show import methods, even when games exist
  const headerComponent = useMemo(() => {
    console.log('[CollectionScreen] Creating headerComponent with useMemo', { filteredGamesLength: filteredGames.length });
    // Always show the import menu, regardless of showMenu state
    return renderHeader();
  }, [filteredGames.length, width, iconSize, gamescannerIconSize]);

  const renderGameCard = useCallback(({ item }) => {
    const hasBggData = !!item._bggData;
    const hasThumbnail = !!(item._bggData?.thumbnail || item.bggThumbnail || item.thumbnail);
    console.log('[CollectionScreen] renderGameCard called for:', item.title || item.id, 'has_bggData:', hasBggData, 'hasThumbnail:', hasThumbnail, 'bggId:', item.bggId);
    if (hasBggData && !hasThumbnail) {
      console.log('[CollectionScreen] ⚠️ Game has BGG data but no thumbnail:', {
        title: item.title,
        bggId: item.bggId,
        bggDataKeys: item._bggData ? Object.keys(item._bggData) : [],
        hasThumbnailInBggData: !!item._bggData?.thumbnail,
        thumbnailValue: item._bggData?.thumbnail ? item._bggData.thumbnail.substring(0, 50) + '...' : null,
        hasThumbnailInGame: !!(item.bggThumbnail || item.thumbnail),
      });
    }
    try {
      // Calculate card width for FlatList - account for padding and gaps
      const containerPadding = theme.spacing.md;
      const gap = theme.spacing.md;
      const rowPadding = theme.spacing.xs * 2; // padding on both sides of row
      const totalPadding = containerPadding * 2 + rowPadding;
      const totalGaps = gap * (numColumns - 1);
      const availableWidth = width - totalPadding - totalGaps;
      const cardWidthPixels = availableWidth / numColumns;
      
      // Pass the already-loaded BGG data to avoid redundant API calls
      // Use item directly - React.memo in GameCard will handle prop comparison
      // Pass the current user's ID as the game owner since this is their collection
      return (
        <View style={{ width: cardWidthPixels }}>
          <GameCard 
            game={item} 
            onDelete={handleDeleteGame}
            preloadedBggData={item._bggData}
            inGrid={true}
          />
        </View>
      );
    } catch (error) {
      console.error('[CollectionScreen] Error rendering GameCard for:', item.title || item.id, 'error:', error, 'stack:', error.stack);
      return null;
    }
  }, [handleDeleteGame, userIdentifier, numColumns, width]);

  // Render category header with sort toggle
  const renderCategoryHeader = useCallback((category, gameCount) => {
    const sortMode = categorySortPreference[category] || 'rating';
    return (
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryTitle}>
          {category} ({gameCount})
        </Text>
        {gameCount > 0 && (
          <View style={styles.categorySortToggleContainer}>
            <Pressable
              style={[styles.categorySortToggleOption, sortMode === 'rating' && styles.categorySortToggleOptionActive]}
              onPress={() => setCategorySortPreference(prev => ({ ...prev, [category]: 'rating' }))}
            >
              <Text style={[styles.categorySortToggleOptionText, sortMode === 'rating' && styles.categorySortToggleOptionTextActive]}>
                ⭐ Rating
              </Text>
            </Pressable>
            <Pressable
              style={[styles.categorySortToggleOption, sortMode === 'title' && styles.categorySortToggleOptionActive]}
              onPress={() => setCategorySortPreference(prev => ({ ...prev, [category]: 'title' }))}
            >
              <Text style={[styles.categorySortToggleOptionText, sortMode === 'title' && styles.categorySortToggleOptionTextActive]}>
                A-Z
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }, [categorySortPreference]);

  // Render category filter buttons
  const renderCategoryButtons = useCallback(() => {
    // Calculate counts for each category
    const categoryCounts = {};
    [...ALL_CATEGORIES, 'Uncategorized'].forEach(cat => {
      categoryCounts[cat] = (gamesByCategory[cat] || []).length;
    });

    return (
      <View style={styles.categoryButtonsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryButtonsScrollContent}
        >
          {[...ALL_CATEGORIES, 'Uncategorized'].map((category) => {
            const count = categoryCounts[category];
            if (count === 0) return null; // Don't show categories with 0 games
            return (
              <Pressable
                key={category}
                style={[styles.categoryButton, selectedCategory === category && styles.categoryButtonActive]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[styles.categoryButtonText, selectedCategory === category && styles.categoryButtonTextActive]}>
                  {category} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }, [gamesByCategory, selectedCategory]);

  // Render games grouped by category (filtered by selectedCategory)
  const renderGamesByCategory = useCallback(() => {
    // Show loading state while determining categories
    if (!categoriesDetermined && sortBy === 'category') {
      return (
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.categoryContent}
          showsVerticalScrollIndicator={true}
        >
          {renderHeader()}
          <View style={styles.emptyCollection}>
            <Text style={styles.emptyTitle}>Loading categories...</Text>
            <ActivityIndicator size="large" color={theme.colors.meepleRed} style={{ marginTop: 20 }} />
            <Text style={styles.emptyText}>
              Organizing your games into categories. This may take a moment.
            </Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.categoryContent}
        showsVerticalScrollIndicator={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {renderHeader()}
        {renderCategoryButtons()}

        {selectedCategory === null ? (
          // No category selected - show empty state prompting user to select a category
          <View style={styles.emptyCollection}>
            <Text style={styles.emptyTitle}>Select a category to view games</Text>
            <Text style={styles.emptyText}>
              Choose a category from the buttons above to load and view your games.
            </Text>
          </View>
        ) : (
          // Show games for selected category
          (() => {
            const games = gamesByCategory[selectedCategory] || [];
            return (
              <View style={styles.categorySection}>
                {renderCategoryHeader(selectedCategory, games.length)}
                {games.length > 0 ? (
                  <View style={styles.categoryGamesGrid}>
                    {games.map((game, index) => (
                      <View 
                        key={`${game.id || game.bggId || 'game'}-${index}`} 
                        style={styles.gameCardWrapper}
                      >
                        {renderGameCard({ item: game })}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyCategoryText}>No games in this category</Text>
                )}
              </View>
            );
          })()
        )}
      </ScrollView>
    );
  }, [gamesByCategory, renderCategoryHeader, renderGameCard, renderHeader, renderCategoryButtons, selectedCategory, categoriesDetermined, sortBy]);

  console.log('[CollectionScreen] Render state:', {
    showMenu,
    activeView,
    filteredGamesLength: filteredGames.length,
    rawCollectionLength: rawCollection.length,
    userIdentifier: userIdentifier ? 'present' : 'missing'
  });

  // Show loading spinner only if:
  // 1. Collections haven't initialized yet, OR
  // 2. We're loading AND there's no cached data for this user
  // This allows cached games to show immediately while Firestore syncs in background
  const hasCachedGames = userIdentifier && (collections[userIdentifier]?.length > 0);
  const shouldShowLoading = !initialised || (loading && !hasCachedGames);
  
  console.log('[CollectionScreen] Loading state check', {
    initialised,
    loading,
    hasCachedGames,
    shouldShowLoading,
    userId: userIdentifier,
    email: user?.email,
    collectionsKeys: Object.keys(collections),
    userCollectionLength: userIdentifier ? (collections[userIdentifier]?.length || 0) : 0,
  });
  
  if (shouldShowLoading) {
    console.log('[CollectionScreen] Showing loading spinner');
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showMenu && filteredGames.length > 0 ? (
        (() => {
          console.log('[CollectionScreen] Rendering GameCollectionView', {
            rawCollectionLength: rawCollection.length,
            filteredGamesLength: filteredGames.length,
            hasHeaderComponent: !!headerComponent,
          });
          return (
            <GameCollectionView
              games={rawCollection}
              onGameDelete={handleDeleteGame}
              usePagination={false}
              defaultSortBy="category"
              availableSorts={['rating', 'category', 'title']}
              showSearch={true}
              showSortOptions={true}
              headerTitle={`Your Games Inventory: ${rawCollection.length.toLocaleString()} games`}
              headerComponent={headerComponent}
            />
          );
        })()
      ) : (
        (() => {
          console.log('[CollectionScreen] Rendering ScrollView (no games or not menu)');
          return (
            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={true}
              onLayout={() => {
                console.log('[CollectionScreen] ScrollView onLayout called');
              }}
              onContentSizeChange={(width, height) => {
                console.log('[CollectionScreen] ScrollView content size changed:', width, 'x', height);
              }}
            >
              {showMenu && (
                <>
                  <View style={styles.bggLogoTopContainer}>
                    <PoweredByBGG size="auto" containerWidth={Math.max(width - 80, 200)} />
                  </View>
                  <View style={styles.menuContainer}>
                    <Text style={styles.menuTitle}>
                      Please choose a method to create a games inventory. A games inventory will allow your meepleup friends to see what you have in common and discuss what to play at the next get-together.
                    </Text>
                    
                    {renderInventoryButton()}

                    <Text style={styles.orDivider}>OR</Text>

                    {renderTextListButton()}

                    <Text style={styles.orDivider}>OR</Text>

                    <Pressable
                      style={styles.menuOption}
                      onPress={() => {
                        if (filteredGames.length > 0) {
                          setShowBGGImportModal(true);
                        } else {
                          setActiveView('import');
                        }
                      }}
                    >
                      <View style={styles.menuOptionContent}>
                        <Image 
                          source={require('../../assets/images/BGGDownload.png')}
                          style={[styles.menuOptionImageIcon, { width: iconSize, height: iconSize }]}
                          resizeMode="contain"
                        />
                        <View style={styles.menuOptionText}>
                          <Text style={styles.menuOptionTitle}>Import existing BGG collection titles</Text>
                        </View>
                        <Text style={styles.menuOptionArrow}>→</Text>
                      </View>
                    </Pressable>
                  </View>

              {filteredGames.length === 0 && loading && (
                <View style={styles.emptyCollection}>
                  <Text style={styles.emptyTitle}>Loading your games...</Text>
                  <ActivityIndicator size="large" color={theme.colors.meepleRed} style={{ marginTop: 20 }} />
                </View>
              )}
            </>
          )}

          {activeView === 'import' && (
            <View style={styles.viewContent}>
              <View style={styles.viewHeader}>
                <Pressable
                  style={styles.backButton}
                  onPress={() => {
                    console.log('[CollectionScreen] Back button pressed, switching to menu');
                    setActiveView('menu');
                  }}
                >
                  <Text style={styles.backButtonText}>← Back</Text>
                </Pressable>
                <Text style={styles.viewTitle}>Import from BGG</Text>
              </View>
              <View style={styles.tabContent}>
                <BGGImport
                  onImportComplete={(count) => {
                    console.log('[CollectionScreen] BGGImport onImportComplete, count:', count);
                    // Games will automatically appear in the inventory section
                    if (count > 0) {
                      setActiveView('menu');
                      // Scroll to inventory after import completes
                      scrollToInventory();
                    }
                  }}
                />
              </View>
            </View>
          )}
            </ScrollView>
          );
        })()
      )}

      {/* Camera and Results Modals */}
      <ClaudeGameIdentifier 
        onAddToCollection={handleAddToCollection}
        onRemoveFromCollection={handleRemoveFromCollection}
        onDone={() => {
          handleDoneIdentifying();
          // Scroll to inventory after import completes
          scrollToInventory();
        }}
        showCameraModal={showCameraModal}
        showResultsModal={showResultsModal}
        onCameraModalClose={handleCameraModalClose}
        onResultsModalClose={handleResultsModalClose}
      />

      {/* Text List Import Modal */}
      <TextListGameIdentifier
        onAddToCollection={handleAddToCollection}
        onRemoveFromCollection={handleRemoveFromCollection}
        onDone={() => {
          setShowTextListModal(false);
          // Scroll to inventory after import completes
          scrollToInventory();
        }}
        showModal={showTextListModal}
        onModalClose={() => setShowTextListModal(false)}
      />

      {/* BGG Import Modal - accessible even when games exist */}
      <Modal
        isOpen={showBGGImportModal}
        onClose={() => setShowBGGImportModal(false)}
        title="Import from BGG"
      >
        <BGGImport
          onImportComplete={(count) => {
            console.log('[CollectionScreen] BGGImport onImportComplete, count:', count);
            if (count > 0) {
              setShowBGGImportModal(false);
              // Scroll to inventory after import completes
              scrollToInventory();
            }
          }}
        />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgColor,
  },
  scrollView: {
    flex: 1,
  },
  bggLogoTopContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  menuContainer: {
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.sm,
  },
  menuTitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
    marginBottom: theme.spacing['2xl'],
    paddingHorizontal: theme.spacing.xs,
    textAlign: 'left',
  },
  orDivider: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginVertical: theme.spacing.lg,
  },
  menuOption: {
    ...commonStyles.card,
    borderRadius: 0, // Cards should have no rounded corners
    marginBottom: theme.spacing.lg,
    marginHorizontal: theme.spacing.md,
    // borderWidth and borderColor already set in commonStyles.card
  },
  menuOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuOptionContentMinimalPadding: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.xs,
  },
  menuOptionIcon: {
    fontSize: theme.typography.fontSize['2xl'],
    marginRight: theme.spacing.lg,
  },
  menuOptionImageIcon: {
    marginRight: theme.spacing.lg,
    // width and height will be set dynamically
  },
  menuOptionText: {
    flex: 1,
  },
  menuOptionTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  menuOptionDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  menuOptionArrow: {
    fontSize: theme.typography.fontSize.xl,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.md,
  },
  // Gamescanner button - vertical layout
  gamescannerButtonContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 12,
    paddingHorizontal: 0,
    gap: 12,
  },
  gamescannerIcon: {
    width: 32,
    height: 32,
  },
  gamescannerButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  viewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.medium,
  },
  viewTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  viewContent: {
    flex: 1,
    paddingBottom: 0,
  },
  sortContainer: {
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.xs,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flex: 1,
  },
  aiInventoryButton: {
    paddingHorizontal: 14,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.meepleRed,
    alignSelf: 'flex-start',
  },
  aiInventoryButtonText: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  sortButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.surfaceColor,
  },
  sortButtonActive: {
    borderColor: theme.colors.meepleRed,
    backgroundColor: theme.colors.woodLight,
  },
  sortButtonText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  sortButtonTextActive: {
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  content: {
    padding: theme.spacing.xl,
  },
  headerContainer: {
    padding: theme.spacing.xl,
    paddingBottom: 0,
  },
  tabContent: {
    minHeight: 400,
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
  },
  emptyCollection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing['2xl'],
    paddingHorizontal: theme.spacing.xl,
  },
  listContainer: {
    paddingBottom: 10,
    paddingHorizontal: theme.spacing.md,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  gameCard: {
    ...commonStyles.card,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  gameCardImage: {
    width: '100%',
    height: 200,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholder: {
    color: theme.colors.textSecondary,
  },
  gameCardInfo: {
    gap: theme.spacing.xs,
  },
  gameCardTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  gameCardMeta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  gameCardBarcode: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  inventorySection: {
    marginTop: theme.spacing['2xl'],
    paddingTop: theme.spacing['2xl'],
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
  },
  inventoryHeader: {
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
  },
  inventoryTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  searchContainer: {
    marginBottom: theme.spacing.md,
  },
  searchInput: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.meepleRed,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    fontWeight: theme.typography.fontWeight.medium,
  },
  searchResultCount: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontStyle: 'italic',
  },
  categoryContent: {
    paddingBottom: 10,
  },
  categorySection: {
    marginBottom: theme.spacing['2xl'],
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.meepleRed,
    marginBottom: theme.spacing.md,
  },
  categoryTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  categorySortToggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    padding: 2,
    gap: 0,
  },
  categorySortToggleOption: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  categorySortToggleOptionActive: {
    backgroundColor: theme.colors.meepleRed,
  },
  categorySortToggleOptionText: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  categorySortToggleOptionTextActive: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  categoryGamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  gameCardWrapper: {
    width: '32%', // Fixed width to match BrowseAndProposeScreen exactly
    flexBasis: '32%', // Ensure flex respects the width
    flexShrink: 0, // Prevent cards from shrinking
    flexGrow: 0, // Prevent cards from growing
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  emptyCategoryText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
  },
  categoryButtonsContainer: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    marginBottom: theme.spacing.md,
  },
  categoryButtonsScrollContent: {
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.woodLight,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    marginRight: theme.spacing.sm,
  },
  categoryButtonActive: {
    backgroundColor: theme.colors.meepleRed,
    borderColor: theme.colors.meepleRed,
  },
  categoryButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  categoryButtonTextActive: {
    color: '#fff',
    fontWeight: theme.typography.fontWeight.semibold,
  },
});

export default CollectionScreen;
