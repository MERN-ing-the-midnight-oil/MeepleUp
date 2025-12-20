import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Image, useWindowDimensions, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import Button from '../components/common/Button';
import ClaudeGameIdentifier from '../components/ClaudeGameIdentifier';
import TextListGameIdentifier from '../components/TextListGameIdentifier';
import GameCard from '../components/GameCard';
import BGGImport from '../components/BGGImport';
import { getGameById } from '../services/gameDatabase';
import { getGameDetails } from '../utils/api';
import { getStarRating } from '../utils/gameBadges';
import { theme, commonStyles } from '../utils/theme';
import { getColumnCount } from '../utils/responsive';
// Note: BarcodeScanner has been archived (see src/archive/barcode-scanner/)
// BGGImport will need to be converted separately if needed

// All game categories in order
const ALL_CATEGORIES = ['Strategy', 'Family', 'Party', 'War', 'Thematic', 'Abstract', 'Children', 'CCG', 'Other'];

const CollectionScreen = () => {
  console.log('[CollectionScreen] Component rendering');
  
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { collections, getUserCollection, addGameToCollection, removeGameFromCollection, updateGameInCollection } = useCollections();
  const [activeView, setActiveView] = useState('menu'); // 'menu', 'import'
  const [sortBy, setSortBy] = useState('category'); // 'rating', 'category', 'title'
  const [categorySortPreference, setCategorySortPreference] = useState({}); // { 'Strategy': 'rating' | 'title', ... }
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showTextListModal, setShowTextListModal] = useState(false);
  
  // Refs to maintain scroll position when sort changes
  const flatListRef = useRef(null);
  const scrollViewRef = useRef(null);
  const scrollPositionRef = useRef(0);
  
  // Handler to change sort while preserving scroll position
  const handleSortChange = useCallback((newSortBy) => {
    // Update sort - scroll position is already tracked in scrollPositionRef via onScroll
    setSortBy(newSortBy);
  }, []);
  
  // Restore scroll position after sort changes
  useEffect(() => {
    // Only restore if we have a saved position > 0 (not at top)
    if (scrollPositionRef.current <= 0) return;
    
    // Use requestAnimationFrame to ensure layout has updated
    requestAnimationFrame(() => {
      // Use a small delay to ensure content has rendered
      setTimeout(() => {
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
      }, 100);
    });
  }, [sortBy]);
  
  // Track scroll position
  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
    if (offsetY >= 0) {
      scrollPositionRef.current = offsetY;
    }
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
  console.log('[CollectionScreen] User identifier:', userIdentifier ? 'found' : 'missing');
  
  // Memoize rawCollection to prevent infinite loops - only recalculate when collections or userIdentifier changes
  const rawCollection = useMemo(() => {
    if (!userIdentifier) return [];
    const collection = collections[userIdentifier] || [];
    return collection;
  }, [collections, userIdentifier]);
  console.log('[CollectionScreen] Raw collection length:', rawCollection.length);
  
  const [sortedCollection, setSortedCollection] = useState([]);
  
  // Component mount/unmount logging
  useEffect(() => {
    console.log('[CollectionScreen] Component mounted');
    return () => {
      console.log('[CollectionScreen] Component unmounting');
    };
  }, []);

  // Load BGG data and sort collection
  useEffect(() => {
    console.log('[CollectionScreen] loadAndSort effect triggered, rawCollection.length:', rawCollection.length, 'sortBy:', sortBy);
    
    const loadAndSort = async () => {
      try {
        console.log('[CollectionScreen] Starting loadAndSort, processing', rawCollection.length, 'games');
        
        const enrichedGames = await Promise.all(
          rawCollection.map(async (game, index) => {
            console.log(`[CollectionScreen] Processing game ${index + 1}/${rawCollection.length}:`, game.title || game.id);
            
            // Check if game needs backfill (missing thumbnails/images)
            // We always fetch BGG data for rating/category display, but only do expensive operations if needed
            const hasThumbnail = !!(game.thumbnail || game.bggThumbnail);
            const hasImage = !!game.image;
            const needsBackfill = !hasThumbnail || !hasImage;
            
            // Fetch BGG data for rating/category display, but optimize based on what's needed
            let bggData = null;
            let foundBggId = game.bggId;
            
            // If game already has thumbnail and image, we can skip BGG fetch entirely
            // (unless we need it for rating/category - but that's optional)
            if (game.bggId && needsBackfill) {
              try {
                console.log(`[CollectionScreen] Fetching BGG data for game ${index + 1}, bggId:`, game.bggId, 'needsBackfill:', needsBackfill);
                // Use getGameDetails to ensure we get full-size images from BGG API
                // This will fetch from Firestore first, then BGG API if image is missing
                bggData = await getGameDetails(game.bggId);
                if (!bggData) {
                  console.log(`[CollectionScreen] Game ${index + 1} (${game.title || game.id}) - getGameDetails returned null for bggId:`, game.bggId);
                }
              } catch (error) {
                console.error(`[CollectionScreen] Error loading BGG data for game ${index + 1} (${game.title || game.id}):`, error);
              }
            } else if (!game.bggId && game.title && game.title !== 'Unknown Game' && needsBackfill) {
              // Only search for BGG ID if we need thumbnails/images (backfill)
              // Don't search just to add bggId if thumbnails already exist
              try {
                console.log(`[CollectionScreen] Game ${index + 1} (${game.title || game.id}) - no bggId, searching BGG by title for backfill`);
                const { searchGamesByName } = await import('../utils/api');
                const searchResults = await searchGamesByName(game.title, true);
                if (searchResults && searchResults.length > 0) {
                  // Use the first (most relevant) result
                  const match = searchResults[0];
                  foundBggId = match.id;
                  console.log(`[CollectionScreen] Found BGG match for "${game.title}": bggId=${foundBggId}`);
                  
                  // Get full details
                  bggData = await getGameDetails(foundBggId);
                  
                  // Update game with bggId if we found one
                  if (foundBggId && userIdentifier && game.id) {
                    try {
                      await updateGameInCollection(userIdentifier, game.id, { bggId: foundBggId });
                      console.log(`[CollectionScreen] Added bggId to game ${game.title || game.id}`);
                    } catch (updateError) {
                      console.warn(`[CollectionScreen] Failed to add bggId to game ${game.title || game.id}:`, updateError);
                    }
                  }
                } else {
                  console.log(`[CollectionScreen] No BGG match found for "${game.title}"`);
                }
              } catch (searchError) {
                console.warn(`[CollectionScreen] Error searching BGG for game "${game.title}":`, searchError);
              }
            } else if (game.bggId && !needsBackfill) {
              // Game has thumbnails/images, but we still need BGG data for rating/category
              // This should be fast if cached in Firestore
              try {
                bggData = await getGameDetails(game.bggId);
                if (bggData) {
                  console.log(`[CollectionScreen] Game ${index + 1} (${game.title || game.id}) - fetched BGG data for rating/category (cached)`);
                }
              } catch (error) {
                // Non-critical - game will display without rating/category
                console.warn(`[CollectionScreen] Could not fetch BGG data for rating (non-critical):`, error);
              }
            }
            
            if (bggData) {
              const rating = bggData.average ? getStarRating(bggData.average) : 0;
              // Get primary category from badges (first one found)
              const primaryCategory = bggData.strategyGamesRank ? 'Strategy' :
                                    bggData.familyGamesRank ? 'Family' :
                                    bggData.partyGamesRank ? 'Party' :
                                    bggData.wargamesRank ? 'War' :
                                    bggData.thematicRank ? 'Thematic' :
                                    bggData.abstractsRank ? 'Abstract' :
                                    bggData.childrensGamesRank ? 'Children' :
                                    bggData.cgsRank ? 'CCG' : 'Other';
              console.log(`[CollectionScreen] Game ${index + 1} (${game.title || game.id}) enriched, rating:`, rating, 'category:', primaryCategory, 'bggId:', foundBggId, 'hasThumbnail:', !!bggData.thumbnail, 'hasImage:', !!bggData.image);
              
              // Backfill missing thumbnails/images for older games
              const needsThumbnailUpdate = bggData.thumbnail && !game.thumbnail && !game.bggThumbnail;
              const needsImageUpdate = bggData.image && !game.image;
              
              if (needsThumbnailUpdate || needsImageUpdate) {
                const updates = {};
                if (needsThumbnailUpdate) {
                  updates.thumbnail = bggData.thumbnail;
                  updates.bggThumbnail = bggData.thumbnail;
                }
                if (needsImageUpdate) {
                  updates.image = bggData.image;
                }
                
                // Update in Firestore and local collection
                if (userIdentifier && game.id) {
                  try {
                    await updateGameInCollection(userIdentifier, game.id, updates);
                    console.log(`[CollectionScreen] Backfilled thumbnail/image for game ${game.title || game.id}`, {
                      thumbnail: needsThumbnailUpdate ? 'added' : 'already exists',
                      image: needsImageUpdate ? 'added' : 'already exists'
                    });
                  } catch (updateError) {
                    console.error(`[CollectionScreen] Failed to backfill thumbnail for game ${game.title || game.id}:`, updateError);
                  }
                }
              }
              
              return {
                ...game,
                ...(foundBggId && !game.bggId ? { bggId: foundBggId } : {}),
                ...(needsThumbnailUpdate ? { thumbnail: bggData.thumbnail, bggThumbnail: bggData.thumbnail } : {}),
                ...(needsImageUpdate ? { image: bggData.image } : {}),
                _bggData: bggData,
                _rating: rating,
                _primaryCategory: primaryCategory,
              };
            }
            
            // Fallback: return game without BGG data
            return {
              ...game,
              _rating: 0,
              _primaryCategory: 'Other',
            };
          })
        );

        console.log('[CollectionScreen] All games enriched, sorting by:', sortBy);
        enrichedGames.forEach((game, idx) => {
          console.log(`[CollectionScreen] Enriched game ${idx + 1}:`, game.title || game.id, 'has_bggData:', !!game._bggData);
        });

        // Sort games
        const sorted = [...enrichedGames].sort((a, b) => {
          if (sortBy === 'rating') {
            return (b._rating || 0) - (a._rating || 0); // Highest first
          } else if (sortBy === 'category') {
            const catA = a._primaryCategory || 'Other';
            const catB = b._primaryCategory || 'Other';
            if (catA !== catB) {
              return catA.localeCompare(catB);
            }
            // Within same category, sort by rating
            return (b._rating || 0) - (a._rating || 0);
          } else if (sortBy === 'title') {
            return (a.title || '').localeCompare(b.title || '');
          }
          return 0;
        });

        console.log('[CollectionScreen] Sorting complete, setting sortedCollection, length:', sorted.length);
        setSortedCollection(sorted);
        console.log('[CollectionScreen] sortedCollection state updated');
      } catch (error) {
        console.error('[CollectionScreen] Error in loadAndSort:', error);
      }
    };

    loadAndSort();
  }, [rawCollection, sortBy]);

  // Group games by category when sortBy is 'category'
  const gamesByCategory = useMemo(() => {
    if (sortBy !== 'category') {
      return {};
    }

    const grouped = {};
    ALL_CATEGORIES.forEach(cat => {
      grouped[cat] = [];
    });

    sortedCollection.forEach(game => {
      const category = game._primaryCategory || 'Other';
      if (grouped[category]) {
        grouped[category].push(game);
      } else {
        grouped['Other'].push(game);
      }
    });

    // Sort each category based on user preference
    ALL_CATEGORIES.forEach(cat => {
      const games = grouped[cat] || [];
      const sortMode = categorySortPreference[cat] || 'rating';
      
      games.sort((a, b) => {
        if (sortMode === 'rating') {
          return (b._rating || 0) - (a._rating || 0);
        } else {
          // title sort (A-Z)
          return (a.title || '').localeCompare(b.title || '');
        }
      });
    });

    return grouped;
  }, [sortedCollection, sortBy, categorySortPreference]);

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
      addGameToCollection(userIdentifier, gameData);
      // Don't show alert for each game - too many alerts
      // The user will see the games in their collection
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
    // Open results modal after camera closes (photo was captured)
    setTimeout(() => {
      setShowResultsModal(true);
    }, 300);
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

  const renderGameCard = useCallback(({ item }) => {
    console.log('[CollectionScreen] renderGameCard called for:', item.title || item.id, 'has_bggData:', !!item._bggData);
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

  // Render games grouped by category
  const renderGamesByCategory = useCallback(() => {
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
        
        <View style={styles.inventoryHeader}>
          <Text style={styles.inventoryTitle}>Your Games Inventory</Text>
        </View>

        {ALL_CATEGORIES.map((category) => {
          const games = gamesByCategory[category] || [];
          return (
            <View key={category} style={styles.categorySection}>
              {renderCategoryHeader(category, games.length)}
              {games.length > 0 ? (
                <View style={styles.categoryGamesGrid}>
                  {games.map((game, index) => (
                    <View 
                      key={game.id || `game-${index}`} 
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
        })}
      </ScrollView>
    );
  }, [gamesByCategory, renderCategoryHeader, renderGameCard, renderHeader, cardWidthPercent]);

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
          <Text style={styles.menuOptionTitle}>Type or paste your game list</Text>
          <Text style={styles.menuOptionDescription}>Let us format your list and look up your titles for you</Text>
        </View>
        <Text style={styles.menuOptionArrow}>→</Text>
      </View>
    </Pressable>
  );

  const renderHeader = () => {
    console.log('[CollectionScreen] renderHeader called, showMenu:', showMenu);
    if (!showMenu) {
      console.log('[CollectionScreen] renderHeader: showMenu is false, returning null');
      return null;
    }
    
    console.log('[CollectionScreen] renderHeader: rendering header content');
    return (
      <>
        <View style={styles.menuContainer}>
          <Text style={styles.menuTitle}>
            Please choose a method to create a games inventory. A games inventory will allow your group members to see what you have in common and discuss what to play at the next get-together.
          </Text>
          
          {renderInventoryButton()}

          <Text style={styles.orDivider}>OR</Text>

          {renderTextListButton()}

          <Text style={styles.orDivider}>OR</Text>

          <Pressable
            style={styles.menuOption}
            onPress={() => setActiveView('import')}
          >
            <View style={styles.menuOptionContent}>
              <Image 
                source={require('../../assets/images/BGGDownload.png')}
                style={[styles.menuOptionImageIcon, { width: iconSize, height: iconSize }]}
                resizeMode="contain"
              />
              <View style={styles.menuOptionText}>
                <Text style={styles.menuOptionTitle}>Import pre-existing BGG collection titles</Text>
              </View>
              <Text style={styles.menuOptionArrow}>→</Text>
            </View>
          </Pressable>
        </View>

        {sortedCollection.length > 0 && (
          <View style={styles.inventoryHeader}>
            <Text style={styles.inventoryTitle}>Your Games Inventory:</Text>
            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              <View style={styles.sortButtons}>
                <Pressable
                  style={[styles.sortButton, sortBy === 'rating' && styles.sortButtonActive]}
                  onPress={() => handleSortChange('rating')}
                >
                  <Text style={[styles.sortButtonText, sortBy === 'rating' && styles.sortButtonTextActive]}>
                    ⭐ Rating
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.sortButton, sortBy === 'category' && styles.sortButtonActive]}
                  onPress={() => handleSortChange('category')}
                >
                  <Text style={[styles.sortButtonText, sortBy === 'category' && styles.sortButtonTextActive]}>
                    🏷️ Category
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.sortButton, sortBy === 'title' && styles.sortButtonActive]}
                  onPress={() => handleSortChange('title')}
                >
                  <Text style={[styles.sortButtonText, sortBy === 'title' && styles.sortButtonTextActive]}>
                    A-Z
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {sortedCollection.length === 0 && (
          <View style={styles.emptyCollection}>
            <Text style={styles.emptyTitle}>No games yet</Text>
            <Text style={styles.emptyText}>
              Add games to your collection by using AI inventory or importing from BoardGameGeek.
            </Text>
          </View>
        )}
      </>
    );
  };

  console.log('[CollectionScreen] Render state:', {
    showMenu,
    activeView,
    sortedCollectionLength: sortedCollection.length,
    rawCollectionLength: rawCollection.length,
    userIdentifier: userIdentifier ? 'present' : 'missing'
  });

  return (
    <View style={styles.container}>
      {showMenu && sortedCollection.length > 0 ? (
        sortBy === 'category' ? (
          renderGamesByCategory()
        ) : (
          (() => {
            console.log('[CollectionScreen] Rendering FlatList with', sortedCollection.length, 'items');
            return (
              <FlatList
                ref={flatListRef}
                data={sortedCollection}
                keyExtractor={(item) => {
                  const key = item.id;
                  if (!key) {
                    console.warn('[CollectionScreen] GameCard missing id:', item);
                  }
                  return key || `game-${Math.random()}`;
                }}
                renderItem={(props) => {
                  console.log('[CollectionScreen] FlatList renderItem called for index:', props.index);
                  try {
                    return renderGameCard(props);
                  } catch (error) {
                    console.error('[CollectionScreen] Error in renderItem:', error);
                    return null;
                  }
                }}
                numColumns={numColumns}
                columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
                contentContainerStyle={styles.listContainer}
                ListHeaderComponent={() => {
                  console.log('[CollectionScreen] Rendering ListHeaderComponent');
                  return renderHeader();
                }}
                ListHeaderComponentStyle={styles.headerContainer}
                scrollEnabled={true}
                showsVerticalScrollIndicator={true}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                updateCellsBatchingPeriod={50}
                initialNumToRender={5}
                windowSize={10}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onLayout={() => {
                  console.log('[CollectionScreen] FlatList onLayout called');
                }}
                onContentSizeChange={(width, height) => {
                  console.log('[CollectionScreen] FlatList content size changed:', width, 'x', height);
                }}
              />
            );
          })()
        )
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
                      onPress={() => setActiveView('import')}
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

              {sortedCollection.length === 0 && (
                <View style={styles.emptyCollection}>
                  <Text style={styles.emptyTitle}>No games yet</Text>
                  <Text style={styles.emptyText}>
                    Add games to your collection by using AI inventory or importing from BoardGameGeek.
                  </Text>
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
        onDone={handleDoneIdentifying}
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
        }}
        showModal={showTextListModal}
        onModalClose={() => setShowTextListModal(false)}
      />
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
    marginBottom: theme.spacing.sm,
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
});

export default CollectionScreen;
