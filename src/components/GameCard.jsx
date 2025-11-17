import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getGameById } from '../utils/bggLocalDB';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import CategoryBadge from './CategoryBadge';

/**
 * Enhanced Game Card Component
 * Displays game with thumbnail, title, year, star rating, and category badges
 */
const GameCard = ({ game }) => {
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

  return (
    <View style={styles.card}>
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
                {'☆'.repeat(5 - Math.ceil(rating))}
              </Text>
              {bggData?.average && (
                <Text style={styles.ratingNumber}>
                  {parseFloat(bggData.average).toFixed(1)}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Category Badges */}
        {badges.length > 0 && (
          <View style={styles.badgesContainer}>
            {badges.map((badge, index) => (
              <CategoryBadge key={`${badge.category}-${index}`} badge={badge} size={16} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginBottom: 16,
  },
  thumbnailContainer: {
    width: '100%',
    height: 200,
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
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  year: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: 14,
    color: '#FFA500',
  },
  ratingNumber: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
});

export default GameCard;

