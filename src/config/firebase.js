// Firebase Configuration (compat for Expo)
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyAqbf2-S5W-O6zvdnb9zVPiobJXFHazLKU',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'meepleup-951a1.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'meepleup-951a1',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'meepleup-951a1.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '177622732549',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:177622732549:web:a7bdfb4b8ed9816d42716c',
};

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