import { db } from '../config/firebase';
import firebase from '../config/firebase';

/**
 * Notification types based on schema
 * 'new_post' | 'new_comment' | 'game_interest' | 'group_invite' | 'rsvp_update' | 'meepleup_changes' | 'new_public_meepleup'
 */

/**
 * Create a notification for a user
 * @param {string} userId - User ID to notify
 * @param {object} notificationData - Notification data
 * @param {string} notificationData.type - Notification type
 * @param {string} [notificationData.groupId] - Gaming group/MeepleUp ID
 * @param {string} [notificationData.postId] - Post ID (for post/comment notifications)
 * @param {string} [notificationData.fromUserId] - User who triggered the notification
 * @param {string} [notificationData.fromUserName] - Name of user who triggered
 * @param {string} notificationData.message - Notification message
 * @returns {Promise<string>} Notification ID
 */
export const createNotification = async (userId, notificationData) => {
  if (!userId || !db) {
    console.warn('Cannot create notification: missing userId or db');
    return null;
  }

  try {
    const notificationsRef = db.collection('users').doc(userId).collection('notifications');
    const notificationId = notificationsRef.doc().id;

    const notification = {
      id: notificationId,
      type: notificationData.type,
      groupId: notificationData.groupId || null,
      postId: notificationData.postId || null,
      fromUserId: notificationData.fromUserId || null,
      fromUserName: notificationData.fromUserName || null,
      message: notificationData.message,
      read: false,
      createdAt: firebase.firestore.Timestamp.now(),
    };

    await notificationsRef.doc(notificationId).set(notification);
    console.log(`Notification created for user ${userId}:`, notification);
    return notificationId;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

/**
 * Get user's notification preferences
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} Notification preferences or null
 */
export const getUserNotificationPreferences = async (userId) => {
  if (!userId || !db) {
    return null;
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return null;
    }

    const userData = userDoc.data();
    return userData.notificationPreferences || {
      meepleupChanges: true,
      newPublicMeepleups: true,
      gameMarking: true,
      nearbyMeepleupDistance: 25,
    };
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return null;
  }
};

/**
 * Check if user has a specific notification type enabled
 * @param {object} preferences - User notification preferences
 * @param {string} notificationType - Type of notification ('meepleupChanges', 'newPublicMeepleups', 'gameMarking')
 * @returns {boolean}
 */
export const isNotificationEnabled = (preferences, notificationType) => {
  if (!preferences) {
    return true; // Default to enabled if preferences not found
  }

  switch (notificationType) {
    case 'meepleupChanges':
      return preferences.meepleupChanges !== false;
    case 'newPublicMeepleups':
      return preferences.newPublicMeepleups !== false;
    case 'gameMarking':
      return preferences.gameMarking !== false;
    default:
      return true;
  }
};

/**
 * Notify members of a MeepleUp about changes (posts, comments, updates)
 * @param {string} groupId - MeepleUp/Group ID
 * @param {string} excludeUserId - User ID to exclude from notifications (the one who made the change)
 * @param {object} notificationData - Notification data
 */
export const notifyMeepleUpMembers = async (groupId, excludeUserId, notificationData) => {
  if (!groupId || !db) {
    return;
  }

  try {
    // Get all members of the group
    const membersRef = db.collection('gamingGroups').doc(groupId).collection('members');
    const membersSnapshot = await membersRef.get();

    if (membersSnapshot.empty) {
      return;
    }

    const memberIds = membersSnapshot.docs
      .map(doc => doc.data().userId)
      .filter(userId => userId && userId !== excludeUserId);

    // Batch create notifications for all members
    const batch = db.batch();
    let notificationCount = 0;

    for (const memberId of memberIds) {
      // Get member's preferences
      const preferences = await getUserNotificationPreferences(memberId);
      
      if (isNotificationEnabled(preferences, 'meepleupChanges')) {
        const notificationsRef = db.collection('users').doc(memberId).collection('notifications');
        const notificationId = notificationsRef.doc().id;

        const notification = {
          id: notificationId,
          type: notificationData.type || 'meepleup_changes',
          groupId: groupId,
          postId: notificationData.postId || null,
          fromUserId: excludeUserId || null,
          fromUserName: notificationData.fromUserName || null,
          message: notificationData.message,
          read: false,
          createdAt: firebase.firestore.Timestamp.now(),
        };

        batch.set(notificationsRef.doc(notificationId), notification);
        notificationCount++;
      }
    }

    if (notificationCount > 0) {
      await batch.commit();
      console.log(`Created ${notificationCount} notifications for MeepleUp ${groupId}`);
    }
  } catch (error) {
    console.error('Error notifying MeepleUp members:', error);
  }
};

/**
 * Notify users about a new public MeepleUp near their zip code
 * @param {string} groupId - New MeepleUp ID
 * @param {string} groupName - MeepleUp name
 * @param {string} groupZipcode - MeepleUp zipcode
 * @param {string} organizerName - Organizer name
 * @param {number} organizerUserId - Organizer user ID (to exclude from notifications)
 */
export const notifyNearbyUsersOfNewPublicMeepleUp = async (
  groupId,
  groupName,
  groupZipcode,
  organizerName,
  organizerUserId
) => {
  if (!groupId || !groupZipcode || !db) {
    return;
  }

  try {
    // Get all users with zipcodes
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      return;
    }

    const batch = db.batch();
    let notificationCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      
      // Skip the organizer
      if (userId === organizerUserId) {
        continue;
      }

      const userData = userDoc.data();
      const userZipcode = userData.zipcode;

      // Skip if user doesn't have a zipcode
      if (!userZipcode) {
        continue;
      }

      // Get user's notification preferences
      const preferences = userData.notificationPreferences || {
        newPublicMeepleups: true,
        nearbyMeepleupDistance: 25,
      };

      // Check if notification is enabled
      if (!isNotificationEnabled(preferences, 'newPublicMeepleups')) {
        continue;
      }

      // Calculate distance (simplified - using zipcode prefix matching for now)
      // TODO: Implement proper distance calculation with geocoding API
      const distance = calculateZipcodeDistance(userZipcode, groupZipcode);
      const maxDistance = preferences.nearbyMeepleupDistance || 25;

      if (distance !== null && distance <= maxDistance) {
        const notificationsRef = db.collection('users').doc(userId).collection('notifications');
        const notificationId = notificationsRef.doc().id;

        const notification = {
          id: notificationId,
          type: 'new_public_meepleup',
          groupId: groupId,
          fromUserId: organizerUserId || null,
          fromUserName: organizerName || null,
          message: `New public MeepleUp "${groupName}" created ${distance.toFixed(1)} miles away!`,
          read: false,
          createdAt: firebase.firestore.Timestamp.now(),
        };

        batch.set(notificationsRef.doc(notificationId), notification);
        notificationCount++;
      }
    }

    if (notificationCount > 0) {
      await batch.commit();
      console.log(`Created ${notificationCount} notifications for new public MeepleUp ${groupId}`);
    }
  } catch (error) {
    console.error('Error notifying nearby users of new public MeepleUp:', error);
  }
};

