import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { getGameById } from '../utils/bggLocalDB';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import CategoryBadge from './CategoryBadge';

/**
 * Enhanced Game Card Component
 * Displays game with thumbnail, title, year, star rating, and category badges
 */
const GameCard = ({ game, onDelete }) => {
  const [bggData, setBggData] = useState(null);
  const [badges, setBadges] = useState([]);
  const [starRating, setStarRating] = useState(0);

  useEffect(() => {
    const loadBGGData = async () => {
      // If game has bggId, try to load full BGG data for badges
      if (game.bggId) {
        try {
          const fullGameData = await getGameById(game.bggId);
          if (fullGameData) {
            setBggData(fullGameData);
            const gameBadges = getGameBadges(fullGameData);
            setBadges(gameBadges);
            
            // Get star rating
            if (fullGameData.average) {
              const stars = getStarRating(fullGameData.average);
              setStarRating(stars);
            }
          }
        } catch (error) {
          console.error('Error loading BGG data for game:', error);
        }
      }
    };

    loadBGGData();
  }, [game.bggId]);

  const thumbnail = game.bggThumbnail || game.thumbnail || null;
  const title = game.title || 'Unknown Game';
  const year = game.yearPublished || bggData?.yearPublished || null;
  const rating = starRating || (bggData?.average ? getStarRating(bggData.average) : 0);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(game.id);
    }
  };

  return (
    <View style={styles.card}>
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

      {/* Thumbnail */}
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
      <View style={styles.cardContent}>
        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {/* Year and Rating Row */}
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

        {/* Category Badges - smaller and limited */}
        {badges.length > 0 && (
          <View style={styles.badgesContainer}>
            {badges.slice(0, 3).map((badge, index) => (
              <CategoryBadge key={`${badge.category}-${index}`} badge={badge} size={14} />
            ))}
            {badges.length > 3 && (
              <Text style={styles.moreBadges}>+{badges.length - 3}</Text>
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
    width: '100%', // Fill wrapper width
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
    height: 100, // Half of original 200
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
    fontSize: 32, // Smaller for smaller card
    fontWeight: 'bold',
    color: '#999',
  },
  cardContent: {
    padding: 8, // Smaller padding
  },
  title: {
    fontSize: 13, // Smaller font
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  year: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 11,
    color: '#FFA500',
  },
  ratingNumber: {
    fontSize: 10,
    color: '#999',
    fontWeight: '500',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
    alignItems: 'center',
  },
  moreBadges: {
    fontSize: 9,
    color: '#999',
    marginLeft: 4,
    fontWeight: '500',
  },
});

export default GameCard;

