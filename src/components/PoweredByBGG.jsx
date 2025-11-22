import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';

/**
 * "Powered by BGG" Logo Component
 * Required for public-facing applications using BGG XML API
 * 
 * According to BGG API Terms of Use:
 * - Logo must be displayed and linked to BoardGameGeek
 * - Text must be easily legible
 * - Required for commercial/public-facing applications
 */
const PoweredByBGG = ({ style, textStyle, size = 'medium' }) => {
  const handlePress = () => {
    const url = 'https://boardgamegeek.com';
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open BGG URL:', err);
    });
  };

  // Size variants
  const sizeStyles = {
    small: {
      fontSize: 10,
      padding: 4,
    },
    medium: {
      fontSize: 12,
      padding: 6,
    },
    large: {
      fontSize: 14,
      padding: 8,
    },
  };

  const currentSizeStyle = sizeStyles[size] || sizeStyles.medium;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, style]}
      accessibilityRole="link"
      accessibilityLabel="Visit BoardGameGeek"
      accessibilityHint="Opens BoardGameGeek website"
    >
      <Text style={[styles.text, currentSizeStyle, textStyle]}>
        Powered by{' '}
        <Text style={styles.bggText}>BoardGameGeek</Text>
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  bggText: {
    color: '#4a90e2',
    fontWeight: '600',
  },
});

export default PoweredByBGG;

