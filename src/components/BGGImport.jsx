import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking, Pressable, Image } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { useEvents } from '../context/EventsContext';
import { fetchBGGCollection, getGames } from '../utils/api';
import { calculateMatchScoresForUser } from '../services/matchScores';
import { bggLogoColor } from './BGGLogoAssets';
import Input from './common/Input';
import Button from './common/Button';
import LoadingSpinner from './common/LoadingSpinner';
import logger from '../utils/logger';

const BGGImport = ({ onImportComplete }) => {
  const { user, updateUser } = useAuth();
  const { addGameToCollection, getUserCollection } = useCollections();
  const { getUserEvents } = useEvents();
  const userIdentifier = user?.uid || user?.id;
  const [bggUsername, setBggUsername] = useState(user?.bggUsername || '');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [collection, setCollection] = useState(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importedGames, setImportedGames] = useState([]);
  const [fetchProgress, setFetchProgress] = useState({ 
    attempt: 0, 
    maxAttempts: 30, 
    estimatedSecondsRemaining: null 
  });

  const handleFetchCollection = async () => {
    if (!bggUsername.trim()) {
      setError('Please enter your BGG username');
      return;
    }

    setLoading(true);
    setError('');
    setCollection(null);
    setImportedGames([]);
    setFetchProgress({ attempt: 0, maxAttempts: 30, estimatedSecondsRemaining: null });

    try {
      // Save username to profile if it changed
      if (bggUsername.trim() !== user?.bggUsername) {
        await updateUser({ bggUsername: bggUsername.trim() });
      }

      const fetchedCollection = await fetchBGGCollection(bggUsername.trim(), {
        onProgress: (attempt, maxAttempts, estimatedSecondsRemaining) => {
          setFetchProgress({
            attempt,
            maxAttempts,
            estimatedSecondsRemaining: estimatedSecondsRemaining > 0 ? estimatedSecondsRemaining : null,
          });
        },
      });
      
      if (!fetchedCollection || fetchedCollection.length === 0) {
        setError(
          'No games found in your BGG collection.\n\n' +
          'This could mean:\n' +
          '• You have no games marked as "Owned" in your BGG collection\n' +
          '• Your collection privacy settings may be restricting access\n' +
          '• Make sure "Include me in the Gamer Database" is enabled at:\n' +
          '  https://boardgamegeek.com/settings/privacy'
        );
        setLoading(false);
        setFetchProgress({ attempt: 0, maxAttempts: 30, estimatedSecondsRemaining: null });
        return;
      }

      setCollection(fetchedCollection);
      setLoading(false);
      setFetchProgress({ attempt: 0, maxAttempts: 30, estimatedSecondsRemaining: null });
      
      // Automatically start importing after fetching
      // Small delay to let the UI update
      setTimeout(() => {
        handleImportGames(fetchedCollection);
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to fetch collection. Please check your username and try again.');
      console.error('BGG collection fetch error:', err);
      setLoading(false);
      setFetchProgress({ attempt: 0, maxAttempts: 30, estimatedSecondsRemaining: null });
    }
  };

  const handleImportGames = async (gamesToImport = null) => {
    const importStartTime = Date.now();
    if (__DEV__) {
      logger.debug('[BGG Import] 🚀 Starting import process', {
        userIdentifier,
        userEmail: user?.email,
        gamesToImportCount: gamesToImport?.length,
        collectionCount: collection?.length,
        timestamp: new Date().toISOString(),
      });
    }

    const games = gamesToImport || collection;
    if (!games || games.length === 0) {
      if (__DEV__) {
        console.warn('[BGG Import] ⚠️ No games to import', { gamesToImport, collection });
      }
      return;
    }

    if (__DEV__) {
      logger.debug('[BGG Import] Importing games', {
        totalGames: games.length,
        userIdentifier,
        userEmail: user?.email,
        estimatedTimeMinutes: Math.ceil(games.length / 20 * 0.5), // ~0.5 min per 20 games (conservative estimate)
      });
    }

    setImporting(true);
    setError('');
    setImportProgress({ current: 0, total: games.length });
    setImportedGames([]);
    
    // Update collection state if we're importing from fetched games
    if (gamesToImport) {
      setCollection(gamesToImport);
    }

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    // Get existing collection to check for duplicates
    const existingCollection = userIdentifier ? getUserCollection(userIdentifier) : [];
    if (__DEV__) {
      logger.debug('[BGG Import] Checking existing collection', {
        userIdentifier,
        existingCollectionCount: existingCollection.length,
        sampleExisting: existingCollection.slice(0, 3).map(g => ({
          id: g.id,
          bggId: g.bggId,
          title: g.title || g.name,
        })),
      });
    }

    const existingBggIds = new Set(
      existingCollection
        .filter((g) => g.bggId)
        .map((g) => g.bggId.toString())
    );
    
    if (__DEV__) {
      logger.debug('[BGG Import] Existing BGG IDs', {
        count: existingBggIds.size,
        sampleIds: Array.from(existingBggIds).slice(0, 5),
      });
    }

    try {
      // Filter out games that already exist in collection, and skip games without bggId
      const gamesToImport = games.filter(game => 
        game && game.bggId && !existingBggIds.has(game.bggId.toString())
      );
      
      if (__DEV__) {
        logger.debug('[BGG Import] Filtered games to import', {
          totalGames: games.length,
          gamesToImportCount: gamesToImport.length,
          skippedCount: games.length - gamesToImport.length,
          sampleGamesToImport: gamesToImport.slice(0, 3).map(g => ({
            bggId: g.bggId,
            name: g.name,
          })),
        });
      }
      
      if (gamesToImport.length === 0) {
        skippedCount = games.length;
        setImportProgress({ current: games.length, total: games.length });
        if (__DEV__) {
          logger.debug('[BGG Import] ⚠️ All games already in collection, skipping import');
        }
      } else {
        // Step 1: Check Firestore for all games first (to see what we already have cached)
        const firestoreCheckStartTime = Date.now();
        if (__DEV__) {
          logger.debug('[BGG Import] ⏱️ Step 1: Checking Firestore cache...', {
            gamesToCheck: gamesToImport.length,
          });
        }
        
        const { getGamesFromFirebase } = await import('../services/gameDatabase');
        const firestoreChecks = await Promise.all(
          gamesToImport.map(async (game) => {
            try {
              const cached = await getGamesFromFirebase(game.bggId);
              return { game, cached };
            } catch {
              return { game, cached: null };
            }
          })
        );
        
        const firestoreCheckDuration = ((Date.now() - firestoreCheckStartTime) / 1000).toFixed(2);
        const cachedCount = firestoreChecks.filter(({ cached }) => !!cached).length;
        if (__DEV__) {
          logger.debug('[BGG Import] ✅ Firestore check completed', {
            durationSeconds: firestoreCheckDuration,
            totalGames: gamesToImport.length,
            cachedGames: cachedCount,
            gamesNeedingAPI: gamesToImport.length - cachedCount,
          });
        }
        
        // Step 2: Identify which games need BGG API calls
        // Strategy: Fetch ALL games during import (at API-friendly rate)
        // Store complete "Thing" objects in Firestore so CollectionScreen can load from backend
        const gamesNeedingAPI = firestoreChecks
          .filter(({ cached }) => !cached) // Only fetch if completely missing from Firestore
          .map(({ game }) => game.bggId);
        
        if (__DEV__) {
          logger.debug(`[BGG Import] ${gamesNeedingAPI.length} games need fetching from BGG API`, {
            totalGames: gamesToImport.length,
            cachedGames: cachedCount,
            gamesNeedingAPI: gamesNeedingAPI.length,
            estimatedTimeMinutes: Math.ceil(gamesNeedingAPI.length / 20 * 0.5), // ~0.5 min per 20 games
          });
        }
        
        // Step 3: Fetch ALL missing games using batch API calls
        // BGG API: 1 request per 5 seconds recommended, up to 20 games per request (we use 20 for safety)
        let batchFetchedGames = new Map();
        if (gamesNeedingAPI.length > 0) {
          const apiFetchStartTime = Date.now();
          const { fetchBGGGameDetailsBatch } = await import('../services/bggApi');
          const BATCH_SIZE = 20; // BGG API recommended: up to 20 games per request (reduced from 50 for safety)
          const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds between batches (BGG API recommendation: 1 request per 5 seconds)
          
          const totalBatches = Math.ceil(gamesNeedingAPI.length / BATCH_SIZE);
          const estimatedTotalSeconds = totalBatches * DELAY_BETWEEN_BATCHES / 1000;
          
          if (__DEV__) {
            logger.debug('[BGG Import] ⏱️ Step 2: Fetching games from BGG API...', {
              totalBatches,
              batchSize: BATCH_SIZE,
              delayBetweenBatches: DELAY_BETWEEN_BATCHES,
              estimatedTimeSeconds: estimatedTotalSeconds,
              estimatedTimeMinutes: Math.ceil(estimatedTotalSeconds / 60),
            });
          }
          
          for (let i = 0; i < gamesNeedingAPI.length; i += BATCH_SIZE) {
            const batchStartTime = Date.now();
            const batch = gamesNeedingAPI.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            
            try {
              if (__DEV__) {
                logger.debug(`[BGG Import] 📦 Fetching batch ${batchNumber}/${totalBatches} (${batch.length} games)...`, {
                  batchStartTime: new Date().toISOString(),
                  elapsedSeconds: ((Date.now() - apiFetchStartTime) / 1000).toFixed(1),
                });
              }
              
              const batchResults = await fetchBGGGameDetailsBatch(batch);
              
              const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
              
              // Map results by game ID
              if (batchResults && Array.isArray(batchResults)) {
                batchResults.forEach(gameData => {
                  if (gameData && gameData.id) {
                    batchFetchedGames.set(gameData.id.toString(), gameData);
                  }
                });
              }
              
              if (__DEV__) {
                logger.debug(`[BGG Import] ✅ Batch ${batchNumber}/${totalBatches} completed`, {
                  durationSeconds: batchDuration,
                  gamesFetched: batchResults?.length || 0,
                  totalFetchedSoFar: batchFetchedGames.size,
                  remainingBatches: totalBatches - batchNumber,
                });
              }
            } catch (batchError) {
              const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
              console.error(`[BGG Import] ❌ Batch ${batchNumber} failed`, {
                durationSeconds: batchDuration,
                error: batchError.message,
                gamesInBatch: batch.length,
              });
              // Continue with other batches even if one fails
            }
            
            // Update progress during batch fetching
            // Progress is based on how many games we've fetched so far
            const fetchedSoFar = Math.min(i + BATCH_SIZE, gamesNeedingAPI.length);
            setImportProgress({ 
              current: Math.floor((fetchedSoFar / gamesNeedingAPI.length) * gamesToImport.length * 0.8), // 80% for fetching, 20% for processing
              total: gamesToImport.length 
            });
            
            // API-friendly delay between batches (except after the last batch)
            if (i + BATCH_SIZE < gamesNeedingAPI.length) {
              if (__DEV__) {
                logger.debug(`[BGG Import] ⏸️ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch (BGG API rate limit)...`);
              }
              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
          }
          
          const apiFetchDuration = ((Date.now() - apiFetchStartTime) / 1000).toFixed(2);
          if (__DEV__) {
            logger.debug(`[BGG Import] ✅ Completed fetching ${batchFetchedGames.size} games from BGG API`, {
              durationSeconds: apiFetchDuration,
              durationMinutes: (apiFetchDuration / 60).toFixed(2),
              averageSecondsPerGame: (apiFetchDuration / gamesNeedingAPI.length).toFixed(2),
            });
          }
        }
        
        // Step 4: Process all games and import them
        const processingStartTime = Date.now();
        if (__DEV__) {
          logger.debug('[BGG Import] ⏱️ Step 3: Processing games for import...', {
            totalGames: firestoreChecks.length,
            userIdentifier,
            userEmail: user?.email,
          });
        }

        for (let i = 0; i < firestoreChecks.length; i++) {
          const { game, cached } = firestoreChecks[i];
          
          try {
            // Validate game has required fields
            if (!game || !game.bggId) {
              if (__DEV__) {
                console.warn(`[BGG Import] ⚠️ Skipping game with missing bggId:`, {
                  game,
                  index: i,
                  total: firestoreChecks.length,
                });
              }
              failCount++;
              continue;
            }

            if (__DEV__) {
              logger.debug(`[BGG Import] Processing game ${i + 1}/${firestoreChecks.length}`, {
                bggId: game.bggId,
                name: game.name,
                hasCached: !!cached,
                hasBatchData: batchFetchedGames.has(game.bggId.toString()),
              });
            }

            // Use batch-fetched data if available, otherwise use cached, otherwise use basic game data
            const batchData = batchFetchedGames.get(game.bggId.toString());
            const gameDetails = batchData || cached || null;
            
            // Format game data for MeepleUp collection
            // Use batch-fetched data if available, otherwise use cached, otherwise use basic game data from BGG collection
            // Include ALL BGG data fields including category ranks
            const gameData = {
              id: `bgg_${game.bggId}`,
              bggId: game.bggId,
              // Basic game info
              name: gameDetails?.name || cached?.name || game.name || 'Unknown Game',
              title: gameDetails?.name || cached?.name || game.name || 'Unknown Game', // Keep title for compatibility
              description: gameDetails?.description || cached?.description || '',
              thumbnail: gameDetails?.thumbnail || cached?.thumbnail || game.thumbnail || null,
              image: gameDetails?.image || cached?.image || game.image || game.thumbnail || null,
              yearPublished: gameDetails?.yearPublished || cached?.yearPublished || game.yearPublished,
              // Player info
              minPlayers: gameDetails?.minPlayers || cached?.minPlayers,
              maxPlayers: gameDetails?.maxPlayers || cached?.maxPlayers,
              playingTime: gameDetails?.playingTime || cached?.playingTime,
              minPlayTime: gameDetails?.minPlayTime || cached?.minPlayTime,
              maxPlayTime: gameDetails?.maxPlayTime || cached?.maxPlayTime,
              minAge: gameDetails?.minAge || cached?.minAge,
              // Ratings
              average: gameDetails?.average || cached?.average || game.rating,
              bggRating: gameDetails?.average || gameDetails?.averageRating || cached?.average || game.rating,
              bayesAverage: gameDetails?.bayesAverage || cached?.bayesAverage,
              usersRated: gameDetails?.usersRated || cached?.usersRated,
              rank: gameDetails?.rank || cached?.rank,
              // Category ranks - CRITICAL for proper categorization
              strategyGamesRank: gameDetails?.strategyGamesRank || cached?.strategyGamesRank || '',
              familyGamesRank: gameDetails?.familyGamesRank || cached?.familyGamesRank || '',
              partyGamesRank: gameDetails?.partyGamesRank || cached?.partyGamesRank || '',
              abstractsRank: gameDetails?.abstractsRank || cached?.abstractsRank || '',
              thematicRank: gameDetails?.thematicRank || cached?.thematicRank || '',
              wargamesRank: gameDetails?.wargamesRank || cached?.wargamesRank || '',
              childrensGamesRank: gameDetails?.childrensGamesRank || cached?.childrensGamesRank || '',
              cgsRank: gameDetails?.cgsRank || cached?.cgsRank || '',
              // Additional BGG data
              mechanics: gameDetails?.mechanics || cached?.mechanics || null,
              categories: gameDetails?.categories || cached?.categories || null,
              designers: gameDetails?.designers || cached?.designers || null,
              publishers: gameDetails?.publishers || cached?.publishers || null,
              publisher: gameDetails?.publisher || cached?.publisher || null,
              artists: gameDetails?.artists || cached?.artists || null,
              complexity: gameDetails?.complexity || cached?.complexity || null,
              averageWeight: gameDetails?.averageWeight || cached?.averageWeight || null,
              ownedCount: gameDetails?.ownedCount || cached?.ownedCount || null,
              bestPlayerCount: gameDetails?.bestPlayerCount || cached?.bestPlayerCount || null,
              languageDependence: gameDetails?.languageDependence || cached?.languageDependence || null,
              suggestedPlayerAge: gameDetails?.suggestedPlayerAge || cached?.suggestedPlayerAge || null,
              alternateNames: gameDetails?.alternateNames || cached?.alternateNames || null,
              dimensions: gameDetails?.dimensions || cached?.dimensions || null,
              weight: gameDetails?.weight || cached?.weight || null,
              // User-specific data
              userRating: game.rating,
              numplays: game.numplays,
              addedAt: new Date().toISOString(),
              source: 'bgg_import',
            };

            // Add to collection
            if (userIdentifier) {
              if (__DEV__) {
                logger.debug(`[BGG Import] Adding game to collection`, {
                  bggId: game.bggId,
                  gameId: gameData.id,
                  title: gameData.title || gameData.name,
                  userIdentifier,
                  userEmail: user?.email,
                  gameDataKeys: Object.keys(gameData),
                });
              }
              
              try {
                addGameToCollection(userIdentifier, gameData);
                if (__DEV__) {
                  logger.debug(`[BGG Import] ✅ Successfully called addGameToCollection for game ${game.bggId}`);
                }
                setImportedGames((prev) => [...prev, gameData]);
                existingBggIds.add(game.bggId.toString()); // Track as added
                successCount++;
              } catch (addError) {
                console.error(`[BGG Import] ❌ Error calling addGameToCollection for game ${game.bggId}:`, {
                  error: addError,
                  message: addError.message,
                  stack: addError.stack,
                  gameData: {
                    id: gameData.id,
                    bggId: gameData.bggId,
                    title: gameData.title || gameData.name,
                  },
                });
                failCount++;
              }
            } else {
              if (__DEV__) {
                console.warn(`[BGG Import] ⚠️ No userIdentifier, skipping game ${game.bggId}`, {
                  user,
                  userIdentifier,
                });
              }
              failCount++;
            }

            // Progress updates during game processing (final 20% of progress)
            setImportProgress({ 
              current: Math.floor((gamesToImport.length * 0.8) + ((i + 1) / gamesToImport.length) * gamesToImport.length * 0.2), 
              total: gamesToImport.length 
            });
          } catch (gameError) {
            if (__DEV__) {
              console.warn(`[BGG Import] Failed to import game ${game?.name || game?.bggId || 'unknown'}:`, gameError);
              console.warn(`[BGG Import] Game data:`, game);
              console.warn(`[BGG Import] Error stack:`, gameError.stack);
            }
            failCount++;
          }
        }
        
        const processingDuration = ((Date.now() - processingStartTime) / 1000).toFixed(2);
        if (__DEV__) {
          logger.debug('[BGG Import] ✅ Game processing completed', {
            durationSeconds: processingDuration,
            successCount,
            failCount,
          });
        }
        
        // Step 5: Cache all batch-fetched games to Firestore (complete "Thing" objects)
        // This ensures CollectionScreen can load everything from our backend without API calls
        if (batchFetchedGames.size > 0) {
          const cacheStartTime = Date.now();
          if (__DEV__) {
            logger.debug('[BGG Import] ⏱️ Step 4: Caching games to Firestore...', {
              gamesToCache: batchFetchedGames.size,
            });
          }
          
          const { updateGameWithBGGData } = await import('../services/gameDatabase');
          const cachePromises = Array.from(batchFetchedGames.values()).map((gameData, index) => {
            // Update progress as we cache
            if (index % 10 === 0) {
              const cachedSoFar = index;
              setImportProgress({ 
                current: Math.floor((gamesToImport.length * 0.8) + (cachedSoFar / batchFetchedGames.size) * gamesToImport.length * 0.2),
                total: gamesToImport.length 
              });
            }
            
            return updateGameWithBGGData(gameData.id, gameData).catch(err => {
              console.warn(`[BGG Import] Failed to cache game ${gameData.id}:`, err);
            });
          });
          
          // Wait for all games to be cached (important - ensures complete data in Firestore)
          await Promise.all(cachePromises);
          
          const cacheDuration = ((Date.now() - cacheStartTime) / 1000).toFixed(2);
          if (__DEV__) {
            logger.debug(`[BGG Import] ✅ Cached ${batchFetchedGames.size} complete game objects to Firestore`, {
              durationSeconds: cacheDuration,
            });
          }
        }
      }
      
      // Update skipped count
      skippedCount = games.length - gamesToImport.length;

      const totalImportDuration = ((Date.now() - importStartTime) / 1000).toFixed(2);
      if (__DEV__) {
        logger.debug('[BGG Import] ✅ Import summary', {
          userIdentifier,
          userEmail: user?.email,
          totalGames: games.length,
          gamesToImportCount: gamesToImport.length,
          successCount,
          failCount,
          skippedCount,
          totalDurationSeconds: totalImportDuration,
          totalDurationMinutes: (totalImportDuration / 60).toFixed(2),
          averageSecondsPerGame: gamesToImport.length > 0 ? (totalImportDuration / gamesToImport.length).toFixed(2) : 0,
        });
      }

      // Recalculate match scores for all meepleups user is in (background task)
      if (successCount > 0 && userIdentifier) {
        try {
          const userEvents = await getUserEvents(userIdentifier);
          const userCollection = getUserCollection(userIdentifier);
          const customWeights = user?.personalMatchWeights || null;
          
          // Calculate scores for each meepleup in background
          userEvents.forEach(event => {
            if (event.id) {
              calculateMatchScoresForUser(event.id, userIdentifier, userCollection, customWeights).catch(err => {
                console.warn(`[BGGImport] Error calculating match scores for meepleup ${event.id}:`, err);
              });
            }
          });
        } catch (err) {
          console.warn('[BGGImport] Error setting up match score recalculation:', err);
          // Non-critical, continue
        }
      }

      if (__DEV__) {
        logger.debug('[BGG Import] Final import results', {
          userIdentifier,
          userEmail: user?.email,
          successCount,
          failCount,
          skippedCount,
          importedGamesCount: importedGames.length,
        });
      }

      if (successCount > 0) {
        let message = `Successfully imported ${successCount} game${successCount !== 1 ? 's' : ''}`;
        if (skippedCount > 0) {
          message += ` (${skippedCount} already in collection)`;
        }
        if (failCount > 0) {
          message += ` (${failCount} failed)`;
        }
        
        if (__DEV__) {
          logger.debug('[BGG Import] ✅ Import completed successfully', {
            message,
            successCount,
            userIdentifier,
            userEmail: user?.email,
          });
        }
        
        Alert.alert('Import Complete', message, [
          {
            text: 'OK',
            onPress: () => {
              if (onImportComplete) {
                onImportComplete(successCount);
              }
            },
          },
        ]);
      } else if (skippedCount > 0) {
        Alert.alert(
          'All Games Already Imported',
          `All ${skippedCount} game${skippedCount !== 1 ? 's' : ''} from your BGG collection are already in your MeepleUp collection.`,
          [
            {
              text: 'OK',
              onPress: () => {
                if (onImportComplete) {
                  onImportComplete(0);
                }
              },
            },
          ]
        );
      } else {
        setError('Failed to import any games. Please try again.');
      }
    } catch (err) {
      console.error('[BGG Import] ❌ Fatal import error:', {
        error: err,
        message: err.message,
        stack: err.stack,
        userIdentifier,
        userEmail: user?.email,
        successCount,
        failCount,
        skippedCount,
      });
      setError(err.message || 'Failed to import games. Some games may have been imported.');
    } finally {
      if (__DEV__) {
        logger.debug('[BGG Import] Import process finished', {
          userIdentifier,
          userEmail: user?.email,
          importing: false,
        });
      }
      setImporting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={bggLogoColor}
            style={styles.bggLogo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.subtitle}>
          Enter your BoardGame Geek username to download an existing games collection.
        </Text>

        <View style={styles.form}>
          <Input
            placeholder="Enter your BGG username"
            value={bggUsername}
            onChangeText={(text) => {
              setBggUsername(text);
              setError('');
              setCollection(null);
            }}
            autoCapitalize="none"
            style={styles.input}
            editable={!loading && !importing}
          />
          <Button
            label={loading ? 'Loading...' : 'Fetch Collection'}
            onPress={handleFetchCollection}
            disabled={loading || importing || !bggUsername.trim()}
            style={styles.button}
          />
        </View>

        <View style={styles.discoverabilityNotice}>
          <Text style={styles.discoverabilityText}>
            Your "Discoverability" must be toggled to "Include me in the Gamer Database" at{' '}
            <Text
              style={styles.discoverabilityLink}
              onPress={() => Linking.openURL('https://boardgamegeek.com/settings/privacy')}
            >
              https://boardgamegeek.com/settings/privacy
            </Text>
          </Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading && (
          <View style={styles.loadingContainer}>
            <LoadingSpinner />
            <Text style={styles.loadingText}>
              {fetchProgress.estimatedSecondsRemaining !== null
                ? `BGG is processing your collection...\nEstimated time remaining: ${fetchProgress.estimatedSecondsRemaining} second${fetchProgress.estimatedSecondsRemaining !== 1 ? 's' : ''}`
                : 'Fetching your BGG collection... This may take a few seconds.'}
            </Text>
            {fetchProgress.attempt > 0 && (
              <Text style={styles.loadingSubtext}>
                Attempt {fetchProgress.attempt} of {fetchProgress.maxAttempts}
              </Text>
            )}
          </View>
        )}

        {collection && collection.length > 0 && (
          <View style={styles.collectionPreview}>
            <Text style={styles.collectionTitle}>Collection Found</Text>
            <Text style={styles.collectionSummary}>
              Found {collection.length} game{collection.length !== 1 ? 's' : ''} in your BGG collection.
            </Text>

            {!importing && importedGames.length === 0 && (
              <View style={styles.importActions}>
                <Text style={styles.importHint}>
                  Games will be automatically imported. Click below to import manually if needed.
                </Text>
                <Button
                  label={`Import ${collection.length} Games`}
                  onPress={() => handleImportGames()}
                  style={styles.importButton}
                />
              </View>
            )}

            {importing && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${(importProgress.current / importProgress.total) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  Importing {importProgress.current} of {importProgress.total} games...
                </Text>
                <Text style={styles.progressSubtext}>
                  This may take a few minutes. We're fetching game details from BoardGameGeek at a respectful rate to avoid overloading their servers.
                </Text>
              </View>
            )}

            {importedGames.length > 0 && !importing && (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>
                  ✓ Successfully imported {importedGames.length} game{importedGames.length !== 1 ? 's' : ''}!
                </Text>
              </View>
            )}

            {/* Show first few games as preview */}
            {!importing && importedGames.length === 0 && collection.length > 0 && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewTitle}>Preview (first 5 games):</Text>
                {collection.slice(0, 5).map((game) => (
                  <View key={game.bggId} style={styles.previewItem}>
                    <Text style={styles.previewGameName}>
                      {game.name}
                      {game.yearPublished ? ` (${game.yearPublished})` : ''}
                    </Text>
                  </View>
                ))}
                {collection.length > 5 && (
                  <Text style={styles.previewMore}>
                    ... and {collection.length - 5} more games
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  bggLogo: {
    width: 200,
    height: undefined,
    aspectRatio: 736 / 216, // bggLogoColor aspect ratio
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  discoverabilityNotice: {
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  discoverabilityText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
  },
  discoverabilityLink: {
    color: '#0066cc',
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  form: {
    marginBottom: 20,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    width: '100%',
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#721c24',
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  collectionPreview: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  collectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  collectionSummary: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  importActions: {
    marginBottom: 20,
  },
  importButton: {
    width: '100%',
    marginBottom: 8,
  },
  importHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4a90e2',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
  progressSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  successContainer: {
    backgroundColor: '#d4edda',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  successText: {
    color: '#155724',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  previewItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  previewGameName: {
    fontSize: 14,
    color: '#333',
  },
  previewMore: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default BGGImport;
