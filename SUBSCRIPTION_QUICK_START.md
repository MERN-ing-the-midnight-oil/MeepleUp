# Subscription Quick Start

## Installation

1. **Install the package** (already added to package.json):
```bash
npm install
```

2. **Update Product IDs** in `src/services/subscriptionService.js`:
   - Replace `com.rhyssmoker.meepleup.monthly` with your actual iOS monthly product ID
   - Replace `com.rhyssmoker.meepleup.yearly` with your actual iOS yearly product ID
   - Replace `com.meepleup.app.monthly` with your actual Android monthly product ID
   - Replace `com.meepleup.app.yearly` with your actual Android yearly product ID

## Firebase Functions Setup

1. **Navigate to functions directory**:
```bash
cd functions
npm install
```

2. **Set environment variables**:
```bash
firebase functions:config:set apple.shared_secret="YOUR_APPLE_SHARED_SECRET"
firebase functions:config:set android.package_name="com.meepleup.app"
```

3. **Deploy functions**:
```bash
firebase deploy --only functions
```

## Testing

1. **Test on device** (in-app purchases don't work in simulators)
2. **Use sandbox/test accounts** from App Store Connect and Google Play Console
3. **Test purchase flow**: Purchase → Verify → Check Firestore
4. **Test restore flow**: Restore purchases after reinstalling

## Key Files

- `src/services/subscriptionService.js` - Core subscription logic
- `src/context/SubscriptionContext.jsx` - Subscription state management
- `src/components/SubscriptionScreen.jsx` - Subscription purchase UI
- `src/components/SubscriptionGate.jsx` - Premium feature protection
- `functions/index.js` - Server-side verification

## Quick Usage

```jsx
// Check subscription status
const { hasActiveSubscription } = useSubscription();

// Protect premium feature
<SubscriptionGate featureName="Premium Feature">
  <PremiumComponent />
</SubscriptionGate>

// Navigate to subscription
// Web: /subscription
// Native: navigation.navigate('Subscription')
```

## Next Steps

1. Create subscription products in App Store Connect and Google Play Console
2. Update product IDs in `subscriptionService.js`
3. Configure Firebase Functions
4. Test thoroughly before production
5. See `SUBSCRIPTION_SETUP.md` for detailed setup instructions












