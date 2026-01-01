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
          console.log(`[Collections] Loaded from storage: ${userIds.length} users, ${totalGames} total games`);
          setCollections(parsed);
        } else {
          console.log('[Collections] No stored collections found in local storage');
        }
      } catch (error) {
        console.error('Error loading collections:', error);
      } finally {
        setInitialised(true);
      }
    };
    loadCollections();
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
      console.log('[Collections] User already synced, skipping');
      return;
    }
    
    console.log('[Collections] Syncing current user games (one-time)');
    
    // Mark as syncing immediately to prevent duplicate runs
    currentUserSyncedRef.current = userId;
    
    // Note: This sync happens in the background. If local storage has cached games,
    // they will be shown immediately while this sync updates them in the background.
    const sync = async () => {
      setLoading(true);
      try {
        console.log(`[Collections] Fetching games for user: ${userId}`);
        const snapshot = await db.collection('userGames').doc(userId).collection('games').get();
        
        console.log(`[Collections] Query result: ${snapshot.size} games found for user ${userId}`);
        
        if (!snapshot.empty) {
          const games = snapshot.docs.map(doc => {
            const data = doc.data();
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
              // BGG data fields for Personal Match feature
              mechanics: data.mechanics || null,
              categories: data.categories || null,
              publishers: data.publishers || null,
              publisher: data.publisher || null,
              complexity: data.complexity || null,
              averageWeight: data.averageWeight || data.complexity || null,
            };
          }).filter(g => g.title !== 'Unknown Game');
          
          console.log(`[Collections] After filtering 'Unknown Game': ${games.length} games remaining`);
          
          // Enrich games with BGG data from main games collection if missing
          // Only enrich games that have bggId but are missing BGG metadata
          const gamesNeedingEnrichment = games.filter(game => 
            game.bggId && 
            (!game.mechanics || (Array.isArray(game.mechanics) && game.mechanics.length === 0)) &&
            (!game.categories || (Array.isArray(game.categories) && game.categories.length === 0)) &&
            !game.publisher && 
            !game.averageWeight
          );
          
          if (gamesNeedingEnrichment.length > 0) {
            console.log(`[Collections] Enriching ${gamesNeedingEnrichment.length} games with BGG data`);
            const { getGameById } = await import('../services/gameDatabase');
            const enrichedGames = await Promise.all(
              games.map(async (game) => {
                // If game needs enrichment, fetch from games collection
                if (gamesNeedingEnrichment.includes(game)) {
                  try {
                    const bggData = await getGameById(game.bggId);
                    if (bggData) {
                      return {
                        ...game,
                        mechanics: (game.mechanics && Array.isArray(game.mechanics) && game.mechanics.length > 0) ? game.mechanics : (bggData.mechanics || null),
                        categories: (game.categories && Array.isArray(game.categories) && game.categories.length > 0) ? game.categories : (bggData.categories || null),
                        publishers: game.publishers || bggData.publishers || null,
                        publisher: game.publisher || bggData.publisher || null,
                        complexity: game.complexity || bggData.complexity || null,
                        averageWeight: game.averageWeight || bggData.averageWeight || bggData.complexity || null,
                      };
                    }
                  } catch (err) {
                    // If fetch fails, just use the game as-is
                    console.warn(`[Collections] Failed to enrich game ${game.bggId} with BGG data:`, err);
                  }
                }
                return game;
              })
            );
            
            if (enrichedGames.length > 0) {
              setCollections(prev => ({
                ...prev,
                [userId]: enrichedGames,
              }));
              return; // Early return after enrichment
            }
          }
          
          // If no enrichment needed, just set games as-is
          setCollections(prev => ({
            ...prev,
            [userId]: games,
          }));
          console.log(`[Collections] Set ${games.length} games for user ${userId}`);
        } else {
          console.log(`[Collections] No games found in Firestore for user ${userId}. Setting empty array.`);
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
  }, [user, db, initialised]); // REMOVED collections from deps

  // Track who we've synced
  const syncedUsersRef = React.useRef(new Set());

  const syncGamesForUsers = useCallback(async (userIds) => {
    if (!db || !userIds || userIds.length === 0) return;
    
    // Filter to only users we haven't synced
    const toSync = userIds.filter(uid => !syncedUsersRef.current.has(uid));
    if (toSync.length === 0) {
      console.log('[Collections] All users already synced');
      return;
    }
    
    console.log('[Collections] Syncing', toSync.length, 'users');
    toSync.forEach(uid => syncedUsersRef.current.add(uid));
    
    try {
      const results = await Promise.all(
        toSync.map(async (userId) => {
          const snapshot = await db.collection('userGames').doc(userId).collection('games').get();
          
          if (snapshot.empty) return { userId, games: [] };
          
          const games = snapshot.docs.map(doc => {
            const data = doc.data();
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
              // BGG data fields for Personal Match feature
              mechanics: data.mechanics || null,
              categories: data.categories || null,
              publishers: data.publishers || null,
              publisher: data.publisher || null,
              complexity: data.complexity || null,
              averageWeight: data.averageWeight || data.complexity || null,
            };
          }).filter(g => g.title !== 'Unknown Game');
          
          return { userId, games };
        })
      );
      
      setCollections(prev => {
        const updates = {};
        let hasChanges = false;
        
        results.forEach(({ userId, games }) => {
          if (games.length > 0) {
            // Check if games actually changed by comparing game IDs, BGG IDs, and titles
            const currentGames = prev[userId] || [];
            // Create stable sorted keys for comparison
            const currentKey = currentGames
              .map(g => `${g.id}:${g.bggId || ''}:${g.title || ''}`)
              .sort()
              .join('|');
            const newKey = games
              .map(g => `${g.id}:${g.bggId || ''}:${g.title || ''}`)
              .sort()
              .join('|');
            
            if (currentKey !== newKey) {
              updates[userId] = games;
              hasChanges = true;
              console.log(`[Collections] Changes detected for user ${userId}`);
            }
          }
        });
        
        // Only update if there are actual changes
        if (!hasChanges) {
          console.log('[Collections] No changes detected in syncGamesForUsers, skipping update');
          return prev; // Return same reference to prevent re-render
        }
        
        return { ...prev, ...updates };
      });
    } catch (error) {
      console.error('Error syncing games:', error);
    }
  }, [db]);

  // Save to storage with simple debounce
  useEffect(() => {
    if (!initialised) return;
    
    const timeoutId = setTimeout(() => {
      storage.setItem('meepleup_collections', JSON.stringify(collections));
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [collections, initialised]);

  // Simple stable callbacks
  const addGameToCollection = useCallback((userId, gameData) => {
    if (!userId) return;
    
    setCollections(prev => ({
      ...prev,
      [userId]: [...(prev[userId] || []), gameData],
    }));
    
    // Also save to Firestore if available
    if (db && gameData.id) {
      // Firestore save happens asynchronously - don't await to avoid blocking
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
    
    setCollections(prev => ({
      ...prev,
      [userId]: (prev[userId] || []).map(game =>
        game.id === gameId ? { ...game, ...updates } : game
      ),
    }));

    if (db) {
      try {
        await db.collection('userGames').doc(userId)
          .collection('games').doc(gameId)
          .set({ ...updates, updatedAt: firebase.firestore.Timestamp.now() }, { merge: true });
      } catch (error) {
        console.error('Error updating game:', error);
      }
    }
  }, [db]);

  // Simple context value - let it change when collections changes!
  // But add logging to see if it's changing unnecessarily
  const value = useMemo(() => {
    const userIds = Object.keys(collections);
    const totalGames = userIds.reduce((sum, uid) => sum + (collections[uid]?.length || 0), 0);
    console.log('[CollectionsContext] Creating context value, users:', userIds.length, 'total games:', totalGames);
    
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

