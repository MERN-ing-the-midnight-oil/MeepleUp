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
          <Input
            placeholder="battery"
            value={joinCodeWord1}
            onChangeText={(text) => onJoinCodeWordChange(1, text)}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.joinCodeInput}
            placeholderTextColor="rgba(43, 31, 20, 0.5)"
          />
        </View>
        <View style={styles.holeWrapper}>
          <Input
            placeholder="horse"
            value={joinCodeWord2}
            onChangeText={(text) => onJoinCodeWordChange(2, text)}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.joinCodeInput}
            placeholderTextColor="rgba(43, 31, 20, 0.5)"
          />
        </View>
        <View style={styles.holeWrapper}>
          <Input
            placeholder="staple"
            value={joinCodeWord3}
            onChangeText={(text) => onJoinCodeWordChange(3, text)}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.joinCodeInput}
            placeholderTextColor="rgba(43, 31, 20, 0.5)"
          />
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
    // Hole edge - darker border to simulate punched hole edge
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Semi-transparent dark edge
    borderRadius: 10,
    padding: 2, // Creates the border/edge effect
    // Inset shadow effect on top and right
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: -2, // Negative for inset effect (may not work on Android)
  },
  joinCodeInput: {
    flex: 1,
    marginBottom: 0,
    // Wood background - looks like hole showing the wood table beneath
    backgroundColor: '#d4b896', // Wood table base color
    // Inset shadow borders on top and right to create depth
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopColor: 'rgba(0, 0, 0, 0.2)', // Subtle dark border for inset shadow
    borderRightColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    color: '#2b1f14', // Dark text for visibility on wood background
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : Platform.OS === 'android' ? 'monospace' : 'Courier New',
    minHeight: 44,
  },
  joinButton: {
    width: '100%',
  },
});

export default JoinForm;

