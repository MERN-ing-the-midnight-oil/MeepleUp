import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Button from './common/Button';
import { theme, commonStyles } from '../utils/theme';

const GameSelectionModal = ({
  visible,
  onClose,
  title = 'Select Games',
  formattedGames = [],
  searchResults = {},
  selectedGames = {},
  loadingGames = new Set(),
  isProcessing = false,
  onSelectGame,
  onRemoveGame,
  onAddGames,
}) => {
  const renderGameSelection = (gameTitle, index) => {
    const results = searchResults[gameTitle];
    const selectedBggId = selectedGames[gameTitle];
    const isLoading = loadingGames.has(gameTitle) || (results === undefined);

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

  // Log when modal should be visible
  React.useEffect(() => {
    if (__DEV__) {
      console.log('[GameSelectionModal] Visibility check:', {
        visible,
        formattedGamesLength: formattedGames.length,
        shouldShow: visible && formattedGames.length > 0,
        title,
      });
    }
  }, [visible, formattedGames.length, title]);

  if (!visible || formattedGames.length === 0) {
    if (__DEV__) {
      console.log('[GameSelectionModal] Not rendering - visible:', visible, 'formattedGames.length:', formattedGames.length);
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
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
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

          {formattedGames.map((gameTitle, index) => renderGameSelection(gameTitle, index))}

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

export default GameSelectionModal;

