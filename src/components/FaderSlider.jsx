import React from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, Dimensions } from 'react-native';
import { theme } from '../utils/theme';

/**
 * Fader-style slider component (like audio mixing board faders)
 * Horizontal slider with a handle that moves left and right
 */
const FaderSlider = ({ 
  value, 
  onValueChange, 
  minimumValue = 0, 
  maximumValue = 5, 
  step = 0.1,
  label,
  description,
  disabled = false 
}) => {
  const sliderWidth = 200;
  const handleSize = 24;
  const trackHeight = 8;
  
  // Calculate position based on value (left is min, right is max)
  const getPositionFromValue = (val) => {
    const range = maximumValue - minimumValue;
    const percentage = (val - minimumValue) / range;
    // Position from left (0 = min value at left, sliderWidth = max value at right)
    return percentage * (sliderWidth - handleSize);
  };

  const [position] = React.useState(new Animated.Value(getPositionFromValue(value)));
  const [currentValue, setCurrentValue] = React.useState(value);
  const startPosition = React.useRef(getPositionFromValue(value));

  React.useEffect(() => {
    const newPosition = getPositionFromValue(value);
    Animated.spring(position, {
      toValue: newPosition,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
    setCurrentValue(value);
    startPosition.current = newPosition;
  }, [value]);

  const getValueFromPosition = (x) => {
    // x is position from left of track
    const clampedX = Math.max(0, Math.min(sliderWidth - handleSize, x));
    const percentage = clampedX / (sliderWidth - handleSize); // left = min, right = max
    const rawValue = minimumValue + (percentage * (maximumValue - minimumValue));
    // Round to nearest step
    return Math.round(rawValue / step) * step;
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt) => {
        if (disabled) return;
        // Get the X position relative to the track container
        const { locationX } = evt.nativeEvent;
        const newValue = getValueFromPosition(locationX);
        const newPosition = getPositionFromValue(newValue);
        startPosition.current = newPosition;
        position.setValue(newPosition);
        setCurrentValue(newValue);
        onValueChange?.(newValue);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (disabled) return;
        // Calculate new position based on gesture delta from start (dx for horizontal)
        const newPos = Math.max(0, Math.min(sliderWidth - handleSize, startPosition.current + gestureState.dx));
        const newValue = getValueFromPosition(newPos);
        position.setValue(newPos);
        setCurrentValue(newValue);
        onValueChange?.(newValue);
      },
      onPanResponderRelease: () => {
        // Final value is already set in onPanResponderMove
        // startPosition will be updated on next grant
      },
    })
  ).current;

  const fillWidth = position.interpolate({
    inputRange: [0, sliderWidth - handleSize],
    outputRange: [0, sliderWidth - handleSize],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label}</Text>
        {description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      
      <View style={styles.sliderContainer}>
        <View 
          style={[styles.trackContainer, { width: sliderWidth }]}
          {...panResponder.panHandlers}
        >
          {/* Track background */}
          <View style={[styles.track, { width: sliderWidth, height: trackHeight }]} />
          
          {/* Fill indicator */}
          <Animated.View 
            style={[
              styles.fill,
              {
                width: fillWidth,
                height: trackHeight,
                left: 0,
              }
            ]} 
          />
          
          {/* Handle */}
          <Animated.View
            style={[
              styles.handle,
              {
                transform: [{ translateX: position }],
              },
              disabled && styles.handleDisabled,
            ]}
          />
          
          {/* Tick marks */}
          <View style={styles.ticks}>
            {[0, 1, 2, 3, 4, 5].map((tick) => {
              const tickPosition = getPositionFromValue(tick);
              return (
                <View
                  key={tick}
                  style={[
                    styles.tick,
                    {
                      left: tickPosition + handleSize / 2 - 1,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
        
        <View style={styles.valueDisplay}>
          <Text style={styles.valueText}>{currentValue.toFixed(1)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
  },
  labelContainer: {
    marginBottom: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  valueDisplay: {
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
  },
  trackContainer: {
    flex: 1,
    height: 40,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  track: {
    backgroundColor: theme.colors.woodMedium,
    borderRadius: 4,
    position: 'absolute',
    top: 16, // Center of 40px container minus half of 8px track = 20 - 4 = 16
  },
  fill: {
    backgroundColor: theme.colors.meepleRed,
    borderRadius: 4,
    position: 'absolute',
    top: 16, // Center of 40px container minus half of 8px track = 20 - 4 = 16
  },
  handle: {
    width: 24,
    height: 32,
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.meepleRed,
    position: 'absolute',
    top: 4, // Center of 40px container minus half of 32px handle = 20 - 16 = 4
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  handleDisabled: {
    opacity: 0.5,
  },
  ticks: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
  },
  tick: {
    position: 'absolute',
    top: -4,
    width: 1,
    height: 16,
    backgroundColor: theme.colors.woodDark,
  },
});

export default FaderSlider;

