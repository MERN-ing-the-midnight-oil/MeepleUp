# MeepleUp App Architecture Map

## I. Entry Point & App Structure

### A. Entry Point (`src/index.js`)
- Initializes React app
- Renders App component with React.StrictMode
- Loads global CSS

### B. App Component (`src/App.jsx`)
- **Purpose**: Root component with routing and context providers
- **Structure**:
  - Context Provider Hierarchy (outer to inner):
    1. AuthProvider - User authentication state
    2. AvailabilityProvider - User availability/scheduling
    3. EventsProvider - Gaming group/event management
    4. CollectionsProvider - Board game collections
  - **Routing** (React Router for web):
    - `/` - Landing/Onboarding (PublicRoute)
    - `/auth` - Authentication (PublicRoute)
    - `/events` - Events list screen (ProtectedRoute)
    - `/event/:eventId` - Event detail hub (ProtectedRoute)
    - `/event/:eventId/browse/:dateIndex` - Game browsing (ProtectedRoute)
    - `/collection` - User's game collection (ProtectedRoute)
    - `/profile` - User profile (ProtectedRoute)
  - **Route Protection**:
    - ProtectedRoute: Redirects to `/` if not authenticated
    - PublicRoute: Redirects to `/events` if already authenticated

---

## II. Context Providers (Global State Management)

### A. AuthContext (`src/context/AuthContext.jsx`)
- **Purpose**: Manages user authentication and profile data
- **State**:
  - `user`: Current user object (uid, email, name, bio, bggUsername, location, zipcode, photoURL, notificationPreferences)
  - `loading`: Auth initialization state
  - `isAuthenticated`: Boolean flag
  - `isEmailVerified`: Email verification status
- **Methods**:
  - `signup()`: Creates new user, sends verification email, saves to Firestore
  - `login()`: Authenticates user, loads profile from Firestore/local storage
  - `signInWithGoogle()`: OAuth Google sign-in (web: popup, native: expo-auth-session)
  - `logout()`: Signs out user
  - `updateUser()`: Updates profile (syncs to Firestore and local storage)
  - `updateNotificationPreferences()`: Updates notification settings
  - `deleteAccount()`: Deletes user data from Firestore and Auth
- **Data Flow**:
  - Firebase Auth → Firestore `users` collection → Local storage (backup)
  - Profile data cached in memory, synced on auth state changes
  - Email verification handled via URL callback

### B. EventsContext (`src/context/EventsContext.jsx`)
- **Purpose**: Manages gaming groups (MeepleUps) and event data
- **State**:
  - `events`: Array of event objects
  - `loading`: Initialization state
- **Event Structure**:
  - Basic: id, name, organizerId, description, location, address
  - Scheduling: scheduledFor, eventDates[], usualStartTime, usualEndTime
  - Membership: members[] (userId, role, rsvpStatus, rsvpStatuses, canShareJoinCode)
  - Access: joinCode, joinCodes[] (multiple codes supported)
  - Settings: rsvpSettings, isActive, deletedAt
- **Methods**:
  - `createEvent()`: Creates new group, saves to Firestore `gamingGroups`
  - `updateEvent()`: Updates event data
  - `archiveEvent()` / `unarchiveEvent()`: Soft delete/restore
  - `joinEventWithCode()`: Joins via join code (queries Firestore with retry logic)
  - `leaveEvent()`: Removes user from group
  - `updateMemberRSVP()`: Updates RSVP status (supports date-specific RSVPs)
  - `updateEventSchedule()`: Updates dates/times/location
  - `updateRSVPSettings()`: Configures RSVP options
  - `updateMemberRole()`: Promotes/demotes members (organizer only)
- **Data Flow**:
  - Firestore `gamingGroups` collection → Local state → Local storage
  - Members stored in subcollection: `gamingGroups/{id}/members`
  - Real-time sync on user authentication
  - Join code lookup with exponential backoff retry

### C. CollectionsContext (`src/context/CollectionsContext.jsx`)
- **Purpose**: Manages user board game collections
- **State**:
  - `collections`: Object mapping userId → array of games
  - `loading`: Loading state
- **Game Structure**:
  - id, title, bggId, image, thumbnail, description
  - yearPublished, minPlayers, maxPlayers, playingTime
  - bggRating, userRating, numplays, isFavorite
  - source (manual/bgg), addedAt, updatedAt
