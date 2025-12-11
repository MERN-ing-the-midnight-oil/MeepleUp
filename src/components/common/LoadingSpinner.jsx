import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '../../utils/theme';

const LoadingSpinner = ({ size = 'large', color = theme.colors.meepleRed }) => {
    return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
    </View>
    );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

export default LoadingSpinner;