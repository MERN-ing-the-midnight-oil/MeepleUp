/**
 * Utility functions for the MeepleUp app
 */

import * as Location from 'expo-location';

/**
 * Format date for display
 */
export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format time for display
 */
export const formatTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

/**
 * Get distance between two coordinates (Haversine formula)
 */
export const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Debounce function for search inputs
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

/**
 * Get user's location (Expo Location API)
 */
export const getUserLocation = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access location was denied');
    }

    const location = await Location.getCurrentPositionAsync({});
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Ensure a value is safe to use as a game id for React Native (no Symbols).
 * React Native bridge cannot serialize Symbols; use for keys, recyclingKey, etc.
 * @param {*} id - Raw id (string, number, or unexpected type)
 * @returns {string|number|null} Serializable id
 */
export function ensureSerializableId(id) {
  if (id == null) return null;
  if (typeof id === 'symbol') return String(id);
  if (typeof id === 'string' || typeof id === 'number') return id;
  return String(id);
}

/**
 * Ensure a value is a non-empty string or null (for thumbnail/image URLs).
 * Prevents Symbols or other non-serializable values from reaching native Image components.
 * @param {*} value - Raw value from API/Firestore
 * @returns {string|null}
 */
export function ensureStringOrNull(value) {
  if (value == null) return null;
  if (typeof value === 'symbol') return null;
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

