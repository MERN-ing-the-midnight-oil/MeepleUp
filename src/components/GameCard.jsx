import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { getGameById } from '../services/gameDatabase';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import CategoryBadge from './CategoryBadge';
import { getGameDetails } from '../utils/api';

/**
 * Game Card Component with BGG Thumbnails
 * Displays game cards in a tall format (2 per row) with BGG thumbnail images
 * @param {Object} props
 * @param {Object} props.game - The game object
 * @param {Function} props.onDelete - Delete handler
 * @param {Object} props.preloadedBggData - Optional preloaded BGG data to avoid redundant API calls
 */
const GameCard = ({ game, onDelete, preloadedBggData = null }) => {
  console.log('[GameCard] Rendering for game:', game.title || game.id, 'bggId:', game.bggId, 'preloadedData:', preloadedBggData ? 'yes' : 'no');
  
  const [bggData, setBggData] = useState(preloadedBggData);
  const [badges, setBadges] = useState([]);
  const [starRating, setStarRating] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const isMountedRef = useRef(true);
  
  // Initialize badges and rating from preloaded data - only run once
  const initializedRef = useRef(false);
  useEffect(() => {
    console.log('[GameCard] Init effect for game:', game.title || game.id, 'preloadedBggData:', !!preloadedBggData, 'badges.length:', badges.length, 'initialized:', initializedRef.current);
    
    // Only initialize once
    if (initializedRef.current) {
      console.log('[GameCard] Already initialized, skipping for game:', game.title || game.id);
      return;
    }
    
    if (preloadedBggData && !badges.length) {
      console.log('[GameCard] Initializing from preloaded data for game:', game.title || game.id);
      initializedRef.current = true;
      
      // Use requestAnimationFrame to batch state updates and prevent re-render storms
      requestAnimationFrame(() => {
        if (!isMountedRef.current) {
          console.log('[GameCard] Component unmounted before state update');
          return;
        }
        
        try {
          console.log('[GameCard] Calling getGameBadges for game:', game.title || game.id);
          const gameBadges = getGameBadges(preloadedBggData);
          console.log('[GameCard] getGameBadges returned', gameBadges.length, 'badges for game:', game.title || game.id);
          
          // Batch all state updates together
          if (isMountedRef.current) {
            setBadges(gameBadges);
            
            if (preloadedBggData.average) {
              console.log('[GameCard] Getting star rating for game:', game.title || game.id, 'average:', preloadedBggData.average);
              const stars = getStarRating(preloadedBggData.average);
              console.log('[GameCard] Star rating calculated:', stars, 'for game:', game.title || game.id);
              setStarRating(stars);
            }
            
            if (preloadedBggData.thumbnail && !game.bggThumbnail && !game.thumbnail) {
              console.log('[GameCard] Setting thumbnail for game:', game.title || game.id);
              setThumbnailUrl(preloadedBggData.thumbnail);
            }
          }
          console.log('[GameCard] Initialization complete for game:', game.title || game.id);
        } catch (error) {
          console.error('[GameCard] Error initializing from preloaded data for game:', game.title || game.id, 'error:', error, 'stack:', error.stack);
          initializedRef.current = false; // Allow retry on error
        }
      });
    } else {
      console.log('[GameCard] Skipping init - preloadedBggData:', !!preloadedBggData, 'badges.length:', badges.length);
    }
  }, [preloadedBggData]); // Only depend on preloadedBggData, not all game properties

  useEffect(() => {
    console.log('[GameCard] useEffect triggered for game:', game.title || game.id, 'hasPreloadedData:', !!preloadedBggData);
    isMountedRef.current = true;
    
    // If we have preloaded data, skip the API call
    if (preloadedBggData) {
      console.log('[GameCard] Using preloaded BGG data, skipping API call for game:', game.title || game.id);
      return () => {
        console.log('[GameCard] Cleanup: Component unmounting for game:', game.title || game.id);
        isMountedRef.current = false;
      };
    }
    
    const loadBGGData = async () => {
      // Skip loading if we don't have preloaded data
      // CollectionScreen already tried to load it, so don't retry here to avoid crashes
      if (!preloadedBggData) {
        console.log('[GameCard] Skipping BGG data load - no preloaded data available for game:', game.title || game.id);
        return;
      }
      
      console.log('[GameCard] No bggId or already has preloaded data for game:', game.title || game.id);
    };

    loadBGGData().catch((error) => {
      console.error('[GameCard] Unhandled error in loadBGGData for game:', game.title || game.id, 'error:', error);
    });

    return () => {
      console.log('[GameCard] Cleanup: Component unmounting for game:', game.title || game.id);
      isMountedRef.current = false;
    };
  }, [game.bggId, game.title, game.id, preloadedBggData]);

  // Memoize computed values to prevent unnecessary recalculations
  const thumbnail = useMemo(() => game.bggThumbnail || game.thumbnail || thumbnailUrl || null, [game.bggThumbnail, game.thumbnail, thumbnailUrl]);
  const title = useMemo(() => game.title || 'Unknown Game', [game.title]);
  const year = useMemo(() => game.yearPublished || bggData?.yearPublished || null, [game.yearPublished, bggData?.yearPublished]);
  
  // Safely calculate rating - memoized
  const rating = useMemo(() => {
    if (starRating) return starRating;
    if (bggData?.average) {
      try {
        return getStarRating(bggData.average);
      } catch (error) {
        console.error('[GameCard] Error calculating rating for game:', game.title || game.id, 'error:', error);
        return 0;
      }
    }
    return 0;
  }, [starRating, bggData?.average, game.title, game.id]);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(game.id);
    }
  };

  const toggleExpand = () => {
    console.log('[GameCard] Toggle expand for game:', game.title || game.id, 'current:', isExpanded);
    setIsExpanded(!isExpanded);
  };

  try {
    console.log('[GameCard] About to render JSX for game:', game.title || game.id, 'bggData:', !!bggData, 'badges.length:', badges.length);
    return (
      <View style={styles.card}>
      {/* Expand/Collapse Button */}
      <Pressable
        style={styles.expandButton}
        onPress={toggleExpand}
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? "Collapse game details" : "Expand game details"}
      >
        <Text style={styles.expandIcon}>
          {isExpanded ? '▼' : '▶'}
        </Text>
      </Pressable>

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

      {/* Thumbnail Image */}
      <View style={styles.thumbnailContainer}>
        {thumbnail ? (
          <Image 
            source={{ uri: thumbnail }} 
            style={styles.thumbnail} 
            resizeMode="cover"
            onError={(error) => {
              console.error('[GameCard] Image load error for game:', game.title || game.id, 'thumbnail:', thumbnail, 'error:', error);
            }}
            onLoad={() => {
              console.log('[GameCard] Image loaded successfully for game:', game.title || game.id);
            }}
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Text style={styles.thumbnailPlaceholderText}>{title.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Card Content */}
      <View style={[styles.cardContent, isExpanded && styles.cardContentExpanded]}>
        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={isExpanded ? 0 : 3}>
            {title}
          </Text>
        </View>

        {/* Collapsed View - Year and Rating only */}
        {!isExpanded && (
          <View style={styles.metaRow}>
            {year && (
              <Text style={styles.year}>{year}</Text>
            )}
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
        )}

        {/* Expanded View - All Game Details */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Year and Rating */}
            <View style={styles.expandedMetaRow}>
              {year && (
                <View style={styles.expandedMetaItem}>
                  <Text style={styles.expandedMetaLabel}>Published:</Text>
                  <Text style={styles.expandedMetaValue}>{year}</Text>
                </View>
              )}
              {rating > 0 && (
                <View style={styles.expandedMetaItem}>
                  <Text style={styles.expandedMetaLabel}>Rating:</Text>
                  <View style={styles.ratingContainer}>
                    <Text style={styles.ratingText}>
                      {'★'.repeat(Math.floor(rating))}
                      {rating % 1 >= 0.5 ? '½' : ''}
                    </Text>
                    {bggData?.average && (
                      <Text style={[styles.expandedMetaValue, { marginLeft: 4 }]}>
                        {parseFloat(bggData.average).toFixed(1)}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Players */}
            {(bggData?.minPlayers || bggData?.maxPlayers) && (
              <View style={styles.expandedMetaItem}>
                <Text style={styles.expandedMetaLabel}>Players:</Text>
                <Text style={styles.expandedMetaValue}>
                  {bggData.minPlayers === bggData.maxPlayers 
                    ? `${bggData.minPlayers}` 
                    : `${bggData.minPlayers}-${bggData.maxPlayers}`}
                </Text>
              </View>
            )}

            {/* Playing Time */}
            {bggData?.playingTime && (
              <View style={styles.expandedMetaItem}>
                <Text style={styles.expandedMetaLabel}>Playing Time:</Text>
                <Text style={styles.expandedMetaValue}>{bggData.playingTime} min</Text>
              </View>
            )}

            {/* Age Rating */}
            {bggData?.minAge && (
              <View style={styles.expandedMetaItem}>
                <Text style={styles.expandedMetaLabel}>Age:</Text>
                <Text style={styles.expandedMetaValue}>{bggData.minAge}+</Text>
              </View>
            )}

            {/* Category Badges */}
            {badges && Array.isArray(badges) && badges.length > 0 && (
              <View style={styles.expandedBadgesContainer}>
                <Text style={[styles.expandedMetaLabel, { marginBottom: 8 }]}>Categories:</Text>
                <View style={styles.expandedBadges}>
                  {badges.map((badge, index) => {
                    try {
                      return <CategoryBadge key={`${badge?.category || 'badge'}-${index}`} badge={badge} size={16} />;
                    } catch (error) {
                      console.error('[GameCard] Error rendering badge:', error);
                      return null;
                    }
                  })}
                </View>
              </View>
            )}

            {/* Description */}
            {bggData?.description && (
              <View style={styles.expandedDescription}>
                <Text style={[styles.expandedMetaLabel, { marginBottom: 8 }]}>Description:</Text>
                <Text style={styles.expandedDescriptionText} numberOfLines={5}>
                  {bggData.description.replace(/<[^>]*>/g, '')}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
    );
  } catch (error) {
    console.error('[GameCard] Error rendering game card for:', game.title || game.id, 'error:', error);
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Error loading game</Text>
      </View>
    );
  }
};

const styles = StyleSheet.create({
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
    width: '48%', // Two cards per row with gap
    marginBottom: 12,
  },
  expandButton: {
    position: 'absolute',
    top: 4,
    right: 32,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
  },
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  thumbnailContainer: {
    width: '100%',
    height: 200, // Tall thumbnail for card format
    backgroundColor: '#f5f5f5',
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
    fontSize: 48,
    fontWeight: 'bold',
    color: '#999',
  },
  cardContent: {
    padding: 12,
    minHeight: 80,
  },
  cardContentExpanded: {
    minHeight: 'auto',
  },
  titleRow: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    lineHeight: 20,
  },
  expandIcon: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  year: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    color: '#FFA500',
  },
  ratingNumber: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  // Expanded Content Styles
  expandedContent: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  expandedMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  expandedMetaItem: {
    marginBottom: 8,
    marginRight: 16,
    minWidth: 100,
  },
  expandedMetaLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  expandedMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  expandedBadgesContainer: {
    marginTop: 8,
    marginBottom: 12,
  },
  expandedBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  expandedDescription: {
    marginTop: 8,
  },
  expandedDescriptionText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#333',
  },
});

// Memoize GameCard to prevent unnecessary re-renders
// Return true if props are equal (skip re-render), false if different (re-render)
export default React.memo(GameCard, (prevProps, nextProps) => {
  // Compare key properties that matter for rendering
  const gameChanged = 
    prevProps.game.id !== nextProps.game.id ||
    prevProps.game.title !== nextProps.game.title ||
    prevProps.game.bggId !== nextProps.game.bggId;
  
  const bggDataChanged = prevProps.preloadedBggData !== nextProps.preloadedBggData;
  const deleteHandlerChanged = prevProps.onDelete !== nextProps.onDelete;
  
  const shouldUpdate = gameChanged || bggDataChanged || deleteHandlerChanged;
  
  if (shouldUpdate) {
    console.log('[GameCard] Memo: Props changed, allowing re-render', {
      gameChanged,
      bggDataChanged,
      deleteHandlerChanged
    });
  }
  
  return !shouldUpdate; // Return true to skip re-render, false to allow
});
