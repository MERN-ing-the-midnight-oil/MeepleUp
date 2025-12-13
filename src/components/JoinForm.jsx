import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
        <Input
          placeholder="battery"
          value={joinCodeWord1}
          onChangeText={(text) => onJoinCodeWordChange(1, text)}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.joinCodeInput}
        />
        <Input
          placeholder="horse"
          value={joinCodeWord2}
          onChangeText={(text) => onJoinCodeWordChange(2, text)}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.joinCodeInput}
        />
        <Input
          placeholder="staple"
          value={joinCodeWord3}
          onChangeText={(text) => onJoinCodeWordChange(3, text)}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.joinCodeInput}
        />
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
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
  },
  error: {
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  joinCodeFields: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  joinCodeInput: {
    flex: 1,
    marginBottom: 0,
  },
  joinButton: {
    width: '100%',
  },
});

export default JoinForm;

