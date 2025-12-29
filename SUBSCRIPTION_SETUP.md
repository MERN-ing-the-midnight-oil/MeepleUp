# Subscription Setup Guide

This guide will walk you through setting up subscription-based payments for MeepleUp on both iOS (App Store) and Android (Google Play Store).

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

### 1. Create Subscription Products in App Store Connect

1. Log in to [App Store Connect](https://appstoreconnect.apple.com/)
2. Navigate to your app → **Features** → **In-App Purchases**
3. Click **+** to create a new subscription
4. Create two subscription groups:
   - **Monthly Subscription**
     - Product ID: `com.rhyssmoker.meepleup.monthly`
     - Duration: 1 month
     - Price: Set your desired price
   - **Yearly Subscription**
     - Product ID: `com.rhyssmoker.meepleup.yearly`
     - Duration: 1 year
     - Price: Set your desired price

5. **Important**: Update the product IDs in `src/services/subscriptionService.js` to match your actual product IDs.

### 2. Configure App Store Server Notifications (Optional but Recommended)

1. In App Store Connect, go to your app → **App Information**
2. Scroll to **App Store Server Notifications**
3. Add your webhook URL: `https://your-project.cloudfunctions.net/appleSubscriptionWebhook`
4. This enables real-time subscription status updates

### 3. Get Shared Secret

1. In App Store Connect, go to **Users and Access** → **Keys**
2. Create or use an existing App Store Connect API key
3. Note the **Shared Secret** - you'll need this for Firebase Functions

## Android Setup (Google Play)

### 1. Create Subscription Products in Google Play Console

1. Log in to [Google Play Console](https://play.google.com/console/)
2. Select your app → **Monetize** → **Products** → **Subscriptions**
3. Click **Create subscription**
4. Create two subscriptions:
   - **Monthly Subscription**
     - Product ID: `com.meepleup.app.monthly`
     - Billing period: 1 month
     - Price: Set your desired price
   - **Yearly Subscription**
     - Product ID: `com.meepleup.app.yearly`
     - Billing period: 1 year
     - Price: Set your desired price

5. **Important**: Update the product IDs in `src/services/subscriptionService.js` to match your actual product IDs.

### 2. Set Up Real-time Developer Notifications (Optional but Recommended)

1. In Google Play Console, go to **Monetize** → **Monetization setup** → **Real-time developer notifications**
2. Create a Pub/Sub topic in Google Cloud Console
3. Configure the webhook URL in Play Console
4. This enables real-time subscription status updates

### 3. Set Up Service Account

1. In Google Cloud Console, create a service account
2. Grant it the **Service Account User** role
3. Download the JSON key file
4. Store it securely (you'll need it for Firebase Functions)

## Firebase Functions Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Environment Variables

Set the following environment variables in Firebase Functions:

```bash
firebase functions:config:set apple.shared_secret="YOUR_APPLE_SHARED_SECRET"
firebase functions:config:set android.package_name="com.meepleup.app"
```

### 3. Set Up Google Service Account (Android)

1. Upload your Google service account JSON key to Firebase Storage or use environment variables
2. Update the path in `functions/index.js` if needed

### 4. Deploy Functions

```bash
firebase deploy --only functions
```

## Testing

### iOS Testing

1. Use a **Sandbox Tester Account** in App Store Connect
2. Sign out of your regular Apple ID on the test device
3. When prompted during purchase, use the sandbox account
4. Test both purchase and restore flows

### Android Testing

1. Add test accounts in Google Play Console → **Settings** → **License testing**
2. Use a test account on your device
3. Test both purchase and restore flows

### Testing Checklist

- [ ] Can view available subscription products
- [ ] Can purchase monthly subscription
- [ ] Can purchase yearly subscription
- [ ] Purchase is verified on backend
- [ ] Subscription status updates in Firestore
- [ ] Can restore previous purchases
- [ ] Subscription gate blocks premium features
- [ ] Subscription gate allows access with active subscription

## Production Deployment

### 1. Update Product IDs

Make sure your product IDs in `src/services/subscriptionService.js` match your production product IDs.

### 2. Update Firebase Functions Environment

Switch to production URLs:
- iOS: Use `https://buy.itunes.apple.com/verifyReceipt` (already configured)
- Android: Use production service account

### 3. Deploy

```bash
# Deploy app
expo build:ios
expo build:android

# Deploy functions
firebase deploy --only functions
```

### 4. Monitor

- Set up alerts for failed verifications
- Monitor subscription status updates
- Track subscription metrics in App Store Connect and Google Play Console

## Troubleshooting

### Common Issues

1. **"No products available"**
   - Check product IDs match exactly
   - Ensure products are approved in App Store Connect/Play Console
   - Wait a few hours after creating products

2. **"Purchase verification failed"**
   - Check Firebase Functions logs
   - Verify shared secret (iOS) or service account (Android)
   - Ensure functions are deployed

3. **"Subscription not showing as active"**
   - Check Firestore user document
   - Verify receipt with Apple/Google directly
   - Check function logs for errors

### Support Resources

- [Apple In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [Google Play Billing Documentation](https://developer.android.com/google/play/billing)
- [Expo In-App Purchases Documentation](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)

## Security Notes

- Never expose shared secrets or service account keys in client code
- Always verify receipts on the server side
- Use HTTPS for all webhook endpoints
- Implement proper error handling and logging
- Regularly audit subscription statuses

## Next Steps

1. Customize subscription features in your app
2. Add analytics to track subscription metrics
3. Implement subscription management UI
4. Set up email notifications for subscription events
5. Create marketing materials for subscription tiers






