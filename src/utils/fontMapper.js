/**
 * Font mapping utility for React Native
 * Maps common font names to React Native compatible font families
 * 
 * For React Native, we use system fonts and common font families.
 * Custom fonts can be added via expo-font if needed.
 */

import { Platform } from 'react-native';

/**
 * Maps a font name to a React Native compatible font family
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

  // Sans-serif fonts
  const sansSerifFonts = {
    'arial': Platform.OS === 'ios' ? 'Arial' : undefined, // iOS has Arial, Android uses system
    'helvetica': Platform.OS === 'ios' ? 'Helvetica' : undefined, // iOS has Helvetica
    'helvetica neue': Platform.OS === 'ios' ? 'Helvetica Neue' : undefined, // iOS has Helvetica Neue
    'futura': Platform.OS === 'ios' ? 'Futura' : undefined,
    'gill sans': Platform.OS === 'ios' ? 'Gill Sans' : undefined,
    'verdana': Platform.OS === 'ios' ? 'Verdana' : undefined,
    'trebuchet ms': Platform.OS === 'ios' ? 'Trebuchet MS' : undefined,
    'tahoma': Platform.OS === 'ios' ? 'Tahoma' : undefined,
    'roboto': Platform.OS === 'android' ? 'Roboto' : undefined,
    'open sans': undefined, // System default sans-serif
    'lato': undefined, // System default sans-serif
    'montserrat': undefined, // System default sans-serif
    'myriad': Platform.OS === 'ios' ? 'Myriad Pro' : undefined,
    'optima': Platform.OS === 'ios' ? 'Optima' : undefined,
    'avenir': Platform.OS === 'ios' ? 'Avenir' : undefined,
    'avenir next': Platform.OS === 'ios' ? 'Avenir Next' : undefined,
  };

  // Serif fonts
  const serifFonts = {
    'times': Platform.OS === 'ios' ? 'Times' : 'serif',
    'times new roman': Platform.OS === 'ios' ? 'Times New Roman' : 'serif',
    'georgia': Platform.OS === 'ios' ? 'Georgia' : 'serif',
    'garamond': Platform.OS === 'ios' ? 'Garamond' : 'serif',
    'baskerville': Platform.OS === 'ios' ? 'Baskerville' : 'serif',
    'palatino': Platform.OS === 'ios' ? 'Palatino' : 'serif',
    'bookman': Platform.OS === 'ios' ? 'Bookman' : 'serif',
    'caslon': Platform.OS === 'ios' ? 'Baskerville' : 'serif', // Similar to Caslon
  };

  // Display/Decorative fonts
  const displayFonts = {
    'impact': Platform.OS === 'ios' ? 'Impact' : undefined,
    'bebas neue': undefined, // System default with bold weight
    'oswald': undefined, // System default with bold weight
    'league gothic': undefined, // System default with bold weight
    'anton': undefined, // System default with bold weight
    'bebas': undefined, // System default with bold weight
    'copperplate': Platform.OS === 'ios' ? 'Copperplate' : undefined,
    'papyrus': Platform.OS === 'ios' ? 'Papyrus' : undefined,
    'chalkduster': Platform.OS === 'ios' ? 'Chalkduster' : undefined,
    'marker felt': Platform.OS === 'ios' ? 'Marker Felt' : undefined,
    'american typewriter': Platform.OS === 'ios' ? 'American Typewriter' : undefined,
  };

  // Monospace fonts
  const monospaceFonts = {
    'courier': Platform.OS === 'ios' ? 'Courier' : 'monospace',
    'courier new': Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    'monaco': Platform.OS === 'ios' ? 'Monaco' : 'monospace',
    'consolas': Platform.OS === 'ios' ? 'Courier' : 'monospace', // Similar to Consolas
    'menlo': Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  };

  // Check all font categories
  if (sansSerifFonts[normalizedName] !== undefined) {
    return sansSerifFonts[normalizedName];
  }
  if (serifFonts[normalizedName] !== undefined) {
    return serifFonts[normalizedName];
  }
  if (displayFonts[normalizedName] !== undefined) {
    return displayFonts[normalizedName];
  }
  if (monospaceFonts[normalizedName] !== undefined) {
    return monospaceFonts[normalizedName];
  }

  // Handle category names (e.g., "Display/Decorative", "Sans-serif", etc.)
  // Normalize by removing slashes and spaces
  const categoryName = normalizedName.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  
  // Partial matches for common font patterns
  if (categoryName.includes('serif') || categoryName.includes('roman')) {
    return Platform.OS === 'ios' ? 'Times New Roman' : 'serif';
  }
  if (categoryName.includes('sans')) {
    return undefined; // System default sans-serif
  }
  if (categoryName.includes('mono') || categoryName.includes('code')) {
    return Platform.OS === 'ios' ? 'Courier' : 'monospace';
  }
  if (categoryName.includes('display') || categoryName.includes('decorative') || categoryName.includes('bold')) {
    // For display/decorative fonts, return undefined but shouldUseBoldWeight will handle the bold styling
    return undefined; // System default with bold weight
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
  const boldKeywords = ['impact', 'bebas', 'oswald', 'anton', 'league gothic', 'display', 'decorative', 'bold', 'black'];

  return boldKeywords.some(keyword => normalizedName.includes(keyword));
};

