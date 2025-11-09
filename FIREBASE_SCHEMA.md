# Firebase Firestore Schema for MeepleUp

## Collections Structure

```
meepleup-951a1/
├── users/
│   └── {userId}/
│       └── profile (document)
├── gamingGroups/
│   └── {groupId}/
│       ├── group (document)
│       ├── members/ (subcollection)
│       │   └── {userId} (document)
│       ├── posts/ (subcollection) - Discussion forum
│       │   └── {postId}/
│       │       ├── post (document)
│       │       └── comments/ (subcollection)
│       │           └── {commentId} (document)
│       └── gameInterests/ (subcollection)
│           └── {interestId} (document)
├── games/
│   └── {gameId}/
│       └── game (document)
└── userGames/
    └── {userId}/
        └── games/ (subcollection)
            └── {gameId} (document)
```

## Detailed Schema

### 1. Users Collection

**Path:** `users/{userId}`

```javascript
{
  // User Profile
  id: string,                    // Firebase Auth UID
  email: string,
  name: string,
  bio: string?,
  bggUsername: string?,          // BoardGameGeek username
  avatarUrl: string?,
  
  // Location (for event discovery)
  location: {
    latitude: number,
    longitude: number,
    city: string?,
    state: string?,
    country: string?
  }?,
  
  // Metadata
  createdAt: timestamp,
  updatedAt: timestamp,
  lastLoginAt: timestamp?,
  
  // Preferences
  preferences: {
    notifications: boolean,
    publicProfile: boolean
  }?
}
```

### 2. Gaming Groups Collection

**Path:** `gamingGroups/{groupId}`

```javascript
{
  // Basic Info
  id: string,
  name: string,
  description: string?,
  
  // Images (stored on third-party platforms like Imgur)
  coverImageUrl: string?,        // URL to image on Imgur/cloud storage
  thumbnailUrl: string?,
  
  // Location & Venue
  location: {
    name: string,                // e.g., "Brewery XYZ", "John's House"
    address: string?,
    latitude: number?,
    longitude: number?,
    venueType: 'home' | 'brewery' | 'game_store' | 'public_space' | 'other'
  },
  
  // Scheduling
  type: 'single' | 'recurring',  // Single event or recurring group
  frequency: 'one-time' | 'weekly' | 'biweekly' | 'monthly' | null,
  nextEventDate: timestamp?,     // Next scheduled event
  startTime: string?,            // e.g., "18:00"
  endTime: string?,
  timezone: string?,
  
  // Privacy & Access
  privacy: 'public' | 'private',
  joinCode: string?,             // For private groups (6 characters)
  
  // Organizer & Members
  organizerId: string,           // Reference to users/{organizerId}
  organizerName: string,         // Denormalized
  memberIds: string[],           // Array of user IDs (for quick queries)
  memberCount: number,           // Denormalized count
  
  // Shared Library (aggregated from all members)
  sharedLibraryGameIds: string[], // Array of game IDs owned by any member
  
  // Metadata
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: string,             // User ID who created it
  
  // Status
  isActive: boolean,
  deletedAt: timestamp?
}
```

**Subcollection: `gamingGroups/{groupId}/members/{userId}`**

```javascript
{
  userId: string,                // Reference to users/{userId}
  userName: string,              // Denormalized
  userAvatarUrl: string?,        // Denormalized
  role: 'organizer' | 'member',
  joinedAt: timestamp,
  invitedBy: string?,           // User ID who invited them
  rsvpStatus: 'going' | 'maybe' | 'not-going' | null,
  rsvpUpdatedAt: timestamp?,
  lastActiveAt: timestamp?
}
```

**Subcollection: `gamingGroups/{groupId}/posts/{postId}`** (Discussion Forum)

```javascript
{
  id: string,
  userId: string,                // Reference to users/{userId}
  userName: string,              // Denormalized for display
  userAvatarUrl: string?,        // Denormalized
  
  // Post Content
  title: string?,
  content: string,
  images: string[]?,             // Array of URLs to images (Imgur, etc.)
  
  // Engagement
  likeCount: number,             // Denormalized
  commentCount: number,          // Denormalized
  
  // Metadata
  createdAt: timestamp,
  updatedAt: timestamp?,
  edited: boolean,
  deleted: boolean,
  pinned: boolean,               // Organizers can pin posts
  pinnedAt: timestamp?
}
```

**Subcollection: `gamingGroups/{groupId}/posts/{postId}/comments/{commentId}`**

```javascript
{
  id: string,
  postId: string,                // Reference to parent post
  userId: string,                // Reference to users/{userId}
  userName: string,              // Denormalized
  userAvatarUrl: string?,        // Denormalized
  content: string,
  images: string[]?,             // Array of image URLs
  createdAt: timestamp,
  updatedAt: timestamp?,
  edited: boolean,
  deleted: boolean
}
```

**Subcollection: `gamingGroups/{groupId}/gameInterests/{interestId}`**

