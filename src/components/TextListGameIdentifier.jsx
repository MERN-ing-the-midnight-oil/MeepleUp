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
import { searchForAllGames as searchForAllGamesUtil } from '../utils/gameSearch';
import { theme, commonStyles } from '../utils/theme';
import GameSelectionModal from './GameSelectionModal';

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
      const result = await formatGameListForBGG(gameListText.trim());
      
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
        console.log('[TextListGameIdentifier] GameSelectionModal should now be visible:', result.games.length > 0);
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

  const searchForAllGames = async (games) => {
    await searchForAllGamesUtil(games, {
      setLoadingGames,
      setSearchResults,
      setSelectedGames,
      setProcessingGameIndex,
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
              // Include fields needed for GameCard to show heart instead of "?"
              // GameCard checks for publisher, mechanics, categories, and complexity
              mechanics: gameDetails.mechanics || null,
              categories: gameDetails.categories || null,
              publishers: gameDetails.publishers || null,
              publisher: gameDetails.publisher || null,
              complexity: gameDetails.complexity || gameDetails.averageWeight || null,
              averageWeight: gameDetails.averageWeight || gameDetails.complexity || null,
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
    setIsProcessing(false);
    setProcessingGameIndex(null);
    setLoadingGames(new Set());
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
            label={isProcessing && formattedGames.length === 0 ? "Formatting List..." : "Submit List"}
            onPress={handleFormatList}
            disabled={isProcessing || !gameListText.trim()}
            style={styles.formatButton}
          />
        </ScrollView>
      </View>
    </Modal>

      <GameSelectionModal
        visible={formattedGames.length > 0}
        onClose={handleClose}
        title="Import Games from List"
        formattedGames={formattedGames}
        searchResults={searchResults}
        selectedGames={selectedGames}
        loadingGames={loadingGames}
        isProcessing={isProcessing && formattedGames.length > 0}
        onSelectGame={handleSelectGame}
        onRemoveGame={handleRemoveGame}
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