- **Methods**:
  - `getUserCollection(userId)`: Gets games for a user
  - `addGameToCollection()`: Adds game locally
  - `removeGameFromCollection()`: Removes game
  - `updateGameInCollection()`: Updates game data (syncs to Firestore)
  - `syncGamesForUsers()`: Batch syncs multiple users' collections
- **Data Flow**:
  - Firestore `userGames/{userId}/games` → Local state → Local storage
  - One-time sync on user login
  - Batch sync for event members

### D. AvailabilityContext (`src/context/AvailabilityContext.jsx`)
- **Purpose**: Manages user availability slots for finding gaming partners
- **State**:
  - `profile`: Current user's availability profile
  - `matches`: Computed matches with other users
  - `loading`, `saving`, `error`
- **Profile Structure**:
  - `slots[]`: Array of time slots (day, startTime, endTime, location, notes)
  - `isLooking`: Boolean flag
  - `preferences`: defaultRadiusMiles
  - `owner`: User display info
- **Methods**:
  - `saveSlot()`: Saves/updates availability slot (geocodes location)
  - `deleteSlot()`: Removes slot
  - `setLookingForMatches()`: Toggles match-seeking
  - `setDefaultRadius()`: Updates search radius
- **Data Flow**:
  - Firestore `availabilityProfiles` collection (real-time subscription)
  - Location geocoding via expo-location
  - Match computation: time overlap + distance within mutual radius
  - Real-time updates via onSnapshot

---

## III. Screens (Main Views)

### A. Landing/Onboarding (`src/screens/Onboarding.jsx`)
- **Purpose**: Welcome screen for unauthenticated users
- **Features**: Sign up/login prompts, app introduction
- **Wrapped in**: ParallaxBackground

### B. Auth Screen (`src/screens/Auth.jsx`)
- **Purpose**: Authentication interface
- **Modes**: Login, Signup, Password Reset
- **Features**: Email/password, Google OAuth, email verification
- **Wrapped in**: ParallaxBackground

### C. Events Screen (`src/screens/EventsScreen.jsx`)
- **Purpose**: List of user's gaming groups
- **Features**:
  - Display active events (EventCard components)
  - Create new event (CreateEventForm modal)
  - Join event by code (JoinForm)
  - Quick RSVP updates
  - Archive/unarchive events
  - User profile modals
- **Data Sources**: EventsContext, Firestore members subcollection
- **Navigation**: → EventHub (on event click)

### D. EventHub (`src/screens/EventHub.jsx`)
- **Purpose**: Detailed view of a single gaming group
- **Tabs**:
  1. **Event Tab**: Event details, schedule, members, RSVP management, join code sharing, iCal export
  2. **Games Tab**: Browse and propose games for event dates
  3. **Discussion Tab**: Posts, comments, game interests, private messaging
- **Features**:
  - Event schedule editing (organizer/co-organizer)
  - RSVP management screen (date-specific RSVPs)
  - Game browsing by date (BrowseAndProposeScreen)
  - Game proposal system
  - Discussion threads with notifications
  - Member management (roles, permissions)
  - Photo uploads (with tracking/limits)
- **Data Sources**: EventsContext, CollectionsContext, Firestore posts/comments collections

### E. BrowseAndProposeScreen (`src/screens/BrowseAndProposeScreen.jsx`)
- **Purpose**: Browse games and propose for specific event date
- **Features**:
  - Game search (BGG API, text input, Claude vision, barcode scanner)
  - Filter by category, player count, rating
  - Propose games for date
  - View proposed games
  - Game details modal
- **Data Sources**: CollectionsContext, BGG API, gameDatabase service

### F. Collection Screen (`src/screens/CollectionScreen.jsx`)
- **Purpose**: User's personal game collection
- **Features**:
  - Display collection (GameCard grid)
  - Add games (BGG import, manual entry, barcode scanner, Claude vision)
  - Edit/remove games
  - Filter/search
  - BGG sync
- **Data Sources**: CollectionsContext, BGG API

### G. Profile Screen (`src/screens/ProfileScreen.jsx`)
- **Purpose**: User profile and settings
- **Features**:
  - Edit profile (name, bio, location, BGG username)
  - Notification preferences
  - Account deletion
  - Availability profile management
- **Data Sources**: AuthContext, AvailabilityContext

---

## IV. Components (Reusable UI)

