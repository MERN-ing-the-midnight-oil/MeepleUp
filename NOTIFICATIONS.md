# Notification System Documentation

The notification system allows users to receive notifications based on their preferences for:
1. **MeepleUp Changes**: Posts, comments, and updates to MeepleUps they're part of
2. **New Public MeepleUps**: When new public MeepleUps are created near their zip code
3. **Game Marking**: When other users mark interest in their game titles

## Notification Preferences

Users can configure their notification preferences in Profile Settings:
- `meepleupChanges`: Notify about changes to MeepleUps (default: enabled)
- `newPublicMeepleups`: Notify about new public MeepleUps nearby (default: enabled)
- `gameMarking`: Notify when others mark interest in their games (default: enabled)
- `nearbyMeepleupDistance`: Distance in miles for "nearby" (default: 25 miles)

## Implementation Status

### ✅ Completed

1. **Notification Settings UI** (`src/components/NotificationSettings.jsx`)
   - User preferences interface in Profile Settings
   - Toggles for each notification type
   - Distance slider for nearby MeepleUps

2. **Notification Service** (`src/utils/notifications.js`)
   - Core notification creation and management
   - Preference checking
   - Batch notification creation
   - Distance calculation (simplified zipcode-based)

3. **New Public MeepleUp Notifications**
   - Automatically triggers when a public MeepleUp is created
   - Notifies users within their specified distance
   - Integrated into `EventsContext.createEvent()`

4. **Helper Functions** (`src/utils/notificationHooks.js`)
   - Ready-to-use functions for triggering notifications
   - Pre-configured for different event types

### 🔄 To Be Integrated

When you implement posts, comments, and game interests, call these functions:

#### For New Posts

```javascript
import { notifyNewPost } from '../utils/notificationHooks';

// When creating a post in a MeepleUp
await notifyNewPost(
  groupId,        // MeepleUp ID
  postId,         // Post ID
  userId,         // User who created the post
  userName,       // User's name
  postTitle,      // Post title (optional)
  postContent     // Post content preview
);
```

#### For New Comments

```javascript
import { notifyNewComment } from '../utils/notificationHooks';

// When creating a comment on a post
await notifyNewComment(
  groupId,        // MeepleUp ID
  postId,         // Post ID
  commentId,      // Comment ID
  userId,         // User who created the comment
  userName,       // User's name
  postAuthorId    // Post author's user ID
);
```

#### For Game Interest Marking

```javascript
import { notifyGameInterest } from '../utils/notificationHooks';

// When someone marks interest in a game
await notifyGameInterest(
  groupId,              // MeepleUp ID
  gameId,               // Game ID
  gameName,             // Game name
  ownerId,              // User ID who owns the game
  interestedUserId,     // User ID who marked interest
  interestedUserName    // Name of interested user
);
```

#### For MeepleUp Updates

```javascript
import { notifyMeepleUpUpdate } from '../utils/notificationHooks';

// When a MeepleUp is updated
await notifyMeepleUpUpdate(
  groupId,           // MeepleUp ID
  updatedByUserId,   // User who made the update
  updateType,        // 'date', 'location', 'description', or 'general'
  groupName          // MeepleUp name
);
```

## Notification Data Structure

Notifications are stored in Firestore at: `users/{userId}/notifications/{notificationId}`

```javascript
{
  id: string,
  type: 'new_post' | 'new_comment' | 'game_interest' | 'meepleup_changes' | 'new_public_meepleup',
  groupId: string?,           // MeepleUp/Group ID
  postId: string?,            // Post ID (for post/comment notifications)
  fromUserId: string?,        // User who triggered the notification
  fromUserName: string?,      // Name of user who triggered
  message: string,            // Notification message
  read: boolean,              // Whether notification has been read
  createdAt: timestamp        // When notification was created
}
```

## Distance Calculation

The current implementation uses a simplified zipcode-based distance calculation. For production, consider:

1. **Geocoding API**: Convert zipcodes to lat/lng coordinates
2. **Haversine Formula**: Calculate accurate distance between coordinates
3. **Geocoding Services**: 
   - Google Geocoding API
   - OpenCage Geocoding API
   - USPS Address API

The current `calculateZipcodeDistance()` function provides a rough approximation based on zipcode prefix differences.

## Firestore Security Rules

Make sure your Firestore security rules allow:
- Users to read their own notifications
- Authenticated users to create notifications for others (via Cloud Functions or backend)

Example rules:

```javascript
match /users/{userId}/notifications/{notificationId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow create: if request.auth != null; // Or restrict to Cloud Functions
  allow update: if request.auth != null && request.auth.uid == userId;
}
```

## Future Enhancements

1. **Push Notifications**: Integrate with Firebase Cloud Messaging (FCM)
2. **Email Notifications**: Send email summaries of notifications
3. **In-App Notification Center**: UI to view and manage notifications
4. **Notification Batching**: Group similar notifications together
5. **Real-time Updates**: Use Firestore listeners for live notification updates

## Testing

To test notifications:

1. Create a public MeepleUp with a zipcode
2. Have another user with a zipcode within the distance
3. Check Firestore: `users/{userId}/notifications/` to see notifications
4. Verify preferences are respected

## Notes

- Notifications respect user preferences before sending
- Batch operations are used for efficiency
- Errors are logged but don't block the main operation
- Distance calculation is simplified and should be improved for production

