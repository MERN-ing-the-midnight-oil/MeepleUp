# Archived: Barcode Scanning Feature

This directory contains the archived barcode scanning functionality for MeepleUp.

## What Was Archived

- **BarcodeScanner.jsx** - React component for barcode scanning UI
- **BarcodeScanner.css** - Styles for the barcode scanner component
- **barcodeApi.js** - API functions for barcode lookup (RapidAPI, GameUPC)

## Why It Was Archived

The barcode scanning feature is not being used going forward, but was preserved for potential future use rather than being deleted entirely.

## Dependencies

The following dependencies may still be in `package.json` but are not actively used:
- `expo-barcode-scanner` - Expo barcode scanner package

## API Configuration

The following API configurations were used (may still exist in `src/config/api.js` but are commented out):
- RapidAPI Barcode Lookup API
- GameUPC API

## To Restore

If you want to restore this feature:

1. Move files back to their original locations:
   - `BarcodeScanner.jsx` → `src/components/BarcodeScanner.jsx`
   - `BarcodeScanner.css` → `src/components/BarcodeScanner.css`
   - `barcodeApi.js` → Extract functions back into `src/utils/api.js`

2. Uncomment barcode-related code in:
   - `src/utils/api.js` (barcode functions)
   - `src/config/api.js` (RapidAPI configuration)

3. Re-enable the component in `CollectionManagement.jsx` or wherever it was used

4. Ensure API keys are configured in environment variables

5. Test the integration with RapidAPI and GameUPC services

## Notes

- The camera permission in `app.json` may still reference barcode scanning, but it's also used for the Claude Vision game identification feature
- The `cleanScannerTitle` function may still be used elsewhere in the codebase


