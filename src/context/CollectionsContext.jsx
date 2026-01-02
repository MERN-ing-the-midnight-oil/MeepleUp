import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import storage from '../utils/storage';
import { useAuth } from './AuthContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';

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
    if (!user || !db || !initialised) {
      currentUserSyncedRef.current = null;
      return;
    }
    
    const userId = user.uid || user.id;
    if (!userId) return;
    
    // Reset sync flag if user changed
    if (currentUserSyncedRef.current !== userId) {
      currentUserSyncedRef.current = null;
    }
    
    // Check if already synced for this user
    if (currentUserSyncedRef.current === userId) {
      // Reduced logging - no need to log skipped syncs
      return;
    }
    
    // Reduced logging - only log when starting sync
    if (__DEV__) {
      console.log('[Collections] Syncing current user games');
    }
    
    // Mark as syncing immediately to prevent duplicate runs
    currentUserSyncedRef.current = userId;
    
    // Note: This sync happens in the background. If local storage has cached games,
    // they will be shown immediately while this sync updates them in the background.
    const sync = async () => {
      setLoading(true);
      try {
        // Reduced logging - only log summary
        const snapshot = await db.collection('userGames').doc(userId).collection('games').get();
        
        if (!snapshot.empty) {
          // Parse references from Firestore (may be new format references or old format full data)
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
            // Filter out invalid references (must have bggId or title for old format)
            if (isReferenceOnly(ref)) {
              return !!ref.bggId;
            }
            return (ref.title && ref.title !== 'Unknown Game') || ref.bggId;
          });
          
          // Separate references (new format) from full data (old format)
          const newFormatRefs = references.filter(ref => isReferenceOnly(ref));
          const oldFormatGames = references.filter(ref => !isReferenceOnly(ref));
          
          // Reduced logging - only log if mixed format detected
          if (__DEV__ && newFormatRefs.length > 0 && oldFormatGames.length > 0) {
            console.log(`[Collections] Mixed format: ${newFormatRefs.length} references, ${oldFormatGames.length} old-format games`);
          }
          
          // Enrich new-format references with full game data
          let enrichedGames = [...oldFormatGames]; // Start with old format games
          
          if (newFormatRefs.length > 0) {
            const enriched = await enrichReferencesWithGameData(newFormatRefs);
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
          
          setCollections(prev => ({
            ...prev,
            [userId]: deduplicatedGames,
          }));
          // Reduced logging - only log summary
          if (__DEV__ && deduplicatedGames.length > 0) {
            console.log(`[Collections] Loaded ${deduplicatedGames.length} games for user ${userId}`);
          }
        } else {
          // Reduced logging - no need to log empty collections
          // Set empty array so we know the sync completed
          setCollections(prev => ({
            ...prev,
            [userId]: [],
          }));
        }
      } catch (error) {
        console.error(`[Collections] Error syncing user games for ${userId}:`, error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          stack: error.stack,
        });
        // Reset flag on error so we can retry
        currentUserSyncedRef.current = null;
      } finally {
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
    
    const timeoutId = setTimeout(() => {
      storage.setItem('meepleup_collections', JSON.stringify(collections));
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [collections, initialised]);

  // Simple stable callbacks
  const addGameToCollection = useCallback(async (userId, gameData) => {
    if (!userId) return;
    
    // Ensure game exists in main games collection first
    // This is important - we need to store full game data in main collection
    if (gameData.bggId && db) {
      try {
        const { getGameById, updateGameWithBGGData } = await import('../services/gameDatabase');
        const existingGame = await getGameById(gameData.bggId);
        
        if (!existingGame) {
          // Game not in main collection - we need full game data to store it
          // If gameData has full data, store it. Otherwise, we need to fetch it.
          if (gameData.title || gameData.name || gameData.image || gameData.thumbnail) {
            // We have enough data to store in main collection
            // Include ALL BGG data fields including category ranks for proper categorization
            await updateGameWithBGGData(gameData.bggId, {
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
            });
          } else {
            console.warn(`[Collections] Cannot store game ${gameData.bggId} in main collection - missing full game data`);
          }
        }
      } catch (error) {
        console.error(`[Collections] Error ensuring game ${gameData.bggId} in main collection:`, error);
      }
    }
    
    // Store full game data in state for immediate UI update
    // Prevent duplicates by checking if game with same bggId or id already exists
    setCollections(prev => {
      const currentCollection = prev[userId] || [];
      const gameId = gameData.id || (gameData.bggId ? `bgg_${gameData.bggId}` : null);
      const bggId = gameData.bggId?.toString();
      
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
        if (__DEV__) {
          console.log(`[Collections] Skipping duplicate game: ${gameId || bggId || 'unknown'}`);
        }
        return prev; // Return unchanged if duplicate
      }
      
      return {
        ...prev,
        [userId]: [...currentCollection, gameData],
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
      
      // Firestore save happens asynchronously - don't await to avoid blocking
      db.collection('userGames').doc(userId)
        .collection('games').doc(gameDocId)
        .set(referenceData, { merge: true })
        .catch((firestoreError) => {
          console.error('[CollectionsContext] Error saving game reference to Firestore:', firestoreError);
        });
      
      if (__DEV__) {
        console.log(`[Collections] Saved game reference to userGames/${userId}/games/${gameDocId}`);
      }
    } else if (db && gameData.id) {
      // Fallback for games without bggId (manual additions) - store full data (legacy behavior)
      console.warn('[Collections] Game without bggId detected - storing full data (legacy mode)');
      db.collection('userGames').doc(userId)
        .collection('games').doc(gameData.id)
        .set({
          ...gameData,
          addedAt: firebase.firestore.Timestamp.now(),
          updatedAt: firebase.firestore.Timestamp.now(),
        }, { merge: true })
        .catch((firestoreError) => {
          console.error('[CollectionsContext] Error saving game to Firestore:', firestoreError);
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
    if (!userId) return;
    
    // Update local state (full game data)
    setCollections(prev => ({
      ...prev,
      [userId]: (prev[userId] || []).map(game =>
        game.id === gameId ? { ...game, ...updates } : game
      ),
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

