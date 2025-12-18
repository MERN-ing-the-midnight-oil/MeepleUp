import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../utils/theme';

/**
 * Beeple Avatar Component
 * Displays Beeple the robot with a "B" letter avatar
 */
const BeepleAvatar = ({ size = 40, style }) => {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.letter, { fontSize: size * 0.6 }]}>B</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.meepleRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
  },
  letter: {
    color: '#fff',
    fontWeight: theme.typography.fontWeight.bold,
    fontFamily: theme.typography.fontFamily || 'Graphik',
  },
});

export default BeepleAvatar;


