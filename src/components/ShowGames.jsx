import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
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
import { theme, commonStyles } from '../utils/theme';
import { getRetryMetadata, hasExceededMaxRetries } from '../utils/pendingGameRetries';
import InAppLogViewer from './InAppLogViewer';
import { useCollections } from '../context/CollectionsContext';
import { useAuth } from '../context/AuthContext';
import { searchGamesByName } from '../utils/api';

const ShowGames = ({
  visible,
  onClose,
  title = 'Select Games',
  formattedGames = [],
  searchResults = {},
  selectedGames = {},
  loadingGames = new Set(),
  stuckGames = new Set(),
  skippedGames = new Set(),
  isProcessing = false,
  onSelectGame,
  onRemoveGame,
  onSkipGame,
  onReviseTitle,
  onAddGames,
}) => {
  const [revisingGames, setRevisingGames] = useState({}); // { gameTitle: revisedTitle }
  const [isRevising, setIsRevising] = useState(new Set()); // Set of game titles being revised
  const [retryAttemptCounts, setRetryAttemptCounts] = useState({}); // { gameTitle: attemptCount }
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [similarTitles, setSimilarTitles] = useState({}); // { gameTitle: [similarGames] }
  const [loadingSimilarTitles, setLoadingSimilarTitles] = useState(new Set()); // { gameTitle }
  
  const { getUserCollection } = useCollections();
  const { user } = useAuth();
  const userIdentifier = user?.uid || user?.id;
  
  // Get user's collection to check for duplicates
  const userCollection = useMemo(() => {
    if (!userIdentifier) return [];
    return getUserCollection(userIdentifier) || [];
  }, [userIdentifier, getUserCollection]);
  
  // Create a Set of BGG IDs already in collection for quick lookup
  const existingBggIds = useMemo(() => {
    return new Set(
      userCollection
        .filter((g) => g.bggId)
        .map((g) => g.bggId.toString())
    );
  }, [userCollection]);

  // Update retry attempt counts periodically for games that are pending
  useEffect(() => {
    const updateRetryInfo = async () => {
      const attemptCounts = {};
      const metadata = await getRetryMetadata();
      
      for (const gameTitle of formattedGames) {
        const results = searchResults[gameTitle];
        const hasResults = results && results.length > 0;
        const hasNoResults = !hasResults; // Matches the logic in renderGameSelection
        if (hasNoResults && !skippedGames.has(gameTitle)) {
          // Get attempt count from metadata
          const gameMetadata = metadata[gameTitle];
          if (gameMetadata) {
            attemptCounts[gameTitle] = gameMetadata.attemptCount || 0;
          }
        }
      }
      setRetryAttemptCounts(attemptCounts);
    };

    updateRetryInfo();
    const interval = setInterval(updateRetryInfo, 1000); // Update every second
    return () => clearInterval(interval);
  }, [formattedGames, skippedGames, searchResults]);

  // Automatically load similar titles when a duplicate game is selected
  useEffect(() => {
    for (const gameTitle of formattedGames) {
      const selectedBggId = selectedGames[gameTitle];
      if (selectedBggId && isGameInCollection(selectedBggId)) {
        // Only load if we haven't already loaded similar titles for this game
        if (!similarTitles[gameTitle] && !loadingSimilarTitles.has(gameTitle)) {
          handleSearchSimilarTitles(gameTitle, selectedBggId);
        }
      }
    }
  }, [selectedGames, formattedGames, existingBggIds]);


  // Check if a game is already in collection
  const isGameInCollection = (bggId) => {
    if (!bggId) return false;
    return existingBggIds.has(bggId.toString());
  };
  
  // Search for similar titles
  const handleSearchSimilarTitles = async (gameTitle, selectedBggId) => {
    if (!selectedBggId) return;
    
    setLoadingSimilarTitles(prev => new Set(prev).add(gameTitle));
    
    try {
      // Get the selected game's name to search for similar games
      const selectedResult = searchResults[gameTitle]?.find(r => r.id === selectedBggId);
      const searchQuery = selectedResult?.name || gameTitle;
      
      // Search for similar games, excluding the current one
      const similarGames = await searchGamesByName(searchQuery, true);
      
      // Filter out the current game and games already in collection
      const filteredSimilar = similarGames.filter(game => 
        game.id.toString() !== selectedBggId.toString() && 
        !existingBggIds.has(game.id.toString())
      );
      
      setSimilarTitles(prev => ({
        ...prev,
        [gameTitle]: filteredSimilar.slice(0, 10) // Limit to 10 similar games
      }));
    } catch (error) {
      console.error(`[ShowGames] Error searching similar titles for "${gameTitle}":`, error);
      setSimilarTitles(prev => ({
        ...prev,
        [gameTitle]: []
      }));
    } finally {
      setLoadingSimilarTitles(prev => {
        const updated = new Set(prev);
        updated.delete(gameTitle);
        return updated;
      });
    }
  };

  const renderGameSelection = (gameTitle, index) => {
    const results = searchResults[gameTitle];
    const selectedBggId = selectedGames[gameTitle];
    const isLoading = loadingGames.has(gameTitle) || (results === undefined);
    const isSkipped = skippedGames.has(gameTitle);
    const hasResults = results && Array.isArray(results) && results.length > 0;
    // Show buttons if: no results (empty array, null, or undefined)
    const hasNoResults = !hasResults; // This covers undefined, null, and empty array
    const revisedTitle = revisingGames[gameTitle] || gameTitle;
    const isRevisingThis = isRevising.has(gameTitle);
    const isDuplicate = selectedBggId ? isGameInCollection(selectedBggId) : false;
    const similarTitlesForGame = similarTitles[gameTitle] || [];
    const isLoadingSimilar = loadingSimilarTitles.has(gameTitle);
    const attemptCount = retryAttemptCounts[gameTitle] || 0;
    const hasExceededRetries = hasExceededMaxRetries(attemptCount);

    return (
      <View key={`${index}-${gameTitle}`} style={styles.gameSelectionCard}>
        <View style={styles.gameTitleRow}>
          <Text style={styles.gameTitleText}>{gameTitle}</Text>
          <Pressable
            onPress={() => onRemoveGame(gameTitle)}
            style={styles.removeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.removeButtonText}>✕</Text>
          </Pressable>
        </View>
        
        {hasResults ? (
          <>
            {/* Main results carousel */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.resultsScroll}>
              {results.map((result) => {
                const isSelected = selectedBggId === result.id;
                const isResultDuplicate = isGameInCollection(result.id);
                return (
                  <Pressable
                    key={result.id}
                    style={[
                      styles.resultCard,
                      isSelected && styles.resultCardSelected,
                      isResultDuplicate && isSelected && styles.resultCardDuplicate,
                    ]}
                    onPress={() => onSelectGame(gameTitle, result.id)}
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
                      <>
                        {isResultDuplicate ? (
                          <View style={styles.duplicateIndicator}>
                            <Text style={styles.duplicateIndicatorText}>Already in collection</Text>
                          </View>
                        ) : (
                          <View style={styles.selectedIndicator}>
                            <Text style={styles.selectedIndicatorText}>✓</Text>
                          </View>
                        )}
                      </>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            
            {/* Show similar titles carousel if available */}
            {similarTitlesForGame.length > 0 && (
              <View style={styles.similarTitlesContainer}>
                <Text style={styles.similarTitlesHeader}>Similar titles:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.resultsScroll}>
                  {similarTitlesForGame.map((similarGame) => {
                    const isSimilarSelected = selectedGames[gameTitle] === similarGame.id;
                    return (
                      <Pressable
                        key={similarGame.id}
                        style={[
                          styles.resultCard,
                          isSimilarSelected && styles.resultCardSelected,
                        ]}
                        onPress={() => onSelectGame(gameTitle, similarGame.id)}
                      >
                        {similarGame.thumbnail ? (
                          <Image source={{ uri: similarGame.thumbnail }} style={styles.resultThumbnail} />
                        ) : (
                          <View style={styles.resultThumbnailPlaceholder}>
                            <Text style={styles.resultPlaceholderText}>BGG</Text>
                          </View>
                        )}
                        <Text style={styles.resultName} numberOfLines={2}>
                          {similarGame.name}
                        </Text>
                        {similarGame.yearPublished && (
                          <Text style={styles.resultYear}>{similarGame.yearPublished}</Text>
                        )}
                        {isSimilarSelected && (
                          <View style={styles.selectedIndicator}>
                            <Text style={styles.selectedIndicatorText}>✓</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </>
        ) : !isSkipped ? (
          // Show options for games that have no results
          <View style={styles.processingContainer}>
            {hasNoResults && (
              <View style={styles.stuckContainer}>
                {hasExceededRetries && (
                  <Text style={styles.stuckText}>
                    We couldn't find this game title.
                  </Text>
                )}
                {!hasExceededRetries && isLoading && (
                  <View style={styles.processingRow}>
                    <ActivityIndicator size="small" color={theme.colors.meepleRed} />
                    <Text style={styles.processingText}>Loading...</Text>
                  </View>
                )}
                {isRevisingThis ? (
                  <View style={styles.reviseContainer}>
                    <TextInput
                      style={styles.reviseInput}
                      value={revisedTitle}
                      onChangeText={(text) => {
                        setRevisingGames(prev => ({ ...prev, [gameTitle]: text }));
                      }}
                      placeholder="Enter revised game title"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (revisedTitle.trim() && revisedTitle.trim() !== gameTitle && onReviseTitle) {
                          onReviseTitle(gameTitle, revisedTitle.trim());
                          setIsRevising(prev => {
                            const updated = new Set(prev);
                            updated.delete(gameTitle);
                            return updated;
                          });
                          setRevisingGames(prev => {
                            const updated = { ...prev };
                            delete updated[gameTitle];
                            return updated;
                          });
                        }
                      }}
                    />
                    <View style={styles.reviseButtonRow}>
                      <Pressable
                        onPress={() => {
                          if (revisedTitle.trim() && revisedTitle.trim() !== gameTitle && onReviseTitle) {
                            onReviseTitle(gameTitle, revisedTitle.trim());
                          }
                          setIsRevising(prev => {
                            const updated = new Set(prev);
                            updated.delete(gameTitle);
                            return updated;
                          });
                          setRevisingGames(prev => {
                            const updated = { ...prev };
                            delete updated[gameTitle];
                            return updated;
                          });
                        }}
                        style={[styles.reviseButton, styles.submitButton]}
                        disabled={!revisedTitle.trim() || revisedTitle.trim() === gameTitle}
                      >
                        <Text style={[styles.reviseButtonText, (!revisedTitle.trim() || revisedTitle.trim() === gameTitle) && styles.reviseButtonTextDisabled]}>
                          Search Again
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setIsRevising(prev => {
                            const updated = new Set(prev);
                            updated.delete(gameTitle);
                            return updated;
                          });
                          setRevisingGames(prev => {
                            const updated = { ...prev };
                            delete updated[gameTitle];
                            return updated;
                          });
                        }}
                        style={[styles.reviseButton, styles.cancelButton]}
                      >
                        <Text style={styles.reviseButtonText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.stuckButtonRow}>
                    {onReviseTitle && (
                      <Pressable
                        onPress={() => {
                          setIsRevising(prev => new Set(prev).add(gameTitle));
                          setRevisingGames(prev => ({ ...prev, [gameTitle]: gameTitle }));
                        }}
                        style={[styles.stuckButton, styles.reviseTitleButton]}
                      >
                        <Text style={styles.stuckButtonText}>Change Text</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  // Log when modal should be visible
  React.useEffect(() => {
    if (__DEV__) {
      console.log('[ShowGames] Visibility check:', {
        visible,
        formattedGamesLength: formattedGames.length,
        shouldShow: visible && formattedGames.length > 0,
        title,
      });
    }
  }, [visible, formattedGames.length, title]);

  if (!visible || formattedGames.length === 0) {
    if (__DEV__) {
      console.log('[ShowGames] Not rendering - visible:', visible, 'formattedGames.length:', formattedGames.length);
    }
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setShowLogViewer(true)} style={styles.logButton}>
              <Text style={styles.logButtonText}>📋 Logs</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              Found {formattedGames.length} game{formattedGames.length !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.resultsSubtitle}>
              Select the correct match for each game. Tap ✕ to remove games we got wrong or ones you don't actually want to add to your collection:
            </Text>
          </View>

          {formattedGames.length === 0 ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="small" color={theme.colors.meepleRed} />
              <Text style={styles.processingText}>Identifying games from image...</Text>
            </View>
          ) : (
            formattedGames.map((gameTitle, index) => {
              // Ensure every game in formattedGames is rendered
              if (!gameTitle) {
                console.warn(`[ShowGames] Warning: Empty game title at index ${index}`);
                return null;
              }
              return renderGameSelection(gameTitle, index);
            })
          )}

          {isProcessing && (
            <View style={styles.addingContainer}>
              <ActivityIndicator size="small" color={theme.colors.meepleRed} />
              <Text style={styles.addingText}>Adding games to collection...</Text>
            </View>
          )}

          <Button
            label={
              isProcessing
                ? 'Adding Games...'
                : `Add ${Object.keys(selectedGames).length} Selected Game${Object.keys(selectedGames).length !== 1 ? 's' : ''} to Collection`
            }
            onPress={onAddGames}
            disabled={isProcessing || Object.keys(selectedGames).length === 0}
            style={styles.addButton}
          />
        </ScrollView>
      </View>
      <InAppLogViewer visible={showLogViewer} onClose={() => setShowLogViewer(false)} />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  logButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.meepleRed,
    borderRadius: 6,
  },
  logButtonText: {
    color: '#fff',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
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
  resultsHeader: {
    marginTop: theme.spacing.xs,
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
    paddingVertical: theme.spacing.md,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  processingText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  stuckContainer: {
    marginTop: theme.spacing.md,
  },
  stuckText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    fontStyle: 'italic',
  },
  stuckButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  stuckButton: {
    flex: 1,
    minWidth: 100,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviseTitleButton: {
    backgroundColor: theme.colors.woodMedium,
    borderColor: theme.colors.woodDark,
  },
  stuckButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  reviseContainer: {
    marginTop: theme.spacing.sm,
  },
  reviseInput: {
    ...commonStyles.input,
    marginBottom: theme.spacing.sm,
    fontSize: theme.typography.fontSize.sm,
  },
  reviseButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  reviseButton: {
    flex: 1,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    backgroundColor: theme.colors.woodMedium,
    borderColor: theme.colors.woodDark,
  },
  cancelButton: {
    backgroundColor: theme.colors.woodLight,
    borderColor: theme.colors.woodMedium,
  },
  reviseButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  reviseButtonTextDisabled: {
    opacity: 0.5,
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
  duplicateIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF9800',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 100,
  },
  duplicateIndicatorText: {
    color: '#fff',
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    textAlign: 'center',
  },
  resultCardDuplicate: {
    borderColor: '#FF9800',
    backgroundColor: '#FFF3E0',
  },
  duplicateActionsContainer: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.woodLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  duplicateText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  similarTitlesButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.meepleRed,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  similarTitlesButtonText: {
    color: '#fff',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  similarTitlesContainer: {
    marginTop: theme.spacing.md,
  },
  similarTitlesHeader: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
});

export default ShowGames;

