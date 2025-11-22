import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform, Image, useWindowDimensions } from 'react-native';
import { bggLogoSmall, bggLogoColor, bggLogoLarge, bggLogoExtraLarge, bggLogoBlack } from './BGGLogoAssets';

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
 */
const PoweredByBGG = ({ 
  style, 
  textStyle, 
  size = 'auto', 
  variant = 'color', 
  showLogo = true,
  autoSize = false,
  containerWidth = null,
  logoSource: providedLogoSource = null 
}) => {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  const handlePress = () => {
    const url = 'https://boardgamegeek.com';
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open BGG URL:', err);
    });
  };

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

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, style]}
      accessibilityRole="link"
      accessibilityLabel="Visit BoardGameGeek"
      accessibilityHint="Opens BoardGameGeek website"
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
    </Pressable>
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
});

export default PoweredByBGG;