/**
 * Notify a user when someone marks interest in their game
 * @param {string} ownerId - User ID who owns the game
 * @param {string} interestedUserId - User ID who marked interest
 * @param {string} interestedUserName - Name of user who marked interest
 * @param {string} gameId - Game ID
 * @param {string} gameName - Game name
 * @param {string} groupId - MeepleUp ID where the interest was marked
 */
export const notifyGameOwner = async (
  ownerId,
  interestedUserId,
  interestedUserName,
  gameId,
  gameName,
  groupId
) => {
  if (!ownerId || !interestedUserId || !db) {
    return;
  }

  // Don't notify if user marked interest in their own game
  if (ownerId === interestedUserId) {
    return;
  }

  try {
    // Get owner's notification preferences
    const preferences = await getUserNotificationPreferences(ownerId);

    if (!isNotificationEnabled(preferences, 'gameMarking')) {
      return;
    }

    const message = `${interestedUserName || 'Someone'} marked interest in your game "${gameName}"`;

    await createNotification(ownerId, {
      type: 'game_interest',
      groupId: groupId,
      fromUserId: interestedUserId,
      fromUserName: interestedUserName,
      message: message,
    });

    console.log(`Game interest notification sent to owner ${ownerId} for game ${gameName}`);
  } catch (error) {
    console.error('Error notifying game owner:', error);
  }
};

/**
 * Calculate distance between two zipcodes (simplified version)
 * This is a basic implementation. For production, use a proper geocoding API
 * to convert zipcodes to lat/lng and calculate actual distance.
 * 
 * @param {string} zipcode1 - First zipcode
 * @param {string} zipcode2 - Second zipcode
 * @returns {number|null} Distance in miles, or null if calculation fails
 */
export const calculateZipcodeDistance = (zipcode1, zipcode2) => {
  if (!zipcode1 || !zipcode2) {
    return null;
  }

  // Extract first 5 digits of zipcode
  const zip1 = zipcode1.replace(/[^0-9]/g, '').substring(0, 5);
  const zip2 = zipcode2.replace(/[^0-9]/g, '').substring(0, 5);

  if (!zip1 || !zip2 || zip1.length !== 5 || zip2.length !== 5) {
    return null;
  }

  // Simplified distance calculation based on zipcode prefix
  // This is a rough approximation. Real implementation would use geocoding
  const zip1Num = parseInt(zip1, 10);
  const zip2Num = parseInt(zip2, 10);
  
  // US zipcodes are roughly geographic - higher numbers generally further north/east
  // This is a very rough approximation: ~70 miles per 1000 zipcode difference
  const difference = Math.abs(zip1Num - zip2Num);
  const estimatedDistance = (difference / 1000) * 70;

  // For same zipcode area (first 3 digits), use a smaller estimate
  if (zip1.substring(0, 3) === zip2.substring(0, 3)) {
    return Math.max(estimatedDistance / 3, 0.5); // At least 0.5 miles
  }

  return estimatedDistance;
};