```javascript
{
  id: string,
  gameId: string,                // Reference to games/{gameId}
  gameName: string,              // Denormalized
  gameImage: string?,            // Denormalized
  gameBggId: string?,            // Denormalized
  
  // Interest Details
  interestedUserId: string,      // User who is interested
  interestedUserName: string,    // Denormalized
  ownerId: string,               // User who owns the game
  ownerName: string,             // Denormalized
  
  // Status
  status: 'interested' | 'confirmed' | 'declined' | 'fulfilled',
  
  // Optional: For specific event dates
  eventDate: timestamp?,         // Which event date this is for
  
  // Metadata
  createdAt: timestamp,
  updatedAt: timestamp,
  respondedAt: timestamp?       // When owner responded
}
```

### 3. Games Collection

**Path:** `games/{gameId}`

```javascript
{
  id: string,
  
  // Basic Info
  title: string,
  description: string?,
  yearPublished: number?,
  
  // Images
  image: string?,
  thumbnail: string?,
  
  // Game Details
  minPlayers: number?,
  maxPlayers: number?,
  playingTime: number?,          // Minutes
  ageRating: number?,
  
  // BGG Integration
  bggId: string?,                // BoardGameGeek ID
  bggRating: number?,            // BGG average rating
  bggUrl: string?,
  
  // Barcode
  barcode: string?,              // UPC/EAN
  
  // Source
  source: 'barcode_lookup' | 'barcode_bgg' | 'bgg_import' | 'manual',
  
  // Metadata
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 4. User Games Collection

**Path:** `userGames/{userId}/games/{gameId}`

```javascript
{
  id: string,
  gameId: string,                // Reference to games/{gameId}
  userId: string,                // Reference to users/{userId}
  
  // User-specific data
  userRating: number?,           // User's personal rating (1-10)
  numplays: number?,             // Number of times played
  notes: string?,
  
  // Trading/Selling Status
  tradingStatus: {
    openToSelling: boolean,      // User wants to sell this game
    openToTrading: boolean,      // User wants to trade this game
    price: number?,              // Asking price if selling
    condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor'?,
    notes: string?               // Trading/selling notes
  }?,
  
  // Ownership Status
  status: {
    own: boolean,
    prevowned: boolean,
    want: boolean,
    wanttoplay: boolean,
    wishlist: boolean
  }?,
  
  // Visibility in Gaming Groups
  visibleInGroups: string[]?,    // Array of groupIds where this game is visible
  
  // Metadata
  addedAt: timestamp,
  updatedAt: timestamp,
  source: 'barcode_lookup' | 'barcode_bgg' | 'bgg_import' | 'manual'
}
```

## Indexes Required

### Gaming Groups Collection
- `privacy` + `location.latitude` + `location.longitude` (for public group discovery)
- `organizerId` (for user's organized groups)
- `memberIds` (array-contains) (for user's joined groups)
- `nextEventDate` (for upcoming events)
- `type` + `isActive` (for filtering active recurring groups)

### Posts Collection
- `groupId` + `createdAt` (for posts in a group, sorted by date)
- `groupId` + `pinned` + `createdAt` (for pinned posts first, then by date)
- `userId` + `createdAt` (for user's posts across all groups)

### Comments Collection
- `postId` + `createdAt` (for comments on a post, sorted by date)

### Game Interests Collection
- `groupId` + `status` + `createdAt` (for interests in a group)
- `ownerId` + `status` (for game owner's pending interests)
- `interestedUserId` + `createdAt` (for user's interests)

### User Games Collection
- `userId` + `addedAt` (for user's collection sorted by date)
- `userId` + `gameId` (for checking if user owns a game)
- `userId` + `tradingStatus.openToSelling` (for games user wants to sell)
- `userId` + `tradingStatus.openToTrading` (for games user wants to trade)

## Security Rules (Basic Structure)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function isGroupMember(groupId) {
      return isAuthenticated() && 
        request.auth.uid in get(/databases/$(database)/documents/gamingGroups/$(groupId)).data.memberIds;
    }
    
    function isGroupOrganizer(groupId) {
      return isAuthenticated() && 
        request.auth.uid == get(/databases/$(database)/documents/gamingGroups/$(groupId)).data.organizerId;
    }
    
    // Users can read/write their own profile
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId);
    }
    
    // Gaming Groups
    match /gamingGroups/{groupId} {
      allow read: if isAuthenticated() && (
        resource.data.privacy == 'public' ||
        isGroupMember(groupId)
      );
      allow create: if isAuthenticated();
      allow update, delete: if isAuthenticated() && isGroupOrganizer(groupId);
      
      // Group members
      match /members/{userId} {
        allow read: if isAuthenticated() && (
          isGroupMember(groupId) ||
          resource.data.privacy == 'public'
        );
        allow create: if isAuthenticated() && (
          isOwner(userId) ||
          isGroupOrganizer(groupId)
        );
        allow update: if isAuthenticated() && (
          isOwner(userId) ||
          isGroupOrganizer(groupId)
        );
        allow delete: if isAuthenticated() && (
          isOwner(userId) ||
          isGroupOrganizer(groupId)
        );
      }
      
      // Discussion Forum Posts
      match /posts/{postId} {
        allow read: if isAuthenticated() && isGroupMember(groupId);
        allow create: if isAuthenticated() && isGroupMember(groupId);
        allow update, delete: if isAuthenticated() && (
          resource.data.userId == request.auth.uid ||
          isGroupOrganizer(groupId)
        );
        
        // Post Comments
        match /comments/{commentId} {
          allow read: if isAuthenticated() && isGroupMember(groupId);
          allow create: if isAuthenticated() && isGroupMember(groupId);
          allow update, delete: if isAuthenticated() && (
            resource.data.userId == request.auth.uid ||
            isGroupOrganizer(groupId)
          );
        }
      }
      
      // Game Interests
      match /gameInterests/{interestId} {
        allow read: if isAuthenticated() && isGroupMember(groupId);
        allow create: if isAuthenticated() && isGroupMember(groupId);
        allow update: if isAuthenticated() && (
          resource.data.ownerId == request.auth.uid ||
          resource.data.interestedUserId == request.auth.uid ||
          isGroupOrganizer(groupId)
        );
        allow delete: if isAuthenticated() && (
          resource.data.interestedUserId == request.auth.uid ||
          isGroupOrganizer(groupId)
        );
      }
    }
    
    // Games (read-only for most users, anyone can create)
    match /games/{gameId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAuthenticated(); // Could restrict to admins
    }
    
    // User Games
    match /userGames/{userId}/games/{gameId} {
      allow read: if isAuthenticated(); // Members can see each other's games in groups
      allow write: if isOwner(userId);
    }
  }
}
```

