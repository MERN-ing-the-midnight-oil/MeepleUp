/**
 * Utility functions for tracking monthly photo uploads per user
 */
import { db } from '../config/firebase';
import firebase from '../config/firebase';

// Maximum photos per user per month
export const MAX_PHOTOS_PER_MONTH = 50;

/**
 * Get the current year-month string (e.g., "2024-01")
 */
const getCurrentYearMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Check if user can upload more photos this month
 * @param {string} userId - User ID
 * @returns {Promise<{canUpload: boolean, count: number, limit: number}>}
 */
export const checkPhotoUploadLimit = async (userId) => {
  if (!userId || !db) {
    return { canUpload: false, count: 0, limit: MAX_PHOTOS_PER_MONTH };
  }

  try {
    const yearMonth = getCurrentYearMonth();
    const trackingDocRef = db.collection('users').doc(userId)
      .collection('photoUploads').doc(yearMonth);

    const doc = await trackingDocRef.get();
    
    if (!doc.exists) {
      // No uploads this month yet
      return { canUpload: true, count: 0, limit: MAX_PHOTOS_PER_MONTH };
    }

    const data = doc.data();
    const count = data?.count || 0;

    return {
      canUpload: count < MAX_PHOTOS_PER_MONTH,
      count,
      limit: MAX_PHOTOS_PER_MONTH,
    };
  } catch (error) {
    console.error('Error checking photo upload limit:', error);
    // On error, allow upload but log the error
    return { canUpload: true, count: 0, limit: MAX_PHOTOS_PER_MONTH };
  }
};

/**
 * Increment the photo upload count for the current month
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export const incrementPhotoUploadCount = async (userId) => {
  if (!userId || !db) {
    return;
  }

  try {
    const yearMonth = getCurrentYearMonth();
    const trackingDocRef = db.collection('users').doc(userId)
      .collection('photoUploads').doc(yearMonth);

    await trackingDocRef.set({
      count: firebase.firestore.FieldValue.increment(1),
      lastUploadAt: firebase.firestore.Timestamp.now(),
      yearMonth,
    }, { merge: true });
  } catch (error) {
    console.error('Error incrementing photo upload count:', error);
    // Don't throw - tracking failure shouldn't block uploads
  }
};

