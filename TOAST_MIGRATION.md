# Toast Notification Migration Guide

This document tracks the migration from `Alert.alert` to the toast notification system.

## Status

- ✅ Toast component created (`src/components/common/Toast.jsx`)
- ✅ ToastProvider integrated in App.js and App.jsx
- ⏳ Migration in progress: 169 Alert.alert calls across 21 files

## Usage

### Basic Usage

```javascript
import { useToast } from '../components/common/Toast';

function MyComponent() {
  const toast = useToast();

  const handleSuccess = () => {
    toast.success('Game added to collection!');
  };

  const handleError = () => {
    toast.error('Failed to save. Please try again.');
  };

  const handleWarning = () => {
    toast.warning('This action cannot be undone.');
  };

  const handleInfo = () => {
    toast.info('Processing your request...');
  };
}
```

### Available Methods

- `toast.success(message, duration?)` - Green success toast (default 3s)
- `toast.error(message, duration?)` - Red error toast (default 5s)
- `toast.warning(message, duration?)` - Orange warning toast (default 3s)
- `toast.info(message, duration?)` - Blue info toast (default 3s)
- `toast.showToast(message, type, duration)` - Custom toast
- `toast.hideToast(id)` - Dismiss specific toast
- `toast.hideAllToasts()` - Dismiss all toasts

### Migration Pattern

**Before:**
```javascript
Alert.alert('Success', 'Game added to collection!');
Alert.alert('Error', 'Failed to save', [{ text: 'OK' }]);
```

**After:**
```javascript
import { useToast } from '../components/common/Toast';

const toast = useToast();
toast.success('Game added to collection!');
toast.error('Failed to save');
```

### For Confirmation Dialogs

For confirmation dialogs (Alert.alert with buttons), you'll need to use a Modal component or keep Alert.alert for now. Toast is for notifications, not confirmations.

**Before:**
```javascript
Alert.alert(
  'Delete Event',
  'Are you sure you want to delete this event?',
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: handleDelete }
  ]
);
```

**After (keep Alert for confirmations, or use Modal):**
```javascript
// Option 1: Keep Alert.alert for confirmations (acceptable)
Alert.alert(
  'Delete Event',
  'Are you sure you want to delete this event?',
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: handleDelete }
  ]
);

// Option 2: Use Modal component (better UX)
// See Modal component for implementation
```

## Files to Migrate (Priority Order)

### High Priority (User-facing actions)
- [ ] `src/screens/Onboarding.jsx` - 2 Alert calls
- [ ] `src/screens/EventHub.jsx` - 67 Alert calls
- [ ] `src/screens/ProfileScreen.jsx` - 8 Alert calls
- [ ] `src/screens/BrowseAndProposeScreen.jsx` - 9 Alert calls
- [ ] `src/components/LogisticsCardV2.jsx` - 13 Alert calls
- [ ] `src/components/UserProfileModal.jsx` - 13 Alert calls

### Medium Priority
- [ ] `src/components/RSVPManagementScreen.jsx` - 7 Alert calls
- [ ] `src/components/LeaveEventButton.jsx` - 6 Alert calls
- [ ] `src/screens/EventsScreen.jsx` - 12 Alert calls
- [ ] `src/components/SubscriptionScreen.jsx` - 8 Alert calls

### Lower Priority
- [ ] `src/components/BeepleGameOptimizer.jsx` - 2 Alert calls
- [ ] `src/components/TextListGameIdentifier.jsx` - 2 Alert calls
- [ ] `src/components/BGGImport.jsx` - 2 Alert calls
- [ ] `src/components/GameCard.jsx` - 2 Alert calls
- [ ] `src/components/GameDetailsModal.jsx` - 4 Alert calls
- [ ] `src/components/ClaudeGameIdentifier.jsx` - 4 Alert calls
- [ ] `src/components/PersonalMatchSettings.jsx` - 2 Alert calls
- [ ] `src/screens/CollectionScreen.jsx` - 1 Alert call
- [ ] `src/screens/Landing.jsx` - 2 Alert calls
- [ ] `src/screens/Auth.jsx` - 2 Alert calls
- [ ] `src/components/MeepleupPurchaseModal.jsx` - 1 Alert call

## Migration Checklist

For each file:
1. Import `useToast` hook
2. Call `const toast = useToast()` in component
3. Replace `Alert.alert('Title', 'Message')` with `toast.success/info/error/warning('Message')`
4. For confirmations, decide: keep Alert.alert or use Modal
5. Test on iOS, Android, and web

## Benefits

- ✅ Non-blocking - users can continue using the app
- ✅ Better UX - modern, polished notifications
- ✅ Consistent styling - matches app theme
- ✅ Auto-dismiss - no need to tap OK
- ✅ Stackable - multiple toasts can show
- ✅ Accessible - works with screen readers
- ✅ Cross-platform - iOS, Android, web

## Notes

- Toast is for **notifications** (success, error, info)
- Alert.alert is still acceptable for **confirmations** (user must choose)
- Consider creating a confirmation Modal component for better UX in the future

