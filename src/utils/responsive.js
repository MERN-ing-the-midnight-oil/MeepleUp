import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

/**
 * Responsive breakpoints
 * These match common device sizes and provide consistent breakpoints across the app
 */
export const BREAKPOINTS = {
  xs: 0,      // Extra small devices (phones, < 576px)
  sm: 576,    // Small devices (landscape phones, ≥ 576px)
  md: 768,    // Medium devices (tablets, ≥ 768px)
  lg: 992,    // Large devices (desktops, ≥ 992px)
  xl: 1200,   // Extra large devices (large desktops, ≥ 1200px)
  xxl: 1400,  // Extra extra large devices (≥ 1400px)
};

/**
 * Hook to get responsive breakpoint information
 * Returns current breakpoint and boolean flags for each breakpoint
 * 
 * @returns {Object} Responsive information
 * @example
 * const { isMobile, isTablet, isDesktop, breakpoint } = useResponsive();
 */
export const useResponsive = () => {
  const [dimensions, setDimensions] = useState(() => {
    const { width } = Dimensions.get('window');
    return { width };
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions({ width: window.width });
    });

    return () => subscription?.remove();
  }, []);

  const width = dimensions.width;

  return {
    width,
    isMobile: width < BREAKPOINTS.md,
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isLargeDesktop: width >= BREAKPOINTS.xl,
    isExtraLargeDesktop: width >= BREAKPOINTS.xxl,
    breakpoint: 
      width >= BREAKPOINTS.xxl ? 'xxl' :
      width >= BREAKPOINTS.xl ? 'xl' :
      width >= BREAKPOINTS.lg ? 'lg' :
      width >= BREAKPOINTS.md ? 'md' :
      width >= BREAKPOINTS.sm ? 'sm' : 'xs',
  };
};

/**
 * Get responsive value based on breakpoint
 * 
 * @param {Object} values - Object with breakpoint keys and values
 * @param {number} width - Current width
 * @returns {*} The value for the current breakpoint
 * @example
 * const fontSize = getResponsiveValue({
 *   xs: 14,
 *   md: 16,
 *   lg: 18,
 * }, width);
 */
export const getResponsiveValue = (values, width) => {
  if (width >= BREAKPOINTS.xxl && values.xxl !== undefined) return values.xxl;
  if (width >= BREAKPOINTS.xl && values.xl !== undefined) return values.xl;
  if (width >= BREAKPOINTS.lg && values.lg !== undefined) return values.lg;
  if (width >= BREAKPOINTS.md && values.md !== undefined) return values.md;
  if (width >= BREAKPOINTS.sm && values.sm !== undefined) return values.sm;
  return values.xs !== undefined ? values.xs : Object.values(values)[0];
};

/**
 * Calculate number of columns for grid layouts
 * 
 * @param {number} width - Current width
 * @param {Object} options - Column configuration
 * @returns {number} Number of columns
 */
export const getColumnCount = (width, options = {}) => {
  const {
    mobile = 1,
    tablet = 2,
    desktop = 3,
    largeDesktop = 4,
  } = options;

  if (width >= BREAKPOINTS.xl) return largeDesktop;
  if (width >= BREAKPOINTS.lg) return desktop;
  if (width >= BREAKPOINTS.md) return tablet;
  return mobile;
};

/**
 * Get responsive spacing value
 * 
 * @param {number} width - Current width
 * @param {Object} spacing - Spacing configuration
 * @returns {number} Spacing value in pixels
 */
export const getResponsiveSpacing = (width, spacing = {}) => {
  return getResponsiveValue({
    xs: spacing.mobile || spacing.xs || 8,
    sm: spacing.sm || spacing.mobile || 12,
    md: spacing.tablet || spacing.md || 16,
    lg: spacing.desktop || spacing.lg || 20,
    xl: spacing.largeDesktop || spacing.xl || 24,
  }, width);
};

/**
 * Check if platform is web
 */
export const isWeb = Platform.OS === 'web';

/**
 * Check if platform is mobile (iOS or Android)
 */
export const isMobilePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

