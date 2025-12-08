// API Configuration
// All sensitive values must be set via environment variables for security
// Use EXPO_PUBLIC_ prefix for Expo projects (accessible in client-side code)

export const API_CONFIG = {
  // RapidAPI barcode lookup (archived feature, but kept for potential future use)
  RAPIDAPI_KEY: process.env.EXPO_PUBLIC_RAPIDAPI_KEY || process.env.REACT_APP_RAPIDAPI_KEY || '',
  RAPIDAPI_HOST: 'barcodes-lookup.p.rapidapi.com',
  
  // BGG API Bearer Token (for authenticated requests)
  BGG_API_TOKEN:
    process.env.EXPO_PUBLIC_BGG_API_TOKEN ||
    process.env.EXPO_PUBLIC_BGGbearerToken ||
    process.env.REACT_APP_BGG_API_TOKEN ||
    '',
  
  // Anthropic/Claude API configuration
  ANTHROPIC_API_KEY:
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ||
    process.env.REACT_APP_ANTHROPIC_API_KEY ||
    '',
  ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
  ANTHROPIC_DEFAULT_MODEL: process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
  ANTHROPIC_VERSION: '2023-06-01',
};

// Email configuration (if needed later)
// WARNING: Email credentials should NEVER be hardcoded in source code
export const EMAIL_CONFIG = {
  USER: process.env.EXPO_PUBLIC_EMAIL_USER || process.env.REACT_APP_EMAIL_USER || '',
  PASS: process.env.EXPO_PUBLIC_EMAIL_PASS || process.env.REACT_APP_EMAIL_PASS || '',
};

