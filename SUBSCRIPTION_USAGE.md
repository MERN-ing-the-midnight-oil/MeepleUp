# Subscription System Usage Guide

This guide explains how to use the subscription system in your MeepleUp app.

## Overview

The subscription system provides:
- Cross-platform subscription management (iOS & Android)
- Server-side receipt verification
- Subscription status tracking
- Premium feature gating
- Automatic subscription status updates

## Basic Usage

### 1. Wrap Your App with SubscriptionProvider

The `SubscriptionProvider` is already added to `App.jsx`. It manages subscription state globally.

### 2. Check Subscription Status

```jsx
import { useSubscription } from './context/SubscriptionContext';

function MyComponent() {
  const { hasActiveSubscription, subscriptionStatus, loading } = useSubscription();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (hasActiveSubscription) {
    return <PremiumFeature />;
  } else {
    return <UpgradePrompt />;
  }
}
```

### 3. Protect Premium Features

Use the `SubscriptionGate` component to protect premium features:

```jsx
import SubscriptionGate from './components/SubscriptionGate';

function PremiumFeatureScreen() {
  return (
    <SubscriptionGate featureName="Advanced Game Recommendations">
      <AdvancedRecommendations />
    </SubscriptionGate>
  );
}
```

### 4. Navigate to Subscription Screen

Add a link to the subscription screen in your navigation or settings:

```jsx
// For web (React Router)
<Link to="/subscription">Manage Subscription</Link>

// For React Native
navigation.navigate('Subscription');
```

## Advanced Usage

### Using Subscription Hooks

```jsx
import { useSubscriptionAccess, useRequireSubscription } from './hooks/useSubscriptionAccess';

function MyComponent() {
  const { hasAccess, isLoading } = useSubscriptionAccess();
  
  // Or require subscription (throws error if not subscribed)
  const hasAccess = useRequireSubscription(true);
  
  // Your component logic
}
```

### Programmatic Purchase

```jsx
import { useSubscription } from './context/SubscriptionContext';

function PurchaseButton() {
  const { purchase, purchasing } = useSubscription();
  
  const handlePurchase = async () => {
    try {
      const productId = 'com.rhyssmoker.meepleup.monthly'; // Your product ID
      await purchase(productId);
      // Purchase initiated - listener will handle completion
    } catch (error) {
      console.error('Purchase failed:', error);
    }
  };
  
  return (
    <Button onPress={handlePurchase} disabled={purchasing}>
      {purchasing ? 'Processing...' : 'Subscribe'}
    </Button>
  );
}
```

### Restore Purchases

```jsx
import { useSubscription } from './context/SubscriptionContext';

function RestoreButton() {
  const { restore } = useSubscription();
  
  const handleRestore = async () => {
    try {
      await restore();
      Alert.alert('Success', 'Purchases restored');
    } catch (error) {
      Alert.alert('Error', 'Failed to restore purchases');
    }
  };
  
  return <Button onPress={handleRestore}>Restore Purchases</Button>;
}
```

## Subscription Status Values

The `subscriptionStatus` can be:
- `'none'` - No subscription
- `'pending'` - Subscription purchased but not yet verified
- `'active'` - Subscription is active and valid
- `'expired'` - Subscription has expired
- `'cancelled'` - Subscription was cancelled
- `'unknown'` - Unknown status

## Subscription Data Structure

The subscription object in Firestore has this structure:

```javascript
{
  productId: 'com.rhyssmoker.meepleup.monthly',
  transactionId: '1000000123456789',
  platform: 'ios', // or 'android'
  verified: true,
  status: 'active', // 'active', 'expired', 'cancelled'
  expiresAt: Timestamp,
  autoRenewing: true,
  verifiedAt: Timestamp,
  updatedAt: Timestamp
}
```

## Examples

### Example 1: Conditional Feature Rendering

```jsx
import { useSubscription } from './context/SubscriptionContext';

function GameRecommendations() {
  const { hasActiveSubscription } = useSubscription();
  
  return (
    <View>
      <BasicRecommendations />
      {hasActiveSubscription ? (
        <AdvancedRecommendations />
      ) : (
        <UpgradePrompt />
      )}
    </View>
  );
}
```

### Example 2: Subscription Badge in Profile

```jsx
import { useSubscription } from './context/SubscriptionContext';

function ProfileHeader() {
  const { hasActiveSubscription, subscriptionStatus } = useSubscription();
  
  return (
    <View>
      <Text>Profile</Text>
      {hasActiveSubscription ? (
        <Badge color="green">Premium</Badge>
      ) : (
        <Badge color="gray">Free</Badge>
      )}
    </View>
  );
}
```

### Example 3: Feature List with Subscription Check

```jsx
const features = [
  { name: 'Basic Features', premium: false },
  { name: 'Advanced Analytics', premium: true },
  { name: 'Unlimited Events', premium: true },
  { name: 'Priority Support', premium: true },
];

function FeaturesList() {
  const { hasActiveSubscription } = useSubscription();
  
  return (
    <View>
      {features.map(feature => (
        <FeatureItem
          key={feature.name}
          feature={feature}
          locked={feature.premium && !hasActiveSubscription}
        />
      ))}
    </View>
  );
}
```

## Best Practices

1. **Always check loading state** before checking subscription status
2. **Use SubscriptionGate** for full-screen premium features
3. **Show upgrade prompts** instead of completely blocking features when possible
4. **Handle errors gracefully** - network issues can prevent subscription checks
5. **Test restore purchases** flow - users may reinstall the app
6. **Monitor subscription status** - use Firebase Functions to check for expired subscriptions

## Troubleshooting

### Products Not Showing

- Check product IDs match exactly in `subscriptionService.js`
- Ensure products are approved in App Store Connect/Play Console
- Wait a few hours after creating products (they need to propagate)

### Purchase Not Verifying

- Check Firebase Functions logs
- Verify shared secret (iOS) or service account (Android)
- Ensure functions are deployed: `firebase deploy --only functions`

### Subscription Status Not Updating

- Check Firestore user document for subscription field
- Verify receipt with Apple/Google directly
- Check function logs for errors
- Run the scheduled function to check expired subscriptions

## Next Steps

1. Customize subscription features for your app
2. Add analytics to track subscription metrics
3. Implement email notifications for subscription events
4. Create marketing materials for subscription tiers
5. Set up A/B testing for subscription pricing














