import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform, Pressable, TouchableOpacity, Alert, Animated } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import DottedHeart from './DottedHeart';
import { getGameById } from '../services/gameDatabase';
import { getGameBadges, getStarRating } from '../utils/gameBadges';
import CategoryBadge from './CategoryBadge';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { theme, commonStyles } from '../utils/theme';
import { findGameSimilarities } from '../utils/gameSimilarities';
import PersonalMatchSettings from '../components/PersonalMatchSettings';
import BeepleAvatar from '../components/BeepleAvatar';
import { getMatchScore, calculateMatchScoresForGame } from '../services/matchScores';
import { preCalculateAllMatches, calculateGameScore } from '../utils/optimizedRecommendations';

const GameDetailsModal = ({ game, isOpen, onClose, preloadedBggData = null, eventMembers = null, memberNames = {}, eventId = null, owners = [], onProposeGame = null, userProposals = new Set(), userProposalLimit = 5 }) => {
  const { user } = useAuth();
  const { updateGameInCollection, addGameToCollection, collections } = useCollections();
  const [bggData, setBggData] = useState(preloadedBggData);
  const [badges, setBadges] = useState([]);
  const [starRating, setStarRating] = useState(0);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showPersonalMatch, setShowPersonalMatch] = useState(false);
  const [personalMatchText, setPersonalMatchText] = useState(null);
  const [showPersonalMatchSettings, setShowPersonalMatchSettings] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const isMountedRef = useRef(true);
  const userId = user?.uid || user?.id;
  
  // Animation values for favorite heart shimmer effect
  const shimmerOpacity = useRef(new Animated.Value(1)).current;
  const shimmerScale = useRef(new Animated.Value(1)).current;

  // Update favorite status when game changes (modal opens with new game)
  useEffect(() => {
    if (!game || !userId) {
      setIsFavorite(false);
      return;
    }

    const gameId = game.bggId || game.id;
    if (!gameId) {
      setIsFavorite(false);
      return;
    }

    // Check if we have the current user's favorite status in their collection
    const userGames = collections[userId] || [];
    const userGame = userGames.find(g => {
      const gId = g.bggId || g.id;
      return gId === gameId;
    });

    // Use isFavorite from user's collection if available, otherwise from game object
    setIsFavorite(userGame?.isFavorite || game?.isFavorite || false);
  }, [game?.id, game?.bggId, game?.isFavorite, userId, collections]);

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


  // Update bggData when preloadedBggData or game changes
  useEffect(() => {
    if (preloadedBggData) {
      setBggData(preloadedBggData);
    } else if (game?._bggData) {
      // Fallback to game._bggData if preloadedBggData is not provided
      setBggData(game._bggData);
    }
  }, [preloadedBggData, game?._bggData, game?.id, game?.bggId]);

  // Load match score when game or eventId changes
  useEffect(() => {
    if (!game || !eventId || !userId) {
      setMatchScore(null);
      return;
    }

    const loadMatchScore = async () => {
      const gameId = game.bggId || game.id;
      if (!gameId) {
        setMatchScore(null);
        return;
      }

      try {
        // Try to get stored score first
        const storedScore = await getMatchScore(eventId, gameId, userId);
        if (storedScore !== null) {
          // Debug logging to catch type issues
          if (typeof storedScore !== 'number' && typeof storedScore !== 'string') {
            console.warn('[GameDetailsModal] Invalid storedScore type:', {
              gameId,
              storedScore,
              storedScoreType: typeof storedScore,
              storedScoreValue: JSON.stringify(storedScore)
            });
          }
          setMatchScore(storedScore);
        } else {
          // Calculate on-demand if not stored - use same scoring system as BeepleRecommendations
          const userCollection = collections[userId] || [];
          if (userCollection.length > 0) {
            const gameWithBggData = {
              ...game,
              _bggData: bggData || preloadedBggData,
            };
            const customWeights = user?.personalMatchWeights || null;
            const weights = customWeights || {
              publisher: 3,
              mechanics: 3,
              category: 2,
              complexity: 1.5,
              favorite: 2,
            };
            
            // Use the same scoring system as BeepleRecommendations
            const preCalculatedMatches = preCalculateAllMatches([gameWithBggData], userCollection);
            const matches = preCalculatedMatches.get(String(gameId));
            let score = null;
            if (matches) {
              score = calculateGameScore(matches, weights, gameWithBggData);
            }
            
            // Debug logging to catch type issues
            if (score !== null && typeof score !== 'number' && typeof score !== 'string') {
              console.warn('[GameDetailsModal] Invalid calculated score type:', {
                gameId,
                score,
                scoreType: typeof score,
                scoreValue: JSON.stringify(score)
              });
            }
            
            setMatchScore(score);
            // Store it for future use (non-blocking)
            if (score !== null && score > 0 && collections) {
              calculateMatchScoresForGame(eventId, gameId, gameWithBggData, collections, { [userId]: customWeights }).catch(err => {
                console.warn('[GameDetailsModal] Error storing match score:', err);
              });
            }
          } else {
            setMatchScore(null);
          }
        }
      } catch (error) {
        console.warn('[GameDetailsModal] Error loading match score:', error);
        setMatchScore(null);
      }
    };

    loadMatchScore();
  }, [game?.id, game?.bggId, eventId, userId, bggData, preloadedBggData, collections, user?.personalMatchWeights]);

  // Initialize badges and rating from preloaded data
  const initializedRef = useRef(false);
  const lastGameIdRef = useRef(null);
  
  useEffect(() => {
    // Reset initialization when game changes
    const currentGameId = game?.id || game?.bggId;
    if (lastGameIdRef.current !== currentGameId) {
      initializedRef.current = false;
      lastGameIdRef.current = currentGameId;
      setBadges([]);
      setStarRating(0);
    }
    
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
  }, [preloadedBggData, game?.id, game?.bggId, badges.length]);

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

  // Check if user owns this game
  const userOwnsGame = useMemo(() => {
    if (!game || !userId) return false;
    const gameId = game.bggId || game.id;
    if (!gameId) return false;
    const userGames = collections[userId] || [];
    return userGames.some(g => {
      const gId = g.bggId || g.id;
      return gId === gameId;
    });
  }, [game, userId, collections]);

  const handleFavoriteToggle = async () => {
    if (!userId || !game) return;
    
    const newFavoriteStatus = !isFavorite;
    setIsFavorite(newFavoriteStatus);
    
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
          isFavorite: newFavoriteStatus,
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
        console.error('Error creating game entry for favorite:', error);
        Alert.alert('Error', 'Failed to save favorite status. Please try again.');
        // Revert the state change
        setIsFavorite(!newFavoriteStatus);
      }
    }
  };

  const handlePersonalMatch = () => {
    if (!userId) {
      Alert.alert('Sign In Required', 'Please sign in to see Beeple\'s recommendations.');
      return;
    }
    
    const userCollection = collections[userId] || [];
    if (userCollection.length === 0) {
      Alert.alert('No Collection', 'Add games to your collection to see Beeple\'s recommendations.');
      return;
    }
    
    // Combine game data with BGG data
    const gameWithBggData = {
      ...game,
      _bggData: bggData || preloadedBggData,
    };
    
    // Get user's custom weights if available
    const customWeights = user?.personalMatchWeights || null;
    
    const recommendation = findGameSimilarities(gameWithBggData, userCollection, customWeights);
    
    setPersonalMatchText(recommendation);
    setShowPersonalMatch(true);
  };

  // Guard against invalid game data
  if (!game || (typeof game !== 'object')) {
    console.log('[GameDetailsModal] Guard clause: game is invalid', { game, isOpen });
    return null;
  }

  // Ensure isOpen is a boolean
  const modalVisible = Boolean(isOpen);
  console.log('[GameDetailsModal] Rendering modal', { 
    gameTitle: game?.title, 
    isOpen, 
    modalVisible,
    hasBggData: !!preloadedBggData 
  });

  return (
    <>
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
            {/* Favorite Button - Upper Left Overlay */}
            {userId && game && userOwnsGame && (
              <TouchableOpacity
                style={[
                  styles.favoriteButtonOverlay,
                  isFavorite && styles.favoriteButtonOverlayActive
                ]}
                onPress={handleFavoriteToggle}
                activeOpacity={0.7}
              >
                <Animated.View
                  style={{
                    opacity: isFavorite ? shimmerOpacity : 1,
                    transform: isFavorite ? [{ scale: shimmerScale }] : [],
                    alignItems: 'center',
                    justifyContent: 'center',
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
                    <DottedHeart size={16} color="#FFFFFF" />
                  )}
                  <Text style={[
                    styles.favoriteButtonOverlayText,
                    isFavorite && styles.favoriteButtonOverlayTextActive
                  ]}>
                    Favorite
                  </Text>
                </Animated.View>
              </TouchableOpacity>
            )}
          </View>

          {/* Propose Game Button - Just Below Image */}
          {onProposeGame && userId && (
            <View style={styles.proposeButtonContainer}>
              {(() => {
                const gameId = String(game.bggId || game.id);
                const isProposed = userProposals.has(gameId);
                const canPropose = userProposals.size < userProposalLimit || isProposed;
                
                if (!isProposed && canPropose) {
                  return (
                    <TouchableOpacity
                      style={styles.proposeButton}
                      onPress={() => {
                        onProposeGame(game);
                        onClose();
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.proposeButtonText}>Propose this game for the next meeting</Text>
                    </TouchableOpacity>
                  );
                } else if (isProposed) {
                  return (
                    <View style={styles.proposedBadge}>
                      <Text style={styles.proposedBadgeText}>Proposed</Text>
                    </View>
                  );
                }
                return (
                  <View style={styles.proposeLimitReached}>
                    <Text style={styles.proposeLimitReachedText}>
                      You've reached the limit of {userProposalLimit} proposed game{userProposalLimit !== 1 ? 's' : ''}. Remove a proposal to propose another game.
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Game Details */}
          <View style={styles.modalDetails}>
            {/* Match Score */}
            {matchScore !== null && matchScore !== undefined && userId && !isFavorite && (
              <View style={styles.matchScoreContainer}>
                <Text style={styles.matchScoreLabel}>💘 Match Score</Text>
                <Text style={styles.matchScoreValue}>{Math.round(matchScore)}</Text>
                <Text style={styles.matchScoreDescription}>
                  Based on your collection and preferences
                </Text>
              </View>
            )}

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

            {/* Mechanics */}
            {bggData?.mechanics && Array.isArray(bggData.mechanics) && bggData.mechanics.length > 0 && (
              <View style={styles.modalBadgesContainer}>
                <Text style={[styles.modalMetaLabel, { marginBottom: 8 }]}>Mechanics:</Text>
                <View style={styles.modalBadges}>
                  {bggData.mechanics.map((mechanic, index) => (
                    <View key={index} style={styles.modalBadgeItem}>
                      <Text style={styles.modalBadgeText}>{mechanic}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Publisher */}
            {(bggData?.publisher || bggData?.publishers) && (
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Publisher:</Text>
                <Text style={styles.modalMetaValue}>
                  {bggData.publisher || (Array.isArray(bggData.publishers) && bggData.publishers.length > 0 ? bggData.publishers.join(', ') : '')}
                </Text>
              </View>
            )}

            {/* Designer */}
            {bggData?.designers && Array.isArray(bggData.designers) && bggData.designers.length > 0 && (
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Designer:</Text>
                <Text style={styles.modalMetaValue}>
                  {bggData.designers.join(', ')}
                </Text>
              </View>
            )}

            {/* Complexity/Weight */}
            {bggData?.averageWeight && typeof bggData.averageWeight === 'number' && (
              <View style={styles.modalMetaItem}>
                <Text style={styles.modalMetaLabel}>Complexity:</Text>
                <Text style={styles.modalMetaValue}>
                  {bggData.averageWeight.toFixed(1)} / 5.0
                </Text>
              </View>
            )}

            {/* Description */}
            {(bggData?.description || game?.description) && typeof (bggData?.description || game?.description) === 'string' && (
              <View style={styles.modalDescription}>
                <Text style={[styles.modalMetaLabel, { marginBottom: 8 }]}>Description:</Text>
                <Text style={styles.modalDescriptionText}>
                  {(bggData?.description || game?.description || '').replace(/<[^>]*>/g, '')}
                </Text>
              </View>
            )}

            {/* Owner Information - Show who owns this game */}
            {owners && Array.isArray(owners) && owners.length > 0 && (
              <View style={styles.modalOwnerSection}>
                <Text style={[styles.modalMetaLabel, { marginBottom: 8 }]}>Owned by:</Text>
                <View style={styles.modalOwnersList}>
                  {owners.map((owner, index) => (
                    <View key={index} style={styles.modalOwnerItem}>
                      <Text style={styles.modalOwnerText}>{owner}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Beeple Recommends Section */}
            {userId && (
              <View style={styles.modalTeachingSection}>
                <View style={styles.beepleSectionHeader}>
                  <BeepleAvatar size={40} />
                  <View style={styles.beepleSectionHeaderText}>
                    <Text style={[styles.modalMetaLabel, { marginBottom: 4 }]}>
                      Beeple Recommends
                    </Text>
                    <Text style={styles.modalTeachingHint}>
                      See why Beeple thinks you might like this game.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.personalMatchButton}
                  onPress={handlePersonalMatch}
                  activeOpacity={0.7}
                >
                  <Text style={styles.personalMatchButtonText}>
                    Ask Beeple
                  </Text>
                </TouchableOpacity>
                {showPersonalMatch && personalMatchText && (
                  <View style={styles.personalMatchResult}>
                    <View style={styles.beepleMessageHeader}>
                      <BeepleAvatar size={32} />
                      <Text style={styles.beepleMessageName}>Beeple</Text>
                    </View>
                    <Text style={styles.personalMatchText}>{personalMatchText}</Text>
                  </View>
                )}
                {showPersonalMatch && !personalMatchText && (
                  <View style={styles.personalMatchResult}>
                    <View style={styles.beepleMessageHeader}>
                      <BeepleAvatar size={32} />
                      <Text style={styles.beepleMessageName}>Beeple</Text>
                    </View>
                    <Text style={styles.personalMatchText}>
                      Beep-Boop-Bop, I'm Beeple! I couldn't find strong similarities between this game and your collection. 
                      Try adding more games to your collection so I can give you better recommendations!
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.customizeWeightsLink}
                  onPress={() => {
                    setShowPersonalMatchSettings(true);
                  }}
                >
                  <Text style={styles.customizeWeightsLinkText}>
                    ⚙️ Customize Beeple's recommendation weights
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </Modal>
      {showPersonalMatchSettings && (
        <Modal
          isOpen={showPersonalMatchSettings}
          onClose={() => {
            setShowPersonalMatchSettings(false);
          }}
          title="Beeple's Recommendation Weights"
        >
          <PersonalMatchSettings
            onSave={() => {
              setShowPersonalMatchSettings(false);
              // Refresh the personal match if it was shown
              if (showPersonalMatch && game) {
                const userCollection = collections[userId] || [];
                const gameWithBggData = {
                  ...game,
                  _bggData: bggData || preloadedBggData,
                };
                const customWeights = user?.personalMatchWeights || null;
                const recommendation = findGameSimilarities(gameWithBggData, userCollection, customWeights);
                setPersonalMatchText(recommendation);
              }
            }}
          />
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.surfaceColor,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.surfaceColor,
    paddingTop: Platform.OS === 'ios' ? 50 : theme.spacing.md,
  },
  modalCloseButton: {
    padding: theme.spacing.sm,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 24,
    color: theme.colors.textSecondary,
    fontWeight: '300',
  },
  modalTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: theme.spacing.sm,
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
    position: 'relative',
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
  modalBadgeItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8f4fd',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a90e2',
  },
  modalBadgeText: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '500',
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
  gameRequestButton: {
    backgroundColor: '#28a745',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  gameRequestButtonDisabled: {
    backgroundColor: '#6c757d',
    opacity: 0.7,
  },
  gameRequestButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  favoriteButtonOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    minWidth: 80,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    flexDirection: 'row',
    gap: 6,
  },
  favoriteButtonOverlayActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#FFD700',
  },
  favoriteButtonOverlayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 4,
  },
  favoriteButtonOverlayTextActive: {
    color: '#333333',
  },
  modalOwnerSection: {
    marginTop: 16,
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalOwnersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalOwnerItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8f4fd',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a90e2',
  },
  modalOwnerText: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '500',
  },
  personalMatchButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF8C00',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  personalMatchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF8C00',
  },
  personalMatchResult: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  beepleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  beepleSectionHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  beepleMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  beepleMessageName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  personalMatchText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  customizeWeightsLink: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  customizeWeightsLinkText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
  },
  matchScoreContainer: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
    alignItems: 'center',
  },
  matchScoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  matchScoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 4,
  },
  matchScoreDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  proposeButtonContainer: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  proposeButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  proposeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  proposedBadge: {
    backgroundColor: '#28a745',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  proposedBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  proposeLimitReached: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  proposeLimitReachedText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default GameDetailsModal;

