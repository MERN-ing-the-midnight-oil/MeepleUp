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

// Heavy/Bold Sans-Serif
import * as Bangers from '@expo-google-fonts/bangers';
import * as TitanOne from '@expo-google-fonts/titan-one';
import * as Bungee from '@expo-google-fonts/bungee';
import * as BlackOpsOne from '@expo-google-fonts/black-ops-one';
import * as Righteous from '@expo-google-fonts/righteous';

// Condensed/Narrow
import * as BebasNeue from '@expo-google-fonts/bebas-neue';
import * as Oswald from '@expo-google-fonts/oswald';
import * as FjallaOne from '@expo-google-fonts/fjalla-one';
import * as Antonio from '@expo-google-fonts/antonio';
import * as PathwayGothicOne from '@expo-google-fonts/pathway-gothic-one';

// Rounded/Circular
import * as Fredoka from '@expo-google-fonts/fredoka';
import * as BubblegumSans from '@expo-google-fonts/bubblegum-sans';
import * as Signika from '@expo-google-fonts/signika';
import * as VarelaRound from '@expo-google-fonts/varela-round';
import * as Comfortaa from '@expo-google-fonts/comfortaa';

// Script/Cursive (Connected Strokes)
import * as Kalam from '@expo-google-fonts/kalam';
import * as Satisfy from '@expo-google-fonts/satisfy';
import * as Caveat from '@expo-google-fonts/caveat';
import * as ShadowsIntoLight from '@expo-google-fonts/shadows-into-light';

// Display Serif (High Contrast)
import * as Cinzel from '@expo-google-fonts/cinzel';
import * as PlayfairDisplay from '@expo-google-fonts/playfair-display';
import * as AbrilFatface from '@expo-google-fonts/abril-fatface';
import * as BodoniModa from '@expo-google-fonts/bodoni-moda';
import * as YesevaOne from '@expo-google-fonts/yeseva-one';

// Old Style/Medieval Serif
import * as MedievalSharp from '@expo-google-fonts/medievalsharp';
import * as IMFellDWPica from '@expo-google-fonts/im-fell-dw-pica';
import * as CrimsonText from '@expo-google-fonts/crimson-text';

// Slab Serif (Blocky)
import * as CreteRound from '@expo-google-fonts/crete-round';
import * as ZillaSlab from '@expo-google-fonts/zilla-slab';
import * as BreeSerif from '@expo-google-fonts/bree-serif';

// Decorative/Ornamental
import * as Creepster from '@expo-google-fonts/creepster';
import * as Eater from '@expo-google-fonts/eater';
import * as Rye from '@expo-google-fonts/rye';
import * as PressStart2P from '@expo-google-fonts/press-start-2p';
import * as BungeeShade from '@expo-google-fonts/bungee-shade';

// Stencil (Disconnected Strokes)
import * as Sarpanch from '@expo-google-fonts/sarpanch';
import * as SairaStencilOne from '@expo-google-fonts/saira-stencil-one';
import * as Wallpoet from '@expo-google-fonts/wallpoet';

// Expanded/Wide
import * as ConcertOne from '@expo-google-fonts/concert-one';
import * as Arvo from '@expo-google-fonts/arvo';
import * as ChangaOne from '@expo-google-fonts/changa-one';

// Handwritten/Marker
import * as PermanentMarker from '@expo-google-fonts/permanent-marker';
import * as IndieFlower from '@expo-google-fonts/indie-flower';
import * as PatrickHand from '@expo-google-fonts/patrick-hand';

// Monospace
import * as CourierPrime from '@expo-google-fonts/courier-prime';
import * as SpaceMono from '@expo-google-fonts/space-mono';

