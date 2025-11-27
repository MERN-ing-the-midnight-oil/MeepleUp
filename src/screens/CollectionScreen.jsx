import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Image, useWindowDimensions, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import Button from '../components/common/Button';
import ClaudeGameIdentifier from '../components/ClaudeGameIdentifier';
import GameCard from '../components/GameCard';
import BGGImport from '../components/BGGImport';
import { getGameById } from '../services/gameDatabase';
import { getStarRating } from '../utils/gameBadges';
// Note: BarcodeScanner has been archived (see src/archive/barcode-scanner/)
// BGGImport will need to be converted separately if needed

const CollectionScreen = () => {
  console.log('[CollectionScreen] Component rendering');
  
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { getUserCollection, addGameToCollection, removeGameFromCollection } = useCollections();
  const [activeView, setActiveView] = useState('menu'); // 'menu', 'import'
  const [sortBy, setSortBy] = useState('rating'); // 'rating', 'category', 'title'
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  
  // Responsive icon size - larger on bigger screens
  const iconSize = width > 768 ? 72 : 64;
  // First two icons are 30% larger, then 20% larger again (1.3 * 1.2 = 1.56)
  const largeIconSize = width > 768 ? Math.round(72 * 1.56) : Math.round(64 * 1.56);
  // Much larger icon for gamescanner button (2.5x base, then 40% bigger = 3.5x)
  const gamescannerIconSize = width > 768 ? Math.round(72 * 3.5) : Math.round(64 * 3.5);
  
  const userIdentifier = user?.uid || user?.id;
  console.log('[CollectionScreen] User identifier:', userIdentifier ? 'found' : 'missing');
  
  const rawCollection = userIdentifier ? getUserCollection(userIdentifier) : [];
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
            
            if (game.bggId) {
              try {
                console.log(`[CollectionScreen] Fetching BGG data for game ${index + 1}, bggId:`, game.bggId);
                const bggData = await getGameById(game.bggId);
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
                  console.log(`[CollectionScreen] Game ${index + 1} (${game.title || game.id}) enriched, rating:`, rating, 'category:', primaryCategory, 'bggId:', game.bggId);
                  return {
                    ...game,
                    _bggData: bggData,
                    _rating: rating,
                    _primaryCategory: primaryCategory,
                  };
                } else {
                  console.log(`[CollectionScreen] Game ${index + 1} (${game.title || game.id}) - getGameById returned null for bggId:`, game.bggId);
                }
              } catch (error) {
                console.error(`[CollectionScreen] Error loading BGG data for game ${index + 1} (${game.title || game.id}):`, error);
              }
            } else {
              console.log(`[CollectionScreen] Game ${index + 1} (${game.title || game.id}) - no bggId`);
            }
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
      // Pass the already-loaded BGG data to avoid redundant API calls
      // Use item directly - React.memo in GameCard will handle prop comparison
      return (
        <GameCard 
          game={item} 
          onDelete={handleDeleteGame}
          preloadedBggData={item._bggData}
        />
      );
    } catch (error) {
      console.error('[CollectionScreen] Error rendering GameCard for:', item.title || item.id, 'error:', error, 'stack:', error.stack);
      return null;
    }
  }, [handleDeleteGame]);

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
        <Text style={styles.gamescannerButtonTitle}>Import game titles with AI camera scanner</Text>
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
          {renderInventoryButton()}

          <Pressable
            style={styles.menuOption}
            onPress={() => setActiveView('import')}
          >
            <View style={styles.menuOptionContent}>
              <Image 
                source={require('../../assets/images/lexiBGG.png')}
                style={[styles.menuOptionIcon, { width: iconSize, height: iconSize }]}
                resizeMode="contain"
              />
              <View style={styles.menuOptionText}>
                <Text style={styles.menuOptionTitle}>Import game titles from your existing BoardGameGeek collection</Text>
              </View>
              <Text style={styles.menuOptionArrow}>→</Text>
            </View>
          </Pressable>
        </View>

        {sortedCollection.length > 0 && (
          <View style={styles.inventoryHeader}>
            <Text style={styles.inventoryTitle}>Your Games Inventory</Text>
            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              <View style={styles.sortButtons}>
                <Pressable
                  style={[styles.sortButton, sortBy === 'rating' && styles.sortButtonActive]}
                  onPress={() => setSortBy('rating')}
                >
                  <Text style={[styles.sortButtonText, sortBy === 'rating' && styles.sortButtonTextActive]}>
                    ⭐ Rating
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.sortButton, sortBy === 'category' && styles.sortButtonActive]}
                  onPress={() => setSortBy('category')}
                >
                  <Text style={[styles.sortButtonText, sortBy === 'category' && styles.sortButtonTextActive]}>
                    🏷️ Category
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.sortButton, sortBy === 'title' && styles.sortButtonActive]}
                  onPress={() => setSortBy('title')}
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
        (() => {
          console.log('[CollectionScreen] Rendering FlatList with', sortedCollection.length, 'items');
          return (
            <FlatList
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
              numColumns={2}
              columnWrapperStyle={styles.row}
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
              onLayout={() => {
                console.log('[CollectionScreen] FlatList onLayout called');
              }}
              onContentSizeChange={(width, height) => {
                console.log('[CollectionScreen] FlatList content size changed:', width, 'x', height);
              }}
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
                  <View style={styles.menuContainer}>
                    {renderInventoryButton()}

                <Pressable
                  style={styles.menuOption}
                  onPress={() => setActiveView('import')}
                >
                  <View style={styles.menuOptionContent}>
                    <Image 
                      source={require('../../assets/images/lexiBGG.png')}
                      style={[styles.menuOptionIcon, { width: iconSize, height: iconSize }]}
                      resizeMode="contain"
                    />
                    <View style={styles.menuOptionText}>
                      <Text style={styles.menuOptionTitle}>Import game titles from your existing BoardGameGeek collection</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  bggLogoTopContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  menuContainer: {
    paddingVertical: 20,
  },
  menuOption: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuOptionContentMinimalPadding: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  menuOptionIcon: {
    width: 32,
    height: 32,
    marginRight: 16,
  },
  menuOptionText: {
    flex: 1,
  },
  menuOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  menuOptionDescription: {
    fontSize: 14,
    color: '#666',
  },
  menuOptionArrow: {
    fontSize: 20,
    color: '#999',
    marginLeft: 12,
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
    fontSize: 16,
    color: '#4a90e2',
    fontWeight: '500',
  },
  viewTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  viewContent: {
    flex: 1,
    paddingBottom: 0,
  },
  sortContainer: {
    marginBottom: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginRight: 4,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  aiInventoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#4a90e2',
    alignSelf: 'flex-start',
  },
  aiInventoryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  sortButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  sortButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  sortButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  sortButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  headerContainer: {
    padding: 20,
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
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  listContainer: {
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  gameCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  gameCardImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholder: {
    color: '#999',
  },
  gameCardInfo: {
    gap: 4,
  },
  gameCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  gameCardMeta: {
    fontSize: 14,
    color: '#666',
  },
  gameCardBarcode: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  inventorySection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inventoryHeader: {
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  inventoryTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
});

export default CollectionScreen;
