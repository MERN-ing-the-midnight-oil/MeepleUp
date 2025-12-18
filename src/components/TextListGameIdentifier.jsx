import React, { useState } from 'react';
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
import { formatGameListForBGG } from '../services/claudeVision';
import { searchGamesByName, getGameDetails } from '../utils/api';
import { theme, commonStyles } from '../utils/theme';

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

    try {
      const result = await formatGameListForBGG(gameListText.trim());
      
      if (!result.games || result.games.length === 0) {
        setError('No games were found in your list. Please check your input and try again.');
        setIsProcessing(false);
        return;
      }

      setFormattedGames(result.games);
      
      // Automatically search for each game
      await searchForAllGames(result.games);
    } catch (err) {
      console.error('[TextListGameIdentifier] Error formatting list:', err);
      setError(err.message || 'Failed to format game list. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const searchForAllGames = async (games) => {
    const results = {};
    const selected = {};

    for (let i = 0; i < games.length; i++) {
      const gameTitle = games[i];
      setProcessingGameIndex(i);
      
      try {
        const searchResults = await searchGamesByName(gameTitle, true);
        
        // Fetch thumbnails for search results (optional, non-blocking)
        const resultsWithThumbnails = await Promise.all(
          (searchResults || []).map(async (result) => {
            try {
              // Try to get thumbnail from game details (quick fetch)
              const gameDetails = await getGameDetails(result.id);
              return {
                ...result,
                thumbnail: gameDetails?.thumbnail || null,
              };
            } catch {
              // If fetching details fails, return result without thumbnail
              return result;
            }
          })
        );
        
        results[gameTitle] = resultsWithThumbnails;
        
        // Update search results incrementally so UI updates as each game finishes
        setSearchResults({ ...results });
        
        // Auto-select the first result if available
        if (resultsWithThumbnails && resultsWithThumbnails.length > 0) {
          selected[gameTitle] = resultsWithThumbnails[0].id;
          setSelectedGames({ ...selected });
        }
      } catch (err) {
        console.error(`[TextListGameIdentifier] Error searching for ${gameTitle}:`, err);
        results[gameTitle] = [];
        // Update search results even for empty results to show "No matches found" instead of loading
        setSearchResults({ ...results });
      }
    }

    setSearchResults(results);
    setSelectedGames(selected);
    setProcessingGameIndex(null);
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

    setIsProcessing(true);
    setError(null);

    let successCount = 0;
    let failCount = 0;

    try {
      for (const [gameTitle, bggId] of Object.entries(selectedGames)) {
        if (!bggId) continue;

        try {
          const gameDetails = await getGameDetails(bggId);
          if (gameDetails) {
            const gameData = {
              title: gameDetails.name || gameTitle,
              bggId: bggId.toString(),
              image: gameDetails.image || null,
              thumbnail: gameDetails.thumbnail || null,
              description: gameDetails.description || '',
              yearPublished: gameDetails.yearPublished || null,
              minPlayers: gameDetails.minPlayers || null,
              maxPlayers: gameDetails.maxPlayers || null,
              playingTime: gameDetails.playingTime || null,
              source: 'text_list',
            };

            if (onAddToCollection) {
              onAddToCollection(gameData);
              successCount++;
            }
          } else {
            failCount++;
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
  };

  const handleReset = () => {
    setGameListText('');
    setFormattedGames([]);
    setSearchResults({});
    setSelectedGames({});
    setError(null);
    setProcessingGameIndex(null);
  };

  const handleClose = () => {
    handleReset();
    if (onModalClose) {
      onModalClose();
    }
  };

  const renderGameSelection = (gameTitle, index) => {
    const results = searchResults[gameTitle];
    const selectedBggId = selectedGames[gameTitle];
    const isProcessing = processingGameIndex === index;
    // Show loading if currently processing this game OR if results haven't been set yet
    const isLoading = isProcessing || (results === undefined && processingGameIndex !== null);

    return (
      <View key={gameTitle} style={styles.gameSelectionCard}>
        <View style={styles.gameTitleRow}>
          <Text style={styles.gameTitleText}>{gameTitle}</Text>
          <Pressable
            onPress={() => handleRemoveGame(gameTitle)}
            style={styles.removeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.removeButtonText}>✕</Text>
          </Pressable>
        </View>
        
        {isLoading ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="small" color={theme.colors.meepleRed} />
            <Text style={styles.processingText}>Loading...</Text>
          </View>
        ) : (results || []).length === 0 ? (
          <Text style={styles.noResultsText}>No matches found</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.resultsScroll}>
            {results.map((result) => {
              const isSelected = selectedBggId === result.id;
              return (
                <Pressable
                  key={result.id}
                  style={[
                    styles.resultCard,
                    isSelected && styles.resultCardSelected,
                  ]}
                  onPress={() => handleSelectGame(gameTitle, result.id)}
                >
                  {result.thumbnail ? (
                    <Image source={{ uri: result.thumbnail }} style={styles.resultThumbnail} />
                  ) : (
                    <View style={styles.resultThumbnailPlaceholder}>
                      <Text style={styles.resultPlaceholderText}>BGG</Text>
                    </View>
                  )}
                  <Text style={styles.resultName} numberOfLines={2}>
                    {result.name}
                  </Text>
                  {result.yearPublished && (
                    <Text style={styles.resultYear}>{result.yearPublished}</Text>
                  )}
                  {isSelected && (
                    <View style={styles.selectedIndicator}>
                      <Text style={styles.selectedIndicatorText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={showModal}
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
            Type or paste your list of board game titles, or describe your collection. You can include multiple games (one per line or separated by commas), or use descriptions like "Pretty much all the 'Dominion' games" or "I have almost all the Settlers Expansions". The AI will generate a comprehensive list for you.
          </Text>

          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={10}
            placeholder="Enter your game titles or description...&#10;&#10;Examples:&#10;• Catan, Ticket to Ride, Pandemic&#10;• Pretty much all the 'Dominion' games&#10;• I have almost all the Settlers Expansions&#10;• All Ticket to Ride games except the base game"
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
            label={isProcessing && formattedGames.length === 0 ? "Formatting List..." : "Submit List"}
            onPress={handleFormatList}
            disabled={isProcessing || !gameListText.trim()}
            style={styles.formatButton}
          />

          {formattedGames.length > 0 && (
            <>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>
                  Found {formattedGames.length} game{formattedGames.length !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.resultsSubtitle}>
                  Select the correct match for each game. Tap ✕ to remove games you don't have:
                </Text>
              </View>

              {formattedGames.map((gameTitle, index) => renderGameSelection(gameTitle, index))}

              {isProcessing && formattedGames.length > 0 && (
                <View style={styles.addingContainer}>
                  <ActivityIndicator size="small" color={theme.colors.meepleRed} />
                  <Text style={styles.addingText}>Adding games to collection...</Text>
                </View>
              )}

              <Button
                label={
                  isProcessing && formattedGames.length > 0
                    ? 'Adding Games...'
                    : `Add ${Object.keys(selectedGames).length} Selected Game${Object.keys(selectedGames).length !== 1 ? 's' : ''} to Collection`
                }
                onPress={handleAddSelectedGames}
                disabled={isProcessing || Object.keys(selectedGames).length === 0}
                style={styles.addButton}
              />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
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
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
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
    minWidth: 28,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
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
    borderColor: theme.colors.meepleRed,
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
    backgroundColor: theme.colors.meepleRed,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicatorText: {
    color: '#fff',
    fontSize: theme.typography.fontSize.sm,
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

