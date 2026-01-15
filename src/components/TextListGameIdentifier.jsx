import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from './common/Button';
import { titlesFromText } from '../services/claudeVision';
import { searchForAllGames as searchForAllGamesUtil } from '../utils/gameSearch';
import { getGames, searchGamesByName } from '../utils/api';
import { theme, commonStyles } from '../utils/theme';
import { addPendingRetry } from '../utils/pendingGameRetries';
import ShowGames from './ShowGames';

const TextListGameIdentifier = ({ 
  onAddToCollection, 
  onRemoveFromCollection, 
  onDone,
  showModal = false,
  onModalClose,
}) => {
  const [gameListText, setGameListText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [formattedGames, setFormattedGames] = useState([]);
  const [searchResults, setSearchResults] = useState({}); // { gameTitle: [results] }
  const [selectedGames, setSelectedGames] = useState({}); // { gameTitle: selectedBggId }
  const [processingGameIndex, setProcessingGameIndex] = useState(null);
  const [loadingGames, setLoadingGames] = useState(new Set()); // Track which games are still loading (including retries)
  const [stuckGames, setStuckGames] = useState(new Set()); // Track which games have been searching > 30 seconds
  const [skippedGames, setSkippedGames] = useState(new Set()); // Track which games user chose to skip
  const [gameSearchStartTimes, setGameSearchStartTimes] = useState({}); // Track when each game search started

  const handleFormatList = async () => {
    if (!gameListText.trim()) {
      setError('Please enter a list of game titles.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setFormattedGames([]);
    setSearchResults({});
    setSelectedGames({});
    setLoadingGames(new Set());

    try {
      const result = await titlesFromText(gameListText.trim());
      
      if (!result.games || result.games.length === 0) {
        setError('No games were found in your list. Please check your input and try again.');
        setIsProcessing(false);
        return;
      }

      console.log('[TextListGameIdentifier] Claude returned games:', result.games);
      console.log(`[TextListGameIdentifier] Starting BGG search for ${result.games.length} games`);

      setFormattedGames(result.games);
      
      if (__DEV__) {
        console.log('[TextListGameIdentifier] Set formattedGames:', result.games.length, 'games');
        console.log('[TextListGameIdentifier] ShowGames should now be visible:', result.games.length > 0);
      }
      
      // Automatically search for each game
      await searchForAllGames(result.games);
    } catch (err) {
      console.error('[TextListGameIdentifier] Error formatting list:', err);
      setError(err.message || 'Failed to format game list. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Track when searches start and check for stuck games (> 30 seconds)
  useEffect(() => {
    if (Object.keys(gameSearchStartTimes).length === 0) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const stuck = new Set();
      
      Object.entries(gameSearchStartTimes).forEach(([gameTitle, startTime]) => {
        const elapsed = (now - startTime) / 1000;
        // Mark as stuck if searching for > 30 seconds and either:
        // 1. Still loading, OR
        // 2. Has empty results (failed search that's in pending retries)
        const hasEmptyResults = searchResults[gameTitle] && searchResults[gameTitle].length === 0;
        if (elapsed > 30 && !skippedGames.has(gameTitle) && (loadingGames.has(gameTitle) || hasEmptyResults)) {
          stuck.add(gameTitle);
        }
      });
      
      if (stuck.size > 0) {
        setStuckGames(prev => {
              const updated = new Set(prev);
          stuck.forEach(title => updated.add(title));
                return updated;
              });
      }
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [gameSearchStartTimes, loadingGames, skippedGames, searchResults]);

  const searchForAllGames = async (games) => {
    // Reset state
    setStuckGames(new Set());
    setSkippedGames(new Set());
    const startTimes = {};
    games.forEach(gameTitle => {
      startTimes[gameTitle] = Date.now();
    });
    setGameSearchStartTimes(startTimes);
    
    await searchForAllGamesUtil(games, {
      setLoadingGames,
      setSearchResults,
      setSelectedGames,
      setProcessingGameIndex,
      isSkipped: (gameTitle) => skippedGames.has(gameTitle),
      setSkippedGames,
      addPendingRetry,
      setStuckGames,
      setGameSearchStartTimes,
    }, 'text_list_import');
  };

  const handleSelectGame = (gameTitle, bggId) => {
    setSelectedGames(prev => ({
      ...prev,
      [gameTitle]: bggId,
    }));
  };

  const handleAddSelectedGames = async () => {
    if (Object.keys(selectedGames).length === 0) {
      Alert.alert('No Games Selected', 'Please select at least one game to add to your collection.');
      return;
    }

    // Filter out games without valid bggId before processing
    const validGames = Object.entries(selectedGames).filter(([gameTitle, bggId]) => {
      return bggId && bggId.toString().trim() !== '';
    });

    if (validGames.length === 0) {
      Alert.alert('No Valid Games', 'The selected games do not have valid game data. Please wait for the search to complete or select different games.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    let successCount = 0;
    let failCount = 0;

    try {
      for (const [gameTitle, bggId] of validGames) {

        try {
          // Use the search results we already have instead of fetching again!
          // Find the selected game in the search results
          const resultsForGame = searchResults[gameTitle] || [];
          const selectedResult = resultsForGame.find(result => result.id === bggId.toString() || result.id === bggId);
          
          let gameData;
          
          if (selectedResult) {
            // We have the data from search - use it directly!
            gameData = {
              title: selectedResult.name || gameTitle,
              bggId: bggId.toString(),
              image: selectedResult.image || null,
              thumbnail: selectedResult.thumbnail || null,
              description: selectedResult.description || null,
              yearPublished: selectedResult.yearPublished || null,
              minPlayers: selectedResult.minPlayers || null,
              maxPlayers: selectedResult.maxPlayers || null,
              playingTime: selectedResult.playingTime || null,
              // Include fields needed for GameCard to show heart instead of "?"
              mechanics: selectedResult.mechanics || null,
              categories: selectedResult.categories || null,
              publishers: selectedResult.publishers || null,
              publisher: selectedResult.publisher || null,
              complexity: selectedResult.complexity || selectedResult.averageWeight || null,
              averageWeight: selectedResult.averageWeight || selectedResult.complexity || null,
              source: 'text_list',
            };
          } else {
            // Fallback: if search result not found, fetch it (shouldn't happen normally)
            console.warn(`[TextListGameIdentifier] Selected game ${gameTitle} (${bggId}) not found in search results, fetching...`);
            const gameDetails = await getGames(bggId);
            if (!gameDetails) {
              failCount++;
              continue;
            }
            gameData = {
              title: gameDetails.name || gameTitle,
              bggId: bggId.toString(),
              image: gameDetails.image || null,
              thumbnail: gameDetails.thumbnail || null,
              description: gameDetails.description || '',
              yearPublished: gameDetails.yearPublished || null,
              minPlayers: gameDetails.minPlayers || null,
              maxPlayers: gameDetails.maxPlayers || null,
              playingTime: gameDetails.playingTime || null,
              mechanics: gameDetails.mechanics || null,
              categories: gameDetails.categories || null,
              publishers: gameDetails.publishers || null,
              publisher: gameDetails.publisher || null,
              complexity: gameDetails.complexity || gameDetails.averageWeight || null,
              averageWeight: gameDetails.averageWeight || gameDetails.complexity || null,
              source: 'text_list',
            };
          }

          if (onAddToCollection) {
            onAddToCollection(gameData);
            successCount++;
          }
        } catch (err) {
          console.error(`[TextListGameIdentifier] Error adding game ${gameTitle}:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        Alert.alert(
          'Games Added',
          `Successfully added ${successCount} game${successCount !== 1 ? 's' : ''} to your collection.${failCount > 0 ? ` ${failCount} game${failCount !== 1 ? 's' : ''} failed.` : ''}`,
          [
            {
              text: 'OK',
              onPress: () => {
                handleReset();
                if (onDone) {
                  onDone();
                }
              },
            },
          ]
        );
      } else {
        setError(`Failed to add games. ${failCount > 0 ? `${failCount} game${failCount !== 1 ? 's' : ''} failed.` : ''}`);
      }
    } catch (err) {
      console.error('[TextListGameIdentifier] Error adding games:', err);
      setError('Failed to add games. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveGame = (gameTitle) => {
    setFormattedGames(prev => prev.filter(title => title !== gameTitle));
    setSearchResults(prev => {
      const updated = { ...prev };
      delete updated[gameTitle];
      return updated;
    });
    setSelectedGames(prev => {
      const updated = { ...prev };
      delete updated[gameTitle];
      return updated;
    });
    setStuckGames(prev => {
      const updated = new Set(prev);
      updated.delete(gameTitle);
      return updated;
    });
    setSkippedGames(prev => {
      const updated = new Set(prev);
      updated.delete(gameTitle);
      return updated;
    });
  };

  const handleReviseTitle = async (oldTitle, newTitle) => {
    console.log('[TextListGameIdentifier] User revised game title:', { oldTitle, newTitle });
    
    // Remove old title from all state
    setFormattedGames(prev => prev.map(title => title === oldTitle ? newTitle : title));
    setSearchResults(prev => {
      const updated = { ...prev };
      if (updated[oldTitle]) {
        delete updated[oldTitle];
      }
      return updated;
    });
    setSelectedGames(prev => {
      const updated = { ...prev };
      if (updated[oldTitle]) {
        delete updated[oldTitle];
      }
      return updated;
    });
    setStuckGames(prev => {
      const updated = new Set(prev);
      updated.delete(oldTitle);
      return updated;
    });
    setSkippedGames(prev => {
      const updated = new Set(prev);
      updated.delete(oldTitle);
      return updated;
    });
    setLoadingGames(prev => {
      const updated = new Set(prev);
      updated.delete(oldTitle);
      updated.add(newTitle);
      return updated;
    });

    // Search for the revised title and merge with existing results (don't clear other games!)
    try {
      const cleanedTitle = newTitle.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
      const searchQuery = cleanedTitle !== newTitle ? cleanedTitle : newTitle;
      
      // Search for the game
      let searchResults = await searchGamesByName(searchQuery, true);
      
      // If no results with cleaned title, try original
      if ((!searchResults || searchResults.length === 0) && searchQuery !== newTitle) {
        searchResults = await searchGamesByName(newTitle, true);
      }
      
      if (searchResults && searchResults.length > 0) {
        // Fetch thumbnails for top 3 results
        const MAX_THUMBNAIL_FETCHES = 3;
        const resultsToEnrich = searchResults.slice(0, MAX_THUMBNAIL_FETCHES);
        const remainingResults = searchResults.slice(MAX_THUMBNAIL_FETCHES);
        
        const enrichedResults = await Promise.all(
          resultsToEnrich.map(async (result) => {
            try {
              const details = await getGames(result.id);
              return {
                ...result,
                thumbnail: details?.thumbnail || result.thumbnail || null,
                image: details?.image || result.image || null,
              };
            } catch (detailError) {
              console.warn(`[TextListGameIdentifier] Failed to fetch details for revised title result ${result.id}:`, detailError.message);
              return result;
            }
          })
        );
        
        const resultsWithThumbnails = [...enrichedResults, ...remainingResults];
        
        // Auto-select best match
        const normalizedSearchTitle = newTitle.toLowerCase().trim();
        const scoredResults = resultsWithThumbnails.map(result => {
          let score = 0;
          const normalizedResultName = (result.name || '').toLowerCase().trim();
          
          if (normalizedResultName === normalizedSearchTitle) score += 1000;
          else if (normalizedResultName.startsWith(normalizedSearchTitle)) score += 500;
          else if (normalizedResultName.includes(normalizedSearchTitle)) score += 100;
          
          if (result.type === 'boardgame') score += 50;
          if (result.rank && result.rank > 0) score += Math.max(0, 10000 - result.rank);
          if (result.thumbnail) score += 10;
          
          return { ...result, _matchScore: score };
        });
        
        scoredResults.sort((a, b) => {
          if (b._matchScore !== a._matchScore) return b._matchScore - a._matchScore;
          return (a.name || '').localeCompare(b.name || '');
        });
        
        const bestMatch = scoredResults[0];
        const { _matchScore, ...cleanResult } = bestMatch;
        const finalResults = scoredResults.map(({ _matchScore, ...clean }) => clean);
        
        // MERGE with existing results instead of replacing
        setSearchResults(prev => ({
          ...prev, // Keep all existing results
          [newTitle]: finalResults, // Only update the revised game
        }));
        
        setSelectedGames(prev => ({
          ...prev, // Keep all existing selections
          [newTitle]: bestMatch.id, // Only update the revised game
        }));
        
        console.log(`[TextListGameIdentifier] Revised title search complete: "${newTitle}" - found ${finalResults.length} results, auto-selected "${bestMatch.name}"`);
      } else {
        // No results - merge empty array
        setSearchResults(prev => ({
          ...prev, // Keep all existing results
          [newTitle]: [], // Only update the revised game
        }));
        
        // Add to pending retries
        try {
          await addPendingRetry(newTitle);
          console.log(`[TextListGameIdentifier] Saved revised title "${newTitle}" to pending retries (no results found)`);
        } catch (retryError) {
          console.error(`[TextListGameIdentifier] Error saving revised title to pending retries:`, retryError);
        }
      }
    } catch (error) {
      console.error(`[TextListGameIdentifier] Error searching for revised title "${newTitle}":`, error);
      // On error, still merge empty results to preserve other games
      setSearchResults(prev => ({
        ...prev,
        [newTitle]: [],
      }));
    } finally {
      // Remove from loading state
      setLoadingGames(prev => {
        const updated = new Set(prev);
        updated.delete(newTitle);
        return updated;
      });
    }
  };

  const handleSkipGame = async (gameTitle) => {
    console.log('[TextListGameIdentifier] User chose to keep trying for:', gameTitle);
    
    // Save to pending retries for background retry
    await addPendingRetry(gameTitle);
    
    // Keep the game in loading state so it shows spinner and "please be patient"
    // Don't mark as skipped - we want to keep trying
    setLoadingGames(prev => {
      const updated = new Set(prev);
      updated.add(gameTitle); // Ensure it's in loading state
      return updated;
    });
    
    // Remove from stuck games so it doesn't show the stuck message
    // It will be re-added if it gets stuck again
    setStuckGames(prev => {
      const updated = new Set(prev);
      updated.delete(gameTitle);
      return updated;
    });
    
    // Keep the empty results so it shows the "please be patient" message
    // The game will continue trying in the background
    setSearchResults(prev => ({
      ...prev,
      [gameTitle]: prev[gameTitle] || [],
    }));
  };

  const handleReset = () => {
    setGameListText('');
    setFormattedGames([]);
    setSearchResults({});
    setSelectedGames({});
    setError(null);
    setIsProcessing(false);
    setProcessingGameIndex(null);
    setLoadingGames(new Set());
    setStuckGames(new Set());
    setSkippedGames(new Set());
    setGameSearchStartTimes({});
  };

  const handleClose = () => {
    handleReset();
    if (onModalClose) {
      onModalClose();
    }
  };

  return (
    <>
    <Modal
      visible={showModal && formattedGames.length === 0}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Import Games from List</Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.instructions}>
            Type or paste your list of board game titles, or describe your collection. Enter a list, paragraph, or whatever. Or be conversational by saying something like "Pretty much all the 'Dominion' games" or "I have almost all the Settlers Expansions". The AI will generate a comprehensive list for you.
          </Text>

          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={10}
            placeholder=""
            placeholderTextColor={theme.colors.textSecondary}
            value={gameListText}
            onChangeText={setGameListText}
            editable={!isProcessing}
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="none"
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button
            label={isProcessing && formattedGames.length === 0 ? "Seeing game titles..." : "Submit List"}
            onPress={handleFormatList}
            disabled={isProcessing || !gameListText.trim()}
            style={styles.formatButton}
          />
        </ScrollView>
      </View>
    </Modal>

      <ShowGames
        visible={formattedGames.length > 0}
        onClose={handleClose}
        title="Import Games from List"
        formattedGames={formattedGames}
        searchResults={searchResults}
        selectedGames={selectedGames}
        loadingGames={loadingGames}
        stuckGames={stuckGames}
        skippedGames={skippedGames}
        isProcessing={isProcessing && formattedGames.length > 0}
        onSelectGame={handleSelectGame}
        onRemoveGame={handleRemoveGame}
        onSkipGame={handleSkipGame}
        onReviseTitle={handleReviseTitle}
        onAddGames={handleAddSelectedGames}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgColor,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.surfaceColor,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  closeButtonText: {
    fontSize: theme.typography.fontSize['2xl'],
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.lg,
  },
  instructions: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.fontSize.lg * theme.typography.lineHeight.normal,
    fontWeight: theme.typography.fontWeight.medium,
  },
  textInput: {
    ...commonStyles.card,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    minHeight: 150,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.md,
  },
  formatButton: {
    marginBottom: theme.spacing.lg,
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderColor: '#fcc',
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: '#c33',
    fontSize: theme.typography.fontSize.sm,
  },
  resultsHeader: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  resultsTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  resultsSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  gameSelectionCard: {
    ...commonStyles.card,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  gameTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  gameTitleText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  removeButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.woodLight,
    borderWidth: 2,
    borderColor: theme.colors.meepleRed,
    minWidth: 28,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.bold,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  processingText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  noResultsText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.md,
  },
  resultsScroll: {
    marginTop: theme.spacing.xs,
  },
  resultCard: {
    width: 120,
    marginRight: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceColor,
    position: 'relative',
  },
  resultCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: theme.colors.woodLight,
  },
  resultThumbnail: {
    width: '100%',
    height: 100,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.woodLight,
  },
  resultThumbnailPlaceholder: {
    width: '100%',
    height: 100,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.woodLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  resultPlaceholderText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  resultName: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  resultYear: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicatorText: {
    color: '#fff',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
  addButton: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  addingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  addingText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
});

export default TextListGameIdentifier;

