# MeepleUp Creation In-App Purchase Setup Guide

This guide will walk you through setting up one-time in-app purchases for creating meepleups on both iOS (App Store) and Android (Google Play Store).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [iOS Setup (App Store)](#ios-setup-app-store)
3. [Android Setup (Google Play)](#android-setup-google-play)
4. [Firebase Functions Setup](#firebase-functions-setup)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)

## Prerequisites

- Apple Developer Account (for iOS)
- Google Play Developer Account (for Android)
- Firebase project with Functions enabled
- Expo project configured

## iOS Setup (App Store)

### 1. Create In-App Purchase Product in App Store Connect

1. Log in to [App Store Connect](https://appstoreconnect.apple.com/)
2. Navigate to your app → **Features** → **In-App Purchases**
3. Click **+** to create a new in-app purchase
4. Select **Non-Consumable** (recommended) or **Consumable**:
   - **Non-Consumable**: User purchases once and can create unlimited meepleups
   - **Consumable**: User must purchase each time they want to create a meepleup
5. Fill in the product details:
   - **Product ID**: `com.rhyssmoker.meepleup.create` (or your preferred ID)
   - **Reference Name**: "Create MeepleUp" (internal name, not shown to users)
   - **Display Name**: "Create MeepleUp" (shown to users)
   - **Description**: "Unlock the ability to create and organize your own MeepleUp events"
   - **Price**: Set your desired price
6. **Important**: Update the product ID in `src/services/meepleupPurchaseService.js` to match your actual product ID:
   ```javascript
   export const MEEPLEUP_PURCHASE_PRODUCTS = {
     ios: 'com.rhyssmoker.meepleup.create', // Update this
     android: 'com.meepleup.app.create',
   };
   ```

### 2. Submit Product for Review

1. After creating the product, you'll need to submit it for review along with your app
2. The product must be approved before it can be purchased
3. This typically takes 24-48 hours

### 3. Get Shared Secret

1. In App Store Connect, go to **Users and Access** → **Keys**
2. Create or use an existing App Store Connect API key
3. Note the **Shared Secret** - you'll need this for Firebase Functions (same one used for subscriptions)

## Android Setup (Google Play)

### 1. Create In-App Product in Google Play Console

1. Log in to [Google Play Console](https://play.google.com/console/)
2. Select your app → **Monetize** → **Products** → **In-app products**
3. Click **Create product**
4. Fill in the product details:
   - **Product ID**: `com.meepleup.app.create` (or your preferred ID)
   - **Name**: "Create MeepleUp" (shown to users)
   - **Description**: "Unlock the ability to create and organize your own MeepleUp events"
   - **Price**: Set your desired price
   - **Status**: Set to "Active" when ready
5. **Important**: Update the product ID in `src/services/meepleupPurchaseService.js` to match your actual product ID

### 2. Set Up Service Account

1. In Google Cloud Console, create a service account (or use existing one from subscriptions)
2. Grant it the **Service Account User** role
3. Download the JSON key file
4. Store it securely (you'll need it for Firebase Functions)

## Firebase Functions Setup

### 1. Update Environment Variables

The Firebase Functions already include the `verifyMeepleupPurchase` function. Make sure you have these environment variables set:

```bash
# For iOS verification
firebase functions:config:set apple.shared_secret="YOUR_APPLE_SHARED_SECRET"

# For Android verification
firebase functions:config:set android.package_name="com.meepleup.app"
```

### 2. Set Up Google Service Account (Android)

1. Upload your Google service account JSON key to Firebase Storage or use environment variables
2. Update the path in `functions/index.js` if needed (should already be configured for subscriptions)

### 3. Deploy Functions

```bash
cd functions
npm install  # If you haven't already
cd ..
firebase deploy --only functions
```

## Testing

### iOS Testing

1. Use a **Sandbox Tester Account** in App Store Connect
2. Sign out of your regular Apple ID on the test device
3. When prompted during purchase, use the sandbox account
4. Test both purchase and restore flows
5. Verify the purchase is recorded in Firestore

### Android Testing

1. Add test accounts in Google Play Console → **Settings** → **License testing**
2. Use a test account on your device
3. Test both purchase and restore flows
4. Verify the purchase is recorded in Firestore

### Testing Checklist

- [ ] Can view meepleup creation product information
- [ ] Can purchase meepleup creation
- [ ] Purchase is verified on backend
- [ ] Purchase is recorded in Firestore (`meepleupPurchases` collection and user's `meepleupPurchases` array)
- [ ] Can create meepleup after purchase
- [ ] Cannot create meepleup without purchase
- [ ] Purchase modal shows correct product information
- [ ] Purchase flow handles cancellation gracefully
- [ ] Purchase flow handles errors gracefully

## Production Deployment

### 1. Update Product IDs

Make sure your product IDs in `src/services/meepleupPurchaseService.js` match your production product IDs.

### 2. Update Firebase Functions Environment

Switch to production URLs:
- iOS: Use `https://buy.itunes.apple.com/verifyReceipt` (already configured)
- Android: Use production service account

### 3. Deploy

```bash
# Deploy app
eas build:ios
eas build:android

# Deploy functions
firebase deploy --only functions
```

### 4. Monitor

- Set up alerts for failed verifications
- Monitor purchase records in Firestore
- Track purchase metrics in App Store Connect and Google Play Console

## Troubleshooting

### Common Issues

1. **"No products available"**
   - Check product IDs match exactly
   - Ensure products are approved in App Store Connect/Play Console
   - Wait a few hours after creating products
   - Make sure IAP is initialized: `initializePurchases()` is called

2. **"Purchase verification failed"**
   - Check Firebase Functions logs
   - Verify shared secret (iOS) or service account (Android)
   - Ensure functions are deployed
   - Check that `verifyMeepleupPurchase` function exists

3. **"Purchase not showing as recorded"**
   - Check Firestore `meepleupPurchases` collection
   - Check user document's `meepleupPurchases` array
   - Verify receipt with Apple/Google directly
   - Check function logs for errors

4. **"Purchase modal not showing"**
   - Check that `createEventWithPurchaseCheck` is being called (not `createEvent`)
   - Verify user is authenticated
   - Check console for errors

### Support Resources

- [Apple In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [Google Play Billing Documentation](https://developer.android.com/google/play/billing)
- [Expo In-App Purchases Documentation](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)

## Security Notes

- Never expose shared secrets or service account keys in client code
- Always verify receipts on the server side
- Use HTTPS for all webhook endpoints
- Implement proper error handling and logging
- Regularly audit purchase records

## Product Type Decision: Non-Consumable vs Consumable

### Non-Consumable (Recommended)
- **Pros**: User purchases once, can create unlimited meepleups
- **Cons**: Lower revenue per user, but better user experience
- **Use Case**: If you want users to be able to create multiple meepleups after one purchase

### Consumable
- **Pros**: Higher revenue potential (users pay per meepleup)
- **Cons**: More friction, users may be reluctant to create multiple meepleups
- **Use Case**: If you want to charge per meepleup creation

**Current Implementation**: The code supports both types. The purchase is verified and recorded, but the app checks if the user has ANY purchase record (not checking if it's been "consumed"). For consumable products, you may want to add additional logic to track how many meepleups a user has created per purchase.

## Next Steps

1. Test the purchase flow thoroughly in sandbox/test environments
2. Submit your app with the IAP product for review
3. Monitor purchase metrics and user feedback
4. Consider adding analytics to track purchase conversion rates
5. Consider offering a free trial or first meepleup free



