import React from 'react';
import { View, Text, StyleSheet, Platform, Image, useWindowDimensions } from 'react-native';
import { bggLogoSmall, bggLogoColor, bggLogoLarge, bggLogoExtraLarge, bggLogoBlack } from './BGGLogoAssets';
import { theme } from '../utils/theme';

/**
 * "Powered by BGG" Logo Component
 * Required for public-facing applications using BGG XML API
 * 
 * According to BGG API Terms of Use:
 * - Logo must be displayed and linked to BoardGameGeek
 * - Text must be easily legible
 * - Required for commercial/public-facing applications
 * 
 * Available sizes:
 * - 'small': SM logo (368x108) - compact mobile views
 * - 'medium': MED logo (736x216) - default mobile
 * - 'large': LG logo (1104x324) - tablets and web
 * - 'extraLarge' or 'xl': XL logo (1472x432) - web high-res displays
 * 
 * For web platforms, the component can auto-select larger sizes based on screen width.
 * 
 * @param {Object} props
 * @param {string} props.size - 'small', 'medium', 'large', 'extraLarge'/'xl', or 'auto' (default: 'auto')
 * @param {string} props.variant - 'color' or 'black' (default: 'color')
 * @param {boolean} props.showLogo - Whether to show logo or text only (default: true)
 * @param {boolean} props.autoSize - Auto-select size based on screen width (web only, default: false)
 * @param {number} props.containerWidth - Optional width for logo container (will scale logo to fit)
 * @param {Object} props.style - Additional styles for container
 * @param {Object} props.textStyle - Additional styles for text
 * @param {number|Object} props.logoSource - Optional logo source (overrides variant and size)
 * @param {boolean} props.stackedCards - Whether to display as stacked cards (default: false)
 */
