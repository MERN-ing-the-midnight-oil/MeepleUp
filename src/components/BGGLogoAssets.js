/**
 * BGG Logo Assets
 * 
 * This file exports BGG logo images in various sizes for use in the PoweredByBGG component.
 * 
 * Available sizes (PNG with transparent backgrounds):
 * - SM: 368x108 (3.9KB) - Small, for mobile compact views
 * - MED: 736x216 (7.9KB) - Medium, default for mobile
 * - LG: 1104x324 (12KB) - Large, for tablets and web
 * - XL: 1472x432 (18KB) - Extra Large, for web high-res displays
 * 
 * All logos use PNG format with transparent backgrounds for better visual integration.
 */

// Export all available logo sizes (PNG with transparency)
export const bggLogoSmall = require('../../assets/images/bgg-logo-small.png'); // 368x108
export const bggLogoColor = require('../../assets/images/bgg-logo-color.png'); // 736x216 (MED - default)
export const bggLogoLarge = require('../../assets/images/bgg-logo-large.png'); // 1104x324
export const bggLogoExtraLarge = require('../../assets/images/bgg-logo-extra-large.png'); // 1472x432

// Black variants (if available in the future)
export const bggLogoBlack = null;