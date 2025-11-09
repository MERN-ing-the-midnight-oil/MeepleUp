// Firebase Configuration
// Replace these values with your actual Firebase config from the console

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// Get this from Firebase Console → Project Settings → Your apps → Web app
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyAqbf2-S5W-O6zvdnb9zVPiobJXFHazLKU",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "meepleup-951a1.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "meepleup-951a1",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "meepleup-951a1.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "177622732549",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:177622732549:web:a7bdfb4b8ed9816d42716c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

