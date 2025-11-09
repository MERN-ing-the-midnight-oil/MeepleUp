/**
 * Constants for the MeepleUp app
 */

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

export const MAX_JOIN_CODE_LENGTH = 6;
export const MIN_PASSWORD_LENGTH = 6;

export const STORAGE_KEYS = {
  USER: 'meepleup_user',
  EVENTS: 'meepleup_events',
  COLLECTIONS: 'meepleup_collections',
};

export const ROUTES = {
  ONBOARDING: '/',
  HOME: '/home',
  EVENT_HUB: '/event/:eventId',
  COLLECTION: '/collection',
  PROFILE: '/profile',
  DISCOVERY: '/discover',
  CREATE_EVENT: '/create-event',
};

