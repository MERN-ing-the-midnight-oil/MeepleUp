# Font Utilities Backup

This folder contains font-related utilities that were used for AI-generated game card styling with custom fonts.

## Files

- **fontLoader.js** - Lazy loads Google Fonts on-demand when games need specific fonts
- **fontMapper.js** - Maps font names to React Native compatible font families

## When These Were Used

These utilities were part of the Claude AI-generated collection management system, where:
- Claude would analyze game box art and extract styling information (colors, fonts)
- The app would load custom Google Fonts to match the game's visual style
- Game cards would display with AI-extracted colors and fonts instead of thumbnails

## Current Status

As of the BGG API integration, we've switched to:
- Using BGG thumbnails/images instead of AI-generated styled cards
- Standard game cards with BGG thumbnail images (2 per row, tall format)
- No longer need custom font loading

## Related Backup Files

- `src/components/GameCard.styled.jsx` - The full AI-styled GameCard component backup

## Restoring

If you need to restore the AI styling system:
1. Move these files back to `src/utils/`
2. Restore `GameCard.styled.jsx` as `GameCard.jsx`
3. Update imports in components that use these utilities

