// Firebase Configuration (compat for Expo)
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import { Platform } from 'react-native';

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

if (missingFields.length > 0) {
  throw new Error(
    `Missing required Firebase configuration. Please set the following environment variables:\n` +
    `  ${missingFields.map(field => {
      const expoVar = `EXPO_PUBLIC_FIREBASE_${field.toUpperCase().replace(/([A-Z])/g, '_$1').slice(1)}`;
      const reactVar = `REACT_APP_FIREBASE_${field.toUpperCase().replace(/([A-Z])/g, '_$1').slice(1)}`;
      return `${expoVar} or ${reactVar}`;
    }).join('\n  ')}\n\n` +
    `Create a .env file in the project root with these variables. See .env.example for reference.`
  );
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();

// Explicitly set persistence for web (local = persists across browser sessions)
// React Native/Expo automatically uses AsyncStorage, so no configuration needed
if (Platform.OS === 'web' && auth.setPersistence) {
  // For web, explicitly set to 'local' persistence (default, but being explicit)
  // This ensures users stay logged in across page refreshes and server restarts
  // Note: 'local' is the default, but we're being explicit for clarity
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
    console.warn('Error setting auth persistence:', error);
    // Continue anyway - default behavior should still work
  });
}

// Note: 
// - Web: Uses localStorage (persists across browser sessions)
// - React Native/Expo: Automatically uses AsyncStorage (persists across app restarts)
// Users will remain logged in across app restarts in both environments.

export const db = firebase.firestore();
export const storage = firebase.storage();

export default firebase;