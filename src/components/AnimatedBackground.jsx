import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { theme } from '../utils/theme';

const MEEPLE_PATH = 'M9 20h-5a1 1 0 0 1 -1 -1c0 -2 3.378 -4.907 4 -6c-1 0 -4 -.5 -4 -2c0 -2 4 -3.5 6 -4c0 -1.5 .5 -4 3 -4s3 2.5 3 4c2 .5 6 2 6 4c0 1.5 -3 2 -4 2c.622 1.093 4 4 4 6a1 1 0 0 1 -1 1h-5c-1 0 -2 -4 -3 -4s-2 4 -3 4z';

// Layer configurations
const LAYER_CONFIGS = {
  background: {
    sizeRange: [25, 45],
    speedRange: [15000, 20000], // milliseconds - small and slow
    opacityRange: [0.15, 0.25],
    tiltRange: [-20, 20],
    spawnWeight: 0.55, // 50-60% of meeples
  },
  midground: {
    sizeRange: [50, 70],
    speedRange: [10000, 15000],
    opacityRange: [0.4, 0.6],
    tiltRange: [-35, 35],
    spawnWeight: 0.35, // 30-40% of meeples
  },
  foreground: {
    sizeRange: [80, 120],
    speedRange: [6000, 10000], // milliseconds - big and fast
    opacityRange: [0.7, 0.9],
    tiltRange: [-20, 20],
    spawnWeight: 0.10, // 10-15% of meeples
  },
};

// Helper to get random value in range
const randomInRange = (min, max) => min + Math.random() * (max - min);

// Helper to select layer based on weights
const selectLayer = () => {
  const rand = Math.random();
  if (rand < LAYER_CONFIGS.background.spawnWeight) return 'background';
  if (rand < LAYER_CONFIGS.background.spawnWeight + LAYER_CONFIGS.midground.spawnWeight) return 'midground';
  return 'foreground';
};

// Stratified randomness: divide viewport into segments
const SEGMENT_COUNT = 10;
const getStratifiedX = (width, usedSegments) => {
  // Find available segments
  const availableSegments = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    if (!usedSegments.has(i)) {
      availableSegments.push(i);
    }
  }
  
  // If all segments used, reset
  if (availableSegments.length === 0) {
    usedSegments.clear();
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      availableSegments.push(i);
    }
  }
  
  // Select random segment from available
  const segmentIndex = availableSegments[Math.floor(Math.random() * availableSegments.length)];
  usedSegments.add(segmentIndex);
  
  // Randomize within segment
  const segmentWidth = width / SEGMENT_COUNT;
  const segmentStart = segmentIndex * segmentWidth;
  return segmentStart + Math.random() * segmentWidth;
};

const MeepleParticle = ({ layer, x, width, height, onComplete }) => {
  const config = LAYER_CONFIGS[layer];
  // Calculate all values once and store them - never changes
  const sizeRef = useRef(randomInRange(config.sizeRange[0], config.sizeRange[1]));
  const size = sizeRef.current;
  const speed = randomInRange(config.speedRange[0], config.speedRange[1]);
  const opacityRef = useRef(randomInRange(config.opacityRange[0], config.opacityRange[1]));
  const opacity = opacityRef.current;
  const tilt = randomInRange(config.tiltRange[0], config.tiltRange[1]);
  
  const translateY = useRef(new Animated.Value(height + size)).current;
  const rotate = useRef(new Animated.Value(tilt)).current;
  
  useEffect(() => {
    // Start animation - using JS driver for rotation support
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -size,
        duration: speed,
        useNativeDriver: false, // Using JS driver to support rotation interpolation
      }),
      // Subtle rotation animation for more organic feel
      Animated.sequence([
        Animated.timing(rotate, {
          toValue: tilt + randomInRange(-5, 5),
          duration: speed / 2,
          useNativeDriver: false,
        }),
        Animated.timing(rotate, {
          toValue: tilt,
          duration: speed / 2,
          useNativeDriver: false,
        }),
      ]),
    ]).start(() => {
      onComplete();
    });
  }, []);
  
  const rotateInterpolated = rotate.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });
  
  return (
    <Animated.View
      style={[
        styles.meepleContainer,
        {
          left: x - size / 2,
          width: size, // Explicitly set width to prevent any scaling
          height: size, // Explicitly set height to prevent any scaling
          opacity,
          transform: [
            { translateY },
            { rotate: rotateInterpolated },
            // Explicitly set scale to 1 to prevent any scaling
            { scaleX: 1 },
            { scaleY: 1 },
          ],
        },
      ]}
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
        <Path
          d={MEEPLE_PATH}
          fill={theme.colors.meepleRed}
        />
      </Svg>
    </Animated.View>
  );
};

const AnimatedBackground = ({ children, enabled = true }) => {
  const { width, height } = useWindowDimensions();
  const [particles, setParticles] = useState([]);
  const particleIdRef = useRef(0);
  const usedSegmentsRef = useRef(new Set());
  const spawnIntervalRef = useRef(null);
  const [animationEnabled, setAnimationEnabled] = useState(enabled);
  
  // Spawn rate: faster for smaller screens, slower for larger
  const getSpawnInterval = () => {
    const baseInterval = 800; // milliseconds
    const screenArea = width * height;
    const normalizedArea = screenArea / (1920 * 1080); // Normalize to 1080p
    return baseInterval * (1 + normalizedArea * 0.5); // Scale up for larger screens
  };
  
  const spawnMeeple = () => {
    if (!animationEnabled || width === 0 || height === 0) return;
    
    const layer = selectLayer();
    const x = getStratifiedX(width, usedSegmentsRef.current);
    const id = particleIdRef.current++;
    
    setParticles(prev => [...prev, { id, layer, x }]);
    
    // Remove segment from used set after a delay to allow reuse
    setTimeout(() => {
      // Find which segment this x belongs to
      const segmentIndex = Math.floor((x / width) * SEGMENT_COUNT);
      usedSegmentsRef.current.delete(segmentIndex);
    }, 2000);
  };
  
  const removeParticle = (id) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  };
  
  // Disable animation after 7 seconds
  useEffect(() => {
    if (!enabled) {
      setAnimationEnabled(false);
      return;
    }
    
    setAnimationEnabled(true);
    const timer = setTimeout(() => {
      setAnimationEnabled(false);
    }, 30000); // 30 seconds
    
    return () => {
      clearTimeout(timer);
    };
  }, [enabled]);
  
  useEffect(() => {
    if (!animationEnabled) {
      if (spawnIntervalRef.current) {
        clearInterval(spawnIntervalRef.current);
        spawnIntervalRef.current = null;
      }
      return;
    }
    
    // Initial spawn
    spawnMeeple();
    
    // Set up spawn interval
    const interval = getSpawnInterval();
    spawnIntervalRef.current = setInterval(spawnMeeple, interval);
    
      return () => {
        if (spawnIntervalRef.current) {
          clearInterval(spawnIntervalRef.current);
          spawnIntervalRef.current = null;
        }
      };
    }, [animationEnabled, width, height]);
  
  return (
    <View style={styles.container}>
      {/* Background layers */}
      {animationEnabled && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {particles.map(particle => (
            <MeepleParticle
              key={particle.id}
              layer={particle.layer}
              x={particle.x}
              width={width}
              height={height}
              onComplete={() => removeParticle(particle.id)}
            />
          ))}
        </View>
      )}
      
      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff', // White background instead of wood color
  },
  content: {
    flex: 1,
  },
  meepleContainer: {
    position: 'absolute',
    top: 0,
  },
});

export default AnimatedBackground;

