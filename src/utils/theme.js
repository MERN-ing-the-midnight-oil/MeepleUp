/**
 * MeepleUp Eurogame Theme
 * 
 * This theme matches the CSS variables in index.css
 * Use this for React Native StyleSheet components
 */

export const theme = {
  // Eurogame-inspired palette
  colors: {
    meepleRed: '#c0392b',
    meepleYellow: '#f1c40f',
    woodLight: '#e9dcc4',
    woodMedium: '#c9b79c',
    woodDark: '#8e7a63',
    feltGreen: '#3a5f3a',
    inkBlack: '#1f1f1f',
    textPrimary: '#2b2b2b',
    textSecondary: '#6f6f6f',
    
    // Surfaces
    bgColor: '#d4b896', // Wood table base color
    surfaceColor: '#ffffff',
    cardSurface: '#fffdf9',
    
    // Legacy aliases for compatibility
    primary: '#c0392b', // meeple-red
    primaryDark: '#a02d22',
    secondary: '#3a5f3a', // felt-green
    accent: '#f1c40f', // meeple-yellow
    success: '#4a7c4a',
    warning: '#f1c40f', // meeple-yellow
    error: '#c0392b', // meeple-red
    border: '#c9b79c', // wood-medium
  },
  
  // Spacing (in pixels for React Native)
  spacing: {
    xs: 4,    // 0.25rem
    sm: 8,    // 0.5rem
    md: 12,   // 0.75rem - reduced for mobile tightness
    lg: 16,   // 1rem
    xl: 24,   // 1.5rem
    '2xl': 32, // 2rem
  },
  
  // Typography
  typography: {
    fontFamily: {
      // Graphik font - use system fonts as fallback for React Native
      default: 'System', // iOS/Android will use system font
      web: "'Graphik', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
    },
    fontSize: {
      xs: 12,    // 0.75rem
      sm: 14,    // 0.875rem
      base: 16,  // 1rem
      lg: 18,    // 1.125rem
      xl: 20,    // 1.25rem
      '2xl': 25.6, // 1.6rem
      h1: 28.8,  // 1.8rem
      h2: 22.4,  // 1.4rem
      h3: 19.2,  // 1.2rem
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.6,
    },
  },
  
  // Border radius
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 16, // chunky card corners
    circle: 9999,
  },
  
  // Shadows - removed for flat design
  shadows: {
    soft: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0, // Android
    },
    card: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0, // Android
    },
    press: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0, // Android
    },
  },
};

// Helper function to get spacing value
export const getSpacing = (size) => theme.spacing[size] || theme.spacing.md;

// Helper function to get color value
export const getColor = (color) => {
  if (color.includes('.')) {
    const [category, key] = color.split('.');
    return theme[category]?.[key] || color;
  }
  return theme.colors[color] || color;
};

// Pre-defined style helpers for common patterns
export const commonStyles = {
  // Button variants
  button: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.meepleRed,
  },
  buttonSecondary: {
    backgroundColor: theme.colors.feltGreen,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.feltGreen,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  buttonTextOutline: {
    color: theme.colors.feltGreen,
  },
  
  // Card styles - flat design with subtle border
  card: {
    backgroundColor: theme.colors.cardSurface,
    borderRadius: 0, // Cards should have no rounded corners
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(201, 183, 156, 0.5)', // Subtle border for definition
    // No shadows for flat design
  },
  
  // Input styles
  input: {
    borderWidth: 2,
    borderColor: theme.colors.woodMedium,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceColor,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
  },
  inputFocused: {
    borderColor: theme.colors.meepleRed,
  },
  
  // Text styles
  textPrimary: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.fontSize.base,
  },
  textSecondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
  heading1: {
    fontSize: theme.typography.fontSize.h1,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: theme.typography.fontSize.h1 * theme.typography.lineHeight.tight,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  heading2: {
    fontSize: theme.typography.fontSize.h2,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: theme.typography.fontSize.h2 * theme.typography.lineHeight.tight,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  heading3: {
    fontSize: theme.typography.fontSize.h3,
    fontWeight: theme.typography.fontWeight.semibold,
    lineHeight: theme.typography.fontSize.h3 * theme.typography.lineHeight.tight,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
};

export default theme;

