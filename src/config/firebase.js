// Firebase Configuration (compat for Expo)
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions';
import { Platform } from 'react-native';
import logger from '../utils/logger';

// Firebase Configuration
// All values must be set via environment variables for security
// Use EXPO_PUBLIC_ prefix for Expo projects (accessible in client-side code)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.REACT_APP_FIREBASE_APP_ID,
};

// Debug: Log if API key is loaded (first 10 chars only for security)
if (__DEV__) {
  const apiKey = firebaseConfig.apiKey;
  const expoKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const reactKey = process.env.REACT_APP_FIREBASE_API_KEY;
  
  console.log('🔍 Environment Variable Check:');
  console.log('  EXPO_PUBLIC_FIREBASE_API_KEY:', expoKey ? expoKey.substring(0, 10) + '...' : '❌ NOT SET');
  console.log('  REACT_APP_FIREBASE_API_KEY:', reactKey ? reactKey.substring(0, 10) + '...' : '❌ NOT SET');
  
  if (apiKey) {
    console.log('✅ Firebase API Key loaded:', apiKey.substring(0, 10) + '...');
  } else {
    console.error('❌ Firebase API Key NOT FOUND in environment variables!');
    console.log('Looking for: EXPO_PUBLIC_FIREBASE_API_KEY or REACT_APP_FIREBASE_API_KEY');
    console.log('Make sure your .env file is in the project root and you restarted the server.');
  }
}

// Validate that required Firebase config values are present
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field]);

// Store initialization error for graceful handling
let firebaseInitError = null;

if (missingFields.length > 0) {
  // Map field names to their correct environment variable names
  const fieldNameMap = {
    apiKey: 'API_KEY',
    authDomain: 'AUTH_DOMAIN',
    projectId: 'PROJECT_ID',
    storageBucket: 'STORAGE_BUCKET',
    messagingSenderId: 'MESSAGING_SENDER_ID',
    appId: 'APP_ID',
  };
  
  const errorMessage = `Missing required Firebase configuration. Please set the following environment variables:\n` +
    `  ${missingFields.map(field => {
      const varName = fieldNameMap[field] || field.toUpperCase().replace(/([A-Z])/g, '_$1').replace(/^_/, '');
      const expoVar = `EXPO_PUBLIC_FIREBASE_${varName}`;
      const reactVar = `REACT_APP_FIREBASE_${varName}`;
      return `${expoVar} or ${reactVar}`;
    }).join('\n  ')}\n\n` +
    `Create a .env file in the project root with these variables, or set EAS secrets for production builds.\n` +
    `For EAS builds, use: eas secret:create --scope project --name <VAR_NAME> --value <VALUE>`;
  
  firebaseInitError = new Error(errorMessage);
  
  // Log error in both dev and production (for debugging TestFlight)
  // Using logger.error ensures it shows in production logs
  logger.error('FIREBASE INIT ERROR:', errorMessage);
  logger.error('Missing fields:', missingFields);
  logger.error('Config received:', Object.keys(firebaseConfig).reduce((acc, key) => {
    acc[key] = firebaseConfig[key] ? 'SET' : 'MISSING';
    return acc;
  }, {}));
  
  // Always log to console for TestFlight debugging (visible in Xcode console)
  console.error('❌ FIREBASE INIT ERROR:', errorMessage);
  console.error('Missing fields:', missingFields);
  
  // In production, don't throw immediately - let the app handle it gracefully
  // The AuthProvider will check for this error and show an error screen
  if (__DEV__) {
    throw firebaseInitError;
  }
} else {
  // Only initialize if config is valid
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      logger.info('Firebase initialized successfully');
      console.log('✅ Firebase initialized successfully');
    }
  } catch (error) {
    firebaseInitError = error;
    logger.error('FIREBASE INITIALIZATION ERROR:', error);
    console.error('❌ FIREBASE INITIALIZATION ERROR:', error);
    // In dev, throw immediately. In production, let the app handle it
    if (__DEV__) {
      throw error;
    }
  }
}

// Export error so components can check it
export { firebaseInitError };

// Only export Firebase services if initialization succeeded
// These will be null if Firebase failed to initialize, allowing graceful error handling
let authInstance = null;
let dbInstance = null;
let storageInstance = null;

if (!firebaseInitError && firebase.apps.length > 0) {
  try {
    authInstance = firebase.auth();
    dbInstance = firebase.firestore();
    storageInstance = firebase.storage();
    
    // Explicitly set persistence for web (local = persists across browser sessions)
    if (Platform.OS === 'web' && authInstance && authInstance.setPersistence) {
      // For web, explicitly set to 'local' persistence (default, but being explicit)
      // This ensures users stay logged in across page refreshes and server restarts
      // Note: 'local' is the default, but we're being explicit for clarity
      authInstance.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
        console.warn('Error setting auth persistence:', error);
        logger.warn('Error setting auth persistence:', error);
        // Continue anyway - default behavior should still work
      });
    }
    
    // For React Native/Expo, Firebase Auth automatically uses AsyncStorage for persistence
    // However, we need to ensure the auth instance is ready before using it
    // The onAuthStateChanged listener will fire with the persisted user once Firebase
    // has restored the session from AsyncStorage
    if (Platform.OS !== 'web' && authInstance) {
      // Log that we're using AsyncStorage for persistence (for debugging)
      if (__DEV__) {
        console.log('✅ Firebase Auth configured for React Native - will use AsyncStorage for persistence');
        logger.info('Firebase Auth configured for React Native - will use AsyncStorage for persistence');
      }
    }
  } catch (error) {
    logger.error('Error initializing Firebase services:', error);
    console.error('❌ Error initializing Firebase services:', error);
    // Services will remain null, and the app will handle the error gracefully
  }
}

export const auth = authInstance;
export const db = dbInstance;
export const storage = storageInstance;

// Note: 
// - Web: Uses localStorage (persists across browser sessions)
// - React Native/Expo: Automatically uses AsyncStorage (persists across app restarts)
//   The onAuthStateChanged listener will fire with the persisted user once Firebase
//   has restored the session from AsyncStorage on app startup.
// Users will remain logged in across app restarts in both environments.

// Initialize Firebase Functions (if available)
let functionsInstance = null;
try {
  functionsInstance = firebase.functions();
} catch (error) {
  console.warn('Firebase Functions not available:', error);
}
export const functions = functionsInstance;

export default firebase;