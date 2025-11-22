import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { getGameById } from '../services/gameDatabase';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import CategoryBadge from './CategoryBadge';

/**
 * Game Card Component with BGG Thumbnails
 * Displays game cards in a tall format (2 per row) with BGG thumbnail images
 */
const GameCard = ({ game, onDelete }) => {
  const [bggData, setBggData] = useState(null);
  const [badges, setBadges] = useState([]);
  const [starRating, setStarRating] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);

  useEffect(() => {
    const loadBGGData = async () => {
      // If game has bggId, try to load full BGG data for badges and thumbnails
      if (game.bggId) {
        try {
          // Use getGameDetails to get full data including thumbnails from BGG API
          const { getGameDetails } = await import('../utils/api');
          const fullGameData = await getGameDetails(game.bggId);
          
          if (fullGameData) {
            setBggData(fullGameData);
            const gameBadges = getGameBadges(fullGameData);
            setBadges(gameBadges);
            
            // Get star rating
            if (fullGameData.average) {
              const stars = getStarRating(fullGameData.average);
              setStarRating(stars);
            }
            
            // Update thumbnail if we got one from BGG API and game doesn't have one
            if (fullGameData.thumbnail && !game.bggThumbnail && !game.thumbnail) {
              setThumbnailUrl(fullGameData.thumbnail);
            }
          }
        } catch (error) {
          console.error('Error loading BGG data for game:', error);
          // Fallback to getGameById if getGameDetails fails
          try {
            const fallbackData = await getGameById(game.bggId);
            if (fallbackData) {
              setBggData(fallbackData);
              const gameBadges = getGameBadges(fallbackData);
              setBadges(gameBadges);
              if (fallbackData.average) {
                const stars = getStarRating(fallbackData.average);
                setStarRating(stars);
              }
            }
          } catch (fallbackError) {
            console.error('Error loading BGG data (fallback):', fallbackError);
          }
        }
      }
    };

    loadBGGData();
  }, [game.bggId]);

  const thumbnail = game.bggThumbnail || game.thumbnail || thumbnailUrl || null;
  const title = game.title || 'Unknown Game';
  const year = game.yearPublished || bggData?.yearPublished || null;
  const rating = starRating || (bggData?.average ? getStarRating(bggData.average) : 0);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(game.id);
    }
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

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
          <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="cover" />
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
            {badges.length > 0 && (
              <View style={styles.expandedBadgesContainer}>
                <Text style={[styles.expandedMetaLabel, { marginBottom: 8 }]}>Categories:</Text>
                <View style={styles.expandedBadges}>
                  {badges.map((badge, index) => (
                    <CategoryBadge key={`${badge.category}-${index}`} badge={badge} size={16} />
                  ))}
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

export default GameCard;
