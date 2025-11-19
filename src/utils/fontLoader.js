/**
 * Font Loader - Lazy loads Google Fonts as needed
 * Fonts are loaded on-demand when a game card needs to display a specific font
 * 
 * Note: React Native doesn't support dynamic imports, so we use static imports
 * and Font.loadAsync to load fonts on demand
 */

import * as Font from 'expo-font';
import { Platform } from 'react-native';

// Import all font packages statically (required for React Native)
// Bold/Geometric Sans
import * as BebasNeue from '@expo-google-fonts/bebas-neue';
import * as Anton from '@expo-google-fonts/anton';
import * as FrancoisOne from '@expo-google-fonts/francois-one';
import * as PassionOne from '@expo-google-fonts/passion-one';
import * as ArchivoBlack from '@expo-google-fonts/archivo-black';

// Medium Weight Sans
import * as Roboto from '@expo-google-fonts/roboto';
import * as Montserrat from '@expo-google-fonts/montserrat';
import * as Lato from '@expo-google-fonts/lato';
import * as Poppins from '@expo-google-fonts/poppins';
import * as Raleway from '@expo-google-fonts/raleway';

// Rounded/Friendly Sans
import * as Quicksand from '@expo-google-fonts/quicksand';
import * as Comfortaa from '@expo-google-fonts/comfortaa';
import * as Fredoka from '@expo-google-fonts/fredoka';
import * as Nunito from '@expo-google-fonts/nunito';

// Condensed
import * as RobotoCondensed from '@expo-google-fonts/roboto-condensed';
import * as BarlowCondensed from '@expo-google-fonts/barlow-condensed';
import * as FjallaOne from '@expo-google-fonts/fjalla-one';
import * as YanoneKaffeesatz from '@expo-google-fonts/yanone-kaffeesatz';

// Playful/Display
import * as Bangers from '@expo-google-fonts/bangers';
import * as PermanentMarker from '@expo-google-fonts/permanent-marker';
import * as TitanOne from '@expo-google-fonts/titan-one';
import * as Righteous from '@expo-google-fonts/righteous';
import * as LuckiestGuy from '@expo-google-fonts/luckiest-guy';

// Elegant Serif
import * as PlayfairDisplay from '@expo-google-fonts/playfair-display';
import * as Cinzel from '@expo-google-fonts/cinzel';
import * as Cormorant from '@expo-google-fonts/cormorant';
import * as LibreBaskerville from '@expo-google-fonts/libre-baskerville';
import * as Merriweather from '@expo-google-fonts/merriweather';

// Bold Serif
import * as AbrilFatface from '@expo-google-fonts/abril-fatface';
import * as AlfaSlabOne from '@expo-google-fonts/alfa-slab-one';
import * as BreeSerif from '@expo-google-fonts/bree-serif';

// Vintage/Retro
import * as SpecialElite from '@expo-google-fonts/special-elite';
import * as Staatliches from '@expo-google-fonts/staatliches';
import * as Audiowide from '@expo-google-fonts/audiowide';
import * as Monoton from '@expo-google-fonts/monoton';

// Script/Handwritten
import * as Pacifico from '@expo-google-fonts/pacifico';
import * as Caveat from '@expo-google-fonts/caveat';
import * as AmaticSC from '@expo-google-fonts/amatic-sc';

// Monospace/Pixel
import * as PressStart2P from '@expo-google-fonts/press-start-2p';
import * as SpaceMono from '@expo-google-fonts/space-mono';