const PoweredByBGG = ({ 
  style, 
  textStyle, 
  size = 'auto', 
  variant = 'color', 
  showLogo = true,
  autoSize = false,
  containerWidth = null,
  logoSource: providedLogoSource = null,
  stackedCards = false
}) => {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  // Get the appropriate logo source based on size and variant
  const getLogoSource = (logoSize, logoVariant) => {
    // If specific logo source provided, use it
    if (providedLogoSource) {
      return providedLogoSource;
    }

    // Auto-select size for web if autoSize is enabled
    let effectiveSize = logoSize;
    if (autoSize && isWeb && logoSize === 'auto') {
      if (width >= 1920) {
        effectiveSize = 'extraLarge';
      } else if (width >= 1280) {
        effectiveSize = 'large';
      } else if (width >= 768) {
        effectiveSize = 'medium';
      } else {
        effectiveSize = 'small';
      }
    } else if (logoSize === 'auto') {
      effectiveSize = 'medium'; // Default to medium
    }

    // Select logo based on variant and size
    if (logoVariant === 'black' && bggLogoBlack) {
      return bggLogoBlack;
    }

    // Color variant - select by size
    switch (effectiveSize) {
      case 'small':
      case 'sm':
        return bggLogoSmall;
      case 'large':
      case 'lg':
        return bggLogoLarge;
      case 'extraLarge':
      case 'xl':
        return bggLogoExtraLarge;
      case 'medium':
      case 'med':
      default:
        return bggLogoColor;
    }
  };

  const logoSource = showLogo ? getLogoSource(size, variant) : null;

  // Size variants for logo display height (used when containerWidth is not provided)
  const sizeStyles = {
    small: {
      fontSize: 10,
      padding: 4,
      logoHeight: 16,
    },
    medium: {
      fontSize: 12,
      padding: 6,
      logoHeight: 20,
    },
    large: {
      fontSize: 14,
      padding: 8,
      logoHeight: 28,
    },
    extraLarge: {
      fontSize: 16,
      padding: 10,
      logoHeight: 36,
    },
  };

  // Determine effective size for styling
  let effectiveSizeForStyle = size;
  if (size === 'auto') {
    if (autoSize && isWeb) {
      if (width >= 1920) effectiveSizeForStyle = 'extraLarge';
      else if (width >= 1280) effectiveSizeForStyle = 'large';
      else if (width >= 768) effectiveSizeForStyle = 'medium';
      else effectiveSizeForStyle = 'small';
    } else {
      effectiveSizeForStyle = 'medium';
    }
  }

  // Normalize size names
  if (effectiveSizeForStyle === 'sm') effectiveSizeForStyle = 'small';
  if (effectiveSizeForStyle === 'med') effectiveSizeForStyle = 'medium';
  if (effectiveSizeForStyle === 'lg') effectiveSizeForStyle = 'large';
  if (effectiveSizeForStyle === 'xl') effectiveSizeForStyle = 'extraLarge';

  const currentSizeStyle = sizeStyles[effectiveSizeForStyle] || sizeStyles.medium;

  // If stackedCards is true, render the stacked cards version
  if (stackedCards) {
    // Calculate card dimensions based on logo size with padding
    const LOGO_ASPECT_RATIO = 1472 / 432; // BGG logo aspect ratio
    const PADDING_PERCENT = 0.03; // 3% padding around logo (small percentage)
    
    let cardWidth, cardHeight, logoWidth, padding;
    
    if (containerWidth) {
      // Use containerWidth as the base, calculate padding as percentage
      padding = containerWidth * PADDING_PERCENT;
      logoWidth = containerWidth - (padding * 2);
      cardWidth = containerWidth;
      cardHeight = (logoWidth / LOGO_ASPECT_RATIO) + (padding * 2);
    } else {
      // Fallback: use logo height to calculate dimensions
      const logoHeight = currentSizeStyle.logoHeight;
      logoWidth = logoHeight * LOGO_ASPECT_RATIO;
      padding = logoWidth * PADDING_PERCENT;
      cardWidth = logoWidth + (padding * 2);
      cardHeight = logoHeight + (padding * 2);
    }
    
    const cardStyle = {
      width: cardWidth,
      height: cardHeight,
      padding: padding,
    };
    
    return (
      <View style={[styles.stackedCardsContainer, style, { width: cardWidth, height: cardHeight }]}>
        {/* Bottom card - slight negative rotation */}
        <View style={[styles.stackedCard, styles.stackedCardBottom, cardStyle]} />
        {/* Middle card - slight rotation */}
        <View style={[styles.stackedCard, styles.stackedCardMiddle, cardStyle]} />
        {/* Top card with logo - 4 degree rotation */}
        <View
          style={[styles.stackedCard, styles.stackedCardTop, cardStyle]}
        >
          {logoSource ? (
            <View style={styles.logoContainer}>
              <Image
                source={logoSource}
                style={[
                  styles.logo,
                  containerWidth 
                    ? { width: logoWidth, height: undefined, aspectRatio: LOGO_ASPECT_RATIO }
                    : { width: logoWidth, height: undefined, aspectRatio: LOGO_ASPECT_RATIO },
                ]}
                resizeMode="contain"
              />
            </View>
          ) : (
            <Text style={[styles.text, currentSizeStyle, textStyle]}>
              Powered by{' '}
              <Text style={styles.bggText}>BoardGameGeek</Text>
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, style]}
    >
      {logoSource ? (
        <View style={styles.logoContainer}>
          <Image
            source={logoSource}
            style={[
              styles.logo,
              containerWidth 
                ? { width: containerWidth, height: undefined, aspectRatio: 1472 / 432 } // Logo aspect ratio (based on XL)
                : { height: currentSizeStyle.logoHeight },
            ]}
            resizeMode="contain"
          />
        </View>
      ) : (
        <Text style={[styles.text, currentSizeStyle, textStyle]}>
          Powered by{' '}
          <Text style={styles.bggText}>BoardGameGeek</Text>
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    resizeMode: 'contain',
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
  stackedCardsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stackedCard: {
    position: 'absolute',
    backgroundColor: '#b89d7a', // Cardboard tan/brown color - same as membershipsToken
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    // Thicker borders on bottom and left for depth - same as membershipsToken
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#6b5435', // Darker brown border
    borderStyle: 'solid',
  },
  stackedCardBottom: {
    // Bottom card - slight negative rotation (-2 degrees)
    transform: [{ rotate: '-2deg' }],
    zIndex: 1,
    top: 8,
    left: 4,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  stackedCardMiddle: {
    // Middle card - slight rotation (1 degree)
    transform: [{ rotate: '1deg' }],
    zIndex: 2,
    top: 4,
    left: 2,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  stackedCardTop: {
    // Top card - 4 degree rotation as specified
    transform: [{ rotate: '4deg' }],
    zIndex: 3,
    top: 0,
    left: 0,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
});

export default PoweredByBGG;