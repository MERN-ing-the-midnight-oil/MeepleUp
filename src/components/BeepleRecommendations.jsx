import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { theme } from '../utils/theme';
import FaderSlider from './FaderSlider';
import BeepleAvatar from './BeepleAvatar';
import PoweredByBGG from './PoweredByBGG';
import GameCard from './GameCard';
import { preCalculateAllMatches, calculateGameScore, getRecommendationText } from '../utils/optimizedRecommendations';
import { db } from '../config/firebase';
import firebase from '../config/firebase';

const DEFAULT_WEIGHTS = {
  publisher: 3,
  mechanics: 3,
  category: 2,
  complexity: 1.5,
  favorite: 2,
};

const BeepleRecommendations = ({ games, userCollection, onProposeGame, userProposals = new Set(), eventId = null }) => {
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { collections, updateGameInCollection, addGameToCollection } = useCollections();
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preCalculatedMatches, setPreCalculatedMatches] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [pendingFavorites, setPendingFavorites] = useState(new Map()); // Map<gameId, isFavorite>
  const pendingFavoritesRef = useRef(new Map()); // Ref to track pending favorites for cleanup
  const pendingFavoriteGamesRef = useRef(new Map()); // Ref to track game data for pending favorites
  const saveTimeoutRef = useRef(null);
  const expandAnimation = useRef(new Animated.Value(0)).current;
  const collapseAnimation = useRef(new Animated.Value(0)).current;

  // Load user's custom weights
  useEffect(() => {
    if (user?.personalMatchWeights) {
      setWeights({ ...DEFAULT_WEIGHTS, ...user.personalMatchWeights });
    }
  }, [user]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Pre-calculate all matches once when games or collection changes
  useEffect(() => {
    console.log('[BeepleRecommendations] useEffect triggered:', {
      gamesCount: games?.length || 0,
      userCollectionCount: userCollection?.length || 0,
      hasGames: !!games && games.length > 0,
      hasCollection: !!userCollection && userCollection.length > 0
    });

    if (!games || games.length === 0 || !userCollection || userCollection.length === 0) {
      console.log('[BeepleRecommendations] Skipping calculation - missing games or collection');
      setPreCalculatedMatches(null);
      return;
    }

    setIsCalculating(true);
    // Use setTimeout to allow UI to update, then calculate
    const timer = setTimeout(() => {
      try {
        console.log('[BeepleRecommendations] Starting pre-calculation...');
        const preCalculated = preCalculateAllMatches(games, userCollection);
        console.log('[BeepleRecommendations] Pre-calculation complete, matches found:', preCalculated.size);
        setPreCalculatedMatches(preCalculated);
        setCurrentIndex(0); // Reset to first recommendation
      } catch (error) {
        console.error('[BeepleRecommendations] Error pre-calculating matches:', error);
      } finally {
        setIsCalculating(false);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [games, userCollection]);

  // Create a set of owned and favorited game IDs for quick lookup
  const ownedGameIds = useMemo(() => {
    if (!userCollection || userCollection.length === 0) return new Set();
    return new Set(
      userCollection
        .filter(game => game.bggId || game.id)
        .map(game => String(game.bggId || game.id))
    );
  }, [userCollection]);

  const favoritedGameIds = useMemo(() => {
    const favorited = new Set();
    
    // Add favorited games from userCollection prop
    if (userCollection && userCollection.length > 0) {
      userCollection
        .filter(game => game.isFavorite === true && (game.bggId || game.id))
        .forEach(game => {
          favorited.add(String(game.bggId || game.id));
        });
    }
    
    // Also check collections context for up-to-date favorite status
    const userId = user?.uid || user?.id;
    if (userId && collections[userId] && collections[userId].length > 0) {
      collections[userId]
        .filter(game => game.isFavorite === true && (game.bggId || game.id))
        .forEach(game => {
          favorited.add(String(game.bggId || game.id));
        });
    }
    
    // Add pending favorites that are being favorited (exclude them immediately)
    pendingFavorites.forEach((isFavorite, gameId) => {
      if (isFavorite) {
        favorited.add(gameId);
      }
    });
    
    return favorited;
  }, [userCollection, collections, user, pendingFavorites]);

  // Calculate scores for all games with current weights
  const scoredGames = useMemo(() => {
    if (!preCalculatedMatches || !games || games.length === 0) {
      return [];
    }

    const scored = games
      .map(game => {
        const gameId = String(game.bggId || game.id);
        
        // Filter out games the user owns
        if (ownedGameIds.has(gameId)) {
          return null;
        }
        
        // Filter out games the user has favorited
        if (favoritedGameIds.has(gameId)) {
          return null;
        }
        
        const matches = preCalculatedMatches.get(gameId);
        if (!matches) {
          // If no matches found, still calculate score (might be 0)
          const emptyMatches = {
            publisher: [],
            mechanics: [],
            category: [],
            complexity: []
          };
          const score = calculateGameScore(emptyMatches, weights, game);
          return {
            game,
            score,
            matches: emptyMatches,
          };
        }

        const score = calculateGameScore(matches, weights, game);
        return {
          game,
          score,
          matches,
        };
      })
      .filter(item => item !== null && item.score > 0)
      .sort((a, b) => b.score - a.score);

    // Debug logging - only in development and reduce verbosity
    if (__DEV__ && scored.length > 0) {
      console.log('[BeepleRecommendations] Scored games:', {
        totalGames: games.length,
        gamesWithScore: scored.length,
        topScores: scored.slice(0, 3).map(s => ({ 
          title: s.game.title || s.game.name, 
          score: Math.round(s.score)
        }))
      });
    }

    return scored;
  }, [preCalculatedMatches, games, weights, ownedGameIds, favoritedGameIds]);

  // Get current recommendation
  const currentRecommendation = useMemo(() => {
    if (!scoredGames || scoredGames.length === 0) {
      return null;
    }

    const index = Math.min(currentIndex, scoredGames.length - 1);
    const item = scoredGames[index];
    if (!item) return null;

    const gameTitle = item.game.title || item.game.name || 'this game';
    const recommendationText = getRecommendationText(item.matches, gameTitle, item.game, weights);

    return {
      game: item.game,
      score: item.score,
      text: recommendationText,
      index: index + 1,
      total: scoredGames.length,
    };
  }, [scoredGames, currentIndex, weights]);

  const handleWeightChange = useCallback((key, value) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      return;
    }
    setWeights(prev => {
      const newWeights = {
        ...prev,
        [key]: numValue,
      };
      
      // Debounce saving to avoid too many writes
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (user && updateUser) {
          updateUser({ personalMatchWeights: newWeights }).catch(err => {
            console.error('[BeepleRecommendations] Error saving weights:', err);
          });
        }
      }, 1000); // Save after 1 second of no changes
      
      return newWeights;
    });
  }, [user, updateUser]);

  const handleNextRecommendation = useCallback(() => {
    if (!scoredGames || scoredGames.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % scoredGames.length);
  }, [scoredGames]);

  const handlePreviousRecommendation = useCallback(() => {
    if (!scoredGames || scoredGames.length === 0) return;
    setCurrentIndex(prev => (prev - 1 + scoredGames.length) % scoredGames.length);
  }, [scoredGames]);

  // Handle favorite toggle - defer actual favorite action until unmount
  const handleFavoriteToggle = useCallback((game, isFavorite) => {
    const gameId = String(game.bggId || game.id);
    if (!gameId) return;
    
    setPendingFavorites(prev => {
      const next = new Map(prev);
      if (isFavorite) {
        next.set(gameId, true);
        // Store game data for later use
        pendingFavoriteGamesRef.current.set(gameId, game);
      } else {
        // If unfavoriting, we can remove from pending or mark as false
        // For now, just remove it from pending (user can re-favorite if needed)
        next.delete(gameId);
        pendingFavoriteGamesRef.current.delete(gameId);
      }
      // Also update the ref
      pendingFavoritesRef.current = new Map(next);
      return next;
    });
  }, []);

  // Apply pending favorites when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup: apply all pending favorites on unmount only
      const pending = pendingFavoritesRef.current;
      if (pending.size === 0 || !user) return;
      
      const userId = user.uid || user.id;
      if (!userId) return;
      
      // Get current collections at unmount time
      const currentCollections = collections;
      
      const applyFavorites = async () => {
        for (const [gameId, isFavorite] of pending.entries()) {
          try {
            // Check if user owns the game in their collection
            const userGames = currentCollections[userId] || [];
            const userGame = userGames.find(g => {
              const gId = String(g.bggId || g.id);
              return gId === gameId;
            });
            
            if (userGame) {
              // Update existing game
              await updateGameInCollection(userId, userGame.id, { isFavorite });
            } else if (db && isFavorite) {
              // Only create new entry if favoriting (not if unfavoriting)
              // Get game data from stored ref (set when user favorited it)
              const game = pendingFavoriteGamesRef.current.get(gameId);
              if (!game) {
                console.warn(`[BeepleRecommendations] Could not find game data for ${gameId} to favorite`);
                continue;
              }
              
              const docId = game.bggId || game.id || db.collection('userGames').doc(userId).collection('games').doc().id;
              
              const gameData = {
                id: docId,
                title: game.title || 'Unknown Game',
                bggId: game.bggId || null,
                image: game.image || game.thumbnail || null,
                thumbnail: game.thumbnail || null,
                description: game.description || '',
                yearPublished: game.yearPublished || null,
                minPlayers: game.minPlayers || null,
                maxPlayers: game.maxPlayers || null,
                playingTime: game.playingTime || null,
                bggRating: game.bggRating || null,
                isFavorite: true,
                addedAt: firebase.firestore.Timestamp.now(),
                updatedAt: firebase.firestore.Timestamp.now(),
                source: 'manual',
              };
              
              // Add to local collections
              addGameToCollection(userId, gameData);
              
              // Save to Firestore
              await db.collection('userGames').doc(userId)
                .collection('games').doc(docId)
                .set(gameData, { merge: true });
            }
          } catch (error) {
            console.error(`[BeepleRecommendations] Error applying favorite for game ${gameId}:`, error);
          }
        }
      };
      
      applyFavorites();
    };
  }, [user, collections, updateGameInCollection, addGameToCollection]);

  const toggleExpand = useCallback(() => {
    const toValue = isExpanded ? 0 : 1;
    Animated.timing(expandAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsExpanded(!isExpanded);
  }, [isExpanded, expandAnimation]);

  const toggleCollapse = useCallback(() => {
    const toValue = isCollapsed ? 1 : 0;
    Animated.timing(collapseAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed, collapseAnimation]);

  // Calculate max height for animation (approximate)
  const maxHeight = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 800], // Adjust based on content height
  });

  // Calculate max height for collapse animation
  const collapseMaxHeight = collapseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2000], // Adjust based on content height
  });

  const weightDescriptions = {
    publisher: 'How much to weight games from the same publishers (as your `favorited` games)',
    mechanics: 'How much to weight games with similar mechanics (as your `favorited` games)',
    category: 'How much to weight games in the same category/theme (as your `favorited` games)',
    complexity: 'How much to weight games with similar complexity (as your `favorited` games)',
    favorite: 'Multiplier for games you\'ve marked as favorites',
  };

  if (isCalculating) {
    return (
      <View style={styles.container}>
        <View style={styles.collapsibleHeader}>
          <View style={styles.beepleContainer}>
            <BeepleAvatar size={80} />
            <Text style={styles.beepleCaption}>Beeple</Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerText}>Beeple Recommends</Text>
          </View>
        </View>
        <View style={styles.collapsibleContent}>
        </View>
      </View>
    );
  }

  if (!currentRecommendation) {
    return (
      <View style={styles.container}>
        <TouchableOpacity 
          style={styles.collapsibleHeader}
          onPress={toggleCollapse}
          activeOpacity={0.7}
        >
          <View style={styles.beepleContainer}>
            <BeepleAvatar size={80} />
            <Text style={styles.beepleCaption}>Beeple</Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerText}>Beeple Recommends</Text>
          </View>
          <Text style={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</Text>
        </TouchableOpacity>
        
        <Animated.View 
          style={[
            styles.collapsibleContent,
            { 
              maxHeight: collapseMaxHeight,
              opacity: collapseAnimation 
            }
          ]}
        >
          <View style={styles.poweredByBGGContainer}>
            <PoweredByBGG 
              size="extraLarge" 
              containerWidth={width - (theme.spacing.lg * 4)} 
              style={styles.poweredByBGG} 
            />
          </View>
          <Text style={styles.emptyText}>
            Beep-Boop-Bop, I'm Beeple! I couldn't find strong similarities between these games and your collection. 
            Try <Text style={styles.linkText} onPress={() => navigation.navigate('Collection')}>adding more games to your collection</Text> so I can give you better recommendations!
          </Text>
          
          {/* Show sliders even when no recommendations */}
          <View style={styles.expandableSection}>
            <TouchableOpacity 
              style={styles.expandableHeader}
              onPress={toggleExpand}
              activeOpacity={0.7}
            >
              <Text style={styles.expandableTitle}>What are you looking for in your next game?</Text>
              <Text style={styles.expandableIcon}>{isExpanded ? '▼' : '▶'}</Text>
            </TouchableOpacity>
            
            <Animated.View 
              style={[
                styles.expandableContent,
                { maxHeight, opacity: expandAnimation }
              ]}
            >
              <View style={styles.slidersContainer}>
                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsText}>
                    <Text style={styles.instructionsBold}>How to use the sliders:</Text>
                    {'\n'}• Drag the sliders left or right to adjust how much each factor influences recommendations
                    {'\n'}• Higher values = that factor has more influence on which games Beeple recommends
                    {'\n'}• Lower values = that factor has less influence
                    {'\n'}• Changes update recommendations in real-time as you adjust the sliders
                    {'\n'}• Your preferences are automatically saved
                  </Text>
                </View>
                {Object.entries(weights)
                  .filter(([key]) => key !== 'favorite') // Exclude favorite from sliders
                  .map(([key, value]) => (
                    <FaderSlider
                      key={key}
                      label={key.charAt(0).toUpperCase() + key.slice(1)}
                      description={weightDescriptions[key]}
                      value={value}
                      onValueChange={(newValue) => handleWeightChange(key, newValue)}
                      minimumValue={0}
                      maximumValue={5}
                      step={0.1}
                    />
                  ))}
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
        <TouchableOpacity 
          style={styles.collapsibleHeader}
          onPress={toggleCollapse}
          activeOpacity={0.7}
        >
          <View style={styles.beepleContainer}>
            <BeepleAvatar size={80} />
            <Text style={styles.beepleCaption}>Beeple</Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerText}>Beeple Recommends</Text>
          </View>
          <Text style={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</Text>
        </TouchableOpacity>

      <Animated.View 
        style={[
          styles.collapsibleContent,
          { 
            maxHeight: collapseMaxHeight,
            opacity: collapseAnimation 
          }
        ]}
      >
        {currentRecommendation && (
          <>
            <View style={styles.poweredByBGGContainer}>
              <PoweredByBGG 
                size="extraLarge" 
                containerWidth={width - (theme.spacing.lg * 4)} 
                style={styles.poweredByBGG} 
              />
            </View>
            <View style={styles.headerSubtextContainer}>
              <Text style={styles.headerSubtext}>
                Recommendation {currentRecommendation.index} of {currentRecommendation.total}
              </Text>
            </View>

            {/* Recommendation Text */}
            {currentRecommendation.text ? (
              <View style={styles.recommendationTextContainer}>
                <Text style={styles.recommendationText}>{currentRecommendation.text}</Text>
              </View>
            ) : (
              <Text style={styles.noRecommendationText}>
                Beep-Boop-Bop, I'm Beeple! I couldn't find strong similarities for this game.
              </Text>
            )}

            {/* Top Recommendation Game Card */}
            <View style={styles.gameCardContainer}>
              <GameCard 
                game={currentRecommendation.game} 
                preloadedBggData={currentRecommendation.game._bggData}
                disableModal={false}
                inGrid={false}
                onFavorite={handleFavoriteToggle}
                onProposeGame={onProposeGame}
                userProposals={userProposals}
                eventId={eventId}
              />
              <View style={styles.scoreBadgeContainer}>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreLabel}>Match Score</Text>
                  <Text style={styles.scoreValue}>{Math.round(currentRecommendation.score)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.adjustWeightsButton}
                  onPress={toggleExpand}
                  activeOpacity={0.8}
                >
                  <Text style={styles.adjustWeightsButtonText}>Adjust Match Weights</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Recommendation Section with Sliders */}
            <View style={styles.recommendationSection}>

              {/* Expandable Weight Sliders Section */}
              <View style={styles.expandableSection}>
                <TouchableOpacity 
                  style={styles.expandableHeader}
                  onPress={toggleExpand}
                  activeOpacity={0.7}
                >
                  <Text style={styles.expandableTitle}>What are you looking for in your next game?</Text>
                  <Text style={styles.expandableIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                
                <Animated.View 
                  style={[
                    styles.expandableContent,
                    { maxHeight, opacity: expandAnimation }
                  ]}
                >
                  <View style={styles.slidersContainer}>
                    <View style={styles.instructionsContainer}>
                      <Text style={styles.instructionsText}>
                        <Text style={styles.instructionsBold}>How to use the sliders:</Text>
                        {'\n'}• Drag the sliders left or right to adjust how much each factor influences recommendations
                        {'\n'}• Higher values = that factor has more influence on which games Beeple recommends
                        {'\n'}• Lower values = that factor has less influence
                        {'\n'}• Changes update recommendations in real-time as you adjust the sliders
                        {'\n'}• Your preferences are automatically saved
                      </Text>
                    </View>
                    {Object.entries(weights)
                      .filter(([key]) => key !== 'favorite') // Exclude favorite from sliders
                      .map(([key, value]) => (
                        <FaderSlider
                          key={key}
                          label={key.charAt(0).toUpperCase() + key.slice(1)}
                          description={weightDescriptions[key]}
                          value={value}
                          onValueChange={(newValue) => handleWeightChange(key, newValue)}
                          minimumValue={0}
                          maximumValue={5}
                          step={0.1}
                        />
                      ))}
                  </View>
                </Animated.View>
              </View>
            </View>

            {/* Navigation Buttons */}
            {scoredGames.length > 1 && (
              <View style={styles.navigationButtonsContainer}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={handlePreviousRecommendation}
                >
                  <Text style={styles.backButtonText}>←</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleNextRecommendation}
                >
                  <Text style={styles.nextButtonText}>
                    Next Recommendation, Please →
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.bgColor,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  beepleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  beepleCaption: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  poweredByBGGContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  poweredByBGG: {
    width: '100%',
    maxWidth: '100%',
  },
  headerTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  collapseIcon: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  collapsibleContent: {
    overflow: 'hidden',
  },
  headerSubtextContainer: {
    marginBottom: theme.spacing.md,
    paddingLeft: theme.spacing.sm,
  },
  headerText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  headerSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: theme.spacing.md,
  },
  linkText: {
    color: theme.colors.meepleRed,
    textDecorationLine: 'underline',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  gameCardContainer: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  scoreBadgeContainer: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  scoreBadge: {
    backgroundColor: 'rgba(241, 196, 15, 0.95)',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  scoreLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  scoreValue: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  adjustWeightsButton: {
    backgroundColor: 'rgba(241, 196, 15, 0.95)',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustWeightsButtonText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  recommendationSection: {
    marginBottom: theme.spacing.md,
  },
  recommendationTextContainer: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  recommendationText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
  noRecommendationText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  expandableSection: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  expandableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
  },
  expandableTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  expandableIcon: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  expandableContent: {
    overflow: 'hidden',
  },
  slidersContainer: {
    padding: theme.spacing.md,
  },
  slidersDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 18,
  },
  instructionsContainer: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.meepleRed,
  },
  instructionsText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  instructionsBold: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  navigationButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  backButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  nextButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    flex: 1,
  },
  nextButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
});

export default BeepleRecommendations;

