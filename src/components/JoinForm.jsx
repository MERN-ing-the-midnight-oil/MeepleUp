import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Button from './common/Button';
import Input from './common/Input';
import { theme } from '../utils/theme';

/**
 * Shared Join Form Component
 * Used by both EventsScreen (web) and Onboarding (mobile)
 * to avoid code duplication
 */
const JoinForm = ({
  joinCodeWord1,
  joinCodeWord2,
  joinCodeWord3,
  onJoinCodeWordChange,
  onJoin,
  error,
  loading,
  style,
  showTitle = true,
  showSubtitle = true,
}) => {
  return (
    <View style={[styles.container, style]}>
      {showTitle && (
        <Text style={styles.title}>Join an existing MeepleUp</Text>
      )}
      {showSubtitle && (
        <Text style={styles.subtitle}>
          Enter the three-word join code provided by your game night organizer.
        </Text>
      )}
      
      {error && <Text style={styles.error}>{error}</Text>}
      
      <View style={styles.joinCodeFields}>
        <View style={styles.holeWrapper}>
          <View style={styles.whiteRectangle}>
            <Input
              placeholder="battery"
              value={joinCodeWord1}
              onChangeText={(text) => onJoinCodeWordChange(1, text)}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.joinCodeInput}
              placeholderTextColor="rgba(0, 0, 0, 0.5)"
            />
          </View>
        </View>
        <View style={styles.holeWrapper}>
          <View style={styles.whiteRectangle}>
            <Input
              placeholder="horse"
              value={joinCodeWord2}
              onChangeText={(text) => onJoinCodeWordChange(2, text)}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.joinCodeInput}
              placeholderTextColor="rgba(0, 0, 0, 0.5)"
            />
          </View>
        </View>
        <View style={styles.holeWrapper}>
          <View style={styles.whiteRectangle}>
            <Input
              placeholder="staple"
              value={joinCodeWord3}
              onChangeText={(text) => onJoinCodeWordChange(3, text)}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.joinCodeInput}
              placeholderTextColor="rgba(0, 0, 0, 0.5)"
            />
          </View>
        </View>
      </View>
      
      <Button
        label={loading ? 'Joining...' : 'Join MeepleUp'}
        onPress={onJoin}
        disabled={loading || !joinCodeWord1?.trim() || !joinCodeWord2?.trim() || !joinCodeWord3?.trim()}
        style={styles.joinButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing['2xl'],
    backgroundColor: '#b89d7a', // Cardboard tan/brown color
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    // Shadows only on bottom and left - less diffuse
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 6 }, // Negative width for left shadow, positive height for bottom
    shadowOpacity: 0.5,
    shadowRadius: 6, // Less diffuse shadow
    elevation: 8, // Android shadow
    // Thinner borders on top and right, thicker on bottom and left for perspective
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#6b5435', // Darker brown border
    borderStyle: 'solid',
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: '#2b1f14', // Dark brown text on cardboard for good contrast
    marginBottom: theme.spacing.sm,
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: '#4a3d2f', // Darker brown text on cardboard
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
  },
  error: {
    color: '#ffcccc', // Light red for visibility on cardboard
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    backgroundColor: 'rgba(192, 57, 43, 0.2)', // Semi-transparent red background
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  joinCodeFields: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  holeWrapper: {
    flex: 1,
    // Wood background - looks like hole showing the wood table beneath
    backgroundColor: '#d4b896', // Wood table base color
    // Match the card's bottom and left border styling on top and right
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopColor: '#6b5435', // Same as card's border color
    borderRightColor: '#6b5435',
    borderRadius: 8,
    padding: theme.spacing.sm, // Padding so wood shows around white rectangles
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  whiteRectangle: {
    // White rectangle that contains the text - sized to fit content
    backgroundColor: '#ffffff',
    borderRadius: 0, // Sharp corners
    paddingHorizontal: 3, // Just a few pixels
    paddingVertical: 3, // Just a few pixels
    alignSelf: 'flex-start', // Size to content width
    minWidth: 60, // Minimum width for placeholder visibility
    // Thin black borders on left and bottom
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderLeftColor: '#000000',
    borderBottomColor: '#000000',
  },
  joinCodeInput: {
    // Override all Input component defaults first
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    marginBottom: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    // Pure black text
    color: '#000000',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold, // Bold text
    fontFamily: Platform.OS === 'ios' ? 'Courier' : Platform.OS === 'android' ? 'monospace' : 'Courier New',
    minHeight: 24,
    textAlign: 'left',
    // Ensure no opacity is applied
    opacity: 1,
  },
  joinButton: {
    width: '100%',
  },
});

export default JoinForm;

