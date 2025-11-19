/**
 * Font mapping utility for React Native
 * Maps common font names to React Native compatible font families
 * 
 * Uses Google Fonts loaded on-demand via expo-google-fonts packages
 */

import { Platform } from 'react-native';
import { getFontFamilyName, loadFontOnDemand } from './fontLoader';

/**
 * Maps a font name to a React Native compatible font family
 * Also triggers lazy loading of the font if needed
 * @param {string} fontName - The font name identified by Claude
 * @returns {string|undefined} - React Native compatible font family, or undefined for system default
 */
export const mapFontNameToFamily = (fontName) => {
  if (!fontName || typeof fontName !== 'string') {
    return undefined;
  }

  // Clean the font name - remove any invalid characters that could cause crashes
  const cleanedName = fontName.trim();
  if (cleanedName.length === 0) {
    return undefined;
  }

  const normalizedName = cleanedName.toLowerCase();

  // First, try to get the font family name from Google Fonts
  const fontFamilyName = getFontFamilyName(cleanedName);
  
  if (fontFamilyName) {
    // Trigger lazy loading in the background (don't wait for it)
    loadFontOnDemand(cleanedName).catch(error => {
      if (__DEV__) {
        console.warn('[fontMapper] Error loading font on demand:', cleanedName, error);
      }
    });
    return fontFamilyName;
  }

  // Fallback to legacy system fonts for fonts not in our Google Fonts list
  const legacyFonts = {
    'arial': Platform.OS === 'ios' ? 'Arial' : undefined,
    'helvetica': Platform.OS === 'ios' ? 'Helvetica' : undefined,
    'helvetica neue': Platform.OS === 'ios' ? 'Helvetica Neue' : undefined,
    'futura': Platform.OS === 'ios' ? 'Futura' : undefined,
    'gill sans': Platform.OS === 'ios' ? 'Gill Sans' : undefined,
    'verdana': Platform.OS === 'ios' ? 'Verdana' : undefined,
    'trebuchet ms': Platform.OS === 'ios' ? 'Trebuchet MS' : undefined,
    'tahoma': Platform.OS === 'ios' ? 'Tahoma' : undefined,
    'times': Platform.OS === 'ios' ? 'Times' : 'serif',
    'times new roman': Platform.OS === 'ios' ? 'Times New Roman' : 'serif',
    'georgia': Platform.OS === 'ios' ? 'Georgia' : 'serif',
    'garamond': Platform.OS === 'ios' ? 'Garamond' : 'serif',
    'baskerville': Platform.OS === 'ios' ? 'Baskerville' : 'serif',
    'palatino': Platform.OS === 'ios' ? 'Palatino' : 'serif',
    'impact': Platform.OS === 'ios' ? 'Impact' : undefined,
    'copperplate': Platform.OS === 'ios' ? 'Copperplate' : undefined,
    'courier': Platform.OS === 'ios' ? 'Courier' : 'monospace',
    'courier new': Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  };

  if (legacyFonts[normalizedName] !== undefined) {
    return legacyFonts[normalizedName];
  }

  // Handle category names (e.g., "Display/Decorative", "Sans-serif", etc.)
  const categoryName = normalizedName.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  
  if (categoryName.includes('serif') || categoryName.includes('roman')) {
    return Platform.OS === 'ios' ? 'Times New Roman' : 'serif';
  }
  if (categoryName.includes('mono') || categoryName.includes('code')) {
    return Platform.OS === 'ios' ? 'Courier' : 'monospace';
  }

  // Default: return undefined to use system default font
  if (__DEV__) {
    console.log('[fontMapper] Font not found in mapping:', fontName, '- using system default');
  }
  return undefined;
};

/**
 * Determines if a font should be rendered with bold weight
 * @param {string} fontName - The font name
 * @returns {boolean} - Whether to apply bold weight
 */
export const shouldUseBoldWeight = (fontName) => {
  if (!fontName || typeof fontName !== 'string') {
    return false;
  }

  const normalizedName = fontName.toLowerCase().trim();
  
  // Expanded list of bold/display fonts from our 40-font list
  const boldKeywords = [
    // Bold/Geometric Sans
    'bebas neue', 'anton', 'francois one', 'passion one', 'archivo black',
    // Condensed
    'fjalla one',
    // Playful/Display
    'bangers', 'permanent marker', 'titan one', 'righteous', 'luckiest guy',
    // Bold Serif
    'abril fatface', 'alfa slab one', 'bree serif',
    // Vintage/Retro
    'staatliches', 'audiowide', 'monoton',
    // Legacy
    'impact', 'bebas', 'oswald', 'league gothic', 'display', 'decorative', 'bold', 'black'
  ];

  return boldKeywords.some(keyword => normalizedName.includes(keyword));
};

