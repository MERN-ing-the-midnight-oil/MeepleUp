import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { theme } from '../utils/theme';

/**
 * Beeple Avatar Component
 * Displays Beeple the robot with a profile picture
 */
const BeepleAvatar = ({ size = 40, style }) => {
  // Ensure size is always a number to prevent type errors
  const sizeNum = typeof size === 'number' ? size : Number(size) || 40;
  
  return (
    <View style={[styles.container, { width: sizeNum, height: sizeNum, borderRadius: sizeNum / 2 }, style]}>
      <Image
        source={require('../../assets/images/beeple.png')}
        style={[styles.image, { width: sizeNum, height: sizeNum, borderRadius: sizeNum / 2 }]}
        resizeMode="cover"
        defaultSource={require('../../assets/images/beeple.png')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent', // Remove red background - show Beeple image instead
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default BeepleAvatar;