// Font package mapping - maps Claude font names to their package exports
const FONT_PACKAGES = {
  'Bebas Neue': BebasNeue,
  'Anton': Anton,
  'Francois One': FrancoisOne,
  'Passion One': PassionOne,
  'Archivo Black': ArchivoBlack,
  'Roboto': Roboto,
  'Montserrat': Montserrat,
  'Lato': Lato,
  'Poppins': Poppins,
  'Raleway': Raleway,
  'Quicksand': Quicksand,
  'Comfortaa': Comfortaa,
  'Fredoka': Fredoka,
  'Nunito': Nunito,
  'Roboto Condensed': RobotoCondensed,
  'Barlow Condensed': BarlowCondensed,
  'Fjalla One': FjallaOne,
  'Yanone Kaffeesatz': YanoneKaffeesatz,
  'Bangers': Bangers,
  'Permanent Marker': PermanentMarker,
  'Titan One': TitanOne,
  'Righteous': Righteous,
  'Luckiest Guy': LuckiestGuy,
  'Playfair Display': PlayfairDisplay,
  'Cinzel': Cinzel,
  'Cormorant': Cormorant,
  'Libre Baskerville': LibreBaskerville,
  'Merriweather': Merriweather,
  'Abril Fatface': AbrilFatface,
  'Alfa Slab One': AlfaSlabOne,
  'Bree Serif': BreeSerif,
  'Special Elite': SpecialElite,
  'Staatliches': Staatliches,
  'Audiowide': Audiowide,
  'Monoton': Monoton,
  'Pacifico': Pacifico,
  'Caveat': Caveat,
  'Amatic SC': AmaticSC,
  'Press Start 2P': PressStart2P,
  'Space Mono': SpaceMono,
};

// Font family name mappings - maps Claude's font names to React Native font family names
const FONT_FAMILY_MAPPINGS = {
  'Bebas Neue': 'BebasNeue_400Regular',
  'Anton': 'Anton_400Regular',
  'Francois One': 'FrancoisOne_400Regular',
  'Passion One': 'PassionOne_400Regular',
  'Archivo Black': 'ArchivoBlack_400Regular',
  'Roboto': 'Roboto_400Regular',
  'Montserrat': 'Montserrat_400Regular',
  'Lato': 'Lato_400Regular',
  'Poppins': 'Poppins_400Regular',
  'Raleway': 'Raleway_400Regular',
  'Quicksand': 'Quicksand_400Regular',
  'Comfortaa': 'Comfortaa_400Regular',
  'Fredoka': 'Fredoka_400Regular',
  'Nunito': 'Nunito_400Regular',
  'Roboto Condensed': 'RobotoCondensed_400Regular',
  'Barlow Condensed': 'BarlowCondensed_400Regular',
  'Fjalla One': 'FjallaOne_400Regular',
  'Yanone Kaffeesatz': 'YanoneKaffeesatz_400Regular',
  'Bangers': 'Bangers_400Regular',
  'Permanent Marker': 'PermanentMarker_400Regular',
  'Titan One': 'TitanOne_400Regular',
  'Righteous': 'Righteous_400Regular',
  'Luckiest Guy': 'LuckiestGuy_400Regular',
  'Playfair Display': 'PlayfairDisplay_400Regular',
  'Cinzel': 'Cinzel_400Regular',
  'Cormorant': 'Cormorant_400Regular',
  'Libre Baskerville': 'LibreBaskerville_400Regular',
  'Merriweather': 'Merriweather_400Regular',
  'Abril Fatface': 'AbrilFatface_400Regular',
  'Alfa Slab One': 'AlfaSlabOne_400Regular',
  'Bree Serif': 'BreeSerif_400Regular',
  'Special Elite': 'SpecialElite_400Regular',
  'Staatliches': 'Staatliches_400Regular',
  'Audiowide': 'Audiowide_400Regular',
  'Monoton': 'Monoton_400Regular',
  'Pacifico': 'Pacifico_400Regular',
  'Caveat': 'Caveat_400Regular',
  'Amatic SC': 'AmaticSC_400Regular',
  'Press Start 2P': 'PressStart2P_400Regular',
  'Space Mono': 'SpaceMono_400Regular',
};

// Track which fonts are currently loading or loaded
const fontLoadingState = new Map(); // 'loading' | 'loaded' | 'error'

/**
 * Get the React Native font family name for a Claude font name
 * @param {string} claudeFontName - Font name from Claude (e.g., "Bebas Neue")
 * @returns {string|undefined} - React Native font family name or undefined
 */
