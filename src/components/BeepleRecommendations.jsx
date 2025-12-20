import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../utils/theme';
import FaderSlider from './FaderSlider';
import BeepleAvatar from './BeepleAvatar';
import GameCard from './GameCard';
import { preCalculateAllMatches, calculateGameScore, getRecommendationText } from '../utils/optimizedRecommendations';

const DEFAULT_WEIGHTS = {
  publisher: 3,
  mechanics: 3,
  category: 2,
  complexity: 1.5,
  favorite: 2,
};

const BeepleRecommendations = ({ games, userCollection, onProposeGame, userProposals = new Set() }) => {
  const { user, updateUser } = useAuth();
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preCalculatedMatches, setPreCalculatedMatches] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const saveTimeoutRef = useRef(null);
  const expandAnimation = useRef(new Animated.Value(0)).current;

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
    if (!userCollection || userCollection.length === 0) return new Set();
    return new Set(
      userCollection
        .filter(game => game.isFavorite === true && (game.bggId || game.id))
        .map(game => String(game.bggId || game.id))
    );
  }, [userCollection]);

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

    // Debug logging - always log to help diagnose
    console.log('[BeepleRecommendations] Scored games:', {
        totalGames: games.length,
        gamesWithScore: scored.length,
        topScores: scored.slice(0, 5).map(s => ({ 
          title: s.game.title || s.game.name, 
          score: s.score,
          matches: {
            publisher: s.matches.publisher.length,
            mechanics: s.matches.mechanics.length,
            category: s.matches.category.length,
            complexity: s.matches.complexity.length
          }
        })),
        sampleUserCollection: userCollection.slice(0, 3).map(g => ({
          title: g.title || g.name,
          hasBggData: !!g._bggData,
          publisher: g._bggData?.publisher || g.publisher,
          mechanics: (g._bggData?.mechanics || g.mechanics || []).slice(0, 2)
        }))
      });

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

  const toggleExpand = useCallback(() => {
    const toValue = isExpanded ? 0 : 1;
    Animated.timing(expandAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsExpanded(!isExpanded);
  }, [isExpanded, expandAnimation]);

  // Calculate max height for animation (approximate)
  const maxHeight = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 800], // Adjust based on content height
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
        <View style={styles.header}>
          <BeepleAvatar size={80} />
          <Text style={styles.headerText}>Beeple is calculating recommendations...</Text>
        </View>
      </View>
    );
  }

  if (!currentRecommendation) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <BeepleAvatar size={80} />
          <Text style={styles.headerText}>Beeple Recommends</Text>
        </View>
        <Text style={styles.emptyText}>
          Beep-Boop-Bop, I'm Beeple! I couldn't find strong similarities between these games and your collection. 
          Try adding more games to your collection so I can give you better recommendations!
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BeepleAvatar size={80} />
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerText}>Beeple Recommends</Text>
          <Text style={styles.headerSubtext}>
            Recommendation {currentRecommendation.index} of {currentRecommendation.total}
          </Text>
        </View>
      </View>

      {/* Top Recommendation Game Card */}
      <View style={styles.gameCardContainer}>
        <GameCard 
          game={currentRecommendation.game} 
          preloadedBggData={currentRecommendation.game._bggData}
          disableModal={true}
          inGrid={false}
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
        {/* Propose Button */}
        {onProposeGame && (
          <View style={styles.proposeButtonContainer}>
            {(() => {
              const gameId = String(currentRecommendation.game.bggId || currentRecommendation.game.id);
              const isProposed = userProposals.has(gameId);
              const canPropose = userProposals.size < 5 || isProposed;
              
              if (!isProposed && canPropose) {
                return (
                  <TouchableOpacity
                    style={styles.proposeButton}
                    onPress={() => onProposeGame(currentRecommendation.game)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.proposeButtonText}>Propose this game for the next meeting</Text>
                  </TouchableOpacity>
                );
              } else if (isProposed) {
                return (
                  <View style={styles.proposedBadge}>
                    <Text style={styles.proposedBadgeText}>Proposed</Text>
                  </View>
                );
              }
              return null;
            })()}
          </View>
        )}
      </View>

      {/* Recommendation Text with Sliders */}
      <View style={styles.recommendationSection}>
        {currentRecommendation.text ? (
          <View style={styles.recommendationTextContainer}>
            <BeepleAvatar size={100} style={styles.beepleInText} />
            <Text style={styles.recommendationText}>{currentRecommendation.text}</Text>
          </View>
        ) : (
          <Text style={styles.noRecommendationText}>
            Beep-Boop-Bop, I'm Beeple! I couldn't find strong similarities for this game.
          </Text>
        )}

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

      {/* Next Recommendation Button */}
      {scoredGames.length > 1 && (
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNextRecommendation}
        >
          <Text style={styles.nextButtonText}>
            Next Recommendation, Please →
          </Text>
        </TouchableOpacity>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  headerTextContainer: {
    marginLeft: theme.spacing.sm,
    flex: 1,
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
  proposeButtonContainer: {
    width: '100%',
  },
  proposeButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  proposeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  proposedBadge: {
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 183, 156, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  proposedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  recommendationSection: {
    marginBottom: theme.spacing.md,
  },
  recommendationTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  beepleInText: {
    marginRight: theme.spacing.md,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  recommendationText: {
    flex: 1,
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
  nextButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  nextButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
});

export default BeepleRecommendations;