### A. Common Components (`src/components/common/`)
- **Button.jsx**: Styled button with variants
- **Input.jsx**: Text input with validation
- **Modal.jsx**: Overlay modal dialog
- **LoadingSpinner.jsx**: Loading indicator
- **CalendarDatePicker.jsx**: Date selection
- **DateTimePicker.jsx**: Date/time selection
- **KeyboardAwareScrollView.jsx**: Scroll view that adjusts for keyboard

### B. Event Components
- **EventCard.jsx**: Event summary card (name, date, members, RSVP)
- **CreateEventForm.jsx**: Form to create new event
- **JoinForm.jsx**: Join event by code
- **RSVPButtons.jsx**: RSVP action buttons
- **RSVPManagementScreen.jsx**: Full RSVP management interface
- **LeaveEventButton.jsx**: Leave event handler
- **ContactOrganizerForm.jsx**: Contact form for non-members

### C. Game Components
- **GameCard.jsx**: Game display card (image, title, metadata, badges)
- **GameCard.styled.jsx**: Styled components for GameCard
- **GameDetailsModal.jsx**: Detailed game view
- **CategoryBadge.jsx**: Game category indicator
- **BGGImport.jsx**: BGG collection import interface
- **ClaudeGameIdentifier.jsx**: AI game identification via vision
- **TextListGameIdentifier.jsx**: Text-based game search

### D. User Components
- **UserProfileModal.jsx**: User profile popup
- **NotificationSettings.jsx**: Notification preferences UI

### E. Messaging Components
- **PrivateMessaging.jsx**: Direct messaging between users
- **Discussion threads**: Posts and comments (in EventHub)

### F. UI Components
- **ParallaxBackground.jsx**: Animated background
- **AnimatedBackground.jsx**: Alternative animated background
- **WebNavigation.jsx**: Top navigation bar (web)
- **Navigation.jsx**: Mobile navigation
- **GearIcon.jsx**: Settings icon
- **PoweredByBGG.jsx**: BGG attribution

---

## V. Services (External APIs & Data)

### A. BGG API (`src/services/bggApi.js`)
- **Purpose**: BoardGameGeek API integration
- **Functions**:
  - `fetchCollection()`: Gets user's BGG collection
  - `searchGames()`: Searches BGG database
  - `getGameDetails()`: Fetches game information
  - `fetchGameImage()`: Gets game images
- **Data Flow**: BGG XML API → Parse → Normalize → App

### B. Game Database (`src/services/gameDatabase.js`)
- **Purpose**: Local game data management
- **Functions**:
  - `getGameById()`: Retrieves game from Firestore/local
  - `saveGame()`: Saves game to Firestore
  - `searchGames()`: Searches local database
- **Data Flow**: Firestore `games` collection (cached locally)

### C. Claude Vision (`src/services/claudeVision.js`)
- **Purpose**: AI-powered game identification from images
- **Functions**: Analyzes photos to identify board games
- **Data Flow**: Image → Claude API → Game suggestions

### D. Messaging (`src/services/messaging.js`)
- **Purpose**: Private messaging between users
- **Data Flow**: Firestore `messages` collection

### E. Blocking (`src/services/blocking.js`)
- **Purpose**: User blocking functionality
- **Functions**: `getBlockedUsers()`, block/unblock operations
- **Data Flow**: Firestore `blockedUsers` collection

---

## VI. Utils (Helpers & Utilities)

### A. Navigation (`src/utils/navigation.js`)
- **Purpose**: Unified navigation for web/native
- **Function**: `useUnifiedNavigation()` - Platform-agnostic navigation hook

### B. Storage (`src/utils/storage.js`)
- **Purpose**: Local storage abstraction (AsyncStorage for native, localStorage for web)

### C. Theme (`src/utils/theme.js`)
- **Purpose**: Theme constants and common styles
- **Exports**: Colors, typography, spacing, commonStyles

### D. Responsive (`src/utils/responsive.js`)
- **Purpose**: Responsive design utilities
- **Function**: `useResponsive()` - Returns isMobile, isTablet, isDesktop

### E. Helpers (`src/utils/helpers.js`)
- **Purpose**: General utility functions
- **Functions**: `formatDate()`, `formatTime()`, validation helpers

### F. Notifications (`src/utils/notifications.js`)
- **Purpose**: Push notification management
- **Functions**: 
  - `notifyMeepleUpMembers()`: Notify group members
  - `notifyDiscussionActivity()`: Discussion notifications
  - `notifyGameOwner()`: Game-related notifications
