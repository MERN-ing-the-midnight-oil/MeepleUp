import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform, Pressable, TouchableOpacity } from 'react-native';
import { getGameById } from '../services/gameDatabase';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import CategoryBadge from './CategoryBadge';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';

const GameDetailsModal = ({ game, isOpen, onClose, preloadedBggData = null, showTeachingStatus = false }) => {
  const { user } = useAuth();
  const { updateGameInCollection } = useCollections();
  const [bggData, setBggData] = useState(preloadedBggData);
  const [badges, setBadges] = useState([]);
  const [starRating, setStarRating] = useState(0);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  // Initialize teaching statuses with backward compatibility migration
  // Support both old single-value format and new array format
  const migrateTeachingStatuses = (statusOrArray) => {
    if (!statusOrArray) return [];
    // If it's already an array, return it (new format)
    if (Array.isArray(statusOrArray)) {
      return statusOrArray.map(status => {
        // Migrate old statuses to new ones
        if (status === 'can-teach') return 'happy-to-teach';
        if (status === 'still-learning') return 'havent-played-yet';
        return status;
      });
    }
    // If it's a single value (old format), convert to array
    if (statusOrArray === 'can-teach') return ['happy-to-teach'];
    if (statusOrArray === 'still-learning') return ['havent-played-yet'];
    return [statusOrArray];
  };

  const [teachingStatuses, setTeachingStatuses] = useState([]);
  const isMountedRef = useRef(true);
  const userId = user?.uid || user?.id;

  // Track the last processed teaching status to prevent loops
  const lastProcessedStatusRef = useRef(null);

  // Update teaching statuses when game changes (modal opens with new game)
  useEffect(() => {
    const statusKey = `${game?.id}-${JSON.stringify(game?.teachingStatus)}`;

    if (lastProcessedStatusRef.current === statusKey) {
      return;
    }

    lastProcessedStatusRef.current = statusKey;

    if (game?.teachingStatus !== undefined) {
      const migratedStatuses = migrateTeachingStatuses(game.teachingStatus);
      setTeachingStatuses(migratedStatuses);

      // If migration happened (single value converted to array), update the database
      // BUT only if this is actually a change and user is defined
      if (!Array.isArray(game.teachingStatus) && userId && game?.id) {
        const currentIsArray = Array.isArray(game.teachingStatus);
        if (!currentIsArray) {
          setTimeout(() => {
            updateGameInCollection(userId, game.id, { teachingStatus: migratedStatuses });
          }, 0);
        }
      }
    } else {
      setTeachingStatuses([]);
    }
  }, [game?.id, game?.teachingStatus, userId, updateGameInCollection]);

  // Clear the ref when modal closes to allow re-processing when reopened
  useEffect(() => {
    if (!isOpen) {
      lastProcessedStatusRef.current = null;
    }
  }, [isOpen]);

  // Initialize badges and rating from preloaded data
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    
    if (preloadedBggData && !badges.length) {
      initializedRef.current = true;
      
      requestAnimationFrame(() => {
        if (!isMountedRef.current) return;
        
        try {
          const gameBadges = getGameBadges(preloadedBggData);
          
          if (isMountedRef.current) {
            setBadges(gameBadges);
            
            if (preloadedBggData.average) {
              const stars = getStarRating(preloadedBggData.average);
              setStarRating(stars);
            }
            
            // Set thumbnail URL as fallback if no image is available
            if (preloadedBggData.thumbnail && !game?.bggThumbnail && !game?.thumbnail && !preloadedBggData.image) {
              setThumbnailUrl(preloadedBggData.thumbnail);
            }
          }
        } catch (error) {
          console.error('[GameDetailsModal] Error initializing:', error);
          initializedRef.current = false;
        }
      });
    }
  }, [preloadedBggData]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Prefer larger image from BGG data, fallback to thumbnail
  const imageUrl = useMemo(() => {
    // First try to get the larger image from BGG data
    if (bggData?.image) return bggData.image;
    if (game?.bggImage || game?.image) return game.bggImage || game.image;
    // Fallback to thumbnail
    if (bggData?.thumbnail) return bggData.thumbnail;
    if (game?.bggThumbnail || game?.thumbnail || thumbnailUrl) {
      return game?.bggThumbnail || game?.thumbnail || thumbnailUrl;
    }
    return null;
  }, [bggData?.image, bggData?.thumbnail, game?.bggImage, game?.image, game?.bggThumbnail, game?.thumbnail, thumbnailUrl]);
  const title = useMemo(() => {
    if (!game) return 'Unknown Game';
    if (typeof game.title === 'string' && game.title.length > 0) return game.title;
    return 'Unknown Game';
  }, [game?.title]);
  const year = useMemo(() => game?.yearPublished || bggData?.yearPublished || null, [game?.yearPublished, bggData?.yearPublished]);
  
  const rating = useMemo(() => {
    if (starRating) return starRating;
    if (bggData?.average) {
      try {
        return getStarRating(bggData.average);
      } catch (error) {
        console.error('[GameDetailsModal] Error calculating rating:', error);
        return 0;
      }
    }
    return 0;
  }, [starRating, bggData?.average]);

  const handleTeachingStatusToggle = (status) => {
    const newStatuses = teachingStatuses.includes(status)
      ? teachingStatuses.filter(s => s !== status) // Remove if already selected
      : [...teachingStatuses, status]; // Add if not selected
    setTeachingStatuses(newStatuses);
    
    if (userId && game?.id) {
      updateGameInCollection(userId, game.id, { teachingStatus: newStatuses });
    }
  };

  const getTeachingStatusLabel = (status) => {
    switch (status) {
      case 'happy-to-teach':
        return 'Happy to Teach 🎓';
      case 'havent-played-yet':
        return "Haven't played yet";
      case 'want-to-learn':
        return 'I want to learn';
      case 'would-happily-play':
        return 'Would happily play';
      case 'not-excited-to-play':
        return 'Not excited to play';
      // Backward compatibility for old statuses
      case 'can-teach':
        return 'Happy to Teach 🎓'; // Migrate to happy-to-teach
      case 'still-learning':
        return "Haven't played yet"; // Migrate to havent-played-yet
      default:
        return 'Not set';
    }
  };

  // Guard against invalid game data
  if (!game || (typeof game !== 'object')) {
    return null;
  }

  // Ensure isOpen is a boolean
  const modalVisible = Boolean(isOpen);

  return (
    <Modal
      visible={modalVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <Text style={styles.modalCloseText}>✕</Text>
          </Pressable>
          <Text style={styles.modalTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.modalHeaderSpacer} />
        </View>

        <ScrollView
          style={styles.modalContent}
          contentContainerStyle={styles.modalScrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Game Image (larger version from BGG) */}
          <View style={styles.modalThumbnailContainer}>
            {imageUrl ? (
              <Image 
                source={{ uri: imageUrl }} 
                style={styles.modalThumbnail} 
                resizeMode="cover"
              />
            ) : (
              <View style={styles.modalThumbnailPlaceholder}>
                <Text style={styles.modalThumbnailPlaceholderText}>
                  {title && typeof title === 'string' && title.length > 0 
                    ? title.charAt(0).toUpperCase() 
                    : '?'}
                </Text>
              </View>
            )}
          </View>

          {/* Game Details */}
          <View style={styles.modalDetails}>
            {/* Year and Rating */}
            <View style={styles.modalMetaRow}>
              {year && (
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>Published:</Text>
                  <Text style={styles.modalMetaValue}>{year}</Text>
                </View>
              )}
              {rating > 0 && typeof rating === 'number' && !isNaN(rating) && (
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>Rating:</Text>
                  <View style={styles.ratingContainer}>
                    <Text style={styles.ratingText}>
                      {'★'.repeat(Math.floor(rating))}
                      {rating % 1 >= 0.5 ? '½' : ''}
                    </Text>
                    {bggData?.average && !isNaN(parseFloat(bggData.average)) && (
                      <Text style={[styles.modalMetaValue, { marginLeft: 4 }]}>
                        {parseFloat(bggData.average).toFixed(1)}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Players */}
            {(bggData?.minPlayers || bggData?.maxPlayers) && (
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Players:</Text>
                <Text style={styles.modalMetaValue}>
                  {bggData.minPlayers === bggData.maxPlayers 
                    ? `${bggData.minPlayers || '?'}` 
                    : `${bggData.minPlayers || '?'}-${bggData.maxPlayers || '?'}`}
                </Text>
              </View>
            )}

            {/* Playing Time */}
            {bggData?.playingTime && typeof bggData.playingTime === 'number' && (
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Playing Time:</Text>
                <Text style={styles.modalMetaValue}>{bggData.playingTime} min</Text>
              </View>
            )}

            {/* Age Rating */}
            {bggData?.minAge && typeof bggData.minAge === 'number' && (
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Age:</Text>
                <Text style={styles.modalMetaValue}>{bggData.minAge}+</Text>
              </View>
            )}

            {/* Category Badges */}
            {badges && Array.isArray(badges) && badges.length > 0 && (
              <View style={styles.modalBadgesContainer}>
                <Text style={[styles.modalMetaLabel, { marginBottom: 8 }]}>Categories:</Text>
                <View style={styles.modalBadges}>
                  {badges
                    .filter(badge => badge && typeof badge === 'object')
                    .map((badge, index) => {
                      try {
                        return <CategoryBadge key={`${badge?.category || 'badge'}-${index}`} badge={badge} size={18} />;
                      } catch (error) {
                        console.error('[GameDetailsModal] Error rendering badge:', error);
                        return null;
                      }
                    })
                    .filter(Boolean)}
                </View>
              </View>
            )}

            {/* Description */}
            {bggData?.description && typeof bggData.description === 'string' && (
              <View style={styles.modalDescription}>
                <Text style={[styles.modalMetaLabel, { marginBottom: 8 }]}>Description:</Text>
                <Text style={styles.modalDescriptionText}>
                  {bggData.description.replace(/<[^>]*>/g, '')}
                </Text>
              </View>
            )}

            {/* Teaching Status Section - Only show if enabled and user owns the game */}
            {showTeachingStatus && userId && game?.id && (
              <View style={styles.modalTeachingSection}>
                <Text style={[styles.modalMetaLabel, { marginBottom: 12 }]}>
                  Your feelings about this game
                </Text>
                <Text style={styles.modalTeachingHint}>
                  Select all that apply. This applies to all MeepleUps you join.
                </Text>
                
                <View style={styles.teachingStatusOptions}>
                  <TouchableOpacity
                    style={[
                      styles.teachingStatusOption,
                      teachingStatuses.includes('happy-to-teach') && styles.teachingStatusOptionActive
                    ]}
                    onPress={() => handleTeachingStatusToggle('happy-to-teach')}
                  >
                    <Text style={[
                      styles.teachingStatusText,
                      teachingStatuses.includes('happy-to-teach') && styles.teachingStatusTextActive
                    ]}>
                      🎓 Happy to Teach
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.teachingStatusOption,
                      teachingStatuses.includes('would-happily-play') && styles.teachingStatusOptionActive
                    ]}
                    onPress={() => handleTeachingStatusToggle('would-happily-play')}
                  >
                    <Text style={[
                      styles.teachingStatusText,
                      teachingStatuses.includes('would-happily-play') && styles.teachingStatusTextActive
                    ]}>
                      Would happily play
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.teachingStatusOption,
                      teachingStatuses.includes('want-to-learn') && styles.teachingStatusOptionActive
                    ]}
                    onPress={() => handleTeachingStatusToggle('want-to-learn')}
                  >
                    <Text style={[
                      styles.teachingStatusText,
                      teachingStatuses.includes('want-to-learn') && styles.teachingStatusTextActive
                    ]}>
                      I want to learn
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.teachingStatusOption,
                      teachingStatuses.includes('havent-played-yet') && styles.teachingStatusOptionActive
                    ]}
                    onPress={() => handleTeachingStatusToggle('havent-played-yet')}
                  >
                    <Text style={[
                      styles.teachingStatusText,
                      teachingStatuses.includes('havent-played-yet') && styles.teachingStatusTextActive
                    ]}>
                      Haven't played yet
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.teachingStatusOption,
                      teachingStatuses.includes('not-excited-to-play') && styles.teachingStatusOptionActive
                    ]}
                    onPress={() => handleTeachingStatusToggle('not-excited-to-play')}
                  >
                    <Text style={[
                      styles.teachingStatusText,
                      teachingStatuses.includes('not-excited-to-play') && styles.teachingStatusTextActive
                    ]}>
                      Not excited to play
                    </Text>
                  </TouchableOpacity>
                  
                  {teachingStatuses.length > 0 && (
                    <TouchableOpacity
                      style={styles.teachingStatusClear}
                      onPress={() => {
                        setTeachingStatuses([]);
                        if (userId && game?.id) {
                          updateGameInCollection(userId, game.id, { teachingStatus: [] });
                        }
                      }}
                    >
                      <Text style={styles.teachingStatusClearText}>Clear all</Text>
                    </TouchableOpacity>
                  )}
                </View>
                
                {teachingStatuses.length > 0 && (
                  <Text style={styles.modalTeachingCurrent}>
                    Selected: {teachingStatuses.map(status => getTeachingStatusLabel(status)).join(', ')}
                  </Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
  },
  modalCloseButton: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  modalContent: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalThumbnailContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#f5f5f5',
  },
  modalThumbnail: {
    width: '100%',
    height: '100%',
  },
  modalThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalThumbnailPlaceholderText: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#999',
  },
  modalDetails: {
    padding: 20,
  },
  modalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  modalMetaItem: {
    marginBottom: 12,
    marginRight: 16,
    minWidth: 100,
  },
  modalMetaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalMetaValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 16,
    color: '#FFA500',
  },
  modalBadgesContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  modalBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalDescription: {
    marginTop: 8,
    marginBottom: 16,
  },
  modalDescriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  modalTeachingSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalTeachingHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
    lineHeight: 16,
  },
  teachingStatusOptions: {
    gap: 8,
  },
  teachingStatusOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  teachingStatusOptionActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  teachingStatusText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  teachingStatusTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  teachingStatusClear: {
    padding: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  teachingStatusClearText: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'underline',
  },
  modalTeachingCurrent: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
    fontStyle: 'italic',
  },
});

export default GameDetailsModal;

