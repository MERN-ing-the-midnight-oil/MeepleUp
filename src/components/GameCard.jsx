import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Dimensions, useWindowDimensions, Alert, Animated } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { getGameBadges } from '../utils/gameBadges';
import GameDetailsModal from './GameDetailsModal';
import DottedHeart from './DottedHeart';
import { getColumnCount, BREAKPOINTS } from '../utils/responsive';
import { theme, commonStyles } from '../utils/theme';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';

/**
 * Game Card Component with BGG Thumbnails
 * Displays game cards in a tall format (2 per row) with BGG thumbnail images
 * @param {Object} props
 * @param {Object} props.game - The game object
 * @param {Function} props.onDelete - Delete handler
 * @param {Object} props.preloadedBggData - Optional preloaded BGG data to avoid redundant API calls
 */
const GameCard = ({ game, onDelete, preloadedBggData = null, disableModal = false, containerPadding = 12, gap = 8, inGrid = false, onFavorite = null, onProposeGame = null, userProposals = new Set(), eventId = null }) => {
  const { user } = useAuth();
  const { collections, updateGameInCollection, addGameToCollection } = useCollections();
  const userId = user?.uid || user?.id;
  console.log(
    '[GameCard] Rendering for game:',
    game.title || game.id,
    'bggId:',
    game.bggId,
    'preloadedData:',
    preloadedBggData ? 'yes' : 'no',
  );

  const { width: screenWidth } = useWindowDimensions();
  const [bggData, setBggData] = useState(null);
  const [badges, setBadges] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showIncompleteExplanation, setShowIncompleteExplanation] = useState(false);
  
  // Animation values for card press effects
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Check if game is display-only (missing all critical fields for recommendations)
  const isDisplayOnly = useMemo(() => {
    // Check displayOnly flag from game data or bggData
    if (game.displayOnly === true || (preloadedBggData && preloadedBggData.displayOnly === true)) {
      return true;
    }
    
    // Use preloadedBggData if available, otherwise check game object directly
    // (enriched games have all BGG data merged into them, so game itself is the source)
    const bggData = preloadedBggData || game;
    
    const hasPublisher = !!(bggData.publisher || 
      (Array.isArray(bggData.publishers) && bggData.publishers.length > 0));
    const hasMechanics = !!(bggData.mechanics && 
      (Array.isArray(bggData.mechanics) ? bggData.mechanics.length > 0 : true));
    const hasCategories = !!(bggData.categories && 
      (Array.isArray(bggData.categories) ? bggData.categories.length > 0 : true));
    const hasComplexity = !!(bggData.averageWeight || bggData.complexity);
    
    // Missing all critical fields
    return !hasPublisher && !hasMechanics && !hasCategories && !hasComplexity;
  }, [game, preloadedBggData]);
  
  // Animation values for favorite heart shimmer effect
  const shimmerOpacity = useRef(new Animated.Value(1)).current;
  const shimmerScale = useRef(new Animated.Value(1)).current;
  
  // When inGrid is true or disableModal is true, we're in a grid layout and should use 100% width
  // Otherwise, calculate responsive width
  const cardWidth = useMemo(() => {
    if (inGrid || disableModal) {
      return '100%'; // In grid layout, use full width of wrapper
    }
    return getCardWidth(screenWidth, containerPadding, gap);
  }, [screenWidth, containerPadding, gap, disableModal, inGrid]);
  
  // Create dynamic styles based on card width
  const dynamicStyles = useMemo(() => {
    return StyleSheet.create({
      card: {
        backgroundColor: theme.colors.cardSurface,
        borderRadius: theme.borderRadius.lg, // Rounded corners
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(201, 183, 156, 0.5)', // Subtle border for flat design
        // No shadows for flat design
        position: 'relative',
        width: cardWidth,
        marginBottom: theme.spacing.md,
        alignSelf: 'flex-start',
        flexShrink: 0,
      },
    });
  }, [cardWidth]);

  // Track if we've initialized this game+bggData combo to prevent re-initialization
  const initializationKeyRef = useRef(null);
  const isMountedRef = useRef(true);

  // Create a stable key for the current game+bggData combination
  const currentKey = useMemo(() => {
    const gameKey = game.id || game.bggId || game.title;
    const bggKey = preloadedBggData?.id || preloadedBggData?.average || 'none';
    return `${gameKey}-${bggKey}`;
  }, [game.id, game.bggId, game.title, preloadedBggData?.id, preloadedBggData?.average]);

  // Initialize BGG data ONCE per game+bggData combination
  useEffect(() => {
    // Skip if already initialized for this exact combination
    if (initializationKeyRef.current === currentKey) {
      console.log('[GameCard] Already initialized for key:', currentKey);
      return;
    }

    // Skip if no preloaded data
    if (!preloadedBggData) {
      console.log('[GameCard] No preloaded data for:', game.title);
      return;
    }

    console.log('[GameCard] Initializing for key:', currentKey);
    initializationKeyRef.current = currentKey;

    const gameBadges = getGameBadges(preloadedBggData);
    const thumbnail =
      preloadedBggData.thumbnail && !game.bggThumbnail && !game.thumbnail
        ? preloadedBggData.thumbnail
        : null;

    // Batch all state updates together
    requestAnimationFrame(() => {
      if (!isMountedRef.current) return;

      setBggData(preloadedBggData);
      setBadges(gameBadges);
      if (thumbnail) setThumbnailUrl(thumbnail);

      console.log('[GameCard] Initialization complete for:', game.title);
    });
  }, [currentKey, game.title, game.bggThumbnail, game.thumbnail, preloadedBggData]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      console.log('[GameCard] Cleanup: Component unmounting for game:', game.title || game.id);
      isMountedRef.current = false;
    };
  }, [game.title, game.id]);

  // Initialize favorite status from game or user's collection
  // Use a ref to track the previous favorite status to prevent unnecessary updates
  const prevFavoriteStatusRef = useRef(null);
  const gameIdRef = useRef(null);
  
  // Store the current game ID
  useEffect(() => {
    const currentGameId = game?.bggId || game?.id;
    if (currentGameId !== gameIdRef.current) {
      gameIdRef.current = currentGameId;
      prevFavoriteStatusRef.current = null;
    }
  }, [game?.id, game?.bggId]);
  
  // Helper to get current favorite status for this specific game
  const getFavoriteStatus = () => {
    if (!userId) {
      return false;
    }

    const gameId = game.bggId || game.id;
    if (!gameId) {
      return game.isFavorite || false;
    }

    const userGames = collections[userId] || [];
    const userGame = userGames.find(g => {
      if (game.bggId && g.bggId) {
        return g.bggId === game.bggId;
      }
      const gId = g.bggId || g.id;
      return gId === gameId;
    });

    return userGame?.isFavorite ?? game?.isFavorite ?? false;
  };
  
  // Update favorite status only when THIS specific game's status changes
  // We check collections on every render but only update state if the value actually changed
  useEffect(() => {
    const gameId = game.bggId || game.id;
    
    // Only proceed if we're still looking at the same game
    if (gameId && gameIdRef.current !== gameId) {
      return;
    }

    const newFavoriteStatus = getFavoriteStatus();
    
    // Only update if the favorite status actually changed for THIS specific game
    if (prevFavoriteStatusRef.current !== newFavoriteStatus) {
      setIsFavorite(newFavoriteStatus);
      prevFavoriteStatusRef.current = newFavoriteStatus;
    }
  }, [
    game?.id, 
    game?.bggId, 
    game?.isFavorite, 
    userId,
    // Include collections but use ref comparison to only update when THIS game's status changes
    collections
  ]);

  // Shimmer animation for favorite hearts - glitter effect
  useEffect(() => {
    if (isFavorite) {
      // Create a looping shimmer/glitter animation with more pronounced effect
      const shimmerAnimation = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(shimmerOpacity, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(shimmerScale, {
              toValue: 1.2,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(shimmerOpacity, {
              toValue: 0.5,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(shimmerScale, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      shimmerAnimation.start();
      return () => shimmerAnimation.stop();
    } else {
      // Reset to default when not favorite
      shimmerOpacity.setValue(1);
      shimmerScale.setValue(1);
    }
  }, [isFavorite]);

  // Memoize computed values to prevent unnecessary recalculations
  // Use thumbnail from preloadedBggData if game doesn't have one stored
  const thumbnail = useMemo(() => {
    // First try stored thumbnail
    if (game.bggThumbnail || game.thumbnail) {
      const result = game.bggThumbnail || game.thumbnail;
      if (__DEV__) {
        console.log('[GameCard] Using thumbnail from game object for:', game.title || game.id);
      }
      return result;
    }
    // Then try from preloadedBggData
    if (preloadedBggData?.thumbnail) {
      if (__DEV__) {
        console.log('[GameCard] Using thumbnail from preloadedBggData for:', game.title || game.id);
      }
      return preloadedBggData.thumbnail;
    }
    // Then try thumbnailUrl (from initialization)
    if (thumbnailUrl) {
      if (__DEV__) {
        console.log('[GameCard] Using thumbnail from thumbnailUrl for:', game.title || game.id);
      }
      return thumbnailUrl;
    }
    if (__DEV__) {
      console.log('[GameCard] ⚠️ No thumbnail found for:', game.title || game.id, {
        hasBggThumbnail: !!game.bggThumbnail,
        hasThumbnail: !!game.thumbnail,
        hasPreloadedBggData: !!preloadedBggData,
        hasThumbnailInPreloaded: !!preloadedBggData?.thumbnail,
        hasThumbnailUrl: !!thumbnailUrl,
        preloadedBggDataKeys: preloadedBggData ? Object.keys(preloadedBggData) : [],
      });
    }
    return null;
  }, [game.bggThumbnail, game.thumbnail, preloadedBggData?.thumbnail, thumbnailUrl, game.title, game.id]);

  const title = useMemo(
    () => (typeof game.title === 'string' && game.title.length > 0 ? game.title : 'Unknown Game'),
    [game.title],
  );

  const year = useMemo(
    () => game.yearPublished || bggData?.yearPublished || null,
    [game.yearPublished, bggData?.yearPublished],
  );

  // Get BGG rating (0-10 scale) directly from game data
  const bggRating = useMemo(() => {
    // Check game object directly for average or bggRating
    if (game.average) {
      const rating = parseFloat(game.average);
      return isNaN(rating) ? null : rating;
    }
    if (game.bggRating) {
      const rating = parseFloat(game.bggRating);
      return isNaN(rating) ? null : rating;
    }
    // Check bggData from preloadedBggData
    if (bggData?.average) {
      const rating = parseFloat(bggData.average);
      return isNaN(rating) ? null : rating;
    }
    return null;
  }, [game.average, game.bggRating, bggData?.average]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(game.id);
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Handle card press animation
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 7,
    }).start();
  };

  const handleFavoriteToggle = async (e) => {
    // Stop event propagation to prevent triggering parent handlers
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    
    // If game is display-only, show explanation instead of favoriting
    if (isDisplayOnly) {
      setShowIncompleteExplanation(true);
      return;
    }
    
    if (!userId || !game) return;
    
    const newFavoriteStatus = !isFavorite;
    setIsFavorite(newFavoriteStatus);
    
    // If onFavorite prop is provided, use it instead of default behavior
    if (onFavorite) {
      onFavorite(game, newFavoriteStatus);
      return;
    }
    
    const gameId = game.bggId || game.id;
    if (!gameId) return;
    
    // Check if user owns the game in their collection
    const userGames = collections[userId] || [];
    const userGame = userGames.find(g => {
      const gId = g.bggId || g.id;
      return gId === gameId;
    });
    
    if (userGame) {
      // Update existing game
      try {
        await updateGameInCollection(userId, userGame.id, { isFavorite: newFavoriteStatus });
      } catch (error) {
        console.error('Error updating favorite status:', error);
        Alert.alert('Error', 'Failed to update favorite status. Please try again.');
        // Revert the state change
        setIsFavorite(!newFavoriteStatus);
      }
    } else if (db) {
      // Create new game entry with favorite status
      try {
        // Use bggId as document ID if available, otherwise use game.id or generate one
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
          isFavorite: newFavoriteStatus,
          addedAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
          source: 'manual',
        };
        
        // Add to local collections immediately for instant feedback
        addGameToCollection(userId, gameData);
        
        // Save to Firestore
        await db.collection('userGames').doc(userId)
          .collection('games').doc(docId)
          .set(gameData, { merge: true });
      } catch (error) {
        console.error('Error creating favorite game entry:', error);
        Alert.alert('Error', 'Failed to save favorite. Please try again.');
        // Revert the state change
        setIsFavorite(!newFavoriteStatus);
      }
    }
  };

  try {
    const animatedCardStyle = {
      transform: [{ scale: scaleAnim }],
    };

    return (
      <Animated.View style={[dynamicStyles.card, styles.card, animatedCardStyle]} pointerEvents={disableModal ? 'box-none' : 'auto'}>
        {/* Favorite Heart Button or Incomplete Data Indicator - Upper Left */}
        {userId && (
          <Pressable
            style={styles.favoriteButton}
            onPress={handleFavoriteToggle}
            onPressIn={(e) => {
              // Stop propagation immediately on press
              if (e && e.stopPropagation) {
                e.stopPropagation();
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isDisplayOnly 
                ? `Game has incomplete data - tap for explanation`
                : isFavorite 
                  ? `Remove ${title} from favorites` 
                  : `Add ${title} to favorites`
            }
          >
            {isDisplayOnly ? (
              <View style={styles.incompleteIndicator}>
                <Text style={styles.incompleteQuestionMark}>?</Text>
              </View>
            ) : (
              <Animated.View
                style={{
                  opacity: isFavorite ? shimmerOpacity : 1,
                  transform: isFavorite ? [{ scale: shimmerScale }] : [],
                }}
              >
                {isFavorite ? (
                  <FontAwesome5 
                    name="heart" 
                    size={16} 
                    solid={true}
                    color="#FFD700"
                  />
                ) : (
                  <DottedHeart size={16} color="#555555" />
                )}
              </Animated.View>
            )}
          </Pressable>
        )}
        
        {/* Explanation Modal for Incomplete Games */}
        {showIncompleteExplanation && (
          <View style={styles.modalOverlay}>
            <View style={styles.explanationModal}>
              <Text style={styles.explanationText}>
                Lacks heart data
              </Text>
              <Pressable
                style={styles.explanationButton}
                onPress={() => setShowIncompleteExplanation(false)}
              >
                <Text style={styles.explanationButtonText}>Got it</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Delete Button */}
        {onDelete && (
          <Pressable
            style={styles.deleteButton}
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${title}`}
          >
            <Text style={styles.deleteIcon}>✕</Text>
          </Pressable>
        )}

        {/* Clickable Card Content */}
        <Pressable
          onPress={disableModal ? undefined : openModal}
          onPressIn={disableModal ? undefined : handlePressIn}
          onPressOut={disableModal ? undefined : handlePressOut}
          style={styles.cardPressable}
          accessibilityRole="button"
          accessibilityLabel={disableModal ? undefined : `View details for ${title}`}
          pointerEvents={disableModal ? 'none' : 'auto'}
        >
          {/* Thumbnail Image */}
          <View style={styles.thumbnailContainer}>
            {thumbnail ? (
              <Image
                source={{ uri: thumbnail }}
                style={styles.thumbnail}
                resizeMode="cover"
                onError={(error) => {
                  console.error('[GameCard] Image load error:', error);
                }}
              />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <Text style={styles.thumbnailPlaceholderText}>
                  {title && typeof title === 'string' && title.length > 0
                    ? title.charAt(0).toUpperCase()
                    : '?'}
                </Text>
              </View>
            )}
          </View>

          {/* Card Content */}
          <View style={styles.cardContent}>
            {/* Title */}
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={3}>
                {title}
              </Text>
            </View>

            {/* Collapsed View - Year and Rating only */}
            <View style={styles.metaRow}>
              {year && <Text style={styles.year}>{year}</Text>}
              {bggRating !== null && bggRating > 0 && (
                <View style={styles.ratingHexagon}>
                  <Text style={styles.ratingHexagonText}>
                    {bggRating.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>

        {/* Full Screen Modal */}
        <GameDetailsModal
          game={game}
          isOpen={isModalOpen}
          onClose={closeModal}
          preloadedBggData={preloadedBggData}
          onProposeGame={onProposeGame}
          userProposals={userProposals}
          eventId={eventId}
        />
      </Animated.View>
    );
  } catch (error) {
    console.error('[GameCard] Error rendering game card:', error);
    return (
      <Animated.View style={[dynamicStyles.card, styles.card]}>
        <Text style={styles.title}>Error loading game</Text>
      </Animated.View>
    );
  }
};

// Calculate responsive card width based on screen size
// Returns a function that calculates width based on current dimensions
const getCardWidth = (screenWidth, containerPadding = 0, gap = 8) => {
  const columns = getColumnCount(screenWidth, {
    mobile: 1,
    tablet: 2,
    desktop: 3,
    largeDesktop: 4,
  });
  
  // Account for container padding, row padding, and gaps between cards
  const totalPadding = containerPadding * 2; // padding on both sides
  const totalGaps = gap * (columns - 1); // gaps between columns
  const availableWidth = screenWidth - totalPadding - totalGaps;
  return availableWidth / columns;
};

const styles = StyleSheet.create({
  card: {
    // Base card styles - width will be overridden by dynamicStyles
    borderRadius: theme.borderRadius.lg, // Rounded corners
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  cardPressable: {
    width: '100%',
  },
  deleteButton: {
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(192, 57, 43, 0.9)', // meeple-red with opacity
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteIcon: {
    color: '#fff',
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    lineHeight: 14,
  },
  favoriteButton: {
    position: 'absolute',
    top: theme.spacing.xs,
    left: theme.spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100, // Higher z-index to ensure it's above the card Pressable
    elevation: 5, // Android elevation
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  incompleteIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 193, 7, 0.9)', // Amber/yellow background
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  incompleteQuestionMark: {
    fontSize: 18,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#FFFFFF',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
  },
  explanationModal: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    margin: theme.spacing.lg,
    maxWidth: 400,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  explanationTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  explanationText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
  },
  explanationButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  explanationButtonText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  thumbnailContainer: {
    width: '100%',
    height: 120, // Thumbnail height for grid cards
    backgroundColor: theme.colors.woodLight,
    position: 'relative',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.woodMedium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 32,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
  },
  cardContent: {
    padding: theme.spacing.sm,
    minHeight: 70,
    justifyContent: 'space-between',
  },
  cardContentExpanded: {
    minHeight: 'auto',
  },
  titleRow: {
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    lineHeight: 18,
    marginBottom: theme.spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: theme.spacing.xs,
  },
  year: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  ratingHexagon: {
    width: 34,
    height: 34,
    backgroundColor: '#5cb85c',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
  },
  ratingHexagonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: theme.typography.fontWeight.bold,
    transform: [{ rotate: '-45deg' }],
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

// Simplified memo comparison - only compare essential props
export default React.memo(
  GameCard,
  (prevProps, nextProps) => {
    const gameChanged =
      prevProps.game.id !== nextProps.game.id ||
      prevProps.game.bggId !== nextProps.game.bggId;

    const bggDataChanged =
      prevProps.preloadedBggData?.id !== nextProps.preloadedBggData?.id;

    const deleteHandlerChanged = prevProps.onDelete !== nextProps.onDelete;

    const shouldUpdate = gameChanged || bggDataChanged || deleteHandlerChanged;

    if (shouldUpdate && __DEV__) {
      console.log('[GameCard] Memo: Props changed, allowing re-render', {
        gameChanged,
        bggDataChanged,
        deleteHandlerChanged,
      });
    }

    return !shouldUpdate;
  },
);
