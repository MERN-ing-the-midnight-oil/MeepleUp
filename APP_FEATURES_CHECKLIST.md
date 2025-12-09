# MeepleUp App Features Checklist

This document provides a comprehensive list of all user actions and information available in the MeepleUp app, organized by feature area. Use this checklist to verify all parts of your app are working correctly.

---

## 1. AUTHENTICATION & ONBOARDING

### Screen: Landing/Onboarding (`/` or `Onboarding` screen)

#### User Actions:
- [ ] Sign In (navigate to Auth screen with login mode)
- [ ] Create Account (navigate to Auth screen with register mode)
- [ ] View existing MeepleUps (if authenticated, shows list of user's events)
- [ ] Join MeepleUp with code (enter 3-word join code)
- [ ] Host new MeepleUp (navigate to create event form)
- [ ] Leave MeepleUp (for non-organizers, from event cards)
- [ ] Navigate to EventHub (tap on event card)

#### Information Available:
- [ ] App logo and branding
- [ ] BGG logo (Powered by BoardGameGeek)
- [ ] List of user's MeepleUps (sorted by creation date, newest first)
- [ ] Event cards showing:
  - Event name
  - Location (general or exact)
  - Scheduled date(s)
  - Member count
  - RSVP status and counts (if RSVP enabled)
  - Leave button (for non-organizers)

---

## 2. AUTHENTICATION SCREEN

### Screen: Auth (`Auth.jsx`)

#### User Actions:
- [ ] Sign In with email/password
- [ ] Create Account with email/password
- [ ] Sign in with Google
- [ ] Toggle between Sign In and Create Account modes
- [ ] Show/hide password (eye icon)
- [ ] Forgot Password (request password reset email)
- [ ] Navigate back to previous screen
- [ ] Auto-complete email/password (browser password manager support)

#### Information Available:
- [ ] App title and BGG logo
- [ ] Form fields:
  - Full Name (register mode only)
  - Email
  - Password
  - Confirm Password (register mode only)
- [ ] Error messages (validation and authentication errors)
- [ ] Success messages (account created, password reset sent)
- [ ] Loading states during authentication

---

## 3. EVENTS SCREEN

### Screen: Events (`/events` or `EventsScreen`)

#### User Actions:
- [ ] Host new MeepleUp (open create event modal)
- [ ] Join MeepleUp with code (enter 3-word join code)
- [ ] View event details (tap event card to navigate to EventHub)
- [ ] RSVP to event (Going/Maybe/Can't Make It buttons on event cards)
- [ ] Leave MeepleUp (for non-organizers)
- [ ] Unarchive MeepleUp (for organizers, from archived events section)
- [ ] Create event via modal form

#### Information Available:
- [ ] Page title: "Your MeepleUps"
- [ ] List of active MeepleUps showing:
  - Event name
  - Location
  - Scheduled date
  - Member count
  - RSVP status (user's current RSVP)
  - RSVP counts (Going/Maybe totals)
  - Attendance limit (if set)
- [ ] Archived MeepleUps section (organizers only):
  - Event name
  - Location
  - Scheduled date
  - Member count
  - "Archived" badge
- [ ] Empty state message (when no events)
- [ ] Join code input form
- [ ] Create event modal with form fields

---

## 4. EVENT HUB (Individual Event View)

### Screen: EventHub (`/event/:eventId`)

#### Tabs Available:
- [ ] Event Tab (default)
- [ ] Games Tab
- [ ] Discussion Tab

---

### EVENT TAB

#### User Actions (All Users):
- [ ] View event schedule (list of dates with times and locations)
- [ ] View pinned notes/description
- [ ] View member list with avatars
- [ ] RSVP to specific dates (Going/Maybe/Can't Make It per date)
- [ ] Add to calendar (iCal download or Google Calendar link)
- [ ] Share event (share join code)
- [ ] View exact location (if shared by organizer)
- [ ] Navigate back

#### User Actions (Organizers Only):
- [ ] Edit schedule (add/edit/remove dates, times, locations)
- [ ] Edit pinned notes/description
- [ ] Regenerate join code
- [ ] Archive event
- [ ] Manage RSVPs (open RSVP Management screen)
- [ ] View contact requests (from strangers wanting to join)

#### Information Available:
- [ ] Event name
- [ ] Event description/pinned notes
- [ ] Schedule:
  - List of event dates
  - Start and end times for each date
  - Location for each date
  - Exact location (if shared)
  - Individual date notes
- [ ] Member list:
  - Member names
  - Member avatars
  - RSVP status per member per date
- [ ] RSVP summary:
  - User's RSVP status for each date
  - RSVP counts (Going/Maybe/Can't Make It) per date
  - Attendance limit (if set)
- [ ] Join code (organizers can see and regenerate)
- [ ] Contact request status (for strangers)
- [ ] Calendar export options (iCal, Google Calendar)

---

### GAMES TAB

#### User Actions (All Users):
- [ ] View games inventory (aggregated collection of all members)
- [ ] Filter games by category
- [ ] Sort games (by rating, category, or title)
- [ ] View game details (tap game card to open modal)
- [ ] Browse attendee collections (view individual member's games)
- [ ] Select game night date (to see games for specific date)
- [ ] Mark games as "bringing" (planning feature)
- [ ] Propose games for the event
- [ ] View proposed games with ratings

#### User Actions (Organizers Only):
- [ ] All of the above, plus:
- [ ] Manage game proposals

#### Information Available:
- [ ] Games inventory:
  - Game cards with thumbnails
  - Game titles
  - Year published
  - BGG ratings (star ratings and numeric)
  - Category badges
  - Games grouped by category
- [ ] Game details modal:
  - Full game image
  - Title and year
  - BGG rating
  - Player count
  - Playing time
  - Age rating
  - Category badges
  - Description
  - Favorite status (if user owns game)
- [ ] Attendee collections:
  - Individual member's game collections
  - Filtered by selected game night date
- [ ] Planning games:
  - List of games user is bringing
  - Proposed games with member ratings
- [ ] Category filters:
  - Strategy
  - Family
  - Party
  - War
  - Thematic
  - Abstract
  - Children
  - CCG
  - Other

---

### DISCUSSION TAB

#### User Actions (All Users):
- [ ] View discussion posts
- [ ] Create new post
- [ ] Reply to posts (add comments)
- [ ] Edit own posts/comments
- [ ] Delete own posts/comments
- [ ] View post details and comments

#### Information Available:
- [ ] Discussion feed:
  - Posts with author names and avatars
  - Post timestamps
  - Post content
  - Comment count
  - Replies/comments to posts
- [ ] Post creation form
- [ ] Comment/reply form
- [ ] Edit post/comment form

---

## 5. COLLECTION SCREEN

### Screen: Collection (`/collection` or `CollectionScreen`)

#### User Actions:
- [ ] Import games via AI scanner (ClaudeGameIdentifier - camera-based)
- [ ] Import games from BGG (BoardGameGeek username import)
- [ ] View games inventory
- [ ] Sort games by:
  - Rating (highest first)
  - Category (grouped by category)
  - Title (A-Z)
- [ ] Toggle category sort (Rating vs A-Z within each category)
- [ ] View game details (tap game card)
- [ ] Delete game from collection
- [ ] Mark game as favorite (from game details modal)

#### Information Available:
- [ ] Import options:
  - AI Scanner button (gamescanner icon)
  - BGG Import option
- [ ] Games inventory:
  - Game cards in grid layout (3 columns)
  - Game thumbnails
  - Game titles
  - Year published
  - BGG ratings (stars and numeric)
  - Category badges
  - Favorite indicator (crown icon)
- [ ] Games grouped by category:
  - Strategy
  - Family
  - Party
  - War
  - Thematic
  - Abstract
  - Children
  - CCG
  - Other
- [ ] Sort controls
- [ ] Category headers with sort toggles
- [ ] Empty state (when no games)
- [ ] Import progress (for BGG import)
- [ ] Game details modal (same as EventHub Games tab)

---

## 6. PROFILE & SETTINGS SCREEN

### Screen: Profile (`/profile` or `ProfileScreen`)

#### User Actions:
- [ ] Update profile picture (upload/change photo)
- [ ] Edit name
- [ ] Edit bio
- [ ] Update password (current + new + confirm)
- [ ] Resend verification email (if email not verified)
- [ ] Refresh verification status
- [ ] Configure notification settings:
  - MeepleUp changes (toggle + email option)
  - Event reminders (toggle + hours before setting)
  - Discussion notifications (toggle + email + frequency)
- [ ] Logout
- [ ] Delete account (with confirmation)

#### Information Available:
- [ ] Profile picture (or placeholder with initial)
- [ ] User email
- [ ] Name field
- [ ] Bio field (multiline)
- [ ] Email verification status:
  - Warning if not verified
  - Verification email sent confirmation
  - Verification success message
- [ ] Password change form:
  - Current password
  - New password
  - Confirm new password
- [ ] Notification settings:
  - MeepleUp changes toggle
  - Email notifications toggle (if MeepleUp changes enabled)
  - Event reminders toggle
  - Hours before reminder input (if reminders enabled)
  - Discussion notifications toggle
  - Email notifications toggle (if discussion enabled)
  - Frequency options:
    - All activity
    - Daily summary
    - Mentions only
    - Responses to my comments
- [ ] Logout button
- [ ] Delete account section:
  - Warning message
  - Delete confirmation modal
  - Type "DELETE" to confirm

---

## 7. RSVP MANAGEMENT (Organizer Feature)

### Screen: RSVPManagementScreen (Modal in EventHub)

#### User Actions (Organizers Only):
- [ ] View all member RSVPs
- [ ] Override member RSVP status
- [ ] Configure RSVP settings:
  - Enable/disable RSVP requirement
  - Allow/deny "Maybe" option
  - Set attendance limit
- [ ] View RSVP summary:
  - Going count
  - Maybe count
  - Not Going count
  - No RSVP count
- [ ] Filter members by RSVP status

#### Information Available:
- [ ] RSVP settings:
  - Enabled toggle
  - Allow Maybe toggle
  - Attendance limit input
- [ ] RSVP summary counts
- [ ] Member list grouped by RSVP status:
  - Going members (with avatars)
  - Maybe members
  - Not Going members
  - No RSVP members
- [ ] Member details:
  - Name
  - Avatar
  - Current RSVP status
  - Override options (organizer only)

---

## 8. GAME IMPORT FEATURES

### AI Scanner (ClaudeGameIdentifier)

#### User Actions:
- [ ] Open camera to scan game shelf
- [ ] Capture photo
- [ ] View identified games
- [ ] Add games to collection
- [ ] Remove games from collection (if already added)
- [ ] Complete import process

#### Information Available:
- [ ] Camera view
- [ ] Identified games list
- [ ] Game titles identified from photo
- [ ] Add/remove status for each game

---

### BGG Import (BGGImport)

#### User Actions:
- [ ] Enter BGG username
- [ ] Fetch BGG collection
- [ ] Import games (automatic or manual)
- [ ] View import progress
- [ ] View preview of games to import

#### Information Available:
- [ ] BGG logo
- [ ] Username input field
- [ ] Discoverability notice (link to BGG privacy settings)
- [ ] Collection preview (first 5 games)
- [ ] Import progress bar
- [ ] Success/failure messages
- [ ] Import statistics (successful, skipped, failed counts)

---

## 9. GAME DETAILS MODAL

### Component: GameDetailsModal

#### User Actions:
- [ ] View full game details
- [ ] Close modal
- [ ] Mark game as favorite (if user owns game)
- [ ] Add game to collection (if not owned)

#### Information Available:
- [ ] Full game image
- [ ] Game title
- [ ] Year published
- [ ] BGG rating (stars and numeric)
- [ ] Player count (min-max)
- [ ] Playing time
- [ ] Age rating
- [ ] Category badges
- [ ] Game description
- [ ] Favorite status (if owned)

---

## 10. NAVIGATION

### Navigation Component

#### User Actions:
- [ ] Navigate to MeepleUps (Onboarding screen)
- [ ] Navigate to Your Games (Collection screen)
- [ ] Navigate to Profile/Settings

#### Information Available:
- [ ] Active tab indicator
- [ ] Navigation links with icons
- [ ] Current route highlighting

---

## 11. NOTIFICATIONS

### Notification Features

#### User Actions:
- [ ] Receive in-app notifications
- [ ] Receive email notifications (if enabled)
- [ ] Configure notification preferences (in Profile screen)

#### Information Available:
- [ ] Notification settings (in Profile):
  - MeepleUp changes notifications
  - Event reminder notifications (with hours before setting)
  - Discussion notifications (with frequency options)
  - Email notification toggles for each type

---

## 12. EVENT CREATION & EDITING

### Create Event Form (Onboarding & EventsScreen)

#### User Actions:
- [ ] Enter event name
- [ ] Enter location (general)
- [ ] Toggle share exact address
- [ ] Enter exact address (if sharing enabled)
- [ ] Select event dates from calendar
- [ ] Set usual start time
- [ ] Set usual end time
- [ ] Edit individual date times
- [ ] Add event description
- [ ] Set RSVP requirements
- [ ] Set member limit (optional)
- [ ] Create event
- [ ] Cancel creation

#### Information Available:
- [ ] Form fields:
  - Event name (required)
  - General location (required)
  - Exact address (optional, if sharing enabled)
  - Date picker (calendar view)
  - Time pickers (start and end)
  - Description (optional, 500 char limit)
  - RSVP required toggle
  - Member limit input
- [ ] Calendar modal:
  - 12-month calendar view
  - Selected dates highlighted
  - Individual date time editing
- [ ] Validation errors
- [ ] Success message with join code

---

## 13. SCHEDULE EDITING (EventHub - Organizer)

#### User Actions:
- [ ] Open schedule editor
- [ ] Add new dates
- [ ] Remove dates
- [ ] Edit date times
- [ ] Edit date locations
- [ ] Add notes to specific dates
- [ ] Set default location for all dates
- [ ] Save schedule changes

#### Information Available:
- [ ] Current schedule display
- [ ] Schedule editor modal
- [ ] Calendar picker
- [ ] Time pickers
- [ ] Location inputs
- [ ] Date-specific notes

---

## 14. CONTACT ORGANIZER (Strangers)

#### User Actions:
- [ ] Request to join event (if not a member)
- [ ] Fill contact form:
  - Name
  - Email/phone
  - Message
- [ ] Submit contact request
- [ ] Cancel request

#### Information Available:
- [ ] Contact form
- [ ] Default message template
- [ ] Instructions for contacting organizer
- [ ] Contact request status

---

## 15. DATA EXPORT & SHARING

#### User Actions:
- [ ] Download iCal file (add to calendar)
- [ ] Open Google Calendar link
- [ ] Share join code
- [ ] Copy join code

#### Information Available:
- [ ] iCal download option
- [ ] Google Calendar link
- [ ] Join code display
- [ ] Share options

---

## 16. ARCHIVED EVENTS

#### User Actions (Organizers Only):
- [ ] View archived events
- [ ] Unarchive event
- [ ] View archived event details

#### Information Available:
- [ ] Archived events list
- [ ] "Archived" badge
- [ ] Event details (name, location, date, member count)
- [ ] Unarchive button

---

## TESTING CHECKLIST BY USER ROLE

### As a New User (Not Authenticated):
- [ ] Can view landing page
- [ ] Can sign in
- [ ] Can create account
- [ ] Can sign in with Google
- [ ] Can request password reset

### As a Regular Member:
- [ ] Can view own MeepleUps
- [ ] Can join MeepleUp with code
- [ ] Can RSVP to events
- [ ] Can view event details
- [ ] Can view games inventory
- [ ] Can browse collections
- [ ] Can participate in discussions
- [ ] Can manage own collection
- [ ] Can update profile
- [ ] Can leave MeepleUp (if not organizer)

### As an Organizer:
- [ ] All regular member features, plus:
- [ ] Can create MeepleUps
- [ ] Can edit event schedule
- [ ] Can edit event description
- [ ] Can regenerate join code
- [ ] Can manage RSVPs
- [ ] Can override member RSVPs
- [ ] Can configure RSVP settings
- [ ] Can archive events
- [ ] Can unarchive events
- [ ] Can view contact requests
- [ ] Cannot leave own MeepleUp

### As a Stranger (Not a Member):
- [ ] Can view event (if has link)
- [ ] Can request to join (contact organizer form)
- [ ] Cannot see exact location (unless shared)
- [ ] Cannot RSVP
- [ ] Cannot participate in discussions
- [ ] Cannot view full member list

---

## CROSS-PLATFORM CONSIDERATIONS

### Web-Specific:
- [ ] Browser navigation works
- [ ] URL routing works correctly
- [ ] Responsive design (mobile/desktop)
- [ ] Password manager integration

### Mobile-Specific (if applicable):
- [ ] Native navigation
- [ ] Camera access (for AI scanner)
- [ ] File system access (for iCal download)
- [ ] Sharing functionality

---

## DATA PERSISTENCE CHECKLIST

- [ ] User authentication state persists
- [ ] User profile data saves correctly
- [ ] Game collection saves and loads
- [ ] Event data saves and loads
- [ ] RSVP data saves and loads
- [ ] Discussion posts save and load
- [ ] Notification preferences save
- [ ] Schedule edits persist
- [ ] Favorite games status persists

---

## ERROR HANDLING CHECKLIST

- [ ] Network errors handled gracefully
- [ ] Authentication errors show helpful messages
- [ ] Form validation errors displayed
- [ ] Permission errors handled (e.g., camera access)
- [ ] Loading states shown during async operations
- [ ] Empty states displayed appropriately
- [ ] Error messages are user-friendly

---

## ACCESSIBILITY CHECKLIST

- [ ] All interactive elements are accessible
- [ ] Form labels are properly associated
- [ ] Error messages are announced
- [ ] Loading states are communicated
- [ ] Keyboard navigation works (web)
- [ ] Screen reader support (if applicable)

---

*Last Updated: Based on current codebase analysis*
*Use this checklist to systematically test all features of your MeepleUp app*

