import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import storage from '../utils/storage';
import { useAuth } from './AuthContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { startBackgroundRetryService, stopBackgroundRetryService } from '../utils/backgroundRetryService';

const CollectionsContext = createContext();

export const useCollections = () => {
  const context = useContext(CollectionsContext);
  if (!context) {
    throw new Error('useCollections must be used within a CollectionsProvider');
  }
  return context;
};

export const CollectionsProvider = ({ children }) => {
  const { user } = useAuth();
  const [collections, setCollections] = useState({}); // { userId: [games] }
  const [loading, setLoading] = useState(false);

  const [initialised, setInitialised] = useState(false);

  // Load collections from storage on mount
  useEffect(() => {
    const loadCollections = async () => {
      try {
        const storedCollections = await storage.getItem('meepleup_collections');
        if (storedCollections) {
        const parsed = JSON.parse(storedCollections);
        const userIds = Object.keys(parsed);
        const totalGames = userIds.reduce((sum, uid) => sum + (parsed[uid]?.length || 0), 0);
        // Reduced logging - only log once on initial load
        if (__DEV__ && totalGames > 0 && Object.keys(collections).length === 0) {
          console.log(`[Collections] Loaded from storage: ${userIds.length} users, ${totalGames} total games`);
        }
        setCollections(parsed);
        } else {
          // Reduced logging - no need to log empty state
        }
      } catch (error) {
        console.error('Error loading collections:', error);
      } finally {
        setInitialised(true);
      }
    };
    loadCollections();
  }, []);

  // Helper to determine if game data is a reference-only (new format) or full data (old format)
  const isReferenceOnly = (data) => {
    // New format: has bggId but missing full game data fields (title, image, etc.)
    // Old format: has title, image, etc. even if it also has bggId
    return data.bggId && !data.title && !data.image && !data.thumbnail && !data.name;
  };

  // Helper to enrich references with full game data from main games collection
  const enrichReferencesWithGameData = useCallback(async (references) => {
    if (!references || references.length === 0) return [];
    
    // Extract all bggIds that need enrichment
    const bggIds = references
      .filter(ref => ref.bggId)
      .map(ref => ref.bggId.toString());
    
    if (bggIds.length === 0) {
      // Reduced logging - no need to log this common case
      return references;
    }
    
    try {
      const { batchGetGamesById } = await import('../services/gameDatabase');
      const gameDataMap = await batchGetGamesById(bggIds);
      
      // Reduced logging - only log if enrichment fails or is incomplete
      if (__DEV__ && gameDataMap.size < bggIds.length * 0.9) {
        console.warn(`[Collections] Enrichment incomplete: ${gameDataMap.size}/${bggIds.length} games found`);
      }
      
      // Merge reference data with full game data
      return references.map(ref => {
        if (!ref.bggId) {
          // No bggId, return as-is (shouldn't happen but handle gracefully)
          return ref;
        }
        
        const fullGameData = gameDataMap.get(ref.bggId.toString());
        if (fullGameData) {
          // Merge: full game data + user-specific data from reference
          return {
            ...fullGameData,
            id: ref.id || `bgg_${ref.bggId}`, // Use reference ID or generate from bggId
            title: fullGameData.name || ref.title, // Use name from full data, fallback to ref
            bggId: ref.bggId,
            userRating: ref.userRating || null,
            numplays: ref.numplays || null,
            isFavorite: ref.isFavorite || false,
            addedAt: ref.addedAt || new Date().toISOString(),
            source: ref.source || 'unknown',
            updatedAt: ref.updatedAt || new Date().toISOString(),
          };
        } else {
          // Game not found in main collection - return reference with minimal data
          console.warn(`[Collections] Game ${ref.bggId} not found in main collection, using reference data only`);
          return {
            id: ref.id || `bgg_${ref.bggId}`,
            bggId: ref.bggId,
            title: `Game ${ref.bggId}`, // Placeholder
            name: `Game ${ref.bggId}`,
            userRating: ref.userRating || null,
            numplays: ref.numplays || null,
            isFavorite: ref.isFavorite || false,
            addedAt: ref.addedAt || new Date().toISOString(),
            source: ref.source || 'unknown',
            updatedAt: ref.updatedAt || new Date().toISOString(),
          };
        }
      });
    } catch (error) {
      console.error('[Collections] Error enriching references:', error);
      return references; // Return references as-is if enrichment fails
    }
  }, []);

  // Track if we've synced the current user to prevent re-syncing
  const currentUserSyncedRef = React.useRef(null);

  // Sync current user ONCE
  useEffect(() => {
    console.log('[Collections] Sync effect triggered', {
      hasUser: !!user,
      hasDb: !!db,
      initialised,
      userEmail: user?.email,
      userId: user?.uid || user?.id,
    });
    
    if (!user || !db || !initialised) {
      console.log('[Collections] Sync skipped - missing requirements', {
        hasUser: !!user,
        hasDb: !!db,
        initialised,
      });
      currentUserSyncedRef.current = null;
      return;
    }
    
    const userId = user.uid || user.id;
    if (!userId) {
      console.warn('[Collections] Sync skipped - no userId found', { user });
      return;
    }
    
    console.log('[Collections] Starting sync for user', {
      userId,
      email: user.email,
      currentUserSyncedRef: currentUserSyncedRef.current,
    });
    
    // Reset sync flag if user changed
    if (currentUserSyncedRef.current !== userId) {
      console.log('[Collections] User changed, resetting sync flag', {
        oldUserId: currentUserSyncedRef.current,
        newUserId: userId,
      });
      currentUserSyncedRef.current = null;
    }
    
    // Check if already synced for this user
    if (currentUserSyncedRef.current === userId) {
      console.log('[Collections] Already synced for this user, skipping');
      return;
    }
    
    console.log('[Collections] Syncing current user games', {
      userId,
      email: user.email,
    });
    
    // Mark as syncing immediately to prevent duplicate runs
    currentUserSyncedRef.current = userId;
    
    // Note: This sync happens in the background. If local storage has cached games,
    // they will be shown immediately while this sync updates them in the background.
    const sync = async () => {
      setLoading(true);
      try {
        console.log('[Collections] Fetching games from Firestore with pagination', {
          userId,
          path: `userGames/${userId}/games`,
        });
        
        // Load games with pagination to handle large collections (>1MB response limit)
        const BATCH_SIZE = 500; // Firestore recommended batch size
        let allDocs = [];
        let lastDoc = null;
        let batchNumber = 0;
        let hasMore = true;

        while (hasMore) {
          batchNumber++;
          
          try {
            let query = db
              .collection('userGames')
              .doc(userId)
              .collection('games')
              .limit(BATCH_SIZE);
            
            if (lastDoc) {
              query = query.startAfter(lastDoc);
            }
            
            const batch = await query.get();
            allDocs = [...allDocs, ...batch.docs];
            
            hasMore = batch.docs.length === BATCH_SIZE;
            
            if (hasMore && batch.docs.length > 0) {
              lastDoc = batch.docs[batch.docs.length - 1];
              // Small delay to avoid overwhelming Firestore
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log(`[Collections] Batch ${batchNumber}: ${batch.docs.length} games (total: ${allDocs.length})`);
            
          } catch (batchError) {
            console.error(`[Collections] Error loading batch ${batchNumber}:`, batchError);
            // Continue with what we have - partial data is better than no data
            // But log the error for monitoring
            hasMore = false;
          }
        }
        
        console.log('[Collections] Firestore query completed', {
          userId,
          totalGames: allDocs.length,
          batches: batchNumber,
          empty: allDocs.length === 0,
        });
        
        if (allDocs.length > 0) {
          console.log('[Collections] Parsing game documents', {
            userId,
            docCount: allDocs.length,
          });
          
          // Parse references from Firestore (may be new format references or old format full data)
          const references = allDocs.map(doc => {
            const data = doc.data();
            const isRef = isReferenceOnly(data);
            
            if (isRef) {
              // New format: reference only
              return {
                id: doc.id,
                bggId: data.bggId,
                userRating: data.userRating || null,
                numplays: data.numplays || null,
                isFavorite: data.isFavorite || false,
                addedAt: data.addedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                source: data.source || 'manual',
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.lastUpdatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              };
            } else {
              // Old format: full data (backward compatibility)
              return {
                id: doc.id,
                title: data.title || data.gameName || 'Unknown Game',
                bggId: data.bggId || null,
                image: data.image || data.thumbnail || null,
                thumbnail: data.thumbnail || null,
                description: data.description || '',
                yearPublished: data.yearPublished || null,
                minPlayers: data.minPlayers || null,
                maxPlayers: data.maxPlayers || null,
                playingTime: data.playingTime || null,
                bggRating: data.bggRating || null,
                userRating: data.userRating || null,
                numplays: data.numplays || null,
                isFavorite: data.isFavorite || false,
                addedAt: data.addedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                source: data.source || 'manual',
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.lastUpdatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                mechanics: data.mechanics || null,
                categories: data.categories || null,
                publishers: data.publishers || null,
                publisher: data.publisher || null,
                complexity: data.complexity || null,
                averageWeight: data.averageWeight || data.complexity || null,
              };
            }
          }).filter(ref => {
            // Filter out invalid references (must have bggId or title for old format)
            if (isReferenceOnly(ref)) {
              return !!ref.bggId;
            }
            return (ref.title && ref.title !== 'Unknown Game') || ref.bggId;
          });
          
          console.log('[Collections] Parsed references', {
            userId,
            totalReferences: references.length,
            sampleRefs: references.slice(0, 3).map(r => ({
              id: r.id,
              bggId: r.bggId,
              hasTitle: !!r.title,
            })),
          });
          
          // Separate references (new format) from full data (old format)
          const newFormatRefs = references.filter(ref => isReferenceOnly(ref));
          const oldFormatGames = references.filter(ref => !isReferenceOnly(ref));
          
          console.log('[Collections] Separated by format', {
            userId,
            newFormatRefs: newFormatRefs.length,
            oldFormatGames: oldFormatGames.length,
          });
          
          // Enrich new-format references with full game data
          let enrichedGames = [...oldFormatGames]; // Start with old format games
          
          if (newFormatRefs.length > 0) {
            console.log('[Collections] Enriching references with game data', {
              userId,
              refCount: newFormatRefs.length,
            });
            const enriched = await enrichReferencesWithGameData(newFormatRefs);
            console.log('[Collections] Enrichment completed', {
              userId,
              enrichedCount: enriched.length,
              sampleEnriched: enriched.slice(0, 2).map(g => ({
                id: g.id,
                bggId: g.bggId,
                title: g.title || g.name,
              })),
            });
            enrichedGames = [...enrichedGames, ...enriched];
          }
          
          // Deduplicate games by bggId (prefer first occurrence)
          const seenBggIds = new Set();
          const seenIds = new Set();
          const deduplicatedGames = enrichedGames.filter(game => {
            const bggId = game.bggId?.toString();
            const gameId = game.id;
            
            // Check for duplicates by bggId first (most reliable)
            if (bggId) {
              if (seenBggIds.has(bggId)) {
                console.warn(`[Collections] Removing duplicate game by bggId: ${bggId}`);
                return false;
              }
              seenBggIds.add(bggId);
            }
            
            // Also check by game id as fallback
            if (gameId) {
              if (seenIds.has(gameId)) {
                console.warn(`[Collections] Removing duplicate game by id: ${gameId}`);
                return false;
              }
              seenIds.add(gameId);
            }
            
            return true;
          });
          
          console.log('[Collections] Setting collections state', {
            userId,
            gameCount: deduplicatedGames.length,
            sampleGames: deduplicatedGames.slice(0, 3).map(g => ({
              id: g.id,
              bggId: g.bggId,
              title: g.title || g.name,
            })),
          });
          
          setCollections(prev => ({
            ...prev,
            [userId]: deduplicatedGames,
          }));
          
          console.log(`[Collections] ✅ Loaded ${deduplicatedGames.length} games for user ${userId} (${user.email})`);
        } else {
          console.log('[Collections] ⚠️ No games found in Firestore', {
            userId,
            email: user.email,
            path: `userGames/${userId}/games`,
          });
          // Set empty array so we know the sync completed
          setCollections(prev => ({
            ...prev,
            [userId]: [],
          }));
        }
      } catch (error) {
        console.error(`[Collections] ❌ Error syncing user games for ${userId} (${user.email}):`, error);
        console.error('[Collections] Error details:', {
          message: error.message,
          code: error.code,
          stack: error.stack,
          userId,
          email: user.email,
        });
        // Reset flag on error so we can retry
        currentUserSyncedRef.current = null;
      } finally {
        console.log('[Collections] Sync completed', {
          userId,
          email: user.email,
        });
        setLoading(false);
      }
    };
    
    sync();
  }, [user, db, initialised, enrichReferencesWithGameData]); // Added enrichReferencesWithGameData

  // Track who we've synced
  const syncedUsersRef = React.useRef(new Set());

  const syncGamesForUsers = useCallback(async (userIds) => {
    if (!db || !userIds || userIds.length === 0) return;
    
    // Filter to only users we haven't synced
    const toSync = userIds.filter(uid => !syncedUsersRef.current.has(uid));
    if (toSync.length === 0) {
      // Reduced logging - no need to log skipped syncs
      return;
    }
    
    // Reduced logging - only log if syncing multiple users
    if (__DEV__ && toSync.length > 1) {
      console.log('[Collections] Syncing', toSync.length, 'users');
    }
    toSync.forEach(uid => syncedUsersRef.current.add(uid));
    
    try {
      const results = await Promise.all(
        toSync.map(async (userId) => {
          const snapshot = await db.collection('userGames').doc(userId).collection('games').get();
          
          if (snapshot.empty) return { userId, references: [] };
          
          // Parse references (may be new format or old format)
          const references = snapshot.docs.map(doc => {
            const data = doc.data();
            const isRef = isReferenceOnly(data);
            
            if (isRef) {
              // New format: reference only
              return {
                id: doc.id,
                bggId: data.bggId,
                userRating: data.userRating || null,
                numplays: data.numplays || null,
                isFavorite: data.isFavorite || false,
                addedAt: data.addedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                source: data.source || 'manual',
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.lastUpdatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              };
            } else {
              // Old format: full data (backward compatibility)
              return {
                id: doc.id,
                title: data.title || data.gameName || 'Unknown Game',
                bggId: data.bggId || null,
                image: data.image || data.thumbnail || null,
                thumbnail: data.thumbnail || null,
                description: data.description || '',
                yearPublished: data.yearPublished || null,
                minPlayers: data.minPlayers || null,
                maxPlayers: data.maxPlayers || null,
                playingTime: data.playingTime || null,
                bggRating: data.bggRating || null,
                userRating: data.userRating || null,
                numplays: data.numplays || null,
                isFavorite: data.isFavorite || false,
                addedAt: data.addedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                source: data.source || 'manual',
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.lastUpdatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                mechanics: data.mechanics || null,
                categories: data.categories || null,
                publishers: data.publishers || null,
                publisher: data.publisher || null,
                complexity: data.complexity || null,
                averageWeight: data.averageWeight || data.complexity || null,
              };
            }
          }).filter(ref => {
            // Filter out invalid references
            if (isReferenceOnly(ref)) {
              return !!ref.bggId;
            }
            return (ref.title && ref.title !== 'Unknown Game') || ref.bggId;
          });
          
          return { userId, references };
        })
      );
      
      // Enrich all references with full game data
      const enrichedResults = await Promise.all(
        results.map(async ({ userId, references }) => {
          if (references.length === 0) return { userId, games: [] };
          
          const newFormatRefs = references.filter(ref => isReferenceOnly(ref));
          const oldFormatGames = references.filter(ref => !isReferenceOnly(ref));
          
          let games = [...oldFormatGames];
          
          if (newFormatRefs.length > 0) {
            const enriched = await enrichReferencesWithGameData(newFormatRefs);
            games = [...games, ...enriched];
          }
          
          // Deduplicate games by bggId (prefer first occurrence)
          const seenBggIds = new Set();
          const seenIds = new Set();
          const deduplicatedGames = games.filter(game => {
            const bggId = game.bggId?.toString();
            const gameId = game.id;
            
            // Check for duplicates by bggId first (most reliable)
            if (bggId) {
              if (seenBggIds.has(bggId)) {
                if (__DEV__) {
                  console.warn(`[Collections] Removing duplicate game by bggId: ${bggId}`);
                }
                return false;
              }
              seenBggIds.add(bggId);
            }
            
            // Also check by game id as fallback
            if (gameId) {
              if (seenIds.has(gameId)) {
                if (__DEV__) {
                  console.warn(`[Collections] Removing duplicate game by id: ${gameId}`);
                }
                return false;
              }
              seenIds.add(gameId);
            }
            
            return true;
          });
          
          return { userId, games: deduplicatedGames };
        })
      );
      
      setCollections(prev => {
        const updates = {};
        let hasChanges = false;
        
        enrichedResults.forEach(({ userId, games }) => {
          if (games.length > 0) {
            // Check if games actually changed by comparing game IDs, BGG IDs, and titles
            const currentGames = prev[userId] || [];
            // Create stable sorted keys for comparison
            const currentKey = currentGames
              .map(g => `${g.id}:${g.bggId || ''}:${g.title || g.name || ''}`)
              .sort()
              .join('|');
            const newKey = games
              .map(g => `${g.id}:${g.bggId || ''}:${g.title || g.name || ''}`)
              .sort()
              .join('|');
            
            if (currentKey !== newKey) {
              updates[userId] = games;
              hasChanges = true;
              // Reduced logging - only log significant changes
            }
          }
        });
        
        // Only update if there are actual changes
        if (!hasChanges) {
          // Reduced logging - no need to log when no changes
          return prev; // Return same reference to prevent re-render
        }
        
        return { ...prev, ...updates };
      });
    } catch (error) {
      console.error('Error syncing games:', error);
    }
  }, [db, enrichReferencesWithGameData]);

  // Save to storage with simple debounce
  useEffect(() => {
    if (!initialised) return;
    
    const userIds = Object.keys(collections);
    const totalGames = userIds.reduce((sum, uid) => sum + (collections[uid]?.length || 0), 0);
    console.log('[Collections] Collections state changed, saving to storage', {
      userIds,
      totalGames,
      gamesPerUser: userIds.reduce((acc, uid) => {
        acc[uid] = collections[uid]?.length || 0;
        return acc;
      }, {}),
    });
    
    const timeoutId = setTimeout(() => {
      storage.setItem('meepleup_collections', JSON.stringify(collections));
      console.log('[Collections] Saved collections to storage');
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [collections, initialised]);

  // Start/stop background retry service when user is authenticated and collections are initialized
  useEffect(() => {
    if (!initialised || !user) {
      // Stop service if user logs out or collections not initialized
      stopBackgroundRetryService();
      return;
    }

    const userId = user.uid || user.id;
    if (!userId) {
      stopBackgroundRetryService();
      return;
    }

    // Start background retry service
    startBackgroundRetryService(addGameToCollection, userId);

    // Cleanup: stop service when component unmounts or user changes
    return () => {
      stopBackgroundRetryService();
    };
  }, [user, initialised, addGameToCollection]);

  // Simple stable callbacks
  const addGameToCollection = useCallback(async (userId, gameData) => {
    console.log('[Collections] addGameToCollection called', {
      userId,
      gameId: gameData.id,
      bggId: gameData.bggId,
      title: gameData.title || gameData.name,
      hasBggId: !!gameData.bggId,
      hasDb: !!db,
      gameDataKeys: Object.keys(gameData),
    });

    if (!userId) {
      console.warn('[Collections] ⚠️ addGameToCollection: No userId provided', { gameData });
      return;
    }
    
    // Ensure game exists in main games collection first
    // This is important - we need to store full game data in main collection
    if (gameData.bggId && db) {
      try {
        console.log('[Collections] Ensuring game exists in main collection', {
          userId,
          bggId: gameData.bggId,
        });

        const { getGamesFromFirebase, updateGameWithBGGData } = await import('../services/gameDatabase');
        const existingGame = await getGamesFromFirebase(gameData.bggId);
        
        console.log('[Collections] Checked main collection', {
          userId,
          bggId: gameData.bggId,
          existsInMainCollection: !!existingGame,
        });
        
        if (!existingGame) {
          // Game not in main collection - we need full game data to store it
          // If gameData has full data, store it. Otherwise, we need to fetch it.
          if (gameData.title || gameData.name || gameData.image || gameData.thumbnail) {
            console.log('[Collections] Game not in main collection, storing full data', {
              userId,
              bggId: gameData.bggId,
              hasTitle: !!(gameData.title || gameData.name),
              hasImage: !!(gameData.image || gameData.thumbnail),
            });

            // We have enough data to store in main collection
            // Include ALL BGG data fields including category ranks for proper categorization
            const mainCollectionData = {
              id: gameData.bggId,
              name: gameData.name || gameData.title || '',
              yearPublished: gameData.yearPublished || '',
              thumbnail: gameData.thumbnail || null,
              image: gameData.image || null,
              description: gameData.description || null,
              minPlayers: gameData.minPlayers || null,
              maxPlayers: gameData.maxPlayers || null,
              playingTime: gameData.playingTime || null,
              minPlayTime: gameData.minPlayTime || null,
              maxPlayTime: gameData.maxPlayTime || null,
              minAge: gameData.minAge || null,
              average: gameData.bggRating || gameData.average || '',
              bayesAverage: gameData.bayesAverage || '',
              usersRated: gameData.usersRated || '',
              rank: gameData.rank || '',
              // Category ranks - CRITICAL for proper categorization
              strategyGamesRank: gameData.strategyGamesRank || '',
              familyGamesRank: gameData.familyGamesRank || '',
              partyGamesRank: gameData.partyGamesRank || '',
              abstractsRank: gameData.abstractsRank || '',
              thematicRank: gameData.thematicRank || '',
              wargamesRank: gameData.wargamesRank || '',
              childrensGamesRank: gameData.childrensGamesRank || '',
              cgsRank: gameData.cgsRank || '',
              mechanics: gameData.mechanics || null,
              categories: gameData.categories || null,
              designers: gameData.designers || null,
              publishers: gameData.publishers || null,
              publisher: gameData.publisher || null,
              artists: gameData.artists || null,
              complexity: gameData.complexity || gameData.averageWeight || null,
              averageWeight: gameData.averageWeight || null,
              ownedCount: gameData.ownedCount || null,
              bestPlayerCount: gameData.bestPlayerCount || null,
              languageDependence: gameData.languageDependence || null,
              suggestedPlayerAge: gameData.suggestedPlayerAge || null,
              alternateNames: gameData.alternateNames || null,
              dimensions: gameData.dimensions || null,
              weight: gameData.weight || null,
            };

            console.log('[Collections] Storing game in main collection', {
              userId,
              bggId: gameData.bggId,
              dataKeys: Object.keys(mainCollectionData),
            });

            await updateGameWithBGGData(gameData.bggId, mainCollectionData);
            
            console.log('[Collections] ✅ Successfully stored game in main collection', {
              userId,
              bggId: gameData.bggId,
            });
          } else {
            console.warn(`[Collections] ⚠️ Cannot store game ${gameData.bggId} in main collection - missing full game data`, {
              userId,
              bggId: gameData.bggId,
              hasTitle: !!(gameData.title || gameData.name),
              hasImage: !!(gameData.image || gameData.thumbnail),
            });
          }
        } else {
          console.log('[Collections] Game already exists in main collection', {
            userId,
            bggId: gameData.bggId,
          });
        }
      } catch (error) {
        console.error(`[Collections] ❌ Error ensuring game ${gameData.bggId} in main collection:`, {
          error,
          message: error.message,
          stack: error.stack,
          userId,
          bggId: gameData.bggId,
        });
      }
    }
    
    // Store full game data in state for immediate UI update
    // Prevent duplicates by checking if game with same bggId or id already exists
    console.log('[Collections] Updating local state with game', {
      userId,
      gameId: gameData.id,
      bggId: gameData.bggId,
      title: gameData.title || gameData.name,
    });

    setCollections(prev => {
      const currentCollection = prev[userId] || [];
      const gameId = gameData.id || (gameData.bggId ? `bgg_${gameData.bggId}` : null);
      const bggId = gameData.bggId?.toString();
      
      console.log('[Collections] Checking for duplicates', {
        userId,
        gameId,
        bggId,
        currentCollectionLength: currentCollection.length,
      });
      
      // Check for duplicates by bggId first (most reliable), then by id
      const isDuplicate = currentCollection.some(existingGame => {
        if (bggId && existingGame.bggId) {
          return existingGame.bggId.toString() === bggId;
        }
        if (gameId && existingGame.id) {
          return existingGame.id === gameId;
        }
        return false;
      });
      
      if (isDuplicate) {
        console.log(`[Collections] ⚠️ Skipping duplicate game: ${gameId || bggId || 'unknown'}`, {
          userId,
          gameId,
          bggId,
        });
        return prev; // Return unchanged if duplicate
      }
      
      const newCollection = [...currentCollection, gameData];
      console.log('[Collections] ✅ Added game to local state', {
        userId,
        gameId,
        bggId,
        newCollectionLength: newCollection.length,
      });
      
      return {
        ...prev,
        [userId]: newCollection,
      };
    });
    
    // Save ONLY reference + user-specific data to userGames collection
    if (db && gameData.bggId) {
      const gameDocId = gameData.id || `bgg_${gameData.bggId}`;
      const referenceData = {
        bggId: gameData.bggId,
        userRating: gameData.userRating || null,
        numplays: gameData.numplays || null,
        isFavorite: gameData.isFavorite || false,
        addedAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
        source: gameData.source || 'manual',
      };
      
      const firestorePath = `userGames/${userId}/games/${gameDocId}`;
      console.log('[Collections] Saving game reference to Firestore', {
        userId,
        gameDocId,
        bggId: gameData.bggId,
        firestorePath,
        referenceData,
      });
      
      // Firestore save happens asynchronously - don't await to avoid blocking
      db.collection('userGames').doc(userId)
        .collection('games').doc(gameDocId)
        .set(referenceData, { merge: true })
        .then(() => {
          console.log('[Collections] ✅ Successfully saved game reference to Firestore', {
            userId,
            gameDocId,
            bggId: gameData.bggId,
            firestorePath,
          });
        })
        .catch((firestoreError) => {
          console.error('[Collections] ❌ Error saving game reference to Firestore:', {
            error: firestoreError,
            message: firestoreError.message,
            code: firestoreError.code,
            stack: firestoreError.stack,
            userId,
            gameDocId,
            bggId: gameData.bggId,
            firestorePath,
            referenceData,
          });
        });
    } else if (db && gameData.id) {
      // Fallback for games without bggId (manual additions) - store full data (legacy behavior)
      console.warn('[Collections] ⚠️ Game without bggId detected - storing full data (legacy mode)', {
        userId,
        gameId: gameData.id,
        gameDataKeys: Object.keys(gameData),
      });

      const firestorePath = `userGames/${userId}/games/${gameData.id}`;
      const fullGameData = {
        ...gameData,
        addedAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
      };

      console.log('[Collections] Saving full game data to Firestore (legacy mode)', {
        userId,
        gameId: gameData.id,
        firestorePath,
        dataKeys: Object.keys(fullGameData),
      });

      db.collection('userGames').doc(userId)
        .collection('games').doc(gameData.id)
        .set(fullGameData, { merge: true })
        .then(() => {
          console.log('[Collections] ✅ Successfully saved full game data to Firestore (legacy mode)', {
            userId,
            gameId: gameData.id,
            firestorePath,
          });
        })
        .catch((firestoreError) => {
          console.error('[Collections] ❌ Error saving game to Firestore (legacy mode):', {
            error: firestoreError,
            message: firestoreError.message,
            code: firestoreError.code,
            stack: firestoreError.stack,
            userId,
            gameId: gameData.id,
            firestorePath,
          });
        });
    } else {
      console.warn('[Collections] ⚠️ Cannot save to Firestore - missing db or game identifier', {
        userId,
        hasDb: !!db,
        hasBggId: !!gameData.bggId,
        hasId: !!gameData.id,
        gameDataKeys: Object.keys(gameData),
      });
    }
  }, [db]);

  const removeGameFromCollection = useCallback((userId, gameId) => {
    if (!userId) return;
    setCollections(prev => ({
      ...prev,
      [userId]: (prev[userId] || []).filter(game => game.id !== gameId),
    }));
  }, []);

  const getUserCollection = useCallback((userId) => {
    if (!userId) return [];
    return collections[userId] || [];
  }, [collections]); // YES, depend on collections - it's fine!

  const updateGameInCollection = useCallback(async (userId, gameId, updates) => {
    if (!userId || !gameId) return;
    
    // Update local state (full game data)
    // Match by id (exact match, using string comparison to avoid type issues)
    const gameIdStr = String(gameId);
    setCollections(prev => ({
      ...prev,
      [userId]: (prev[userId] || []).map(game => {
        // Match by id using string comparison to handle type mismatches
        const gameIdToCompare = game.id ? String(game.id) : null;
        if (gameIdToCompare === gameIdStr) {
          return { ...game, ...updates };
        }
        return game;
      }),
    }));

    if (db) {
      try {
        // Only update user-specific fields in Firestore (reference format)
        // Extract only fields that belong in userGames collection
        const userSpecificUpdates = {
          userRating: updates.userRating !== undefined ? updates.userRating : undefined,
          numplays: updates.numplays !== undefined ? updates.numplays : undefined,
          isFavorite: updates.isFavorite !== undefined ? updates.isFavorite : undefined,
          source: updates.source !== undefined ? updates.source : undefined,
          updatedAt: firebase.firestore.Timestamp.now(),
        };
        
        // Remove undefined fields
        Object.keys(userSpecificUpdates).forEach(key => 
          userSpecificUpdates[key] === undefined && delete userSpecificUpdates[key]
        );
        
        await db.collection('userGames').doc(userId)
          .collection('games').doc(gameId)
          .set(userSpecificUpdates, { merge: true });
          
        if (__DEV__) {
          console.log(`[Collections] Updated game reference ${gameId} with user-specific fields:`, Object.keys(userSpecificUpdates));
        }
      } catch (error) {
        console.error('Error updating game reference:', error);
      }
    }
  }, [db]);

  // Simple context value - let it change when collections changes!
  // Track previous collection count to reduce logging
  const prevCollectionCountRef = React.useRef(0);
  const prevTotalGamesRef = React.useRef(0);
  const value = useMemo(() => {
    const userIds = Object.keys(collections);
    const totalGames = userIds.reduce((sum, uid) => sum + (collections[uid]?.length || 0), 0);
    // Reduced logging - only log on significant changes (when user count or total games changes significantly)
    const userCountChanged = userIds.length !== prevCollectionCountRef.current;
    const gamesChangedSignificantly = Math.abs(totalGames - prevTotalGamesRef.current) > 10;
    if (__DEV__ && (userCountChanged || gamesChangedSignificantly)) {
      console.log('[CollectionsContext] Context updated, users:', userIds.length, 'total games:', totalGames);
      prevCollectionCountRef.current = userIds.length;
      prevTotalGamesRef.current = totalGames;
    }
    
    return {
      collections,
      addGameToCollection,
      removeGameFromCollection,
      getUserCollection,
      updateGameInCollection,
      syncGamesForUsers,
      loading,
      initialised,
    };
  }, [
    collections, // It's OK for this to change!
    addGameToCollection,
    removeGameFromCollection,
    getUserCollection,
    updateGameInCollection,
    syncGamesForUsers,
    loading,
    initialised,
  ]);

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
};

