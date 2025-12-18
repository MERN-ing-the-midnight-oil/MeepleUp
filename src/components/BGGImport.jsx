import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking, Pressable, Image } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useCollections } from '../context/CollectionsContext';
import { useEvents } from '../context/EventsContext';
import { fetchBGGCollection, getGameDetails } from '../utils/api';
import { calculateVibeScoresForUser } from '../services/vibeScores';
import { bggLogoColor } from './BGGLogoAssets';
import Input from './common/Input';
import Button from './common/Button';
import LoadingSpinner from './common/LoadingSpinner';

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

  const handleFetchCollection = async () => {
    if (!bggUsername.trim()) {
      setError('Please enter your BGG username');
      return;
    }

    setLoading(true);
    setError('');
    setCollection(null);
    setImportedGames([]);

    try {
      // Save username to profile if it changed
      if (bggUsername.trim() !== user?.bggUsername) {
        await updateUser({ bggUsername: bggUsername.trim() });
      }

      const fetchedCollection = await fetchBGGCollection(bggUsername.trim());
      
      if (!fetchedCollection || fetchedCollection.length === 0) {
        setError('No games found in your BGG collection. Make sure your collection is set to public on BoardGameGeek.');
        setLoading(false);
        return;
      }

      setCollection(fetchedCollection);
      setLoading(false);
      
      // Automatically start importing after fetching
      // Small delay to let the UI update
      setTimeout(() => {
        handleImportGames(fetchedCollection);
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to fetch collection. Please check your username and try again.');
      console.error('BGG collection fetch error:', err);
      setLoading(false);
    }
  };

  const handleImportGames = async (gamesToImport = null) => {
    const games = gamesToImport || collection;
    if (!games || games.length === 0) return;

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
    const existingBggIds = new Set(
      existingCollection
        .filter((g) => g.bggId)
        .map((g) => g.bggId.toString())
    );

    try {
      // Filter out games that already exist in collection
      const gamesToImport = games.filter(game => 
        !existingBggIds.has(game.bggId.toString())
      );
      
      if (gamesToImport.length === 0) {
        skippedCount = games.length;
        setImportProgress({ current: games.length, total: games.length });
      } else {
        // Step 1: Check Firestore for all games first (to see what we already have cached)
        const { getGameById } = await import('../services/gameDatabase');
        const firestoreChecks = await Promise.all(
          gamesToImport.map(async (game) => {
            try {
              const cached = await getGameById(game.bggId);
              return { game, cached };
            } catch {
              return { game, cached: null };
            }
          })
        );
        
        // Step 2: Identify which games need BGG API calls
        // (games not in Firestore or missing thumbnails/images)
        const gamesNeedingAPI = firestoreChecks
          .filter(({ cached }) => !cached || !cached.thumbnail)
          .map(({ game }) => game.bggId);
        
        // Step 3: Fetch missing games using batch API calls
        let batchFetchedGames = new Map();
        if (gamesNeedingAPI.length > 0) {
          if (__DEV__) {
            console.log(`[BGG Import] Fetching ${gamesNeedingAPI.length} games from BGG API using batch calls`);
          }
          
          const { fetchBGGGameDetailsBatch } = await import('../services/bggApi');
          const BATCH_SIZE = 50; // BGG API limit
          
          for (let i = 0; i < gamesNeedingAPI.length; i += BATCH_SIZE) {
            const batch = gamesNeedingAPI.slice(i, i + BATCH_SIZE);
            const batchResults = await fetchBGGGameDetailsBatch(batch);
            
            // Map results by game ID
            batchResults.forEach(gameData => {
              if (gameData && gameData.id) {
                batchFetchedGames.set(gameData.id.toString(), gameData);
              }
            });
            
            // Update progress during batch fetching
            const progress = Math.min(i + batch.length, gamesNeedingAPI.length);
            setImportProgress({ 
              current: Math.floor((progress / gamesNeedingAPI.length) * gamesToImport.length), 
              total: gamesToImport.length 
            });
            
            // Wait between batches (bulk operation)
            if (i + BATCH_SIZE < gamesNeedingAPI.length) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }
        
        // Step 4: Process all games and import them
        for (let i = 0; i < firestoreChecks.length; i++) {
          const { game, cached } = firestoreChecks[i];
          
          try {
            // Use batch-fetched data if available, otherwise use cached, otherwise use basic game data
            const batchData = batchFetchedGames.get(game.bggId.toString());
            const gameDetails = batchData || cached || null;
            
            // Format game data for MeepleUp collection
            const gameData = {
              id: `bgg_${game.bggId}`,
              bggId: game.bggId,
              title: gameDetails?.name || game.name,
              description: gameDetails?.description || '',
              image: gameDetails?.image || gameDetails?.thumbnail || game.image || game.thumbnail,
              yearPublished: gameDetails?.yearPublished || game.yearPublished,
              minPlayers: gameDetails?.minPlayers,
              maxPlayers: gameDetails?.maxPlayers,
              playingTime: gameDetails?.playingTime,
              bggRating: gameDetails?.average || gameDetails?.averageRating || game.rating,
              userRating: game.rating,
              numplays: game.numplays,
              addedAt: new Date().toISOString(),
              source: 'bgg_import',
            };

            // Add to collection
            if (userIdentifier) {
              addGameToCollection(userIdentifier, gameData);
              setImportedGames((prev) => [...prev, gameData]);
              existingBggIds.add(game.bggId.toString()); // Track as added
              successCount++;
            }

            setImportProgress({ 
              current: i + 1, 
              total: gamesToImport.length 
            });
          } catch (gameError) {
            console.warn(`Failed to import game ${game.name}:`, gameError);
            failCount++;
          }
        }
        
        // Also cache all batch-fetched games to Firestore for future use
        if (batchFetchedGames.size > 0) {
          const { updateGameWithBGGData } = await import('../services/gameDatabase');
          const cachePromises = Array.from(batchFetchedGames.values()).map(gameData =>
            updateGameWithBGGData(gameData.id, gameData).catch(err => {
              if (__DEV__) {
                console.warn(`[BGG Import] Failed to cache game ${gameData.id}:`, err);
              }
            })
          );
          // Cache in background (non-blocking)
          Promise.all(cachePromises).catch(() => {
            // Non-critical - just log
          });
        }
      }
      
      // Update skipped count
      skippedCount = games.length - gamesToImport.length;

      // Recalculate vibe scores for all meepleups user is in (background task)
      if (successCount > 0 && userIdentifier) {
        try {
          const userEvents = await getUserEvents(userIdentifier);
          const userCollection = getUserCollection(userIdentifier);
          const customWeights = user?.personalMatchWeights || null;
          
          // Calculate scores for each meepleup in background
          userEvents.forEach(event => {
            if (event.id) {
              calculateVibeScoresForUser(event.id, userIdentifier, userCollection, customWeights).catch(err => {
                console.warn(`[BGGImport] Error calculating vibe scores for meepleup ${event.id}:`, err);
              });
            }
          });
        } catch (err) {
          console.warn('[BGGImport] Error setting up vibe score recalculation:', err);
          // Non-critical, continue
        }
      }

      if (successCount > 0) {
        let message = `Successfully imported ${successCount} game${successCount !== 1 ? 's' : ''}`;
        if (skippedCount > 0) {
          message += ` (${skippedCount} already in collection)`;
        }
        if (failCount > 0) {
          message += ` (${failCount} failed)`;
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
      setError(err.message || 'Failed to import games. Some games may have been imported.');
      console.error('Import error:', err);
    } finally {
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
              Fetching your BGG collection... This may take a few seconds.
            </Text>
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
