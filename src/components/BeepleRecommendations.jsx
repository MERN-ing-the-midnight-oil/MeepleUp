import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, useWindowDimensions, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { theme } from '../utils/theme';
import FaderSlider from './FaderSlider';
import BeepleAvatar from './BeepleAvatar';
import PoweredByBGG from './PoweredByBGG';
import GameCard from './GameCard';
import LoadingSpinner from './common/LoadingSpinner';
import Modal from './common/Modal';
import { preCalculateAllMatches, calculateGameScore, getRecommendationText } from '../utils/optimizedRecommendations';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import storage from '../utils/storage';

const DEFAULT_WEIGHTS = {
  publisher: 3,
  mechanics: 3,
  category: 2,
  complexity: 1.5,
  favorite: 2,
};

const BeepleRecommendations = ({ games, userCollection, onProposeGame, userProposals = new Set(), eventId = null }) => {
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { collections, updateGameInCollection, addGameToCollection, getUserCollection } = useCollections();
  const userId = user?.uid || user?.id;
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preCalculatedMatches, setPreCalculatedMatches] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [hasSeenExplanation, setHasSeenExplanation] = useState(false);
  const [pendingFavorites, setPendingFavorites] = useState(new Map()); // Map<gameId, isFavorite>
  const pendingFavoritesRef = useRef(new Map()); // Ref to track pending favorites for cleanup
  const pendingFavoriteGamesRef = useRef(new Map()); // Ref to track game data for pending favorites
  const saveTimeoutRef = useRef(null);
  const expandAnimation = useRef(new Animated.Value(0)).current;
  const collapseAnimation = useRef(new Animated.Value(0)).current;
  
  // Count user's favorited games
  const favoritedGamesCount = useMemo(() => {
    if (!userId) return 0;
    const collection = getUserCollection ? getUserCollection(userId) : (collections[userId] || []);
    if (!Array.isArray(collection)) return 0;
    return collection.filter(game => game.isFavorite === true).length;
  }, [userId, collections, getUserCollection]);

  // Load user's custom weights
  useEffect(() => {
    if (user?.personalMatchWeights) {
      setWeights({ ...DEFAULT_WEIGHTS, ...user.personalMatchWeights });
    }
  }, [user]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Check if user has seen the explanation modal
  useEffect(() => {
    const checkExplanationSeen = async () => {
      try {
        const seen = await storage.getItem('beeple_recommends_explanation_seen');
        setHasSeenExplanation(seen === 'true');
      } catch (error) {
        console.error('[BeepleRecommendations] Error checking explanation seen:', error);
      }
    };
    checkExplanationSeen();
  }, []);

  // Handle banner click - show modal on first click
  const handleBannerClick = useCallback(() => {
    if (!hasSeenExplanation) {
      setShowExplanationModal(true);
      // Mark as seen
      storage.setItem('beeple_recommends_explanation_seen', 'true').catch(err => {
        console.error('[BeepleRecommendations] Error saving explanation seen:', err);
      });
      setHasSeenExplanation(true);
    }
  }, [hasSeenExplanation]);

  // Automatically expand component when analysis completes
  const prevIsCalculatingRef = useRef(isCalculating);
  useEffect(() => {
    // Check if calculation just finished (transitioned from true to false)
    if (prevIsCalculatingRef.current === true && isCalculating === false && isCollapsed) {
      // Analysis just finished, expand the component immediately
      setIsCollapsed(false);
      // Set animation value immediately
      collapseAnimation.setValue(1);
    }
    prevIsCalculatingRef.current = isCalculating;
  }, [isCalculating, isCollapsed]);

  // Helper function to check if a game is display-only (missing all critical fields)
  const isDisplayOnlyGame = useCallback((game) => {
    // Check displayOnly flag
    if (game.displayOnly === true) {
      return true;
    }
    
    // Also check if game is missing all critical fields
    const bggData = game._bggData || game;
    const hasPublisher = !!(bggData.publisher || 
      (Array.isArray(bggData.publishers) && bggData.publishers.length > 0) ||
      (Array.isArray(game.publishers) && game.publishers.length > 0) ||
      game.publisher);
    const hasMechanics = !!(bggData.mechanics || game.mechanics) && 
      (!Array.isArray(bggData.mechanics || game.mechanics) || (bggData.mechanics || game.mechanics).length > 0);
    const hasCategories = !!(bggData.categories || game.categories) && 
      (!Array.isArray(bggData.categories || game.categories) || (bggData.categories || game.categories).length > 0);
    const hasComplexity = !!(bggData.averageWeight || bggData.complexity || game.averageWeight || game.complexity);
    
    // Missing all critical fields
    return !hasPublisher && !hasMechanics && !hasCategories && !hasComplexity;
  }, []);

  // Enrich userCollection if it contains references without full BGG data
  const enrichedUserCollection = useMemo(() => {
    if (!userCollection || userCollection.length === 0) return [];
    
    // Filter out display-only games - they cannot be used for recommendations
    const validGames = userCollection.filter(game => !isDisplayOnlyGame(game));
    
    // Check if any games are references (missing ALL publisher/mechanics/categories/complexity)
    // A game needs enrichment if it has a bggId but is missing ALL critical matching fields
    const needsEnrichment = validGames.some(game => {
      if (!game.bggId && !game.id) return false; // Not a reference if no ID
      
      const bggData = game._bggData || game;
      const hasPublisher = !!(bggData.publisher || 
        (Array.isArray(bggData.publishers) && bggData.publishers.length > 0) ||
        (Array.isArray(game.publishers) && game.publishers.length > 0) ||
        game.publisher);
      const hasMechanics = !!(bggData.mechanics || game.mechanics);
      const hasCategories = !!(bggData.categories || game.categories);
      const hasComplexity = !!(bggData.averageWeight || bggData.complexity || game.averageWeight || game.complexity);
      
      // If it's a reference with bggId but missing ALL critical fields, it needs enrichment
      // Note: we check for missing ALL fields, not just any one field
      return !hasPublisher && !hasMechanics && !hasCategories && !hasComplexity;
    });
    
    if (!needsEnrichment) {
      // Collection is already enriched, return filtered games
      return validGames;
    }
    
    // Return filtered games as-is for now - enrichment will happen asynchronously
    // The enrichment should be handled by CollectionsContext, but we'll still try to work with what we have
    return validGames;
  }, [userCollection, isDisplayOnlyGame]);

  // Track last calculated data to prevent unnecessary recalculations
  const lastCalculatedRef = useRef({ gamesLength: 0, collectionLength: 0, collectionHash: '' });

  // Pre-calculate all matches once when games or collection changes
  useEffect(() => {
    // Create a simple hash of collection to detect actual changes
    const collectionHash = enrichedUserCollection 
      ? enrichedUserCollection.map(g => `${g.bggId || g.id}_${g.isFavorite ? 'f' : 'n'}`).join(',')
      : '';
    
    const gamesLength = games?.length || 0;
    const collectionLength = enrichedUserCollection?.length || 0;
    
    // Skip if nothing has actually changed
    if (
      lastCalculatedRef.current.gamesLength === gamesLength &&
      lastCalculatedRef.current.collectionLength === collectionLength &&
      lastCalculatedRef.current.collectionHash === collectionHash
    ) {
      return; // No actual changes, skip recalculation
    }
    
    // Update ref
    lastCalculatedRef.current = {
      gamesLength,
      collectionLength,
      collectionHash,
    };

    // Only log once per actual change, not on every render
    console.log('[BeepleRecommendations] Recalculating recommendations:', {
      gamesCount: gamesLength,
      collectionCount: collectionLength,
      favoritedCount: favoritedGamesCount,
      hasGames: !!(games && games.length > 0),
      hasCollection: !!(enrichedUserCollection && enrichedUserCollection.length > 0),
    });

    if (!games || games.length === 0 || !enrichedUserCollection || enrichedUserCollection.length === 0) {
      console.warn('[BeepleRecommendations] Skipping calculation - missing games or collection:', {
        games: !games ? 'null' : games.length === 0 ? 'empty' : `has ${games.length} games`,
        collection: !enrichedUserCollection ? 'null' : enrichedUserCollection.length === 0 ? 'empty' : `has ${enrichedUserCollection.length} games`,
      });
      setPreCalculatedMatches(null);
      return;
    }

    setIsCalculating(true);
    // Use setTimeout to allow UI to update, then calculate
    const timer = setTimeout(async () => {
      try {
        console.log('[BeepleRecommendations] Starting pre-calculation...');
        console.log('[BeepleRecommendations] Initial collection state:', {
          totalGames: enrichedUserCollection.length,
          favoritedGames: enrichedUserCollection.filter(g => g.isFavorite === true).length,
          sampleFavoritedGame: enrichedUserCollection.find(g => g.isFavorite === true) ? {
            title: enrichedUserCollection.find(g => g.isFavorite === true).title || enrichedUserCollection.find(g => g.isFavorite === true).name,
            bggId: enrichedUserCollection.find(g => g.isFavorite === true).bggId,
            hasMechanics: !!(enrichedUserCollection.find(g => g.isFavorite === true).mechanics || enrichedUserCollection.find(g => g.isFavorite === true)._bggData?.mechanics),
            hasCategories: !!(enrichedUserCollection.find(g => g.isFavorite === true).categories || enrichedUserCollection.find(g => g.isFavorite === true)._bggData?.categories),
            hasPublisher: !!(enrichedUserCollection.find(g => g.isFavorite === true).publisher || enrichedUserCollection.find(g => g.isFavorite === true).publishers || enrichedUserCollection.find(g => g.isFavorite === true)._bggData?.publisher || enrichedUserCollection.find(g => g.isFavorite === true)._bggData?.publishers),
          } : null,
        });
        
        // Try to enrich collection if needed
        let collectionToUse = enrichedUserCollection;
        const needsEnrichment = enrichedUserCollection.some(game => {
          if (!game.bggId && !game.id) return false;
          
          const bggData = game._bggData || game;
          const hasPublisher = !!(bggData.publisher || 
            (Array.isArray(bggData.publishers) && bggData.publishers.length > 0) ||
            (Array.isArray(game.publishers) && game.publishers.length > 0) ||
            game.publisher);
          const hasMechanics = !!(bggData.mechanics || game.mechanics);
          const hasCategories = !!(bggData.categories || game.categories);
          const hasComplexity = !!(bggData.averageWeight || bggData.complexity || game.averageWeight || game.complexity);
          
          // Needs enrichment if missing ALL critical fields
          return !hasPublisher && !hasMechanics && !hasCategories && !hasComplexity;
        });
        
        if (needsEnrichment) {
          try {
            const { batchGetGamesById } = await import('../services/gameDatabase');
            
            // OPTIMIZATION: Only enrich games that are favorited OR games that have missing data
            // For recommendations, we primarily care about favorited games, but we'll enrich
            // all games that need it to ensure accurate matching
            const gamesToEnrich = enrichedUserCollection.filter(g => {
              if (!g.bggId) return false;
              
              // Always enrich favorited games
              if (g.isFavorite === true) return true;
              
              // Also enrich games that are missing all critical fields
              const bggData = g._bggData || g;
              const hasPublisher = !!(bggData.publisher || 
                (Array.isArray(bggData.publishers) && bggData.publishers.length > 0) ||
                (Array.isArray(g.publishers) && g.publishers.length > 0) ||
                g.publisher);
              const hasMechanics = !!(bggData.mechanics || g.mechanics);
              const hasCategories = !!(bggData.categories || g.categories);
              const hasComplexity = !!(bggData.averageWeight || bggData.complexity || g.averageWeight || g.complexity);
              
              return !hasPublisher && !hasMechanics && !hasCategories && !hasComplexity;
            });
            
            const bggIds = gamesToEnrich
              .map(g => g.bggId.toString());
            
            if (bggIds.length > 0) {
              if (__DEV__) {
                console.log(`[BeepleRecommendations] Enriching ${bggIds.length} games (${gamesToEnrich.filter(g => g.isFavorite).length} favorited)`);
              }
              
              const gameDataMap = await batchGetGamesById(bggIds);
              console.log('[BeepleRecommendations] Enrichment results:', {
                requestedGames: bggIds.length,
                foundGames: gameDataMap.size,
                missingGames: bggIds.length - gameDataMap.size,
                sampleFoundGame: gameDataMap.size > 0 ? (() => {
                  const firstKey = Array.from(gameDataMap.keys())[0];
                  const firstGame = gameDataMap.get(firstKey);
                  return {
                    bggId: firstKey,
                    hasMechanics: !!(firstGame.mechanics && Array.isArray(firstGame.mechanics) && firstGame.mechanics.length > 0),
                    hasCategories: !!(firstGame.categories && Array.isArray(firstGame.categories) && firstGame.categories.length > 0),
                    hasPublisher: !!(firstGame.publisher || (firstGame.publishers && Array.isArray(firstGame.publishers) && firstGame.publishers.length > 0)),
                    hasComplexity: !!(firstGame.averageWeight || firstGame.complexity),
                    mechanicsCount: Array.isArray(firstGame.mechanics) ? firstGame.mechanics.length : 0,
                    categoriesCount: Array.isArray(firstGame.categories) ? firstGame.categories.length : 0,
                  };
                })() : null,
              });
              
              // Create a map for quick lookup
              const enrichedGamesMap = new Map();
              gamesToEnrich.forEach(game => {
                if (!game.bggId) return;
                const fullData = gameDataMap.get(game.bggId.toString());
                if (fullData) {
                  enrichedGamesMap.set(game.bggId.toString(), {
                    ...fullData,
                    ...game, // Preserve user-specific data like isFavorite
                    id: game.id || `bgg_${game.bggId}`,
                    title: fullData.name || game.title || game.name,
                    bggId: game.bggId,
                    isFavorite: game.isFavorite === true,
                  });
                } else {
                  console.warn(`[BeepleRecommendations] Game ${game.bggId} not found in enrichment results`);
                }
              });
              
              // Merge enriched games back into collection
              collectionToUse = enrichedUserCollection.map(game => {
                if (!game.bggId) return game;
                const enriched = enrichedGamesMap.get(game.bggId.toString());
                return enriched || game;
              });
              
              if (__DEV__) {
                const favoritedBefore = enrichedUserCollection.filter(g => g.isFavorite === true).length;
                const favoritedAfter = collectionToUse.filter(g => g.isFavorite === true).length;
                
                // Debug: Check what data the enriched games actually have
                const sampleEnriched = collectionToUse
                  .filter(g => g.isFavorite)
                  .slice(0, 1);
                
                if (sampleEnriched.length > 0) {
                  const sample = sampleEnriched[0];
                  console.log('[BeepleRecommendations] Sample enriched favorite game data:', {
                    title: sample.title || sample.name,
                    bggId: sample.bggId,
                    hasMechanics: !!(sample.mechanics || (sample._bggData && sample._bggData.mechanics)),
                    hasCategories: !!(sample.categories || (sample._bggData && sample._bggData.categories)),
                    hasPublisher: !!(sample.publisher || sample.publishers || (sample._bggData && (sample._bggData.publisher || sample._bggData.publishers))),
                    hasComplexity: !!(sample.averageWeight || sample.complexity || (sample._bggData && (sample._bggData.averageWeight || sample._bggData.complexity))),
                    mechanicsType: typeof sample.mechanics,
                    mechanicsValue: Array.isArray(sample.mechanics) ? sample.mechanics.slice(0, 3) : sample.mechanics,
                    categoriesType: typeof sample.categories,
                    categoriesValue: Array.isArray(sample.categories) ? sample.categories.slice(0, 3) : sample.categories,
                    publisherValue: sample.publisher || (Array.isArray(sample.publishers) ? sample.publishers[0] : sample.publishers),
                    complexityValue: sample.averageWeight || sample.complexity,
                  });
                }
                
                console.log('[BeepleRecommendations] Enriched collection:', {
                  original: enrichedUserCollection.length,
                  enriched: collectionToUse.length,
                  gamesFound: gameDataMap.size,
                  favoritedBefore,
                  favoritedAfter,
                });
              }
            }
          } catch (enrichError) {
            console.error('[BeepleRecommendations] Error enriching collection:', enrichError);
            // Continue with original collection if enrichment fails
          }
        }
        
        // Filter out display-only games from both games list and user collection
        // Display-only games cannot be used for recommendations
        const validGames = games.filter(game => !isDisplayOnlyGame(game));
        const validCollection = collectionToUse.filter(game => !isDisplayOnlyGame(game));
        
        if (__DEV__ && validGames.length < games.length) {
          console.log(`[BeepleRecommendations] Filtered out ${games.length - validGames.length} display-only games from recommendations pool`);
        }
        if (__DEV__ && validCollection.length < collectionToUse.length) {
          console.log(`[BeepleRecommendations] Filtered out ${collectionToUse.length - validCollection.length} display-only games from user collection`);
        }
        
        console.log('[BeepleRecommendations] About to pre-calculate matches:', {
          validGamesCount: validGames.length,
          validCollectionCount: validCollection.length,
          favoritedInCollection: validCollection.filter(g => g.isFavorite === true).length,
        });
        
        const preCalculated = preCalculateAllMatches(validGames, validCollection);
        console.log('[BeepleRecommendations] Pre-calculation complete:', {
          totalMatchesMapSize: preCalculated.size,
          sampleMatchCount: Array.from(preCalculated.values()).slice(0, 5).map(m => ({
            totalMatches: m.publisher.length + m.mechanics.length + m.category.length + m.complexity.length,
            publisher: m.publisher.length,
            mechanics: m.mechanics.length,
            category: m.category.length,
            complexity: m.complexity.length,
          })),
        });
        setPreCalculatedMatches(preCalculated);
        setCurrentIndex(0); // Reset to first recommendation
      } catch (error) {
        console.error('[BeepleRecommendations] Error pre-calculating matches:', error);
      } finally {
        setIsCalculating(false);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [games, enrichedUserCollection, isDisplayOnlyGame]);

  // Create a set of owned and favorited game IDs for quick lookup
  const ownedGameIds = useMemo(() => {
    if (!enrichedUserCollection || enrichedUserCollection.length === 0) return new Set();
    return new Set(
      enrichedUserCollection
        .filter(game => game.bggId || game.id)
        .map(game => String(game.bggId || game.id))
    );
  }, [enrichedUserCollection]);

  const favoritedGameIds = useMemo(() => {
    const favorited = new Set();
    
    // Add favorited games from enrichedUserCollection
    if (enrichedUserCollection && enrichedUserCollection.length > 0) {
      enrichedUserCollection
        .filter(game => game.isFavorite === true && (game.bggId || game.id))
        .forEach(game => {
          favorited.add(String(game.bggId || game.id));
        });
    }
    
    // Also check collections context for up-to-date favorite status
    const userId = user?.uid || user?.id;
    if (userId && collections[userId] && collections[userId].length > 0) {
      collections[userId]
        .filter(game => game.isFavorite === true && (game.bggId || game.id))
        .forEach(game => {
          favorited.add(String(game.bggId || game.id));
        });
    }
    
    // Add pending favorites that are being favorited (exclude them immediately)
    pendingFavorites.forEach((isFavorite, gameId) => {
      if (isFavorite) {
        favorited.add(gameId);
      }
    });
    
    return favorited;
  }, [enrichedUserCollection, collections, user, pendingFavorites]);

  // Calculate scores for all games with current weights
  const scoredGames = useMemo(() => {
    if (!preCalculatedMatches || !games || games.length === 0) {
      console.log('[BeepleRecommendations] ScoredGames: No pre-calculated matches or games:', {
        hasMatches: !!preCalculatedMatches,
        hasGames: !!(games && games.length > 0),
      });
      return [];
    }

    // Filter out display-only games (same as pre-calculation)
    const validGames = games.filter(game => !isDisplayOnlyGame(game));

    let filteredOutOwned = 0;
    let filteredOutFavorited = 0;
    let gamesWithNoMatches = 0;
    let gamesWithZeroScore = 0;
    
    const scored = validGames
      .map(game => {
        const gameId = String(game.bggId || game.id);
        
        // Filter out games the user owns
        if (ownedGameIds.has(gameId)) {
          filteredOutOwned++;
          return null;
        }
        
        // Filter out games the user has favorited
        if (favoritedGameIds.has(gameId)) {
          filteredOutFavorited++;
          return null;
        }
        
        const matches = preCalculatedMatches.get(gameId);
        if (!matches) {
          gamesWithNoMatches++;
          // Log first few missing matches to debug
          if (gamesWithNoMatches <= 3) {
            console.log(`[BeepleRecommendations] Game ${gameId} not found in preCalculatedMatches:`, {
              gameId,
              bggId: game.bggId,
              id: game.id,
              title: game.title || game.name,
              mapKeys: Array.from(preCalculatedMatches.keys()).slice(0, 5),
              mapSize: preCalculatedMatches.size,
            });
          }
          // If no matches found, still calculate score (might be 0)
          const emptyMatches = {
            publisher: [],
            mechanics: [],
            category: [],
            complexity: []
          };
          const score = calculateGameScore(emptyMatches, weights, game);
          if (score === 0) {
            gamesWithZeroScore++;
          }
          return {
            game,
            score,
            matches: emptyMatches,
          };
        }

        const score = calculateGameScore(matches, weights, game);
        if (score === 0) {
          gamesWithZeroScore++;
        }
        return {
          game,
          score,
          matches,
        };
      })
      .filter(item => item !== null && item.score > 0)
      .sort((a, b) => b.score - a.score);

    console.log('[BeepleRecommendations] Scored games summary:', {
      totalGames: games.length,
      validGames: validGames.length,
      filteredOutOwned,
      filteredOutFavorited,
      gamesWithNoMatches,
      gamesWithZeroScore,
      gamesWithScore: scored.length,
      ownedGameIdsCount: ownedGameIds.size,
      favoritedGameIdsCount: favoritedGameIds.size,
      topScores: scored.slice(0, 5).map(s => ({ 
        title: s.game.title || s.game.name, 
        score: Math.round(s.score * 100) / 100,
        matchCounts: {
          publisher: s.matches.publisher.length,
          mechanics: s.matches.mechanics.length,
          category: s.matches.category.length,
          complexity: s.matches.complexity.length,
        },
      })),
    });

    return scored;
  }, [preCalculatedMatches, games, weights, ownedGameIds, favoritedGameIds, isDisplayOnlyGame]);

  // Get current recommendation
  const currentRecommendation = useMemo(() => {
    if (!scoredGames || scoredGames.length === 0) {
      return null;
    }

    const index = Math.min(currentIndex, scoredGames.length - 1);
    const item = scoredGames[index];
    if (!item) return null;

    const gameTitle = item.game.title || item.game.name || 'this game';
    const recommendationText = getRecommendationText(item.matches, gameTitle, item.game, weights);

    return {
      game: item.game,
      score: item.score,
      text: recommendationText,
      index: index + 1,
      total: scoredGames.length,
    };
  }, [scoredGames, currentIndex, weights]);

  const handleWeightChange = useCallback((key, value) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      return;
    }
    setWeights(prev => {
      const newWeights = {
        ...prev,
        [key]: numValue,
      };
      
      // Debounce saving to avoid too many writes
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (user && updateUser) {
          updateUser({ personalMatchWeights: newWeights }).catch(err => {
            console.error('[BeepleRecommendations] Error saving weights:', err);
          });
        }
      }, 1000); // Save after 1 second of no changes
      
      return newWeights;
    });
  }, [user, updateUser]);

  const handleNextRecommendation = useCallback(() => {
    if (!scoredGames || scoredGames.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % scoredGames.length);
  }, [scoredGames]);

  const handlePreviousRecommendation = useCallback(() => {
    if (!scoredGames || scoredGames.length === 0) return;
    setCurrentIndex(prev => (prev - 1 + scoredGames.length) % scoredGames.length);
  }, [scoredGames]);

  // Handle favorite toggle - defer actual favorite action until unmount
  const handleFavoriteToggle = useCallback((game, isFavorite) => {
    const gameId = String(game.bggId || game.id);
    if (!gameId) return;
    
    setPendingFavorites(prev => {
      const next = new Map(prev);
      if (isFavorite) {
        next.set(gameId, true);
        // Store game data for later use
        pendingFavoriteGamesRef.current.set(gameId, game);
      } else {
        // If unfavoriting, we can remove from pending or mark as false
        // For now, just remove it from pending (user can re-favorite if needed)
        next.delete(gameId);
        pendingFavoriteGamesRef.current.delete(gameId);
      }
      // Also update the ref
      pendingFavoritesRef.current = new Map(next);
      return next;
    });
  }, []);

  // Apply pending favorites when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup: apply all pending favorites on unmount only
      const pending = pendingFavoritesRef.current;
      if (pending.size === 0 || !user) return;
      
      const userId = user.uid || user.id;
      if (!userId) return;
      
      // Get current collections at unmount time
      const currentCollections = collections;
      
      const applyFavorites = async () => {
        for (const [gameId, isFavorite] of pending.entries()) {
          try {
            // Check if user owns the game in their collection
            const userGames = currentCollections[userId] || [];
            const userGame = userGames.find(g => {
              const gId = String(g.bggId || g.id);
              return gId === gameId;
            });
            
            if (userGame) {
              // Update existing game
              await updateGameInCollection(userId, userGame.id, { isFavorite });
            } else if (db && isFavorite) {
              // Only create new entry if favoriting (not if unfavoriting)
              // Get game data from stored ref (set when user favorited it)
              const game = pendingFavoriteGamesRef.current.get(gameId);
              if (!game) {
                console.warn(`[BeepleRecommendations] Could not find game data for ${gameId} to favorite`);
                continue;
              }
              
              const docId = game.bggId || game.id || db.collection('userGames').doc(userId).collection('games').doc().id;
              
              const gameData = {
                id: docId,
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
                isFavorite: true,
                addedAt: firebase.firestore.Timestamp.now(),
                updatedAt: firebase.firestore.Timestamp.now(),
                source: 'manual',
              };
              
              // Add to local collections
              addGameToCollection(userId, gameData);
              
              // Save to Firestore
              await db.collection('userGames').doc(userId)
                .collection('games').doc(docId)
                .set(gameData, { merge: true });
            }
          } catch (error) {
            console.error(`[BeepleRecommendations] Error applying favorite for game ${gameId}:`, error);
          }
        }
      };
      
      applyFavorites();
    };
  }, [user, collections, updateGameInCollection, addGameToCollection]);

  const toggleExpand = useCallback(() => {
    const toValue = isExpanded ? 0 : 1;
    Animated.timing(expandAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsExpanded(!isExpanded);
  }, [isExpanded, expandAnimation]);

  const toggleCollapse = useCallback(() => {
    const toValue = isCollapsed ? 1 : 0;
    Animated.timing(collapseAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed, collapseAnimation]);

  // Calculate max height for animation (approximate)
  const maxHeight = expandAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 800], // Adjust based on content height
  });

  // Calculate max height for collapse animation
  const collapseMaxHeight = collapseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2000], // Adjust based on content height
  });

  const weightDescriptions = {
    publisher: 'How much to weight games from the same publishers (as your `favorited` games)',
    mechanics: 'How much to weight games with similar mechanics (as your `favorited` games)',
    category: 'How much to weight games in the same category/theme (as your `favorited` games)',
    complexity: 'How much to weight games with similar complexity (as your `favorited` games)',
    favorite: 'Multiplier for games you\'ve marked as favorites',
  };

  // Show placeholder if user hasn't loved enough games
  if (favoritedGamesCount < 8) {
    return (
      <View style={styles.container}>
        <View style={styles.collapsibleHeader}>
          <View style={styles.headerTopRow}>
            <View style={styles.beepleContainer}>
              <BeepleAvatar size={80} />
              <Text style={styles.beepleCaption}>Beeple</Text>
            </View>
            <TouchableOpacity 
              style={styles.headerImageContainer}
              onPress={handleBannerClick}
              activeOpacity={0.8}
            >
              <Image 
                source={require('../../assets/images/beeplerecommends.png')} 
                style={styles.headerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.headerPoweredByBGG}>
            <PoweredByBGG 
              size="small" 
              containerWidth={200} 
              style={styles.headerPoweredByBGGStyle} 
            />
          </View>
        </View>
        <View style={styles.collapsibleContent}>
          <TouchableOpacity 
            style={styles.placeholderContainer}
            onPress={() => navigation.navigate('Collection')}
            activeOpacity={0.7}
          >
            <Text style={styles.placeholderText}>
              "Heart" at least 8 games to unlock beeple recommendations
            </Text>
          </TouchableOpacity>
        </View>

        {/* Beeple Explanation Modal */}
        <Modal
          isOpen={showExplanationModal}
          onClose={() => setShowExplanationModal(false)}
          title="Beeple Recommends"
        >
          <View style={styles.modalContent}>
            <View style={styles.modalBeepleContainer}>
              <BeepleAvatar size={120} />
              <Text style={styles.modalBeepleCaption}>Beeple</Text>
            </View>
            <View style={styles.modalTextContainer}>
              <Text style={styles.modalText}>
                Beep-Boop-Bop! I'm Beeple, your friendly MeepleBot! 🎲
              </Text>
              <Text style={styles.modalText}>
                I analyze the games you've favorited and find similar games from everyone's collections that you might want to propose for your game nights!
              </Text>
              <Text style={styles.modalText}>
                I look at things like:
              </Text>
              <Text style={styles.modalBullet}>
                • Publishers (games from the same publishers)
              </Text>
              <Text style={styles.modalBullet}>
                • Mechanics (similar gameplay mechanics)
              </Text>
              <Text style={styles.modalBullet}>
                • Categories (similar themes and genres)
              </Text>
              <Text style={styles.modalBullet}>
                • Complexity (similar difficulty levels)
              </Text>
              <Text style={styles.modalText}>
                The more games you favorite, the better I can understand your preferences and make recommendations!
              </Text>
              <Text style={styles.modalText}>
                You can adjust how much each factor influences my recommendations using the sliders below.
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  if (isCalculating) {
    return (
      <View style={styles.container}>
        <View style={styles.collapsibleHeader}>
          <View style={styles.headerTopRow}>
            <View style={styles.beepleContainer}>
              <BeepleAvatar size={80} />
              <Text style={styles.beepleCaption}>Beeple</Text>
            </View>
            <TouchableOpacity 
              style={styles.headerImageContainer}
              onPress={handleBannerClick}
              activeOpacity={0.8}
            >
              <Image 
                source={require('../../assets/images/beeplerecommends.png')} 
                style={styles.headerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.headerPoweredByBGG}>
            <PoweredByBGG 
              size="small" 
              containerWidth={200} 
              style={styles.headerPoweredByBGGStyle} 
            />
          </View>
        </View>
        <View style={styles.collapsibleContent}>
          <View style={styles.loadingContainer}>
            <LoadingSpinner size="large" />
            <Text style={styles.loadingText}>Analyzing your collection...</Text>
            <Text style={styles.loadingSubtext}>Beep-Boop-Bop, I'm thinking!</Text>
          </View>
        </View>

        {/* Beeple Explanation Modal */}
        <Modal
          isOpen={showExplanationModal}
          onClose={() => setShowExplanationModal(false)}
          title="Beeple Recommends"
        >
          <View style={styles.modalContent}>
            <View style={styles.modalBeepleContainer}>
              <BeepleAvatar size={120} />
              <Text style={styles.modalBeepleCaption}>Beeple</Text>
            </View>
            <View style={styles.modalTextContainer}>
              <Text style={styles.modalText}>
                Beep-Boop-Bop! I'm Beeple, your friendly MeepleBot! 🎲
              </Text>
              <Text style={styles.modalText}>
                I analyze the games you've favorited and find similar games from everyone's collections that you might want to propose for your game nights!
              </Text>
              <Text style={styles.modalText}>
                I look at things like:
              </Text>
              <Text style={styles.modalBullet}>
                • Publishers (games from the same publishers)
              </Text>
              <Text style={styles.modalBullet}>
                • Mechanics (similar gameplay mechanics)
              </Text>
              <Text style={styles.modalBullet}>
                • Categories (similar themes and genres)
              </Text>
              <Text style={styles.modalBullet}>
                • Complexity (similar difficulty levels)
              </Text>
              <Text style={styles.modalText}>
                The more games you favorite, the better I can understand your preferences and make recommendations!
              </Text>
              <Text style={styles.modalText}>
                You can adjust how much each factor influences my recommendations using the sliders below.
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  if (!currentRecommendation) {
    return (
      <View style={styles.container}>
        <TouchableOpacity 
          style={styles.collapsibleHeader}
          onPress={toggleCollapse}
          activeOpacity={0.7}
        >
          <View style={styles.headerTopRow}>
            <View style={styles.beepleContainer}>
              <BeepleAvatar size={80} />
              <Text style={styles.beepleCaption}>Beeple</Text>
            </View>
            <TouchableOpacity 
              style={styles.headerImageContainer}
              onPress={handleBannerClick}
              activeOpacity={0.8}
            >
              <Image 
                source={require('../../assets/images/beeplerecommends.png')} 
                style={styles.headerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <Text style={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</Text>
          </View>
          <View style={styles.headerPoweredByBGG}>
            <PoweredByBGG 
              size="small" 
              containerWidth={200} 
              style={styles.headerPoweredByBGGStyle} 
            />
          </View>
        </TouchableOpacity>
        
        <Animated.View 
          style={[
            styles.collapsibleContent,
            { 
              maxHeight: collapseMaxHeight,
              opacity: collapseAnimation 
            }
          ]}
        >
          <Text style={styles.emptyText}>
            No games are jumping out at me as being similar to the games you have favorited. Try favoriting more games in your collection (or other people's collections!) You have favorited {favoritedGamesCount} games.
          </Text>
          
          {/* Show sliders even when no recommendations */}
          <View style={styles.expandableSection}>
            <TouchableOpacity 
              style={styles.expandableHeader}
              onPress={toggleExpand}
              activeOpacity={0.7}
            >
              <Text style={styles.expandableTitle}>What are you looking for in your next game?</Text>
              <Text style={styles.expandableIcon}>{isExpanded ? '▼' : '▶'}</Text>
            </TouchableOpacity>
            
            <Animated.View 
              style={[
                styles.expandableContent,
                { maxHeight, opacity: expandAnimation }
              ]}
            >
              <View style={styles.slidersContainer}>
                <View style={styles.instructionsContainer}>
                  <Text style={styles.instructionsText}>
                    <Text style={styles.instructionsBold}>How to use the sliders:</Text>
                    {'\n'}• Drag the sliders left or right to adjust how much each factor influences recommendations
                    {'\n'}• Higher values = that factor has more influence on which games Beeple recommends
                    {'\n'}• Lower values = that factor has less influence
                    {'\n'}• Changes update recommendations in real-time as you adjust the sliders
                    {'\n'}• Your preferences are automatically saved
                  </Text>
                </View>
                {Object.entries(weights)
                  .filter(([key]) => key !== 'favorite') // Exclude favorite from sliders
                  .map(([key, value]) => (
                    <FaderSlider
                      key={key}
                      label={key.charAt(0).toUpperCase() + key.slice(1)}
                      description={weightDescriptions[key]}
                      value={value}
                      onValueChange={(newValue) => handleWeightChange(key, newValue)}
                      minimumValue={0}
                      maximumValue={5}
                      step={0.1}
                    />
                  ))}
              </View>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Beeple Explanation Modal */}
        <Modal
          isOpen={showExplanationModal}
          onClose={() => setShowExplanationModal(false)}
          title="Beeple Recommends"
        >
          <View style={styles.modalContent}>
            <View style={styles.modalBeepleContainer}>
              <BeepleAvatar size={120} />
              <Text style={styles.modalBeepleCaption}>Beeple</Text>
            </View>
            <View style={styles.modalTextContainer}>
              <Text style={styles.modalText}>
                Beep-Boop-Bop! I'm Beeple, your friendly MeepleBot! 🎲
              </Text>
              <Text style={styles.modalText}>
                I analyze the games you've favorited and find similar games from everyone's collections that you might want to propose for your game nights!
              </Text>
              <Text style={styles.modalText}>
                I look at things like:
              </Text>
              <Text style={styles.modalBullet}>
                • Publishers (games from the same publishers)
              </Text>
              <Text style={styles.modalBullet}>
                • Mechanics (similar gameplay mechanics)
              </Text>
              <Text style={styles.modalBullet}>
                • Categories (similar themes and genres)
              </Text>
              <Text style={styles.modalBullet}>
                • Complexity (similar difficulty levels)
              </Text>
              <Text style={styles.modalText}>
                The more games you favorite, the better I can understand your preferences and make recommendations!
              </Text>
              <Text style={styles.modalText}>
                You can adjust how much each factor influences my recommendations using the sliders below.
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
        <TouchableOpacity 
          style={styles.collapsibleHeader}
          onPress={toggleCollapse}
          activeOpacity={0.7}
        >
          <View style={styles.headerTopRow}>
            <View style={styles.beepleContainer}>
              <BeepleAvatar size={80} />
              <Text style={styles.beepleCaption}>Beeple</Text>
            </View>
            <TouchableOpacity 
              style={styles.headerImageContainer}
              onPress={handleBannerClick}
              activeOpacity={0.8}
            >
              <Image 
                source={require('../../assets/images/beeplerecommends.png')} 
                style={styles.headerImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <Text style={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</Text>
          </View>
          <View style={styles.headerPoweredByBGG}>
            <PoweredByBGG 
              size="small" 
              containerWidth={200} 
              style={styles.headerPoweredByBGGStyle} 
            />
          </View>
        </TouchableOpacity>

      <Animated.View 
        style={[
          styles.collapsibleContent,
          { 
            maxHeight: collapseMaxHeight,
            opacity: collapseAnimation 
          }
        ]}
      >
        {currentRecommendation && (
          <>
            <View style={styles.headerSubtextContainer}>
              <Text style={styles.headerSubtext}>
                Recommendation {currentRecommendation.index} of {currentRecommendation.total}
              </Text>
            </View>

            {/* Recommendation Text */}
            {currentRecommendation.text ? (
              <View style={styles.recommendationTextContainer}>
                <Text style={styles.recommendationText}>{currentRecommendation.text}</Text>
              </View>
            ) : (
              <Text style={styles.noRecommendationText}>
                Beep-Boop-Bop, I'm Beeple! I couldn't find strong similarities for this game.
              </Text>
            )}

            {/* Top Recommendation Game Card */}
            <View style={styles.gameCardContainer}>
              <GameCard 
                game={currentRecommendation.game} 
                preloadedBggData={currentRecommendation.game._bggData}
                disableModal={false}
                inGrid={false}
                onFavorite={handleFavoriteToggle}
                onProposeGame={onProposeGame}
                userProposals={userProposals}
                eventId={eventId}
              />
              <View style={styles.scoreBadgeContainer}>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreLabel}>Match Score</Text>
                  <Text style={styles.scoreValue}>{Math.round(currentRecommendation.score)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.adjustWeightsButton}
                  onPress={toggleExpand}
                  activeOpacity={0.8}
                >
                  <Text style={styles.adjustWeightsButtonText}>Adjust Match Weights</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Recommendation Section with Sliders */}
            <View style={styles.recommendationSection}>

              {/* Expandable Weight Sliders Section */}
              <View style={styles.expandableSection}>
                <TouchableOpacity 
                  style={styles.expandableHeader}
                  onPress={toggleExpand}
                  activeOpacity={0.7}
                >
                  <Text style={styles.expandableTitle}>What are you looking for in your next game?</Text>
                  <Text style={styles.expandableIcon}>{isExpanded ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                
                <Animated.View 
                  style={[
                    styles.expandableContent,
                    { maxHeight, opacity: expandAnimation }
                  ]}
                >
                  <View style={styles.slidersContainer}>
                    <View style={styles.instructionsContainer}>
                      <Text style={styles.instructionsText}>
                        <Text style={styles.instructionsBold}>How to use the sliders:</Text>
                        {'\n'}• Drag the sliders left or right to adjust how much each factor influences recommendations
                        {'\n'}• Higher values = that factor has more influence on which games Beeple recommends
                        {'\n'}• Lower values = that factor has less influence
                        {'\n'}• Changes update recommendations in real-time as you adjust the sliders
                        {'\n'}• Your preferences are automatically saved
                      </Text>
                    </View>
                    {Object.entries(weights)
                      .filter(([key]) => key !== 'favorite') // Exclude favorite from sliders
                      .map(([key, value]) => (
                        <FaderSlider
                          key={key}
                          label={key.charAt(0).toUpperCase() + key.slice(1)}
                          description={weightDescriptions[key]}
                          value={value}
                          onValueChange={(newValue) => handleWeightChange(key, newValue)}
                          minimumValue={0}
                          maximumValue={5}
                          step={0.1}
                        />
                      ))}
                  </View>
                </Animated.View>
              </View>
            </View>

            {/* Navigation Buttons */}
            {scoredGames.length > 1 && (
              <View style={styles.navigationButtonsContainer}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={handlePreviousRecommendation}
                >
                  <Text style={styles.backButtonText}>←</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleNextRecommendation}
                >
                  <Text style={styles.nextButtonText}>
                    Next Recommendation, Please →
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </Animated.View>

      {/* Beeple Explanation Modal */}
      <Modal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
        title="Beeple Recommends"
      >
        <View style={styles.modalContent}>
          <View style={styles.modalBeepleContainer}>
            <BeepleAvatar size={120} />
            <Text style={styles.modalBeepleCaption}>Beeple</Text>
          </View>
          <View style={styles.modalTextContainer}>
            <Text style={styles.modalText}>
              Beep-Boop-Bop! I'm Beeple, your friendly MeepleBot! 🎲
            </Text>
            <Text style={styles.modalText}>
              I analyze the games you've favorited and find similar games from everyone's collections that you might want to propose for your game nights!
            </Text>
            <Text style={styles.modalText}>
              I look at things like:
            </Text>
            <Text style={styles.modalBullet}>
              • Publishers (games from the same publishers)
            </Text>
            <Text style={styles.modalBullet}>
              • Mechanics (similar gameplay mechanics)
            </Text>
            <Text style={styles.modalBullet}>
              • Categories (similar themes and genres)
            </Text>
            <Text style={styles.modalBullet}>
              • Complexity (similar difficulty levels)
            </Text>
            <Text style={styles.modalText}>
              The more games you favorite, the better I can understand your preferences and make recommendations!
            </Text>
            <Text style={styles.modalText}>
              You can adjust how much each factor influences my recommendations using the sliders below.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  collapsibleHeader: {
    flexDirection: 'column',
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.bgColor,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  beepleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  beepleCaption: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
  poweredByBGGContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  poweredByBGG: {
    width: '100%',
    maxWidth: '100%',
  },
  headerTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing.xs,
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 2,
    paddingVertical: 2,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  headerImage: {
    height: 80,
    width: undefined,
    aspectRatio: 1536 / 672, // Actual image aspect ratio
    maxWidth: '100%',
  },
  headerPoweredByBGG: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  headerPoweredByBGGStyle: {
    width: '100%',
    maxWidth: '100%',
  },
  collapseIcon: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  collapsibleContent: {
    overflow: 'hidden',
  },
  headerSubtextContainer: {
    marginBottom: theme.spacing.md,
    paddingLeft: theme.spacing.sm,
  },
  headerText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  headerSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: theme.spacing.md,
  },
  linkText: {
    color: theme.colors.meepleRed,
    textDecorationLine: 'underline',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  gameCardContainer: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  scoreBadgeContainer: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  scoreBadge: {
    backgroundColor: 'rgba(241, 196, 15, 0.95)',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  scoreLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  scoreValue: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  adjustWeightsButton: {
    backgroundColor: 'rgba(241, 196, 15, 0.95)',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustWeightsButtonText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  recommendationSection: {
    marginBottom: theme.spacing.md,
  },
  recommendationTextContainer: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  recommendationText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
  noRecommendationText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  expandableSection: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  expandableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
  },
  expandableTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  expandableIcon: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  expandableContent: {
    overflow: 'hidden',
  },
  slidersContainer: {
    padding: theme.spacing.md,
  },
  slidersDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 18,
  },
  instructionsContainer: {
    backgroundColor: theme.colors.bgColor,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.meepleRed,
  },
  instructionsText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  instructionsBold: {
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  navigationButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  backButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  nextButton: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    flex: 1,
  },
  nextButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#fff',
  },
  placeholderContainer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    borderStyle: 'dashed',
    margin: theme.spacing.md,
  },
  placeholderText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  loadingContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    fontWeight: theme.typography.fontWeight.medium,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  modalContent: {
    padding: theme.spacing.lg,
  },
  modalBeepleContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalBeepleCaption: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
  },
  modalTextContainer: {
    gap: theme.spacing.md,
  },
  modalText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    lineHeight: theme.typography.lineHeight.relaxed,
  },
  modalBullet: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    lineHeight: theme.typography.lineHeight.relaxed,
    marginLeft: theme.spacing.md,
  },
});

export default BeepleRecommendations;

