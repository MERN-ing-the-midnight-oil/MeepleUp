import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Platform } from 'react-native';
import { getGameById } from '../services/gameDatabase';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import { mapFontNameToFamily, shouldUseBoldWeight } from '../utils/fontMapper';
import CategoryBadge from './CategoryBadge';

/**
 * Enhanced Game Card Component with AI-Styled Support
 * Displays game with AI-extracted styling (colors, fonts) or fallback to thumbnail
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
  const styling = game.styling || null;

  // Validate and normalize color hex codes
  const normalizeColor = (color) => {
    try {
      if (!color || typeof color !== 'string') return null;
      // Remove # if present and ensure it's a valid hex
      const hex = color.replace('#', '').trim();
      // Support both 6-digit and 3-digit hex codes
      if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
        return `#${hex}`;
      }
      // Try 3-digit hex
      if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
      }
      return null;
    } catch (error) {
      console.warn('Error normalizing color:', color, error);
      return null;
    }
  };

  // Extract styling values (support both old and new schema for backward compatibility)
  let backgroundColor = null;
  let titleTextColor = null;
  let fontName = null;

  try {
    if (styling) {
      backgroundColor = styling.backgroundColor 
        ? normalizeColor(styling.backgroundColor) 
        : (styling.primaryColor ? normalizeColor(styling.primaryColor) : null);
      
      titleTextColor = styling.titleTextColor 
        ? normalizeColor(styling.titleTextColor) 
        : null;
      
      fontName = styling.fontName || styling.fontStyle || null;
    }
  } catch (error) {
    console.warn('Error extracting styling:', error);
  }
  
  const hasStyling = backgroundColor !== null && backgroundColor !== undefined;

  // Get font family from font name (with error handling)
  let fontFamily = undefined;
  let shouldBold = false;
  try {
    if (fontName && typeof fontName === 'string' && fontName.trim().length > 0) {
      const mappedFont = mapFontNameToFamily(fontName);
      // Only use fontFamily if it's a valid non-empty string
      if (mappedFont && typeof mappedFont === 'string' && mappedFont.trim().length > 0) {
        fontFamily = mappedFont;
      }
      shouldBold = shouldUseBoldWeight(fontName);
      if (__DEV__) {
        console.log('[GameCard] Font mapping:', {
          fontName,
          fontFamily,
          shouldBold,
          hasStyling,
          backgroundColor,
          titleTextColor,
        });
      }
    } else if (__DEV__ && hasStyling) {
      console.log('[GameCard] No fontName provided in styling:', styling);
    }
  } catch (error) {
    console.warn('Error mapping font:', fontName, error);
    // Ensure fontFamily stays undefined on error to prevent crashes
    fontFamily = undefined;
  }

  // Get text colors - use extracted titleTextColor if available, otherwise calculate from background
  const getTextColor = () => {
    try {
      if (titleTextColor) {
        return titleTextColor;
      }
      // Fallback: calculate text color based on background brightness
      if (!backgroundColor) return '#333';
      // Convert hex to RGB and calculate brightness
      const hex = backgroundColor.replace('#', '');
      if (hex.length !== 6) return '#333';
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return '#333';
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 128 ? '#000000' : '#FFFFFF';
    } catch (error) {
      console.warn('Error calculating text color:', error);
      return '#333';
    }
  };

  // Get secondary text color (semi-transparent variant of main text color)
  const getSecondaryTextColor = () => {
    try {
      const mainColor = getTextColor();
      if (mainColor === '#FFFFFF' || mainColor === '#FFF') {
        return 'rgba(255, 255, 255, 0.8)';
      }
      return 'rgba(0, 0, 0, 0.7)';
    } catch (error) {
      console.warn('Error calculating secondary text color:', error);
      return '#666';
    }
  };

  const textColor = getTextColor();
  const secondaryTextColor = getSecondaryTextColor();

  const handleDelete = () => {
    if (onDelete) {
      onDelete(game.id);
    }
  };

  // Render styled card (AI-styled) or traditional card (with thumbnail)
  // Only render styled card if we have a valid background color
  if (hasStyling && backgroundColor) {
    // Build style object safely
    const titleStyle = {
      color: textColor,
      fontWeight: shouldBold ? '700' : '600',
    };
    
    // Only add fontFamily if it's valid (prevents React Native crashes)
    if (fontFamily && typeof fontFamily === 'string' && fontFamily.trim().length > 0) {
      titleStyle.fontFamily = fontFamily;
    }
    
    // AI-Styled Card with solid background color
    return (
      <View style={styles.card}>
        {/* Delete Button */}
        {onDelete && (
          <Pressable
            style={[styles.deleteButton, { backgroundColor: 'rgba(231, 76, 60, 0.95)' }]}
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${title}`}
          >
            <Text style={styles.deleteIcon}>✕</Text>
          </Pressable>
        )}

        {/* Solid Background Card */}
        <View style={[styles.styledCardContainer, { backgroundColor }]}>
          {/* Card Content */}
          <View style={styles.styledCardContent}>
            {/* Title with AI styling - using extracted font and colors */}
            <Text 
              style={[styles.styledTitle, titleStyle]} 
              numberOfLines={2}
            >
              {title}
            </Text>

            {/* Year and Rating Row */}
            <View style={styles.styledMetaRow}>
              {year && (
                <Text style={[styles.styledYear, { color: secondaryTextColor }]}>{year}</Text>
              )}
              {rating > 0 && (
                <View style={styles.ratingContainer}>
                  <Text style={[styles.styledRatingText, { color: textColor }]}>
                    {'★'.repeat(Math.floor(rating))}
                    {rating % 1 >= 0.5 ? '½' : ''}
                  </Text>
                  {bggData?.average && (
                    <Text style={[styles.styledRatingNumber, { color: secondaryTextColor }]}>
                      {parseFloat(bggData.average).toFixed(1)}
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Category Badges - overlay on styled card */}
            {badges.length > 0 && (
              <View style={styles.styledBadgesContainer}>
                {badges.slice(0, 3).map((badge, index) => (
                  <CategoryBadge key={`${badge.category}-${index}`} badge={badge} size={14} />
                ))}
                {badges.length > 3 && (
                  <Text style={[styles.styledMoreBadges, { color: secondaryTextColor }]}>
                    +{badges.length - 3}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  // Traditional Card (fallback for games without styling)
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
    height: 50, // Reduced to half height
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
    fontSize: 24, // Reduced for smaller card
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
  // AI-Styled Card Styles
  styledCardContainer: {
    width: '100%',
    minHeight: 90, // Reduced to half height
    borderRadius: 12,
    overflow: 'hidden',
  },
  styledCardContainerFallback: {
    backgroundColor: '#f5f5f5', // Fallback gray background if color parsing fails
  },
  styledCardContent: {
    padding: 8, // Reduced padding
    minHeight: 90, // Reduced to half height
    justifyContent: 'space-between',
  },
  styledTitle: {
    fontSize: 14, // Reduced for smaller card
    marginBottom: 4, // Reduced margin
    lineHeight: 18, // Reduced line height
  },
  styledMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4, // Reduced margin
  },
  styledYear: {
    fontSize: 12,
    fontWeight: '500',
  },
  styledRatingText: {
    fontSize: 12,
  },
  styledRatingNumber: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
  },
  styledBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2, // Reduced margin
    alignItems: 'center',
  },
  styledMoreBadges: {
    fontSize: 10,
    marginLeft: 4,
    fontWeight: '500',
  },
});

export default GameCard;

