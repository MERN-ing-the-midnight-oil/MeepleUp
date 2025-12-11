# MeepleUp

MeepleUp is a mobile app that helps private board game groups coordinate their regular game nights. Users can quickly catalog their board game collections using AI-powered game recognition, which pulls game data from BoardGameGeek's API. The core value is making it easy for game night attendees to browse each other's collections and request games they'd like to play at upcoming events.

The app is organized around events - recurring game nights at breweries, game stores, or private homes. Each event has its own hub where members can RSVP, see who's attending, browse the collective game library from all members, and post on a simple message board. Events are private and invitation-only, using join codes for access control.

New users enter a join code to access their friend's game night. Users can belong to multiple events (Tuesday brewery night, Saturday home games, etc.), with each event appearing as a tile on their home screen. The app spreads organically as people invite friends to game nights and those friends download MeepleUp to participate.

## Features

- **Onboarding**: A smooth onboarding process for new users, including join code entry.
- **Event Management**: Create, edit, and delete events, and manage attendees.
- **Game Collection**: Browse and manage your game collection with filtering and sorting options.
- **AI Game Recognition**: Easily add games to your collection using AI-powered game recognition from photos.
- **Messaging**: A message board for events to facilitate communication among attendees.
- **User Profile**: Manage and edit user profile information.

## Project Architecture

### Tech Stack

- **React 18**: Modern React with hooks
- **React Router v6**: Client-side routing
- **Context API**: State management (no Redux needed for this scale)
- **Axios**: HTTP client for API calls
- **CSS Variables**: For theming and consistent styling
- **LocalStorage**: For data persistence (will be replaced with backend later)

### Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/          # Basic components (Button, Input, Modal, etc.)
│   ├── Navigation.jsx   # Main navigation component
│   ├── AIGameRecognition.jsx
│   ├── CollectionBrowser.jsx
│   ├── EventManagement.jsx
│   ├── GameDetails.jsx
│   └── Messaging.jsx
├── context/             # React Context providers for state management
│   ├── AuthContext.jsx      # User authentication state
│   ├── EventsContext.jsx    # Events state management
│   └── CollectionsContext.jsx  # Game collections state
├── screens/             # Page-level components
│   ├── Onboarding.jsx
│   ├── Home.jsx
│   ├── EventHub.jsx
│   ├── CollectionManagement.jsx
│   └── UserProfile.jsx
├── utils/               # Utility functions and helpers
│   ├── api.js           # BoardGameGeek API integration
│   ├── helpers.js        # General utility functions
│   └── constants.js     # App-wide constants
├── App.jsx              # Main app component with routing
└── index.js             # Entry point
```

### State Management

The app uses React Context API for state management:

1. **AuthContext**: Manages user authentication and profile
   - `user`: Current user object
   - `login(userData)`: Log in a user
   - `logout()`: Log out current user
   - `updateUser(userData)`: Update user profile
   - `isAuthenticated`: Boolean indicating auth status

2. **EventsContext**: Manages game night events
   - `events`: Array of all events
   - `createEvent(eventData)`: Create a new event
   - `updateEvent(eventId, updates)`: Update an event
   - `deleteEvent(eventId)`: Delete an event
   - `joinEvent(eventId, userId)`: Add user to event
   - `leaveEvent(eventId, userId)`: Remove user from event
   - `getEventById(eventId)`: Get specific event
   - `getUserEvents(userId)`: Get all events for a user

3. **CollectionsContext**: Manages game collections
   - `collections`: Object mapping userId to their games
   - `addGameToCollection(userId, gameData)`: Add game to user's collection
   - `removeGameFromCollection(userId, gameId)`: Remove game
   - `getUserCollection(userId)`: Get user's games
   - `getEventCollection(eventMembers)`: Get combined collection for event
   - `updateGameInCollection(userId, gameId, updates)`: Update game info

### Routing

Protected routes require authentication. Public routes redirect authenticated users:

- `/` - Onboarding (public)
- `/home` - Home screen with event tiles (protected)
- `/event/:eventId` - Event hub page (protected)
- `/collection` - Collection management (protected)
- `/profile` - User profile (protected)

### Data Persistence

Currently using `localStorage` for persistence. This is a temporary solution for development. In production, you'll want to:

1. Set up a backend API (Node.js/Express, Python/Flask, etc.)
2. Replace localStorage calls with API calls
3. Add proper authentication (JWT tokens, etc.)
4. Use a database (PostgreSQL, MongoDB, etc.)

### Styling

The app uses CSS Variables for theming, making it easy to customize colors, spacing, and typography. The design is mobile-first and responsive.

Key CSS variables are defined in `src/index.css`:
- Color palette (primary, secondary, accent colors)
- Spacing scale
- Typography scale
- Border radius
- Shadows

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm (version 5.6 or higher)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/MeepleUp.git
   ```

2. Navigate to the project directory:
   ```bash
   cd MeepleUp
   ```

3. Install the dependencies:
   ```bash
   npm install
   ```

### Running the Application

To start the development server, run:

```bash
npm start
```

The application will be available at `http://localhost:3000`.

### Building for Production

To create a production build, run:

```bash
npm run build
```

This will generate a `build` directory with optimized files for deployment.

## Development Roadmap

### Phase 1: Core Features (Current)
- [x] Project setup and architecture
- [x] Authentication flow
- [x] Event management basics
- [x] Collection management structure
- [ ] AI game recognition integration
- [ ] BoardGameGeek API integration
- [ ] Event creation UI
- [ ] Event hub page

### Phase 2: Enhanced Features
- [ ] Real-time messaging
- [ ] Game request system
- [ ] RSVP functionality
- [ ] User profiles

### Phase 3: Backend Integration
- [ ] Backend API setup
- [ ] Database schema
- [ ] Authentication system
- [ ] Replace localStorage with API calls
- [ ] File uploads for game images

### Phase 4: Mobile Optimization
- [ ] Progressive Web App (PWA) setup
- [ ] Mobile-responsive improvements
- [ ] Offline support
- [ ] Push notifications

## API Integration Notes

### BoardGameGeek API

The app integrates with BoardGameGeek's XML API. Key functions:

- `searchGamesByName(query)`: Search for games
- `getGameDetails(gameId)`: Get detailed game information
- `recognizeGameFromImage(image)`: AI-powered game recognition from photos

**Note**: BGG API returns XML, so you'll need proper XML parsing. Consider installing `xml2js`:
```bash
npm install xml2js
```

For AI game recognition, the app uses image recognition technology to identify board games from photos, matching them with BoardGameGeek's database.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
