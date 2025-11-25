import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Image, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import Button from '../components/common/Button';
import ClaudeGameIdentifier from '../components/ClaudeGameIdentifier';
import GameCard from '../components/GameCard';
import PoweredByBGG from '../components/PoweredByBGG';
import BGGImport from '../components/BGGImport';
import { getGameById } from '../services/gameDatabase';
import { getStarRating } from '../utils/gameBadges';
// Note: BarcodeScanner has been archived (see src/archive/barcode-scanner/)
// BGGImport will need to be converted separately if needed

const CollectionScreen = () => {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { getUserCollection, addGameToCollection, removeGameFromCollection } = useCollections();
  const [activeView, setActiveView] = useState('menu'); // 'menu', 'view', 'add', 'import'
  const [sortBy, setSortBy] = useState('rating'); // 'rating', 'category', 'title'
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  
  // Responsive icon size - larger on bigger screens
  const iconSize = width > 768 ? 72 : 64;
  // First two icons are 30% larger, then 20% larger again (1.3 * 1.2 = 1.56)
  const largeIconSize = width > 768 ? Math.round(72 * 1.56) : Math.round(64 * 1.56);
  
  const userIdentifier = user?.uid || user?.id;
  const rawCollection = userIdentifier ? getUserCollection(userIdentifier) : [];
  const [sortedCollection, setSortedCollection] = useState([]);

  // Reset to menu when collection becomes empty while on view screen
  useEffect(() => {
    if (rawCollection.length === 0 && activeView === 'view') {
      setActiveView('menu');
    }
  }, [rawCollection.length, activeView]);

  // Load BGG data and sort collection
  useEffect(() => {
    const loadAndSort = async () => {
      const enrichedGames = await Promise.all(
        rawCollection.map(async (game) => {
          if (game.bggId) {
            try {
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
                return {
                  ...game,
                  _bggData: bggData,
                  _rating: rating,
                  _primaryCategory: primaryCategory,
                };
              }
            } catch (error) {
              console.error('Error loading BGG data for sorting:', error);
            }
          }
          return {
            ...game,
            _rating: 0,
            _primaryCategory: 'Other',
          };
        })
      );

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

      setSortedCollection(sorted);
    };

    loadAndSort();
  }, [rawCollection, sortBy]);

  const handleAddToCollection = (gameData) => {
    if (userIdentifier) {
      addGameToCollection(userIdentifier, gameData);
      // Don't show alert for each game - too many alerts
      // The user will see the games in their collection
    }
  };

  const handleRemoveFromCollection = (gameId) => {
    if (userIdentifier) {
      removeGameFromCollection(userIdentifier, gameId);
    }
  };

  const handleDoneIdentifying = () => {
    // After identifying games, close results modal and show the collection view
    setShowResultsModal(false);
    setActiveView('view');
  };

  const handleOpenCamera = () => {
    setShowCameraModal(true);
  };

  const handleCameraModalClose = () => {
    setShowCameraModal(false);
    // Open results modal after camera closes (photo was captured)
    setTimeout(() => {
      setShowResultsModal(true);
    }, 300);
  };

  const handleResultsModalClose = () => {
    setShowResultsModal(false);
  };

  const handleDeleteGame = useCallback((gameId) => {
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
    return (
      <GameCard game={item} onDelete={handleDeleteGame} />
    );
  }, [handleDeleteGame]);

  // Show menu when no specific view is active
  const showMenu = activeView === 'menu';

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {showMenu && (
          <View style={styles.menuContainer}>
            <Pressable
              style={styles.menuOption}
              onPress={handleOpenCamera}
            >
              <View style={styles.menuOptionContentMinimalPadding}>
                <Image 
                  source={require('../../assets/images/lexisterium.png')}
                  style={[styles.menuOptionIcon, { width: largeIconSize, height: largeIconSize, marginRight: 12 }]}
                  resizeMode="contain"
                />
                <View style={styles.menuOptionText}>
                  <Text style={styles.menuOptionTitle}>Inventory using Lexisterium AI</Text>
                  <Text style={styles.menuOptionDescription}>
                    Snap side-view photos of stacks of game boxes for instant title and game information retrieval
                  </Text>
                </View>
                <Text style={styles.menuOptionArrow}>→</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.menuOption}
              onPress={() => setActiveView('view')}
            >
              <View style={styles.menuOptionContentMinimalPadding}>
                <Image 
                  source={require('../../assets/images/lexigames.png')}
                  style={[styles.menuOptionIcon, { width: largeIconSize, height: largeIconSize, marginRight: 12 }]}
                  resizeMode="contain"
                />
                <View style={styles.menuOptionText}>
                  <Text style={styles.menuOptionTitle}>View your games inventory</Text>
                  <Text style={styles.menuOptionDescription}>
                    Browse your {rawCollection.length} game{rawCollection.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={styles.menuOptionArrow}>→</Text>
              </View>
            </Pressable>

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
        )}

        {activeView === 'view' && (
          <View style={styles.viewContent}>
            {/* AI Inventory Button and Sort Options */}
            {sortedCollection.length > 0 && (
              <View style={styles.sortContainer}>
                <Pressable
                  style={styles.aiInventoryButton}
                  onPress={handleOpenCamera}
                >
                  <Text style={styles.aiInventoryButtonText}>Inventory my collection using AI</Text>
                </Pressable>
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
            
            {sortedCollection.length === 0 ? (
              <View style={styles.emptyCollection}>
                <Text style={styles.emptyTitle}>No games yet</Text>
                <Text style={styles.emptyText}>
                  Add games to your collection by using AI inventory or importing from BoardGameGeek.
                </Text>
                <View style={styles.emptyActions}>
                  <Button
                    label="Inventory your collection using AI"
                    onPress={handleOpenCamera}
                    style={styles.emptyButton}
                  />
                  <Button
                    label="Import from BGG"
                    onPress={() => setActiveView('import')}
                    variant="outline"
                    style={styles.emptyButton}
                  />
                </View>
                <View style={styles.emptyBggLogoContainer}>
                  <PoweredByBGG size="small" />
                </View>
              </View>
            ) : (
              <>
                <FlatList
                  data={sortedCollection}
                  keyExtractor={(item) => item.id}
                  renderItem={renderGameCard}
                  numColumns={2}
                  columnWrapperStyle={styles.row}
                  contentContainerStyle={styles.listContainer}
                  scrollEnabled={true}
                  showsVerticalScrollIndicator={false}
                />
                <View style={styles.bggLogoContainer}>
                  <PoweredByBGG size="small" />
                </View>
              </>
            )}
          </View>
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

        {activeView === 'import' && (
          <View style={styles.viewContent}>
            <View style={styles.viewHeader}>
              <Pressable
                style={styles.backButton}
                onPress={() => setActiveView('menu')}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </Pressable>
              <Text style={styles.viewTitle}>Import from BGG</Text>
            </View>
            <View style={styles.tabContent}>
              <BGGImport
                onImportComplete={(count) => {
                  if (count > 0) {
                    setActiveView('view');
                  }
                }}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    flex: 1,
    padding: 20,
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
  emptyActions: {
    width: '100%',
  },
  emptyButton: {
    marginBottom: 12,
  },
  emptyBggLogoContainer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    width: '100%',
  },
  listContainer: {
    paddingBottom: 10,
    paddingHorizontal: 8,
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
  bggLogoContainer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
});

export default CollectionScreen;