export function getFontFamilyName(claudeFontName) {
  if (!claudeFontName || typeof claudeFontName !== 'string') {
    return undefined;
  }

  // Try exact match first
  const exactMatch = Object.keys(FONT_FAMILY_MAPPINGS).find(
    key => key.toLowerCase() === claudeFontName.toLowerCase()
  );

  if (exactMatch) {
    return FONT_FAMILY_MAPPINGS[exactMatch];
  }

  // Try partial match (e.g., "Bebas Neue" matches "Bebas Neue")
  const partialMatch = Object.keys(FONT_FAMILY_MAPPINGS).find(
    key => claudeFontName.toLowerCase().includes(key.toLowerCase()) ||
           key.toLowerCase().includes(claudeFontName.toLowerCase())
  );

  if (partialMatch) {
    return FONT_FAMILY_MAPPINGS[partialMatch];
  }

  return undefined;
}

/**
 * Load a font on-demand
 * @param {string} claudeFontName - Font name from Claude (e.g., "Bebas Neue")
 * @returns {Promise<boolean>} - True if font loaded successfully
 */
export async function loadFontOnDemand(claudeFontName) {
  if (!claudeFontName || typeof claudeFontName !== 'string') {
    return false;
  }

  // Find the font package to load
  const fontKey = Object.keys(FONT_PACKAGES).find(
    key => key.toLowerCase() === claudeFontName.toLowerCase()
  );

  if (!fontKey) {
    if (__DEV__) {
      console.log('[FontLoader] Font not found in packages:', claudeFontName);
    }
    return false;
  }

  // Check if already loaded or loading
  const state = fontLoadingState.get(fontKey);
  if (state === 'loaded') {
    return true;
  }
  if (state === 'loading') {
    // Wait for existing load to complete
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const currentState = fontLoadingState.get(fontKey);
        if (currentState === 'loaded') {
          clearInterval(checkInterval);
          resolve(true);
        } else if (currentState === 'error') {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 5000);
    });
  }

  // Mark as loading
  fontLoadingState.set(fontKey, 'loading');

  try {
    if (__DEV__) {
      console.log('[FontLoader] Loading font on demand:', fontKey);
    }

    // Get the font package (already imported statically)
    const fontPackage = FONT_PACKAGES[fontKey];
    
    // Get the font family name
    const fontFamilyName = getFontFamilyName(fontKey);
    if (!fontFamilyName) {
      throw new Error(`Font family name not found for: ${fontKey}`);
    }

    // Get the font constant from the package
    const fontConstant = fontPackage[fontFamilyName];
    if (!fontConstant) {
      throw new Error(`Font constant not found: ${fontFamilyName} in package for ${fontKey}`);
    }

    // Load the font using expo-font
    await Font.loadAsync({
      [fontFamilyName]: fontConstant,
    });

    fontLoadingState.set(fontKey, 'loaded');
    
    if (__DEV__) {
      console.log('[FontLoader] Font loaded successfully:', fontKey);
    }
    
    return true;
  } catch (error) {
    console.error('[FontLoader] Error loading font:', fontKey, error);
    fontLoadingState.set(fontKey, 'error');
    return false;
  }
}

/**
 * Check if a font is loaded
 * @param {string} claudeFontName - Font name from Claude
 * @returns {boolean} - True if font is loaded
 */
export function isFontLoaded(claudeFontName) {
  if (!claudeFontName || typeof claudeFontName !== 'string') {
    return false;
  }

  const fontKey = Object.keys(FONT_PACKAGES).find(
    key => key.toLowerCase() === claudeFontName.toLowerCase()
  );

  if (!fontKey) {
    return false;
  }

  return fontLoadingState.get(fontKey) === 'loaded';
}

/**
 * Get font family name for use in React Native styles
 * This will trigger lazy loading if needed
 * @param {string} claudeFontName - Font name from Claude
 * @returns {string|undefined} - Font family name or undefined
 */
export function getFontFamilyForStyle(claudeFontName) {
  return getFontFamilyName(claudeFontName);
}
