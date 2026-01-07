# MeepleUp

MeepleUp is a cross-platform mobile and web application that helps private board game groups coordinate their regular game nights. Users can quickly catalog their board game collections using AI-powered game recognition, which pulls game data from BoardGameGeek's API. The core value is making it easy for game night attendees to browse each other's collections and request games they'd like to play at upcoming events.

The app is organized around events - recurring game nights at breweries, game stores, or private homes. Each event has its own hub where members can RSVP, see who's attending, browse the collective game library from all members, and post on a simple message board. Events are private and invitation-only, using join codes for access control.

---

## Table of Contents

### [I. Architecture & Layout](#i-architecture--layout)
- [Entry Points](#entry-points)
- [Context Providers Hierarchy](#context-providers-hierarchy)
- [Screen Structure](#screen-structure)
- [Component Organization](#component-organization)
- [Services Layer](#services-layer)
- [Utilities Layer](#utilities-layer)
- [Data Flow Patterns](#data-flow-patterns)
- [Firebase Database Structure](#firebase-database-structure)

### [II. Technical Choices](#ii-technical-choices)
- [Technology Stack](#technology-stack)
- [State Management Strategy](#state-management-strategy)
- [Routing & Navigation](#routing--navigation)
- [API Integration Strategies](#api-integration-strategies)
- [Data Persistence](#data-persistence)
- [Styling & Theming](#styling--theming)
- [Platform-Specific Considerations](#platform-specific-considerations)
- [Performance Optimizations](#performance-optimizations)

### [III. User's Manual](#iii-users-manual)
- [Getting Started](#getting-started)
- [Authentication & Account Setup](#authentication--account-setup)
- [Creating & Managing Events](#creating--managing-events)
- [Joining Events](#joining-events)
- [Managing Your Game Collection](#managing-your-game-collection)
- [Event Hub Features](#event-hub-features)
- [RSVP Management](#rsvp-management)
- [Discussion & Messaging](#discussion--messaging)
- [Profile & Settings](#profile--settings)
- [Troubleshooting](#troubleshooting)

---

# I. Architecture & Layout

## Entry Points

### Web Entry (`src/index.js`)
- Initializes React app for web platform
- Renders App component with React.StrictMode
- Loads global CSS styles
- Entry point: `src/App.jsx` (React Router)

### Native Entry (`App.js`)
- Expo/React Native entry point
- Configures React Navigation
- Sets default font family (Graphik)
- Entry point: Native stack navigator

## Context Providers Hierarchy

The app uses a nested provider structure for global state management:

```
App
└── AuthProvider (outermost)
    └── SubscriptionProvider
        └── AvailabilityProvider
            └── EventsProvider
                └── CollectionsProvider
                    └── NotificationProvider (web only)
                        └── AppContent (screens)
```

### Provider Responsibilities

1. **AuthProvider** (`src/context/AuthContext.jsx`)
   - User authentication state
   - Profile data management
   - Email verification
   - Google/Apple OAuth
   - Account deletion

2. **SubscriptionProvider** (`src/context/SubscriptionContext.jsx`)
   - In-app purchase management
   - Subscription status
   - Feature gating

3. **AvailabilityProvider** (`src/context/AvailabilityContext.jsx`)
   - User availability slots
   - Match computation (time/location overlap)
   - Real-time availability updates

4. **EventsProvider** (`src/context/EventsContext.jsx`)
   - Gaming groups (MeepleUps) management
   - Event schedules
   - Member management
   - RSVP tracking
   - Join code generation

5. **CollectionsProvider** (`src/context/CollectionsContext.jsx`)
   - User game collections
   - Game data caching
   - Collection synchronization

6. **NotificationProvider** (`src/context/NotificationContext.jsx`) - Web only
   - Push notification management
   - Notification preferences

## Screen Structure

### Public Screens
- **Landing** (`src/screens/Landing.jsx`) - Welcome screen for unauthenticated users
- **Auth** (`src/screens/Auth.jsx`) - Login/signup interface
- **VerifyEmail** (`src/screens/VerifyEmail.jsx`) - Email verification screen

### Protected Screens
- **Onboarding** (`src/screens/Onboarding.jsx`) - Main events list (home screen)
- **EventsScreen** (`src/screens/EventsScreen.jsx`) - Web version of events list
- **EventHub** (`src/screens/EventHub.jsx`) - Individual event detail view with tabs
- **BrowseAndProposeScreen** (`src/screens/BrowseAndProposeScreen.jsx`) - Game browsing for specific dates
- **CollectionScreen** (`src/screens/CollectionScreen.jsx`) - User's game collection
- **ProfileScreen** (`src/screens/ProfileScreen.jsx`) - User profile and settings

## Component Organization

### Common Components (`src/components/common/`)
- `Button.jsx` - Styled button with variants
- `Input.jsx` - Text input with validation
- `Modal.jsx` - Overlay modal dialog
- `LoadingSpinner.jsx` - Loading indicator
- `CalendarDatePicker.jsx` - Date selection component
- `DateTimePicker.jsx` - Date/time picker
- `KeyboardAwareScrollView.jsx` - Scroll view that adjusts for keyboard

### Event Components
- `EventCard.jsx` - Event summary card
- `CreateEventForm.jsx` - Event creation form
- `JoinForm.jsx` - Join event by code form
- `RSVPButtons.jsx` - RSVP action buttons
- `RSVPManagementScreen.jsx` - Full RSVP management interface
- `LeaveEventButton.jsx` - Leave event handler
- `ContactOrganizerForm.jsx` - Contact form for non-members
- `LogisticsCardV2.jsx` - Event logistics display

### Game Components
- `GameCard.jsx` - Game display card
- `GameCard.styled.jsx` - Styled components for GameCard
- `GameDetailsModal.jsx` - Detailed game view modal
- `CategoryBadge.jsx` - Game category indicator
- `BGGImport.jsx` - BGG collection import interface
- `ClaudeGameIdentifier.jsx` - AI game identification via vision
- `TextListGameIdentifier.jsx` - Text-based game search
- `GameCollectionView.jsx` - Collection display component
- `BeepleRecommendations.jsx` - AI-powered game recommendations
- `BeepleGameOptimizer.jsx` - Game selection optimizer

### User Components
- `UserProfileModal.jsx` - User profile popup
- `NotificationSettings.jsx` - Notification preferences UI
- `BeepleAvatar.jsx` - User avatar component
- `PersonalMatchSettings.jsx` - Personal match preferences

### Messaging Components
- `PrivateMessaging.jsx` - Direct messaging between users

### UI Components
- `ParallaxBackground.jsx` - Animated background (web)
- `AnimatedBackground.jsx` - Alternative animated background
- `WebNavigation.jsx` - Top navigation bar (web)
- `Navigation.jsx` - Mobile navigation
- `GearIcon.jsx` - Settings icon
- `PoweredByBGG.jsx` - BGG attribution
- `SubscriptionGate.jsx` - Feature gating component
- `SubscriptionScreen.jsx` - Subscription management
- `MeepleupPurchaseModal.jsx` - Purchase flow modal
- `NotificationPopup.jsx` - Notification display

## Services Layer

### External API Services (`src/services/`)

1. **BGG API** (`bggApi.js`)
   - BoardGameGeek XML API integration
   - Game search and details fetching
   - Rate limiting and retry logic
   - XML parsing (DOMParser + regex fallback)
   - Batch game fetching

2. **Claude Vision** (`claudeVision.js`)
   - AI-powered game identification from images
   - Photo analysis and game matching

3. **Game Database** (`gameDatabase.js`)
   - Local game data management
   - Firestore game caching
   - Game search and retrieval

4. **Messaging** (`messaging.js`)
   - Private messaging between users
   - Firestore message management

5. **Blocking** (`blocking.js`)
   - User blocking functionality
   - Blocked user management

6. **Subscription Service** (`subscriptionService.js`)
   - In-app purchase handling
   - Subscription verification

7. **MeepleUp Purchase Service** (`meepleupPurchaseService.js`)
   - Event-specific purchases

8. **Match Scores** (`matchScores.js`)
   - Game matching algorithm
   - Similarity scoring

## Utilities Layer

### Core Utilities (`src/utils/`)

1. **Navigation** (`navigation.js`)
   - Unified navigation for web/native
   - Platform-agnostic navigation hook

2. **Storage** (`storage.js`)
   - Local storage abstraction
   - AsyncStorage (native) / localStorage (web)

3. **Theme** (`theme.js`)
   - Theme constants and common styles
   - Colors, typography, spacing

4. **Responsive** (`responsive.js`)
   - Responsive design utilities
   - Device detection (mobile/tablet/desktop)

5. **Helpers** (`helpers.js`)
   - General utility functions
   - Date/time formatting
   - Validation helpers

6. **Notifications** (`notifications.js`)
   - Push notification management
   - Notification scheduling

7. **Image Upload** (`imageUpload.js`)
   - Image upload to Firebase Storage
   - Photo tracking and limits

8. **iCal Export** (`icalExport.js`)
   - Calendar export functionality
   - Google Calendar URL generation

9. **Game Badges** (`gameBadges.js`)
   - Game rating/quality indicators
   - Star rating display

10. **API** (`api.js`)
    - API validation helpers
    - Join code validation

11. **Constants** (`constants.js`)
    - App-wide constants

12. **Wordlist** (`wordlist.js`)
    - Join code word generation
    - Three-word code system

13. **Game Optimizer** (`gameOptimizer.js`)
    - Game selection optimization
    - Recommendation algorithms

14. **Game Similarities** (`gameSimilarities.js`)
    - Game similarity computation
    - Matching algorithms

15. **Match Score** (`matchScore.js`)
    - User matching scores
    - Compatibility calculation

16. **Meeple Bot** (`meepleBot.js`)
    - Bot functionality
    - Automated responses

17. **Optimized Recommendations** (`optimizedRecommendations.js`)
    - AI recommendation system

18. **Photo Upload Tracking** (`photoUploadTracking.js`)
    - Photo upload limits
    - Usage tracking

19. **Notification Hooks** (`notificationHooks.js`)
    - React hooks for notifications

20. **Holidays** (`holidays.js`)
    - Holiday calendar
    - Date utilities

## Data Flow Patterns

### Authentication Flow
1. User signs up/logs in → Firebase Auth
2. Auth state change → AuthContext loads profile
3. Profile loaded from Firestore → Cached in local storage
4. User data available throughout app via `useAuth()`

### Event Creation Flow
1. User creates event → `createEvent()` in EventsContext
2. Event saved to Firestore `gamingGroups` collection
3. Organizer added to `members` subcollection
4. Local state updated → Local storage synced
5. Event appears in EventsScreen

### Join Event Flow
1. User enters join code → `joinEventWithCode()`
2. Query Firestore with retry logic (handles propagation delay)
3. If found: Add user to `members` subcollection
4. Update `memberIds` array in group document
5. Local state updated → Event appears in user's list

### Game Collection Flow
1. User imports from BGG → BGG API fetches collection
2. Games saved to Firestore `userGames/{userId}/games`
3. CollectionsContext syncs → Local state updated
4. Games available in CollectionScreen and EventHub

### RSVP Flow
1. User updates RSVP → `updateMemberRSVP()` in EventsContext
2. RSVP saved to member document in Firestore
3. Date-specific RSVPs stored in `rsvpStatuses` object
4. Local state updated immediately (non-blocking Firestore update)
5. Waitlist promotion if attendance limit reached

### Discussion Flow
1. User creates post → Saved to Firestore `gamingGroups/{id}/posts`
2. Comments saved to `posts/{postId}/comments` subcollection
3. Real-time updates via Firestore listeners
4. Notifications sent to subscribed users

### Availability Matching Flow
1. User creates availability slots → Saved to `availabilityProfiles`
2. Real-time subscription to all profiles
3. Match computation: time overlap + distance check
4. Matches displayed in AvailabilityContext

## Firebase Database Structure

### Collections

```
users/
  {userId}/
    - uid, email, name, bio, bggUsername
    - location, zipcode, photoURL
    - notificationPreferences
    - personalMatchWeights

gamingGroups/
  {groupId}/
    - name, description, location, address
    - organizerId, joinCode, joinCodes[]
    - scheduledFor, eventDates[]
    - usualStartTime, usualEndTime
    - rsvpSettings, isActive, deletedAt
    - memberIds[]
    
    members/ (subcollection)
      {userId}/
        - role (organizer/co-organizer/member)
        - rsvpStatus, rsvpStatuses{}
        - canShareJoinCode
    
    posts/ (subcollection)
      {postId}/
        - authorId, content, createdAt
        - comments/ (subcollection)
          {commentId}/
            - authorId, content, createdAt
    
    gameInterests/ (subcollection)
      {dateIndex}/
        - gameId, userId, rating

userGames/
  {userId}/
    games/ (subcollection)
      {gameId}/
        - bggId, title, image, thumbnail
        - yearPublished, minPlayers, maxPlayers
        - bggRating, userRating, numplays
        - isFavorite, source, addedAt

availabilityProfiles/
  {userId}/
    - slots[] (day, startTime, endTime, location)
    - isLooking, preferences
    - owner (user display info)

messages/
  {messageId}/
    - fromUserId, toUserId, content
    - createdAt, readAt

blockedUsers/
  {userId}/
    - blockedUserIds[]

games/
  {gameId}/
    - Cached game data from BGG API
    - All game metadata
```

---

# II. Technical Choices

## Technology Stack

### Core Framework
- **React 19.1.0** - Modern React with hooks
- **React Native 0.81.5** - Cross-platform mobile framework
- **Expo SDK 54** - Development platform and tooling

### Routing & Navigation
- **React Router v6** (Web) - Client-side routing for web
- **React Navigation v6** (Native) - Native navigation stack
- **@react-navigation/native-stack** - Stack navigator for native

### State Management
- **React Context API** - Global state management
- **React Hooks** - Local component state
- No Redux (Context API sufficient for app scale)

### Backend & Database
- **Firebase v9** - Backend-as-a-Service
  - **Firebase Auth** - Authentication
  - **Cloud Firestore** - NoSQL database
  - **Firebase Storage** - File storage
  - **Cloud Functions** - Serverless functions

### API Integration
- **BoardGameGeek XML API** - Game data source
- **Claude AI API** - Vision-based game identification
- **fast-xml-parser** - XML parsing library

### Authentication
- **Firebase Authentication** - Email/password
- **Google Sign-In** - OAuth via `@react-native-google-signin/google-signin`
- **Apple Sign-In** - OAuth via `expo-apple-authentication`

### UI & Styling
- **CSS Variables** - Theming system
- **Styled Components** - Component-level styling (GameCard)
- **Expo Google Fonts** - 40+ font families available
- **Responsive Design** - Mobile-first approach

### Media & Device Features
- **expo-camera** - Camera access for game scanning
- **expo-image-picker** - Image selection
- **expo-location** - Location services
- **expo-notifications** - Push notifications
- **expo-file-system** - File system access
- **expo-sharing** - Share functionality

### In-App Purchases
- **expo-in-app-purchases** - Subscription management

### Utilities
- **axios** - HTTP client (legacy, mostly using fetch now)
- **zipcodes** - ZIP code utilities
- **@react-native-async-storage/async-storage** - Local storage

## State Management Strategy

### Context API Pattern
The app uses React Context API for global state, organized by domain:

1. **AuthContext** - User authentication and profile
2. **EventsContext** - Gaming groups and events
3. **CollectionsContext** - Game collections
4. **AvailabilityContext** - User availability matching
5. **SubscriptionContext** - In-app purchases
6. **NotificationContext** - Push notifications (web)

### State Update Strategy
- **Optimistic Updates** - UI updates immediately, Firestore syncs in background
- **Real-time Sync** - Firestore listeners for live updates
- **Local Caching** - AsyncStorage/localStorage for offline support
- **Batch Operations** - Efficient bulk updates where possible

### Data Normalization
- Collections stored as objects keyed by ID for O(1) lookup
- Subcollections used for hierarchical data (members, posts, comments)
- Denormalization for read performance (memberIds array in group doc)

## Routing & Navigation

### Web Routing (React Router)
```
/ → Landing/Onboarding (public)
/auth → Authentication (public)
/events → Events list (protected)
/event/:eventId → Event hub (protected)
/event/:eventId/browse/:dateIndex → Game browsing (protected)
/collection → Collection management (protected)
/profile → User profile (protected)
/subscription → Subscription management (protected)
```

### Native Navigation (React Navigation)
- Stack navigator with conditional screens based on auth state
- Tab navigation via custom Navigation component
- Deep linking support via Expo

### Route Protection
- **ProtectedRoute** - Redirects to `/` if not authenticated
- **PublicRoute** - Redirects to `/events` if already authenticated
- **Smart Redirect** - Auto-redirects to single event or collection if applicable

## API Integration Strategies

### BoardGameGeek API

**Rate Limiting Strategy:**
- Bulk operations: 5 second delay between calls
- Normal operations: 0.5 second delay
- Exponential backoff on 429 errors (5s, 10s)
- Batch fetching (20 games per request)

**Authentication:**
- Bearer token in Authorization header (primary)
- Token as query parameter (fallback)
- Unauthenticated requests (final fallback)

**Error Handling:**
- Retry logic with exponential backoff
- Graceful degradation (empty results on failure)
- XML parsing with DOMParser + regex fallback

**Caching:**
- Firestore `games` collection for cached game data
- Reduces redundant API calls
- Batch fetching for collection imports

### Claude Vision API

**Image Processing:**
- Photo capture via expo-camera
- Image optimization before upload
- Base64 encoding for API requests

**Game Identification:**
- Vision analysis of game shelf photos
- Text extraction and game name matching
- BGG API lookup for identified games

## Data Persistence

### Primary Storage: Firebase Firestore
- Real-time database with offline support
- Automatic sync across devices
- Subcollections for hierarchical data
- Security rules for access control

### Local Caching: AsyncStorage/localStorage
- Profile data backup
- Offline access to recent data
- Faster initial load times
- Fallback when Firestore unavailable

### Data Sync Strategy
- **On Login**: Full sync of user data
- **On Event Join**: Incremental sync
- **Real-time Listeners**: Live updates for active screens
- **Background Sync**: Periodic updates for inactive data

## Styling & Theming

### CSS Variables System
Defined in `src/index.css`:
- Color palette (primary, secondary, accent, background)
- Spacing scale (consistent margins/padding)
- Typography scale (font sizes, line heights)
- Border radius values
- Shadow definitions

### Component Styling
- **Inline Styles** - React Native StyleSheet
- **CSS Classes** - Web platform
- **Styled Components** - Complex components (GameCard)
- **Theme Utilities** - Shared theme constants

### Responsive Design
- Mobile-first approach
- Breakpoints via `useResponsive()` hook
- Platform-specific components (WebNavigation vs Navigation)
- Adaptive layouts for tablet/desktop

## Platform-Specific Considerations

### Web Platform
- React Router for navigation
- CSS for styling
- Browser APIs (localStorage, window.location)
- Web-specific components (ParallaxBackground, WebNavigation)
- Progressive Web App capabilities

### Native Platform (iOS/Android)
- React Navigation for navigation
- StyleSheet for styling
- Native modules (camera, location, notifications)
- Platform-specific permissions
- Native sharing APIs

### Code Sharing Strategy
- Shared business logic in services/utils
- Platform-specific components when needed
- Conditional rendering based on Platform.OS
- Unified navigation hook abstraction

## Performance Optimizations

### Code Splitting
- Lazy loading of fonts (on-demand loading)
- Component-level code splitting
- Route-based code splitting (web)

### Image Optimization
- Thumbnail generation for game images
- Lazy loading of images
- Caching in Firebase Storage
- Progressive image loading

### Data Fetching
- Batch API calls where possible
- Pagination for large lists
- Virtual scrolling for long lists
- Debouncing for search inputs

### State Management
- Memoization with useMemo/useCallback
- Selective context subscriptions
- Local state for UI-only data
- Optimistic updates for better UX

### Caching Strategy
- Firestore offline persistence
- Local storage for critical data
- Game data caching in Firestore
- API response caching

---

# III. User's Manual

## Getting Started

### Installation

**For Web:**
1. Navigate to the MeepleUp web app in your browser
2. No installation required - works in modern browsers

**For Mobile (iOS/Android):**
1. Download from App Store (iOS) or Google Play (Android)
2. Open the app after installation
3. Follow the onboarding flow

### First Time Setup

1. **Create an Account**
   - Tap "Create Account" on the landing screen
   - Enter your email and password
   - Or sign in with Google/Apple
   - Verify your email address (check your inbox)

2. **Complete Your Profile**
   - Add your name and bio
   - Optionally link your BoardGameGeek username
   - Set your location (for finding nearby players)

3. **Add Games to Your Collection**
   - Navigate to "Your Games" (Collection screen)
   - Import from BoardGameGeek or scan games with AI
   - See [Managing Your Game Collection](#managing-your-game-collection) for details

## Authentication & Account Setup

### Creating an Account

**Email/Password:**
1. Tap "Create Account" on the landing screen
2. Enter your full name
3. Enter your email address
4. Create a password (minimum 8 characters)
5. Confirm your password
6. Tap "Create Account"
7. Check your email for verification link

**Social Sign-In:**
1. Tap "Sign in with Google" or "Sign in with Apple"
2. Authorize MeepleUp in the popup
3. Your account is created automatically

### Signing In

1. Tap "Sign In" on the landing screen
2. Enter your email and password
3. Or use Google/Apple sign-in
4. If you forgot your password, tap "Forgot Password"

### Email Verification

- After creating an account, check your email
- Click the verification link
- Return to the app - you'll be automatically verified
- If you need to resend, go to Profile → Resend Verification Email

### Password Reset

1. On the Sign In screen, tap "Forgot Password"
2. Enter your email address
3. Check your email for reset link
4. Follow the link to create a new password

## Creating & Managing Events

### Creating a New Event (MeepleUp)

1. From the Events screen, tap "Host New MeepleUp"
2. Fill in the event details:
   - **Event Name** (required) - e.g., "Tuesday Brewery Night"
   - **Location** (required) - General location description
   - **Share Exact Address** (optional) - Toggle to share precise location
   - **Exact Address** (if sharing) - Full address for GPS
3. **Set Schedule:**
   - Tap calendar to select event dates
   - Set usual start and end times
   - Edit individual date times if different
4. **Add Description** (optional) - Notes about the event
5. **RSVP Settings:**
   - Toggle RSVP required on/off
   - Set attendance limit (optional)
6. Tap "Create Event"
7. **Save your join code** - Share this 3-word code with friends

### Editing Event Details

**As Organizer:**
1. Open the event from Events screen
2. Go to Event tab
3. Tap "Edit" on schedule, description, or settings
4. Make changes and save

**Schedule Editing:**
- Add new dates via calendar picker
- Remove dates by tapping delete
- Edit times for individual dates
- Update locations per date
- Add notes to specific dates

### Archiving Events

**To Archive:**
1. Open the event
2. Tap "Archive Event" (organizer only)
3. Event moves to archived section

**To Unarchive:**
1. Scroll to "Archived MeepleUps" section
2. Tap "Unarchive" on the event

### Regenerating Join Code

1. Open the event (as organizer)
2. Go to Event tab
3. Tap "Regenerate Join Code"
4. New 3-word code is generated
5. Share the new code with members

## Joining Events

### Joining with a Join Code

1. From Events screen, tap "Join MeepleUp"
2. Enter the 3-word join code (e.g., "happy-dice-fun")
3. Tap "Join"
4. Event appears in your events list

### Requesting to Join (Non-Members)

If you have a link to an event but aren't a member:
1. Open the event link
2. Tap "Contact Organizer"
3. Fill in the contact form:
   - Your name
   - Email or phone
   - Message (optional)
4. Submit request
5. Organizer will receive your request

### Leaving an Event

**As Regular Member:**
1. Open the event card
2. Tap "Leave MeepleUp"
3. Confirm leaving
4. You'll be removed from the event

**Note:** Organizers cannot leave their own events (must archive instead)

## Managing Your Game Collection

### Adding Games

**Method 1: BoardGameGeek Import**
1. Go to Collection screen
2. Tap "Import from BGG"
3. Enter your BGG username
4. Tap "Import Collection"
5. Games are automatically added

**Method 2: AI Scanner**
1. Go to Collection screen
2. Tap the camera/scanner icon
3. Take a photo of your game shelf
4. AI identifies games in the photo
5. Review and add identified games

**Method 3: Text Search**
1. Go to Collection screen
2. Tap "Add Game"
3. Search for game by name
4. Select from search results
5. Game is added to collection

**Method 4: Barcode Scanner** (if available)
1. Use barcode scanner feature
2. Scan game barcode
3. Game is identified and added

### Viewing Your Collection

**Sorting Options:**
- **By Rating** - Highest rated first
- **By Category** - Grouped by game category
- **By Title** - Alphabetical order

**Filtering:**
- Filter by category (Strategy, Family, Party, etc.)
- Search by game name
- View favorites only

### Managing Games

**Mark as Favorite:**
1. Open game details (tap game card)
2. Tap star/crown icon
3. Game is marked as favorite

**Delete Game:**
1. Open game details
2. Tap "Remove from Collection"
3. Confirm deletion

**Edit Game Info:**
- User ratings and play counts are tracked
- Update number of plays
- Add personal notes

### Game Details View

Tap any game card to see:
- Full game image
- Title and year published
- BGG rating (stars and numeric)
- Player count range
- Playing time
- Age rating
- Category badges
- Game description
- Your personal rating (if set)
- Number of plays

## Event Hub Features

The Event Hub is the central place for each gaming group. It has three main tabs:

### Event Tab

**Viewing Event Information:**
- Event name and description
- Schedule (all event dates with times)
- Location (general or exact if shared)
- Member list with avatars
- RSVP status for each date

**RSVP Actions:**
1. Select a date from the schedule
2. Tap RSVP buttons:
   - **Going** - You'll attend
   - **Maybe** - You might attend
   - **Can't Make It** - You won't attend
3. RSVP applies to that specific date

**Calendar Export:**
- Tap "Add to Calendar"
- Choose iCal download or Google Calendar
- Event is added to your calendar

**Sharing:**
- Tap "Share Event"
- Copy join code to share
- Send to friends via message/email

**Organizer Features:**
- Edit schedule, description, settings
- Manage RSVPs (see RSVP Management)
- View contact requests
- Regenerate join code
- Archive event

### Games Tab

**Browsing Games:**
1. Select an event date (if multiple dates)
2. View aggregated collection from all members
3. Filter by category
4. Sort by rating, category, or title

**Game Details:**
- Tap any game card for full details
- See who owns the game
- View BGG ratings and info

**Proposing Games:**
1. Browse or search for games
2. Tap "Propose" on a game
3. Game appears in proposed games list
4. Members can rate proposed games

**Viewing Proposed Games:**
- See all games proposed for the date
- View member ratings
- See which games are most popular

**Attendee Collections:**
- View individual member's collections
- Filter by selected date
- See what games each person is bringing

### Discussion Tab

**Creating Posts:**
1. Go to Discussion tab
2. Tap "New Post"
3. Enter your message
4. Tap "Post"
5. Post appears in discussion feed

**Replying to Posts:**
1. Tap on a post to view details
2. Scroll to comments section
3. Enter your reply
4. Tap "Reply"
5. Comment appears under the post

**Editing/Deleting:**
- Tap "Edit" on your own posts/comments
- Make changes and save
- Or tap "Delete" to remove

**Game Interests:**
- Propose games you'd like to play
- Rate games others have proposed
- See popular game choices

## RSVP Management

### For Regular Members

**RSVP to Dates:**
1. Open Event Hub → Event tab
2. Find the date in the schedule
3. Tap RSVP button (Going/Maybe/Can't Make It)
4. Your status updates immediately

**Viewing RSVPs:**
- See your RSVP status for each date
- View RSVP counts (Going/Maybe totals)
- See attendance limit status

### For Organizers

**RSVP Management Screen:**
1. Open Event Hub → Event tab
2. Tap "Manage RSVPs"
3. View all member RSVPs organized by status

**RSVP Settings:**
- **Enable/Disable RSVP** - Turn RSVP system on/off
- **Allow Maybe** - Enable/disable "Maybe" option
- **Attendance Limit** - Set maximum attendees

**Managing Member RSVPs:**
- View members grouped by RSVP status
- Override member RSVP if needed
- See RSVP summary counts
- Filter by RSVP status

**Waitlist Management:**
- If attendance limit is reached, waitlist is created
- Automatically promotes from waitlist if someone cancels
- Organizer can manually manage waitlist

## Discussion & Messaging

### Event Discussion

**Posting:**
- Create posts in Discussion tab
- Share updates, questions, or game interests
- All members can see and reply

**Commenting:**
- Reply to posts with comments
- Engage in threaded discussions
- Get notified of replies (if enabled)

**Game Interests:**
- Propose games you want to play
- Rate games others propose
- See which games are popular

### Private Messaging

**Sending Messages:**
1. Open a user's profile
2. Tap "Send Message"
3. Enter your message
4. Send - message appears in both users' inboxes

**Receiving Messages:**
- Notifications for new messages
- View messages in messaging interface
- Reply directly from message view

**Blocking Users:**
- Block users from messaging you
- Blocked users cannot contact you
- Manage blocked users in settings

## Profile & Settings

### Profile Management

**Edit Profile:**
1. Go to Profile screen
2. Tap "Edit" on any field:
   - **Name** - Your display name
   - **Bio** - About you section
   - **Location** - Your general location
   - **BGG Username** - Link BoardGameGeek account
3. Save changes

**Profile Picture:**
- Tap profile picture to change
- Upload new photo from device
- Photo syncs across devices

### Notification Settings

**Access Settings:**
1. Go to Profile screen
2. Scroll to "Notification Settings"

**Configure Notifications:**

**MeepleUp Changes:**
- Toggle notifications for event changes
- Enable email notifications (optional)

**Event Reminders:**
- Toggle event reminder notifications
- Set hours before event (default: 24 hours)
- Get notified before upcoming events

**Discussion Notifications:**
- Toggle discussion activity notifications
- Choose frequency:
  - **All Activity** - Every post/comment
  - **Daily Summary** - Once per day
  - **Mentions Only** - Only when mentioned
  - **Responses** - Only replies to your comments
- Enable email notifications (optional)

### Account Management

**Change Password:**
1. Go to Profile screen
2. Scroll to "Change Password"
3. Enter current password
4. Enter new password
5. Confirm new password
6. Save changes

**Delete Account:**
1. Go to Profile screen
2. Scroll to "Delete Account"
3. Read warning message
4. Type "DELETE" to confirm
5. Tap "Delete Account"
6. All your data is permanently deleted

**Logout:**
- Tap "Logout" button in Profile screen
- You'll be signed out
- Return to landing screen

### Availability Profile (Finding Players)

**Set Availability:**
1. Go to Profile screen
2. Scroll to "Availability"
3. Add time slots when you're available:
   - Day of week
   - Start time
   - End time
   - Location
   - Notes (optional)
4. Toggle "Looking for Matches"
5. Set search radius (miles)

**View Matches:**
- See other users with overlapping availability
- Filter by distance
- Contact matched users

## Troubleshooting

### Common Issues

**Can't Sign In:**
- Check email and password are correct
- Try "Forgot Password" to reset
- Ensure email is verified
- Try signing in with Google/Apple

**Join Code Not Working:**
- Verify code is entered correctly (case-sensitive)
- Check with organizer that code is current
- Try regenerating code (organizer)
- Wait a few seconds and try again (propagation delay)

**Games Not Importing:**
- Verify BGG username is correct
- Check BGG privacy settings (collection must be public)
- Ensure internet connection is stable
- Try importing again (may take time for large collections)

**RSVP Not Updating:**
- Refresh the event page
- Check internet connection
- Try RSVP again
- Contact organizer if issue persists

**Notifications Not Working:**
- Check notification settings in Profile
- Ensure app has notification permissions
- Verify email is verified (for email notifications)
- Check device notification settings

**Can't Add Games:**
- Check internet connection
- Verify BGG API is accessible
- Try different import method
- Clear app cache and retry

### Getting Help

**Contact Support:**
- Use in-app contact form
- Email support team
- Check app documentation
- Visit help center (if available)

**Reporting Bugs:**
- Describe the issue clearly
- Include steps to reproduce
- Note your device/platform
- Include screenshots if possible

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
