/**
 * @jest-environment node
 */
import {
  BGG_API,
  EVENT_TYPES,
  EVENT_FREQUENCY,
  MEMBER_ROLES,
  RSVP_STATUS,
  GAME_CATEGORIES,
  GAME_RATINGS,
  GAME_SEARCH,
  VALIDATION,
  STORAGE_KEYS,
  ROUTES,
  TIMEOUTS,
  BEEPLE_USER_ID,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_MATCH_WEIGHTS,
  UI,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  UPLOAD_LIMITS,
  COLLECTION,
} from '../../src/utils/constants';

describe('constants', () => {
  describe('BGG_API', () => {
    it('has BASE_URL', () => {
      expect(BGG_API.BASE_URL).toBe('https://boardgamegeek.com/xmlapi2');
    });
    it('has RATE_LIMIT settings', () => {
      expect(BGG_API.RATE_LIMIT.BATCH_SIZE).toBe(20);
      expect(BGG_API.RATE_LIMIT.MAX_RETRIES).toBe(2);
    });
    it('has HTTP_STATUS', () => {
      expect(BGG_API.HTTP_STATUS.RATE_LIMITED).toBe(429);
    });
  });

  describe('EVENT_TYPES', () => {
    it('has PUBLIC and PRIVATE', () => {
      expect(EVENT_TYPES.PUBLIC).toBe('public');
      expect(EVENT_TYPES.PRIVATE).toBe('private');
    });
  });

  describe('EVENT_FREQUENCY', () => {
    it('has expected frequency values', () => {
      expect(EVENT_FREQUENCY.ONE_TIME).toBe('one-time');
      expect(EVENT_FREQUENCY.WEEKLY).toBe('weekly');
      expect(EVENT_FREQUENCY.MONTHLY).toBe('monthly');
    });
  });

  describe('MEMBER_ROLES', () => {
    it('has organizer, co-organizer, member', () => {
      expect(MEMBER_ROLES.ORGANIZER).toBe('organizer');
      expect(MEMBER_ROLES.MEMBER).toBe('member');
    });
  });

  describe('RSVP_STATUS', () => {
    it('has going, maybe, cant-make-it', () => {
      expect(RSVP_STATUS.GOING).toBe('going');
      expect(RSVP_STATUS.MAYBE).toBe('maybe');
      expect(RSVP_STATUS.CANT_MAKE_IT).toBe('cant-make-it');
    });
  });

  describe('GAME_CATEGORIES', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(GAME_CATEGORIES)).toBe(true);
      expect(GAME_CATEGORIES.length).toBeGreaterThan(0);
      expect(GAME_CATEGORIES).toContain('Strategy');
    });
  });

  describe('GAME_RATINGS', () => {
    it('has numeric rating values', () => {
      expect(GAME_RATINGS.REALLY_WANT).toBe(3);
      expect(GAME_RATINGS.NO_VOTE).toBe(0);
      expect(GAME_RATINGS.RATHER_NOT).toBe(-1);
    });
  });

  describe('VALIDATION', () => {
    it('has length limits', () => {
      expect(VALIDATION.MAX_NAME_LENGTH).toBe(50);
      expect(VALIDATION.MIN_PASSWORD_LENGTH).toBe(6);
    });
  });

  describe('STORAGE_KEYS', () => {
    it('has string keys', () => {
      expect(STORAGE_KEYS.USER).toBe('meepleup_user');
      expect(STORAGE_KEYS.EVENTS).toBe('meepleup_events');
    });
    it('PROFILE is a function that takes uid', () => {
      expect(STORAGE_KEYS.PROFILE('abc')).toBe('meepleup_profile_abc');
    });
  });

  describe('ROUTES', () => {
    it('has route paths', () => {
      expect(ROUTES.HOME).toBe('/home');
      expect(ROUTES.COLLECTION).toBe('/collection');
      expect(ROUTES.EVENT_HUB).toContain(':eventId');
    });
  });

  describe('TIMEOUTS', () => {
    it('has positive numeric values', () => {
      expect(TIMEOUTS.API_REQUEST_MS).toBe(30000);
      expect(TIMEOUTS.DEBOUNCE_SEARCH_MS).toBe(300);
    });
  });

  describe('BEEPLE_USER_ID', () => {
    it('is the beeple bot id', () => {
      expect(BEEPLE_USER_ID).toBe('beeple');
    });
  });

  describe('DEFAULT_NOTIFICATION_PREFERENCES', () => {
    it('has boolean and numeric fields', () => {
      expect(typeof DEFAULT_NOTIFICATION_PREFERENCES.meepleupChanges).toBe('boolean');
      expect(typeof DEFAULT_NOTIFICATION_PREFERENCES.eventReminderHours).toBe('number');
    });
  });

  describe('UI', () => {
    it('has PAGINATION and ANIMATION', () => {
      expect(UI.PAGINATION.GAMES_PER_PAGE).toBe(20);
      expect(UI.ANIMATION.DURATION_MS).toBe(300);
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('has non-empty error strings', () => {
      expect(ERROR_MESSAGES.NETWORK_ERROR).toContain('Network');
      expect(ERROR_MESSAGES.AUTH_FAILED).toContain('Authentication');
    });
  });

  describe('SUCCESS_MESSAGES', () => {
    it('has success strings', () => {
      expect(SUCCESS_MESSAGES.EVENT_CREATED).toContain('successfully');
      expect(SUCCESS_MESSAGES.GAME_ADDED).toBeDefined();
    });
  });

  describe('UPLOAD_LIMITS', () => {
    it('has MAX_IMAGE_SIZE_MB and ALLOWED_IMAGE_TYPES', () => {
      expect(UPLOAD_LIMITS.MAX_IMAGE_SIZE_MB).toBe(10);
      expect(UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
    });
  });

  describe('COLLECTION', () => {
    it('has SORT_OPTIONS and FILTER_CATEGORIES', () => {
      expect(COLLECTION.SORT_OPTIONS.RATING).toBe('rating');
      expect(Array.isArray(COLLECTION.FILTER_CATEGORIES)).toBe(true);
    });
  });
});
