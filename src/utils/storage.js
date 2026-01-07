// Platform-agnostic storage utility
// Uses AsyncStorage on React Native/Expo native platforms
// Falls back to localStorage on web

import { Platform } from 'react-native';
import logger from './logger';

let storage;

if (Platform.OS === 'web') {
  // Use localStorage on web
  storage = {
    async getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        logger.error('Error reading from localStorage:', error);
        return null;
      }
    },
    async setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        logger.error('Error writing to localStorage:', error);
      }
    },
    async removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        logger.error('Error removing from localStorage:', error);
      }
    },
  };
} else {
  // Use AsyncStorage on native platforms
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    storage = AsyncStorage;
  } catch (error) {
    logger.warn('AsyncStorage not available, falling back to in-memory storage');
    // Fallback to in-memory storage if AsyncStorage is not available
    const memoryStorage = {};
    storage = {
      async getItem(key) {
        return memoryStorage[key] || null;
      },
      async setItem(key, value) {
        memoryStorage[key] = value;
      },
      async removeItem(key) {
        delete memoryStorage[key];
      },
    };
  }
}

export default storage;

