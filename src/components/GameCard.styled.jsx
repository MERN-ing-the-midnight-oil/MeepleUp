import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Platform } from 'react-native';
import { getGameById } from '../services/gameDatabase';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import { mapFontNameToFamily, shouldUseBoldWeight } from '../utils/fontMapper';
import { loadFontOnDemand, isFontLoaded } from '../utils/fontLoader';
import CategoryBadge from './CategoryBadge';

/**
 * Enhanced Game Card Component with AI-Styled Support
 * Displays game with AI-extracted styling (colors, fonts) or fallback to thumbnail
 * Now with expandable details view
 */
const GameCard = ({ game, onDelete }) => {
  const [bggData, setBggData] = useState(null);
  const [badges, setBadges] = useState([]);
  const [starRating, setStarRating] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);

  useEffect(() => {
    const loadBGGData = async () => {
      // If game has bggId, try to load full BGG data for badges
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

  // Preload font when component mounts if styling includes a font
  useEffect(() => {
    if (styling?.fontFamily && typeof styling.fontFamily === 'string') {
      const fontName = styling.fontFamily.trim();
      // Only load if not already loaded
      if (!isFontLoaded(fontName)) {
        loadFontOnDemand(fontName).catch(error => {
          if (__DEV__) {
            console.warn('[GameCard] Error preloading font:', fontName, error);
          }
        });
      }
    }
  }, [styling?.fontFamily]);

  const thumbnail = game.bggThumbnail || game.thumbnail || thumbnailUrl || null;
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
      
      // Support both new schema (color) and old schema (titleTextColor)
      titleTextColor = styling.color 
        ? normalizeColor(styling.color) 
        : (styling.titleTextColor ? normalizeColor(styling.titleTextColor) : null);
      
      // Support new schema (fontFamily) first, then fall back to old schema (fontName, fontStyle)
      fontName = styling.fontFamily || styling.fontName || styling.fontStyle || null;
      
      if (__DEV__ && styling.fontFamily) {
        console.log('[GameCard] Found fontFamily from Claude:', styling.fontFamily);
      }
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

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
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
        {/* Expand/Collapse Button */}
        <Pressable
          style={styles.expandButtonTop}
          onPress={toggleExpand}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? "Collapse game details" : "Expand game details"}
        >
          <Text style={[styles.expandIcon, { color: textColor }]}>
            {isExpanded ? '▼' : '▶'}
          </Text>
        </Pressable>

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
          <View style={[styles.styledCardContent, isExpanded && styles.styledCardContentExpanded]}>
            {/* Title */}
            <View style={styles.titleRow}>
              <Text 
                style={[styles.styledTitle, titleStyle]} 
                numberOfLines={isExpanded ? 0 : 5}
              >
                {title}
              </Text>
            </View>

            {/* Collapsed View - Year and Rating only */}
            {!isExpanded && (
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
            )}

            {/* Expanded View - All Game Details */}
            {isExpanded && (
              <View style={[
                styles.expandedContent,
                { borderTopColor: textColor === '#FFFFFF' || textColor === '#FFF' 
                  ? 'rgba(255, 255, 255, 0.2)' 
                  : 'rgba(0, 0, 0, 0.1)' }
              ]}>
                {/* Year and Rating */}
                <View style={styles.expandedMetaRow}>
                  {year && (
                    <View style={styles.expandedMetaItem}>
                      <Text style={[styles.expandedMetaLabel, { color: secondaryTextColor }]}>
                        Published:
                      </Text>
                      <Text style={[styles.expandedMetaValue, { color: textColor }]}>
                        {year}
                      </Text>
                    </View>
                  )}
                  {rating > 0 && (
                    <View style={styles.expandedMetaItem}>
                      <Text style={[styles.expandedMetaLabel, { color: secondaryTextColor }]}>
                        Rating:
                      </Text>
                      <View style={styles.ratingContainer}>
                        <Text style={[styles.styledRatingText, { color: textColor }]}>
                          {'★'.repeat(Math.floor(rating))}
                          {rating % 1 >= 0.5 ? '½' : ''}
                        </Text>
                        {bggData?.average && (
                          <Text style={[styles.expandedMetaValue, { color: secondaryTextColor, marginLeft: 4 }]}>
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
                    <Text style={[styles.expandedMetaLabel, { color: secondaryTextColor }]}>
                      Players:
                    </Text>
                    <Text style={[styles.expandedMetaValue, { color: textColor }]}>
                      {bggData.minPlayers === bggData.maxPlayers 
                        ? `${bggData.minPlayers}` 
                        : `${bggData.minPlayers}-${bggData.maxPlayers}`}
                    </Text>
                  </View>
                )}

                {/* Playing Time */}
                {bggData?.playingTime && (
                  <View style={styles.expandedMetaItem}>
                    <Text style={[styles.expandedMetaLabel, { color: secondaryTextColor }]}>
                      Playing Time:
                    </Text>
                    <Text style={[styles.expandedMetaValue, { color: textColor }]}>
                      {bggData.playingTime} min
                    </Text>
                  </View>
                )}

                {/* Age Rating */}
                {bggData?.minAge && (
                  <View style={styles.expandedMetaItem}>
                    <Text style={[styles.expandedMetaLabel, { color: secondaryTextColor }]}>
                      Age:
                    </Text>
                    <Text style={[styles.expandedMetaValue, { color: textColor }]}>
                      {bggData.minAge}+
                    </Text>
                  </View>
                )}

                {/* Category Badges */}
                {badges.length > 0 && (
                  <View style={styles.expandedBadgesContainer}>
                    <Text style={[styles.expandedMetaLabel, { color: secondaryTextColor, marginBottom: 8 }]}>
                      Categories:
                    </Text>
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
                    <Text style={[styles.expandedMetaLabel, { color: secondaryTextColor, marginBottom: 8 }]}>
                      Description:
                    </Text>
                    <Text style={[styles.expandedDescriptionText, { color: textColor }]} numberOfLines={5}>
                      {bggData.description.replace(/<[^>]*>/g, '')}
                    </Text>
                  </View>
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
      {/* Expand/Collapse Button */}
      <Pressable
        style={styles.expandButtonTop}
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
      <View style={[styles.cardContent, isExpanded && styles.cardContentExpanded]}>
        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={isExpanded ? 0 : 5}>
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
    width: '100%', // Full width on mobile
    marginBottom: 12,
  },
  expandButtonTop: {
    position: 'absolute',
    top: 4,
    right: 32, // Positioned to the left of delete button (which is 24px wide + 4px spacing)
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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
    height: 53, // Reduced by one third
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
    padding: 12,
    minHeight: 67, // Reduced by one third
  },
  cardContentExpanded: {
    minHeight: 'auto',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    minHeight: 27,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    lineHeight: 36,
  },
  expandIcon: {
    fontSize: 24,
    color: '#666',
    fontWeight: '600',
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
    minHeight: 67, // Reduced by one third
    borderRadius: 12,
    overflow: 'hidden',
  },
  styledCardContainerFallback: {
    backgroundColor: '#f5f5f5', // Fallback gray background if color parsing fails
  },
  styledCardContent: {
    padding: 12,
    minHeight: 80, // Reduced by one third
    justifyContent: 'space-between',
  },
  styledCardContentExpanded: {
    minHeight: 'auto',
  },
  styledTitle: {
    fontSize: 28,
    flex: 1,
    marginRight: 8,
    lineHeight: 36,
    fontWeight: '700',
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
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  expandedMetaValue: {
    fontSize: 14,
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
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
  },
});

export default GameCard;