## Additional Collections for Enhanced Features

### Post Likes (Optional - for engagement tracking)

**Path:** `gamingGroups/{groupId}/posts/{postId}/likes/{userId}`

```javascript
{
  userId: string,
  createdAt: timestamp
}
```

### User Notifications (Optional - for real-time updates)

**Path:** `users/{userId}/notifications/{notificationId}`

```javascript
{
  id: string,
  type: 'new_post' | 'new_comment' | 'game_interest' | 'group_invite' | 'rsvp_update',
  groupId: string?,
  postId: string?,
  fromUserId: string?,
  fromUserName: string?,
  message: string,
  read: boolean,
  createdAt: timestamp
}
```

## Image Storage Strategy

Since images are stored on third-party platforms (like Imgur):

1. **User Avatars**: Store Imgur URLs in user profile
2. **Group Cover Images**: Store Imgur URLs in gaming group document
3. **Post Images**: Store array of Imgur URLs in post document
4. **Game Images**: Store URLs from BGG or Imgur in games collection

**Imgur Integration Flow:**
- User uploads image → Frontend uploads to Imgur API
- Imgur returns URL → Store URL in Firestore
- Display images using stored URLs

## Alternative: Flattened Structure (Simpler Queries)

If you prefer simpler queries, you could also use:

```
users/{userId}                          // User profiles
gamingGroups/{groupId}                  // Groups with memberIds array
groupMembers/{groupId}_{userId}         // Group membership (composite key)
posts/{groupId}_{postId}                // Posts with groupId field
comments/{postId}_{commentId}           // Comments with postId field
gameInterests/{groupId}_{interestId}    // Interests with groupId field
games/{gameId}                          // Game catalog
userGames/{userId}_{gameId}             // User collections (composite key)
```

## Notes

1. **Denormalization**: Fields like `userName`, `gameName`, `organizerName` are denormalized for performance (no joins needed for display)

2. **Arrays vs Subcollections**: 
   - `memberIds` array for quick "is user in group?" checks and queries
   - `members/` subcollection for detailed membership info (RSVP, role, join date, etc.)
   - `sharedLibraryGameIds` array for quick access to all games in a group

3. **Game Catalog**: Central `games/` collection prevents duplication - multiple users can own the same game, and we store game details once

4. **Discussion Forum**: 
   - Posts are top-level in the group
   - Comments are nested under posts for hierarchical structure
   - Pinned posts appear first in queries

5. **Game Interests**: 
   - Tracks "interested in playing" requests
   - Links interested user to game owner
   - Can be tied to specific event dates for recurring groups

6. **Trading/Selling**: 
   - Stored in user's game document
   - Visible to group members when browsing shared library
   - Can be queried across all groups for marketplace features

7. **Location Queries**: For public group discovery, you'll need:
   - Geohash fields for proximity searches, OR
   - Cloud Functions for complex location queries, OR
   - Client-side filtering after fetching nearby groups

8. **Real-time Updates**: Subcollections enable real-time listeners for:
   - New posts and comments
   - Member joins/leaves
   - Game interest requests
   - RSVP updates

9. **Image Storage**: 
   - All images stored on third-party platforms (Imgur, Cloudinary, etc.)
   - Only URLs stored in Firestore
   - Reduces Firestore storage costs
   - Better for CDN delivery

10. **Privacy Model**:
    - Public groups: Anyone can view details and join
    - Private groups: Require join code or invitation
    - Members can see shared library and forum
    - Non-members can only see basic info (if public)