// Font package mapping - maps Claude font names to their package exports
const FONT_PACKAGES = {
  // Heavy/Bold Sans-Serif
  'Bangers': Bangers,
  'Titan One': TitanOne,
  'Bungee': Bungee,
  'Black Ops One': BlackOpsOne,
  'Righteous': Righteous,
  // Condensed/Narrow
  'Bebas Neue': BebasNeue,
  'Oswald': Oswald,
  'Fjalla One': FjallaOne,
  'Antonio': Antonio,
  'Pathway Gothic One': PathwayGothicOne,
  // Rounded/Circular
  'Fredoka': Fredoka,
  'Bubblegum Sans': BubblegumSans,
  'Signika': Signika,
  'Varela Round': VarelaRound,
  'Comfortaa': Comfortaa,
  // Script/Cursive
  'Kalam': Kalam,
  'Satisfy': Satisfy,
  'Caveat': Caveat,
  'Shadows Into Light': ShadowsIntoLight,
  // Display Serif
  'Cinzel': Cinzel,
  'Playfair Display': PlayfairDisplay,
  'Abril Fatface': AbrilFatface,
  'Bodoni Moda': BodoniModa,
  'Yeseva One': YesevaOne,
  // Old Style/Medieval Serif
  'MedievalSharp': MedievalSharp,
  'IM Fell DW Pica': IMFellDWPica,
  'Crimson Text': CrimsonText,
  // Slab Serif
  'Crete Round': CreteRound,
  'Zilla Slab': ZillaSlab,
  'Bree Serif': BreeSerif,
  // Decorative/Ornamental
  'Creepster': Creepster,
  'Eater': Eater,
  'Rye': Rye,
  'Press Start 2P': PressStart2P,
  'Bungee Shade': BungeeShade,
  // Stencil
  'Sarpanch': Sarpanch,
  'Saira Stencil One': SairaStencilOne,
  'Wallpoet': Wallpoet,
  // Expanded/Wide
  'Concert One': ConcertOne,
  'Arvo': Arvo,
  'Changa One': ChangaOne,
  // Handwritten/Marker
  'Permanent Marker': PermanentMarker,
  'Indie Flower': IndieFlower,
  'Patrick Hand': PatrickHand,
  // Monospace
  'Courier Prime': CourierPrime,
  'Space Mono': SpaceMono,
};

// Font family name mappings - maps Claude's font names to React Native font family names
const FONT_FAMILY_MAPPINGS = {
  // Heavy/Bold Sans-Serif
  'Bangers': 'Bangers_400Regular',
  'Titan One': 'TitanOne_400Regular',
  'Bungee': 'Bungee_400Regular',
  'Black Ops One': 'BlackOpsOne_400Regular',
  'Righteous': 'Righteous_400Regular',
  // Condensed/Narrow
  'Bebas Neue': 'BebasNeue_400Regular',
  'Oswald': 'Oswald_400Regular',
  'Fjalla One': 'FjallaOne_400Regular',
  'Antonio': 'Antonio_400Regular',
  'Pathway Gothic One': 'PathwayGothicOne_400Regular',
  // Rounded/Circular
  'Fredoka': 'Fredoka_400Regular',
  'Bubblegum Sans': 'BubblegumSans_400Regular',
  'Signika': 'Signika_400Regular',
  'Varela Round': 'VarelaRound_400Regular',
  'Comfortaa': 'Comfortaa_400Regular',
  // Script/Cursive
  'Kalam': 'Kalam_400Regular',
  'Satisfy': 'Satisfy_400Regular',
  'Caveat': 'Caveat_400Regular',
  'Shadows Into Light': 'ShadowsIntoLight_400Regular',
  // Display Serif
  'Cinzel': 'Cinzel_400Regular',
  'Playfair Display': 'PlayfairDisplay_400Regular',
  'Abril Fatface': 'AbrilFatface_400Regular',
  'Bodoni Moda': 'BodoniModa_400Regular',
  'Yeseva One': 'YesevaOne_400Regular',
  // Old Style/Medieval Serif
  'MedievalSharp': 'MedievalSharp_400Regular',
  'IM Fell DW Pica': 'IMFellDWPica_400Regular',
  'Crimson Text': 'CrimsonText_400Regular',
  // Slab Serif
  'Crete Round': 'CreteRound_400Regular',
  'Zilla Slab': 'ZillaSlab_400Regular',
  'Bree Serif': 'BreeSerif_400Regular',
  // Decorative/Ornamental
  'Creepster': 'Creepster_400Regular',
  'Eater': 'Eater_400Regular',
  'Rye': 'Rye_400Regular',
  'Press Start 2P': 'PressStart2P_400Regular',
  'Bungee Shade': 'BungeeShade_400Regular',
  // Stencil
  'Sarpanch': 'Sarpanch_400Regular',
  'Saira Stencil One': 'SairaStencilOne_400Regular',
  'Wallpoet': 'Wallpoet_400Regular',
  // Expanded/Wide
  'Concert One': 'ConcertOne_400Regular',
  'Arvo': 'Arvo_400Regular',
  'Changa One': 'ChangaOne_400Regular',
  // Handwritten/Marker
  'Permanent Marker': 'PermanentMarker_400Regular',
  'Indie Flower': 'IndieFlower_400Regular',
  'Patrick Hand': 'PatrickHand_400Regular',
  // Monospace
  'Courier Prime': 'CourierPrime_400Regular',
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
