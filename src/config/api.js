// API Configuration
// In production, these should be set via environment variables

export const API_CONFIG = {
  RAPIDAPI_KEY: process.env.REACT_APP_RAPIDAPI_KEY || 'ab5fb0b08dmsh801b30df51c049dp15ea7ejsn09d021675790',
  RAPIDAPI_HOST: 'barcodes-lookup.p.rapidapi.com',
  // BGG API removed - using Firebase Firestore for game database instead
  ANTHROPIC_API_KEY:
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ||
    process.env.REACT_APP_ANTHROPIC_API_KEY ||
    '',
  ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
  ANTHROPIC_DEFAULT_MODEL: process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
  ANTHROPIC_VERSION: '2023-06-01',
};

// Email configuration (if needed later)
export const EMAIL_CONFIG = {
  USER: process.env.REACT_APP_EMAIL_USER || 'game.lender.app@gmail.com',
  PASS: process.env.REACT_APP_EMAIL_PASS || 'gddq sifd wibz uzuh',
};

