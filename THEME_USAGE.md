# MeepleUp Theme Usage Guide

## Overview

The MeepleUp app now uses a unified Eurogame-inspired theme that works for both:
- **Web components** (using CSS classes in `index.css`)
- **React Native components** (using StyleSheet with theme values from `src/utils/theme.js`)

## Using the Theme in React Native Components

### Basic Import

```javascript
import { theme, commonStyles } from '../utils/theme';
```

### Using Colors

```javascript
import { theme } from '../utils/theme';

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bgColor,
    borderColor: theme.colors.woodMedium,
  },
  text: {
    color: theme.colors.textPrimary,
  },
  errorText: {
    color: theme.colors.error, // or theme.colors.meepleRed
  },
});
```

### Using Spacing

```javascript
import { theme } from '../utils/theme';

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
});
```

### Using Typography

```javascript
import { theme } from '../utils/theme';

const styles = StyleSheet.create({
  heading: {
    fontSize: theme.typography.fontSize.h1,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  body: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
  },
});
```

### Using Common Styles

The theme includes pre-defined common styles for buttons, cards, inputs, and text:

```javascript
import { commonStyles } from '../utils/theme';

const styles = StyleSheet.create({
  button: {
    ...commonStyles.button,
    ...commonStyles.buttonPrimary,
  },
  buttonText: {
    ...commonStyles.buttonText,
  },
  card: {
    ...commonStyles.card,
  },
  input: {
    ...commonStyles.input,
  },
});
```

### Using Shadows

```javascript
import { theme } from '../utils/theme';

const styles = StyleSheet.create({
  card: {
    ...theme.shadows.card,
  },
  button: {
    ...theme.shadows.soft,
  },
});
```

## Theme Colors Reference

### Primary Colors
- `meepleRed`: `#c0392b` - Primary action color
- `meepleYellow`: `#f1c40f` - Accent/highlight color
- `feltGreen`: `#3a5f3a` - Secondary actions

### Wood Tones
- `woodLight`: `#e9dcc4` - Navigation backgrounds
- `woodMedium`: `#c9b79c` - Borders
- `woodDark`: `#8e7a63` - Dark wood accents

### Text Colors
- `textPrimary`: `#2b2b2b` - Main text
- `textSecondary`: `#6f6f6f` - Secondary text
- `inkBlack`: `#1f1f1f` - Dark text

### Surfaces
- `bgColor`: `#f4f1ec` - Page background (paper texture)
- `surfaceColor`: `#ffffff` - Card/container backgrounds
- `cardSurface`: `#fffdf9` - Card backgrounds

### Legacy Aliases (for compatibility)
- `primary`: Same as `meepleRed`
- `secondary`: Same as `feltGreen`
- `error`: Same as `meepleRed`
- `success`: `#4a7c4a`
- `border`: Same as `woodMedium`

## Updated Components

The following components have been updated to use the new theme:
- ✅ `Button` - Uses theme colors and common styles
- ✅ `Input` - Uses theme colors with focus states
- ✅ `LoadingSpinner` - Uses theme colors

## Migration Guide

To update existing components:

1. **Import the theme:**
   ```javascript
   import { theme, commonStyles } from '../utils/theme';
   ```

2. **Replace hardcoded colors:**
   ```javascript
   // Before
   backgroundColor: '#4a90e2',
   
   // After
   backgroundColor: theme.colors.meepleRed,
   ```

3. **Replace hardcoded spacing:**
   ```javascript
   // Before
   padding: 12,
   
   // After
   padding: theme.spacing.md,
   ```

4. **Use common styles where applicable:**
   ```javascript
   // Instead of defining button styles from scratch
   button: {
     ...commonStyles.button,
     ...commonStyles.buttonPrimary,
   },
   ```

## CSS Variables (Web)

For web components using CSS classes, the same values are available as CSS variables in `index.css`:

```css
.my-component {
  background-color: var(--meeple-red);
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
}
```

## Questions?

Refer to `src/utils/theme.js` for the complete theme definition and all available values.

