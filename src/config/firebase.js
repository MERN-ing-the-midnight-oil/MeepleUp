// Firebase Configuration (compat for Expo)
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

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
export const db = firebase.firestore();
export const storage = firebase.storage();

export default firebase;