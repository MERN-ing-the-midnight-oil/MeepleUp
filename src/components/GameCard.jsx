import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Dimensions, useWindowDimensions } from 'react-native';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import GameDetailsModal from './GameDetailsModal';
import { getColumnCount, BREAKPOINTS } from '../utils/responsive';

/**
 * Game Card Component with BGG Thumbnails
 * Displays game cards in a tall format (2 per row) with BGG thumbnail images
 * @param {Object} props
 * @param {Object} props.game - The game object
 * @param {Function} props.onDelete - Delete handler
 * @param {Object} props.preloadedBggData - Optional preloaded BGG data to avoid redundant API calls
 */
const GameCard = ({ game, onDelete, preloadedBggData = null, disableModal = false, containerPadding = 12, gap = 8 }) => {
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
  const [starRating, setStarRating] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  
  // Calculate responsive card width
  const cardWidth = useMemo(() => {
    return getCardWidth(screenWidth, containerPadding, gap);
  }, [screenWidth, containerPadding, gap]);
  
  // Create dynamic styles based on card width
  const dynamicStyles = useMemo(() => {
    return StyleSheet.create({
      card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
        position: 'relative',
        width: cardWidth,
        marginBottom: 12,
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
    const stars = preloadedBggData.average ? getStarRating(preloadedBggData.average) : 0;
    const thumbnail =
      preloadedBggData.thumbnail && !game.bggThumbnail && !game.thumbnail
        ? preloadedBggData.thumbnail
        : null;

    // Batch all state updates together
    requestAnimationFrame(() => {
      if (!isMountedRef.current) return;

      setBggData(preloadedBggData);
      setBadges(gameBadges);
      setStarRating(stars);
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

  // Memoize computed values to prevent unnecessary recalculations
  const thumbnail = useMemo(
    () => game.bggThumbnail || game.thumbnail || thumbnailUrl || null,
    [game.bggThumbnail, game.thumbnail, thumbnailUrl],
  );

  const title = useMemo(
    () => (typeof game.title === 'string' && game.title.length > 0 ? game.title : 'Unknown Game'),
    [game.title],
  );

  const year = useMemo(
    () => game.yearPublished || bggData?.yearPublished || null,
    [game.yearPublished, bggData?.yearPublished],
  );

  const rating = useMemo(() => {
    if (starRating) return starRating;
    if (bggData?.average) {
      try {
        return getStarRating(bggData.average);
      } catch (error) {
        console.error('[GameCard] Error calculating rating:', error);
        return 0;
      }
    }
    return 0;
  }, [starRating, bggData?.average]);

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

  try {
    return (
      <View style={[dynamicStyles.card, styles.card]} pointerEvents={disableModal ? 'box-none' : 'auto'}>
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
            {/* Crown icon for favorites */}
            {game.isFavorite && (
              <View style={styles.crownContainer}>
                <Text style={styles.crownIcon}>👑</Text>
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
              {rating > 0 && (
                <View style={styles.ratingContainer}>
                  <Text style={styles.ratingText}>
                    {'★'.repeat(Math.floor(rating))}
                    {rating % 1 >= 0.5 ? '½' : ''}
                  </Text>
                  {bggData?.average && (
                    <Text style={styles.ratingNumber}>
                      {parseFloat(bggData.average).toFixed(1)}
                    </Text>
                  )}
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
        />
      </View>
    );
  } catch (error) {
    console.error('[GameCard] Error rendering game card:', error);
    return (
      <View style={[dynamicStyles.card, styles.card]}>
        <Text style={styles.title}>Error loading game</Text>
      </View>
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
  },
  cardPressable: {
    width: '100%',
  },
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteIcon: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  thumbnailContainer: {
    width: '100%',
    height: 140, // Reduced height for smaller cards
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  crownContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.9)',
    borderRadius: 12,
    padding: 4,
    zIndex: 5,
  },
  crownIcon: {
    fontSize: 16,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#999',
  },
  cardContent: {
    padding: 8,
    minHeight: 60,
  },
  cardContentExpanded: {
    minHeight: 'auto',
  },
  titleRow: {
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  year: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 10,
    color: '#FFA500',
  },
  ratingNumber: {
    fontSize: 9,
    color: '#999',
    fontWeight: '500',
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