- **Data Flow**: Expo Notifications API → Firebase Cloud Messaging

### G. Image Upload (`src/utils/imageUpload.js`)
- **Purpose**: Image upload to Firebase Storage
- **Functions**: `pickAndUploadImage()`, photo tracking
- **Data Flow**: Device → Firebase Storage → Firestore metadata

### H. iCal Export (`src/utils/icalExport.js`)
- **Purpose**: Calendar export functionality
- **Functions**: `generateIcalEvent()`, `downloadIcalFile()`, Google Calendar URL

### I. Game Badges (`src/utils/gameBadges.js`)
- **Purpose**: Game rating/quality indicators
- **Functions**: `getStarRating()`, category badges

### J. API (`src/utils/api.js`)
- **Purpose**: API validation helpers
- **Functions**: `validateJoinCode()`

### K. Constants (`src/utils/constants.js`)
- **Purpose**: App-wide constants

### L. Wordlist (`src/utils/wordlist.js`)
- **Purpose**: Join code word generation
- **Exports**: wordList1, wordList2, wordList3

---

## VII. Data Flow Patterns

### A. Authentication Flow
1. User signs up/logs in → Firebase Auth
2. Auth state change → AuthContext loads profile
3. Profile loaded from Firestore → Cached in local storage
4. User data available throughout app via `useAuth()`

### B. Event Creation Flow
1. User creates event → `createEvent()` in EventsContext
2. Event saved to Firestore `gamingGroups` collection
3. Organizer added to `members` subcollection
4. Local state updated → Local storage synced
5. Event appears in EventsScreen

### C. Join Event Flow
1. User enters join code → `joinEventWithCode()`
2. Query Firestore with retry logic (handles propagation delay)
3. If found: Add user to `members` subcollection
4. Update `memberIds` array in group document
5. Local state updated → Event appears in user's list

### D. Game Collection Flow
1. User imports from BGG → BGG API fetches collection
2. Games saved to Firestore `userGames/{userId}/games`
3. CollectionsContext syncs → Local state updated
4. Games available in CollectionScreen and EventHub

### E. RSVP Flow
1. User updates RSVP → `updateMemberRSVP()` in EventsContext
2. RSVP saved to member document in Firestore
3. Date-specific RSVPs stored in `rsvpStatuses` object
4. Local state updated immediately (non-blocking Firestore update)
5. Waitlist promotion if attendance limit reached

### F. Discussion Flow
1. User creates post → Saved to Firestore `gamingGroups/{id}/posts`
2. Comments saved to `posts/{postId}/comments` subcollection
3. Real-time updates via Firestore listeners
4. Notifications sent to subscribed users

### G. Availability Matching Flow
1. User creates availability slots → Saved to `availabilityProfiles`
2. Real-time subscription to all profiles
3. Match computation: time overlap + distance check
4. Matches displayed in AvailabilityContext

---

## VIII. Firebase Structure

### Collections:
- `users` - User profiles
- `gamingGroups` - Events/MeepleUps
  - `members` (subcollection) - Group members with RSVPs
  - `posts` (subcollection) - Discussion posts
    - `comments` (subcollection) - Post comments
  - `gameInterests` (subcollection) - Proposed games per date
- `userGames/{userId}/games` - User game collections
- `availabilityProfiles` - User availability slots
- `messages` - Private messages
- `blockedUsers` - Blocked user relationships
- `games` - Cached game data

---

## IX. Key Features Summary

1. **Gaming Groups (MeepleUps)**: Private groups with join codes, member management, RSVPs
2. **Game Collections**: BGG sync, manual entry, barcode/vision scanning
3. **Event Scheduling**: Single/multi-date events, recurring patterns, iCal export
4. **RSVP System**: Date-specific RSVPs, attendance limits, waitlist promotion
5. **Discussion**: Posts, comments, game proposals, notifications
6. **Availability Matching**: Find gaming partners by time/location overlap
7. **Private Messaging**: Direct user-to-user messaging
8. **BGG Integration**: Collection import, game search, ratings
9. **Multi-platform**: Web (React Router) and Native (React Navigation) support

---

## X. Information Flow Summary

**Top-Down**: App → Context Providers → Screens → Components → Services/Utils
**Bottom-Up**: User Actions → Components → Screens → Context → Firestore/Local Storage
**Real-time**: Firestore listeners → Context updates → Component re-renders
**Caching**: Firestore → Local state → Local storage (backup)

