/**
 * Constants for the MeepleUp app
 * 
 * Centralized constants to avoid magic numbers and strings throughout the codebase.
 * This improves maintainability and makes it easier to update values.
 */

// ============================================================================
// API Configuration
// ============================================================================

export const BGG_API = {
  BASE_URL: 'https://boardgamegeek.com/xmlapi2',
  RATE_LIMIT: {
    BULK_OPERATION_MS: 5000, // 5 seconds between bulk API calls
    NORMAL_OPERATION_MS: 500, // 0.5 seconds between normal calls
    BATCH_SIZE: 20, // Number of games to fetch per batch request
    MAX_RETRIES: 2, // Maximum retry attempts for 429 errors
    RETRY_BACKOFF_BASE_MS: 5000, // Base delay for exponential backoff (5s, 10s)
    EXTRA_DELAY_ON_429_MS: 10000, // Extra delay when rate limited (10 seconds)
    BATCH_DELAY_MS: 3000, // Delay between batch requests (3 seconds)
  },
  HTTP_STATUS: {
    RATE_LIMITED: 429,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
  },
};

// ============================================================================
// Event Configuration
// ============================================================================

export const EVENT_TYPES = {
  PUBLIC: 'public',
  PRIVATE: 'private',
};

export const EVENT_FREQUENCY = {
  ONE_TIME: 'one-time',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
};

export const MEMBER_ROLES = {
  ORGANIZER: 'organizer',
  CO_ORGANIZER: 'co-organizer',
  MEMBER: 'member',
};

export const RSVP_STATUS = {
  GOING: 'going',
  MAYBE: 'maybe',
  CANT_MAKE_IT: 'cant-make-it',
};

// ============================================================================
// Game Configuration
// ============================================================================

export const GAME_CATEGORIES = [
  'Strategy',
  'Party',
  'Family',
  'Cooperative',
  'Competitive',
  'Card Game',
  'Dice Game',
  'Euro',
  'Ameritrash',
  'Abstract',
];

export const GAME_RATINGS = {
  REALLY_WANT: 3,
  INTERESTED: 2,
  MAYBE: 1,
  NO_VOTE: 0,
  RATHER_NOT: -1,
};

export const GAME_SEARCH = {
  DEFAULT_LIMIT: 10,
  MAX_RESULTS: 100,
};

// ============================================================================
// Validation & Limits
// ============================================================================

export const VALIDATION = {
  MAX_JOIN_CODE_LENGTH: 6,
  MIN_PASSWORD_LENGTH: 6,
  MAX_PASSWORD_LENGTH: 128,
  MAX_NAME_LENGTH: 50,
  MAX_BIO_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_NOTE_LENGTH: 500,
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 30,
};

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  USER: 'meepleup_user',
  EVENTS: 'meepleup_events',
  COLLECTIONS: 'meepleup_collections',
  TOUR_COMPLETED: 'meepleup_tour_completed',
  PROFILE: (uid) => `meepleup_profile_${uid}`,
};

// ============================================================================
// Routes
// ============================================================================

export const ROUTES = {
  ONBOARDING: '/',
  HOME: '/home',
  AUTH: '/auth',
  EVENTS: '/events',
  EVENT_HUB: '/event/:eventId',
  BROWSE_GAMES: '/event/:eventId/browse/:dateIndex',
  COLLECTION: '/collection',
  PROFILE: '/profile',
  SUBSCRIPTION: '/subscription',
  DISCOVERY: '/discover',
  CREATE_EVENT: '/create-event',
};

// ============================================================================
// Timeouts & Delays
// ============================================================================

export const TIMEOUTS = {
  FIRESTORE_SYNC_MS: 2000, // Wait time for Firestore to sync (2 seconds)
  API_REQUEST_MS: 30000, // Default API request timeout (30 seconds)
  DEBOUNCE_SEARCH_MS: 300, // Search input debounce (300ms)
  TOAST_DURATION_MS: 3000, // Toast notification duration (3 seconds)
  TOAST_ERROR_DURATION_MS: 5000, // Error toast duration (5 seconds - longer for errors)
};

// ============================================================================
// User & System
// ============================================================================

// Beeple bot user ID - used for system messages from Beeple
export const BEEPLE_USER_ID = 'beeple';

// Default notification preferences
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  meepleupChanges: true,
  meepleupChangesEmail: false,
  eventReminders: true,
  eventReminderHours: 24, // Default: 24 hours before event
  discussion: true,
  discussionEmail: false,
  discussionFrequency: 'all', // 'all', 'daily', 'mentions', 'responses'
};

// Default personal match weights
export const DEFAULT_MATCH_WEIGHTS = {
  publisher: 3,
  mechanics: 3,
  category: 2,
  complexity: 1.5,
  favorite: 2, // Multiplier for favorited games
};

// ============================================================================
// UI Constants
// ============================================================================

export const UI = {
  GAME_CARD_COLUMNS: 3, // Number of columns in game grid
  SKELETON_ROWS: 6, // Number of skeleton rows to show while loading
  PAGINATION: {
    GAMES_PER_PAGE: 20,
    POSTS_PER_PAGE: 10,
    COMMENTS_PER_PAGE: 20,
  },
  ANIMATION: {
    DURATION_MS: 300,
    SPRING_CONFIG: {
      tension: 100,
      friction: 8,
    },
  },
};

// ============================================================================
// Error Messages
// ============================================================================

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  AUTH_FAILED: 'Authentication failed. Please check your credentials.',
  PERMISSION_DENIED: 'You don\'t have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',
};

// ============================================================================
// Success Messages
// ============================================================================

export const SUCCESS_MESSAGES = {
  EVENT_CREATED: 'MeepleUp created successfully!',
  EVENT_UPDATED: 'MeepleUp updated successfully!',
  EVENT_JOINED: 'Successfully joined MeepleUp!',
  GAME_ADDED: 'Game added to collection!',
  PROFILE_UPDATED: 'Profile updated successfully!',
  PASSWORD_CHANGED: 'Password changed successfully!',
};

// ============================================================================
// Date/Time Formats
// ============================================================================

export const DATE_FORMATS = {
  DISPLAY: 'MMM DD, YYYY',
  FULL: 'MMMM DD, YYYY',
  TIME: 'h:mm A',
  DATETIME: 'MMM DD, YYYY h:mm A',
};

// ============================================================================
// File Upload Limits
// ============================================================================

export const UPLOAD_LIMITS = {
  MAX_IMAGE_SIZE_MB: 10,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  MAX_PHOTOS_PER_USER: 100, // Maximum photos a user can upload
};

// ============================================================================
// Game Collection
// ============================================================================

export const COLLECTION = {
  SORT_OPTIONS: {
    RATING: 'rating',
    CATEGORY: 'category',
    TITLE: 'title',
    YEAR: 'year',
    PLAYTIME: 'playtime',
  },
  FILTER_CATEGORIES: [
    'Strategy',
    'Family',
    'Party',
    'War',
    'Thematic',
    'Abstract',
    'Children',
    'CCG',
    'Other',
  ],
};

