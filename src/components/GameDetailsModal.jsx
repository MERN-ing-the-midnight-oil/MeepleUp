import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform, Pressable, TouchableOpacity, Alert } from 'react-native';
import { getGameById } from '../services/gameDatabase';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import CategoryBadge from './CategoryBadge';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';

const GameDetailsModal = ({ game, isOpen, onClose, preloadedBggData = null, showTeachingStatus = false, eventMembers = null, memberNames = {} }) => {
  const { user } = useAuth();
  const { updateGameInCollection, addGameToCollection, collections } = useCollections();
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
  const [memberTeachingStatuses, setMemberTeachingStatuses] = useState({}); // { userId: [statuses] }
  const isMountedRef = useRef(true);
  const userId = user?.uid || user?.id;

  // Track the last processed teaching status to prevent loops
  const lastProcessedStatusRef = useRef(null);

  // Update teaching statuses when game changes (modal opens with new game)
  useEffect(() => {
    if (!game || !userId) {
      setTeachingStatuses([]);
      return;
    }

    const gameId = game.bggId || game.id;
    if (!gameId) {
      setTeachingStatuses([]);
      return;
    }

    // Check if we have the current user's teaching status in their collection
    const userGames = collections[userId] || [];
    const userGame = userGames.find(g => {
      const gId = g.bggId || g.id;
      return gId === gameId;
    });

    // Use teaching status from user's collection if available, otherwise from game object
    const teachingStatus = userGame?.teachingStatus || game?.teachingStatus;
    const statusKey = `${gameId}-${JSON.stringify(teachingStatus)}`;

    if (lastProcessedStatusRef.current === statusKey) {
      return;
    }

    lastProcessedStatusRef.current = statusKey;

    if (teachingStatus !== undefined) {
      const migratedStatuses = migrateTeachingStatuses(teachingStatus);
      setTeachingStatuses(migratedStatuses);

      // If migration happened (single value converted to array), update the database
      // BUT only if this is actually a change and user is defined
      if (!Array.isArray(teachingStatus) && userGame) {
        const currentIsArray = Array.isArray(teachingStatus);
        if (!currentIsArray) {
          setTimeout(() => {
            updateGameInCollection(userId, userGame.id, { teachingStatus: migratedStatuses });
          }, 0);
        }
      }
    } else {
      setTeachingStatuses([]);
    }
  }, [game?.id, game?.bggId, game?.teachingStatus, userId, collections, updateGameInCollection]);

  // Clear the ref when modal closes to allow re-processing when reopened
  useEffect(() => {
    if (!isOpen) {
      lastProcessedStatusRef.current = null;
      setMemberTeachingStatuses({});
    }
  }, [isOpen]);

  // Fetch teaching statuses from all event members when modal opens
  useEffect(() => {
    if (!isOpen || !eventMembers || !game || !collections || !db) {
      return;
    }

    const gameId = game.bggId || game.id;
    if (!gameId) return;

    const fetchMemberStatuses = async () => {
      const statuses = {};
      
      // Check collections first (faster, already loaded)
      eventMembers.forEach(member => {
        const memberGames = collections[member.userId] || [];
        const memberGame = memberGames.find(g => {
          const gId = g.bggId || g.id;
          return gId === gameId;
        });
        
        if (memberGame && memberGame.teachingStatus) {
          const migrated = migrateTeachingStatuses(memberGame.teachingStatus);
          if (migrated.length > 0) {
            statuses[member.userId] = migrated;
          }
        }
      });

      // Also fetch from Firestore for any members not in collections
      try {
        const memberIds = eventMembers.map(m => m.userId).filter(Boolean);
        const fetchPromises = memberIds.map(async (memberId) => {
          // Skip if we already have it from collections
          if (statuses[memberId]) return;
          
          try {
            const gameDoc = await db.collection('userGames').doc(memberId)
              .collection('games')
              .where('bggId', '==', gameId)
              .limit(1)
              .get();
            
            if (!gameDoc.empty) {
              const data = gameDoc.docs[0].data();
              if (data.teachingStatus) {
                const migrated = migrateTeachingStatuses(data.teachingStatus);
                if (migrated.length > 0) {
                  statuses[memberId] = migrated;
                }
              }
            } else {
              // Try matching by game.id if bggId didn't match
              const gameDocById = await db.collection('userGames').doc(memberId)
                .collection('games')
                .doc(gameId)
                .get();
              
              if (gameDocById.exists) {
                const data = gameDocById.data();
                if (data.teachingStatus) {
                  const migrated = migrateTeachingStatuses(data.teachingStatus);
                  if (migrated.length > 0) {
                    statuses[memberId] = migrated;
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching teaching status for member ${memberId}:`, error);
          }
        });
        
        await Promise.all(fetchPromises);
      } catch (error) {
        console.error('Error fetching member teaching statuses:', error);
      }
      
      setMemberTeachingStatuses(statuses);
    };

    fetchMemberStatuses();
  }, [isOpen, eventMembers, game, collections, db]);

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

  const handleTeachingStatusToggle = async (status) => {
    const newStatuses = teachingStatuses.includes(status)
      ? teachingStatuses.filter(s => s !== status) // Remove if already selected
      : [...teachingStatuses, status]; // Add if not selected
    setTeachingStatuses(newStatuses);
    
    if (!userId || !game) return;
    
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
        await updateGameInCollection(userId, userGame.id, { teachingStatus: newStatuses });
      } catch (error) {
        console.error('Error updating teaching status:', error);
        Alert.alert('Error', 'Failed to update your feelings about this game. Please try again.');
        // Revert the state change
        setTeachingStatuses(teachingStatuses);
      }
    } else if (db) {
      // Create new game entry with teaching status
      try {
        const gameData = {
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
          teachingStatus: newStatuses,
          addedAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
          source: 'manual',
        };
        
        // Use bggId as document ID if available, otherwise use game.id or generate one
        const docId = game.bggId || game.id || db.collection('userGames').doc(userId).collection('games').doc().id;
        await db.collection('userGames').doc(userId)
          .collection('games').doc(docId)
          .set(gameData, { merge: true });
        
        // Update local collections state for immediate UI update
        const newGame = { ...gameData, id: docId };
        addGameToCollection(userId, newGame);
      } catch (error) {
        console.error('Error creating game entry for teaching status:', error);
        Alert.alert('Error', 'Failed to save your feelings about this game. Please try again.');
        // Revert the state change
        setTeachingStatuses(teachingStatuses);
      }
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

            {/* Member Teaching Statuses Section - Show statuses from all members */}
            {showTeachingStatus && eventMembers && Object.keys(memberTeachingStatuses).length > 0 && (
              <View style={styles.modalTeachingSection}>
                <Text style={[styles.modalMetaLabel, { marginBottom: 12 }]}>
                  Member feelings about this game
                </Text>
                <View style={styles.memberStatusesContainer}>
                  {Object.entries(memberTeachingStatuses).map(([memberId, statuses]) => {
                    const memberName = memberNames[memberId] || memberId;
                    const isCurrentUser = memberId === userId;
                    return (
                      <View key={memberId} style={styles.memberStatusItem}>
                        <Text style={styles.memberStatusName}>
                          {isCurrentUser ? `${memberName} (You)` : memberName}:
                        </Text>
                        <View style={styles.memberStatusBadges}>
                          {statuses.map((status, idx) => (
                            <View key={idx} style={styles.memberStatusBadge}>
                              <Text style={styles.memberStatusBadgeText}>
                                {getTeachingStatusLabel(status)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Teaching Status Section - Show if enabled and user is logged in */}
            {showTeachingStatus && userId && game && (
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
  memberStatusesContainer: {
    marginBottom: 16,
  },
  memberStatusItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  memberStatusName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  memberStatusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e8f4fd',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a90e2',
  },
  memberStatusBadgeText: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '500',
  },
});

export default GameDetailsModal;

