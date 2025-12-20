import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { Platform } from 'react-native';

// Note: Email sending requires a Cloud Function to be deployed
// See EMAIL_SETUP.md for instructions on setting up the email Cloud Function

// Try to import expo-notifications (may not be installed)
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  // Configure how notifications are handled when app is in foreground
  if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (error) {
  console.log('[notifications] expo-notifications not available, push notifications will be limited');
}

/**
 * Notification types based on schema
 * 'new_post' | 'new_comment' | 'game_interest' | 'group_invite' | 'rsvp_update' | 'meepleup_changes'
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
      meepleupChangesEmail: false,
      gameMarking: true,
      gameMarkingEmail: false,
    };
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return null;
  }
};

/**
 * Check if user has a specific notification type enabled
 * @param {object} preferences - User notification preferences
 * @param {string} notificationType - Type of notification ('meepleupChanges', 'gameMarking')
 * @returns {boolean}
 */
export const isNotificationEnabled = (preferences, notificationType) => {
  if (!preferences) {
    return true; // Default to enabled if preferences not found
  }

  switch (notificationType) {
    case 'meepleupChanges':
      return preferences.meepleupChanges !== false;
    case 'gameMarking':
      // Legacy support - check both gameMarking and discussion
      return preferences.gameMarking !== false && preferences.discussion !== false;
    case 'discussion':
      return preferences.discussion !== false;
    default:
      return true;
  }
};

/**
 * Notify meepleup members when someone adds games to their collection
 * @param {string} userId - User ID who added games
 * @param {string} userName - Name of user who added games
 * @param {number} gameCount - Number of games added
 */
export const notifyGameAdditions = async (userId, userName, gameCount) => {
  if (!userId || !db || !gameCount || gameCount <= 0) {
    return;
  }

  try {
    // Find all meepleups this user belongs to
    const groupsSnapshot = await db
      .collection('gamingGroups')
      .where('memberIds', 'array-contains', userId)
      .get();

    if (groupsSnapshot.empty) {
      return;
    }

    const batch = db.batch();
    let notificationCount = 0;

    for (const groupDoc of groupsSnapshot.docs) {
      const groupData = groupDoc.data();
      const groupId = groupDoc.id;
      const groupName = groupData.name || 'your MeepleUp';
      const memberIds = groupData.memberIds || [];

      // Notify all other members
      for (const memberId of memberIds) {
        if (memberId === userId) continue; // Skip the user who added games

        // Get member's preferences
        const preferences = await getUserNotificationPreferences(memberId);
        
        if (isNotificationEnabled(preferences, 'meepleupChanges')) {
          const notificationsRef = db.collection('users').doc(memberId).collection('notifications');
          const notificationId = notificationsRef.doc().id;

          const message = `${userName} added ${gameCount} new game${gameCount > 1 ? 's' : ''} to their collection in ${groupName}`;

          const notification = {
            id: notificationId,
            type: 'game_added',
            groupId: groupId,
            fromUserId: userId,
            fromUserName: userName,
            message: message,
            read: false,
            createdAt: firebase.firestore.Timestamp.now(),
          };

          batch.set(notificationsRef.doc(notificationId), notification);
          notificationCount++;
        }
      }
    }

    if (notificationCount > 0) {
      await batch.commit();
      console.log(`Created ${notificationCount} game addition notifications for user ${userId}`);
    }
  } catch (error) {
    console.error('Error notifying about game additions:', error);
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
 * Notify members about Discussion activity (posts, comments)
 * Respects user's discussion notification frequency preferences
 * @param {string} groupId - MeepleUp/Group ID
 * @param {string} excludeUserId - User ID to exclude from notifications (the one who made the change)
 * @param {object} notificationData - Notification data
 * @param {string} notificationData.type - 'new_post' or 'new_comment'
 * @param {string} notificationData.postId - Post ID
 * @param {string} notificationData.commentId - Comment ID (for comment notifications)
 * @param {string} notificationData.postAuthorId - Post author ID (for comment notifications, to check if it's a response)
 * @param {string} notificationData.fromUserName - Name of user who created the post/comment
 * @param {string} notificationData.message - Notification message
 */
export const notifyDiscussionActivity = async (groupId, excludeUserId, notificationData) => {
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
      
      // Check if Discussion notifications are enabled
      if (!isNotificationEnabled(preferences, 'discussion')) {
        continue;
      }

      const frequency = preferences.discussionFrequency || 'all';
      
      // Check frequency settings
      if (frequency === 'responses') {
        // Only notify if this is a response to the user's comment or post
        // For new posts, skip (not a response to the user)
        if (notificationData.type === 'new_post') {
          continue;
        }
        // For comments, check if the post author is the current user
        // or if this comment is a reply to one of the user's comments
        if (notificationData.type === 'new_comment') {
          let shouldNotify = false;
          
          // Check if this comment is on a post by the user
          if (notificationData.postAuthorId === memberId) {
            // This is a comment on the user's post - notify
            shouldNotify = true;
          } else if (notificationData.parentCommentAuthorId === memberId) {
            // This is a reply to the user's comment - notify
            shouldNotify = true;
          }
          
          if (!shouldNotify) {
            // Not a response to the user - skip
            continue;
          }
        }
      } else if (frequency === 'mentions') {
        // Only notify if the user is mentioned
        // For now, we'll skip this as mention detection would need to be implemented
        // TODO: Implement mention detection (@username)
        continue;
      } else if (frequency === 'daily') {
        // For daily aggregation, we'll still create the notification
        // but it should be aggregated by a separate process
        // For now, create it normally - aggregation can be handled separately
      }
      // 'all' frequency - notify for all activity

      const notificationsRef = db.collection('users').doc(memberId).collection('notifications');
      const notificationId = notificationsRef.doc().id;

      const notification = {
        id: notificationId,
        type: notificationData.type || 'new_post',
        groupId: groupId,
        postId: notificationData.postId || null,
        commentId: notificationData.commentId || null,
        fromUserId: excludeUserId || null,
        fromUserName: notificationData.fromUserName || null,
        message: notificationData.message,
        read: false,
        createdAt: firebase.firestore.Timestamp.now(),
      };

      batch.set(notificationsRef.doc(notificationId), notification);
      notificationCount++;
    }

    if (notificationCount > 0) {
      await batch.commit();
      console.log(`Created ${notificationCount} Discussion notifications for MeepleUp ${groupId}`);
    }
  } catch (error) {
    console.error('Error notifying Discussion activity:', error);
  }
};

// Public meepleups feature removed - notification function no longer needed

/**
 * Notify a user when someone comments on their game
 * @param {string} ownerId - User ID who owns the game
 * @param {string} interestedUserId - User ID who commented
 * @param {string} interestedUserName - Name of user who commented
 * @param {string} gameId - Game ID
 * @param {string} gameName - Game name
 * @param {string} groupId - MeepleUp ID where the comment was made
 */
export const notifyGameOwner = async (
  ownerId,
  interestedUserId,
  interestedUserName,
  gameId,
  gameName,
  groupId
) => {
  console.log('[notifyGameOwner] Starting notification process:', {
    ownerId,
    interestedUserId,
    interestedUserName,
    gameId,
    gameName,
    groupId
  });

  if (!ownerId || !interestedUserId || !db) {
    console.warn('[notifyGameOwner] Missing required parameters:', { ownerId, interestedUserId, hasDb: !!db });
    return;
  }

  // Don't notify if user commented on their own game
  if (ownerId === interestedUserId) {
    console.log('[notifyGameOwner] Skipping: user is commenting on their own game');
    return;
  }

  // Verify both users are members of the same MeepleUp
  if (!groupId) {
    console.warn('[notifyGameOwner] Cannot notify game owner: groupId is required to verify MeepleUp membership');
    return;
  }

  try {
    // Check if both users are members of the MeepleUp
    console.log('[notifyGameOwner] Checking MeepleUp membership for group:', groupId);
    const groupRef = db.collection('gamingGroups').doc(groupId);
    const groupDoc = await groupRef.get();
    
    if (!groupDoc.exists) {
      console.warn(`[notifyGameOwner] MeepleUp ${groupId} does not exist`);
      return;
    }

    const groupData = groupDoc.data();
    const memberIds = groupData.memberIds || [];
    
    console.log('[notifyGameOwner] MeepleUp members:', memberIds);
    
    // Check if both users are members
    const ownerIsMember = memberIds.includes(ownerId);
    const commenterIsMember = memberIds.includes(interestedUserId);
    
    console.log('[notifyGameOwner] Membership check:', {
      ownerIsMember,
      commenterIsMember,
      ownerId,
      interestedUserId
    });
    
    if (!ownerIsMember || !commenterIsMember) {
      console.log(`[notifyGameOwner] Skipping notification: users do not share MeepleUp ${groupId}`, {
        ownerIsMember,
        commenterIsMember
      });
      return;
    }

    // Get owner's notification preferences
    console.log('[notifyGameOwner] Fetching notification preferences for owner:', ownerId);
    const preferences = await getUserNotificationPreferences(ownerId);
    console.log('[notifyGameOwner] Notification preferences:', preferences);

    if (!isNotificationEnabled(preferences, 'gameMarking')) {
      console.log('[notifyGameOwner] Skipping: gameMarking notification is disabled for user:', ownerId);
      return;
    }

    const message = `${interestedUserName || 'Someone'} has expressed interest in ${gameName} for your next meeting`;
    console.log('[notifyGameOwner] Creating notification with message:', message);

    // Create in-app notification
    const notificationId = await createNotification(ownerId, {
      type: 'game_interest',
      groupId: groupId,
      fromUserId: interestedUserId,
      fromUserName: interestedUserName,
      message: message,
    });

    console.log('[notifyGameOwner] Notification created with ID:', notificationId);

    // Send push notification
    try {
      await sendPushNotification(ownerId, message, {
        type: 'game_interest',
        groupId: groupId,
        gameId: gameId,
        gameName: gameName,
        fromUserId: interestedUserId,
        fromUserName: interestedUserName,
      });
    } catch (pushError) {
      console.error('[notifyGameOwner] Error sending push notification:', pushError);
      // Don't fail the notification if push fails
    }

    // Send email if email notifications are enabled
    if (preferences.gameMarkingEmail === true && notificationId) {
      console.log('[notifyGameOwner] Sending email notification');
      try {
        await sendGameRequestEmail(ownerId, interestedUserName, gameName, groupId);
        console.log('[notifyGameOwner] Email notification sent successfully');
      } catch (emailError) {
        console.error('[notifyGameOwner] Error sending game request email:', emailError);
        // Don't fail the notification if email fails
      }
    } else {
      console.log('[notifyGameOwner] Email notifications disabled or notificationId missing:', {
        gameMarkingEmail: preferences.gameMarkingEmail,
        notificationId
      });
    }

    console.log(`[notifyGameOwner] Successfully sent notification to owner ${ownerId} for game ${gameName}`);
  } catch (error) {
    console.error('[notifyGameOwner] Error notifying game owner:', error);
    console.error('[notifyGameOwner] Error stack:', error.stack);
  }
};

/**
 * Send email notification for game request
 * This calls a Cloud Function to send the email
 * @param {string} ownerId - User ID who owns the game
 * @param {string} interestedUserName - Name of user who requested
 * @param {string} gameName - Game name
 * @param {string} groupId - MeepleUp ID
 * @returns {Promise<void>}
 */
const sendGameRequestEmail = async (ownerId, interestedUserName, gameName, groupId) => {
  if (!ownerId || !db) {
    return;
  }

  try {
    // Get owner's email from Firestore
    const ownerDoc = await db.collection('users').doc(ownerId).get();
    if (!ownerDoc.exists) {
      console.warn(`Cannot send email: user ${ownerId} not found`);
      return;
    }

    const ownerData = ownerDoc.data();
    const ownerEmail = ownerData.email;
    
    if (!ownerEmail) {
      console.warn(`Cannot send email: user ${ownerId} has no email`);
      return;
    }

    // Get MeepleUp name
    let meepleUpName = 'your MeepleUp';
    if (groupId) {
      try {
        const groupDoc = await db.collection('gamingGroups').doc(groupId).get();
        if (groupDoc.exists) {
          meepleUpName = groupDoc.data().name || meepleUpName;
        }
      } catch (error) {
        console.error('Error fetching MeepleUp name:', error);
      }
    }

    // Call Cloud Function to send email
    // Note: This requires a Cloud Function to be deployed
    // The function should be at: https://us-central1-meepleup-951a1.cloudfunctions.net/sendGameRequestEmail
    const projectId = firebase.apps[0]?.options?.projectId || 'meepleup-951a1';
    const functionsUrl = `https://us-central1-${projectId}.cloudfunctions.net/sendGameRequestEmail`;
    
    try {
      const response = await fetch(functionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: ownerEmail,
          subject: `Game Request: ${interestedUserName} wants you to bring ${gameName}`,
          gameName: gameName,
          interestedUserName: interestedUserName,
          meepleUpName: meepleUpName,
          groupId: groupId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Email service returned ${response.status}: ${errorText}`);
      }

      const result = await response.json().catch(() => ({}));
      console.log(`Game request email sent to ${ownerEmail}`, result);
    } catch (error) {
      // If Cloud Function doesn't exist or fails, log but don't throw
      // This allows the in-app notification to still be created
      console.warn('Could not send email (Cloud Function may not be deployed):', error.message);
      console.warn('To enable emails, deploy a Cloud Function. See EMAIL_SETUP.md for instructions.');
      console.warn('Expected function URL:', functionsUrl);
    }
  } catch (error) {
    console.error('Error in sendGameRequestEmail:', error);
    // Don't throw - allow notification to be created even if email fails
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

/**
 * Notify user about a new direct message
 * @param {string} recipientId - User ID receiving the message
 * @param {string} senderId - User ID sending the message
 * @param {string} senderName - Name of sender
 * @param {string} messagePreview - Preview of the message
 * @param {string} groupId - MeepleUp ID where message was sent
 * @param {string} groupName - MeepleUp name
 */
export const notifyNewDirectMessage = async (
  recipientId,
  senderId,
  senderName,
  messagePreview,
  groupId,
  groupName
) => {
  if (!recipientId || !senderId || !db) {
    return;
  }

  try {
    // Get recipient's notification preferences
    const preferences = await getUserNotificationPreferences(recipientId);

    // Create in-app notification
    const notificationId = await createNotification(recipientId, {
      type: 'new_message',
      groupId: groupId,
      fromUserId: senderId,
      fromUserName: senderName,
      message: `${senderName} sent you a message in ${groupName || 'a MeepleUp'}`,
    });

    // Send push notification if enabled
    if (preferences?.meepleupChanges !== false) {
      try {
        await sendPushNotification(recipientId, `${senderName}: ${messagePreview.substring(0, 50)}${messagePreview.length > 50 ? '...' : ''}`, {
          type: 'new_message',
          groupId: groupId,
          groupName: groupName,
          senderId: senderId,
          senderName: senderName,
        });
      } catch (pushError) {
        console.error('Error sending push notification for DM:', pushError);
      }
    }

    // Send email if enabled
    if (preferences?.meepleupChangesEmail === true && notificationId) {
      try {
        await sendDirectMessageEmail(recipientId, senderName, messagePreview, groupName, groupId);
      } catch (emailError) {
        console.error('Error sending email notification for DM:', emailError);
      }
    }
  } catch (error) {
    console.error('Error notifying about direct message:', error);
  }
};

/**
 * Send email notification for direct message
 * @param {string} recipientId - User ID receiving the message
 * @param {string} senderName - Name of sender
 * @param {string} messagePreview - Preview of the message
 * @param {string} groupName - MeepleUp name
 * @param {string} groupId - MeepleUp ID
 */
const sendDirectMessageEmail = async (recipientId, senderName, messagePreview, groupName, groupId) => {
  if (!recipientId || !db) {
    return;
  }

  try {
    const recipientDoc = await db.collection('users').doc(recipientId).get();
    if (!recipientDoc.exists) {
      console.warn(`Cannot send email: user ${recipientId} not found`);
      return;
    }

    const recipientData = recipientDoc.data();
    const recipientEmail = recipientData.email;

    if (!recipientEmail) {
      console.warn(`Cannot send email: user ${recipientId} has no email`);
      return;
    }

    const projectId = firebase.apps[0]?.options?.projectId || 'meepleup-951a1';
    const functionsUrl = `https://us-central1-${projectId}.cloudfunctions.net/sendDirectMessageEmail`;

    try {
      const response = await fetch(functionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `New message from ${senderName} in ${groupName || 'MeepleUp'}`,
          senderName: senderName,
          messagePreview: messagePreview,
          groupName: groupName || 'MeepleUp',
          groupId: groupId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Email service returned ${response.status}: ${errorText}`);
      }

      const result = await response.json().catch(() => ({}));
      console.log(`Direct message email sent to ${recipientEmail}`, result);
    } catch (error) {
      console.warn('Could not send email (Cloud Function may not be deployed):', error.message);
    }
  } catch (error) {
    console.error('Error in sendDirectMessageEmail:', error);
  }
};

/**
 * Send push notification to a user
 * @param {string} userId - User ID to send notification to
 * @param {string} message - Notification message
 * @param {object} data - Additional data to include in notification
 * @returns {Promise<void>}
 */
const sendPushNotification = async (userId, message, data = {}) => {
  if (!userId || !message) {
    console.warn('[sendPushNotification] Missing userId or message');
    return;
  }

  try {
    // Get user's push token from Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.warn(`[sendPushNotification] User ${userId} not found`);
      return;
    }

    const userData = userDoc.data();
    const pushToken = userData.pushToken || userData.expoPushToken;

    if (!pushToken) {
      console.log(`[sendPushNotification] User ${userId} does not have a push token registered`);
      // Still try to send a local notification if on the same device
      if (Platform.OS !== 'web' && Notifications && Notifications.scheduleNotificationAsync) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'MeepleUp',
              body: message,
              data: data,
            },
            trigger: null, // Show immediately
          });
          console.log('[sendPushNotification] Local notification sent');
        } catch (localError) {
          console.error('[sendPushNotification] Error sending local notification:', localError);
        }
      }
      return;
    }

    // Send push notification via Expo's push notification service
    // Note: For production, you'd typically send this from a backend/Cloud Function
    // For now, we'll use Expo's API directly (requires EXPO_ACCESS_TOKEN in production)
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title: 'MeepleUp',
          body: message,
          data: data,
          priority: 'high',
        }),
      });

      const result = await response.json();
      if (result.data?.status === 'ok') {
        console.log(`[sendPushNotification] Push notification sent successfully to ${userId}`);
      } else {
        console.warn(`[sendPushNotification] Push notification may have failed:`, result);
      }
    } catch (pushError) {
      console.error('[sendPushNotification] Error sending push notification:', pushError);
      // Fallback to local notification if push fails
      if (Platform.OS !== 'web' && Notifications && Notifications.scheduleNotificationAsync) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'MeepleUp',
              body: message,
              data: data,
            },
            trigger: null,
          });
        } catch (localError) {
          console.error('[sendPushNotification] Error sending fallback local notification:', localError);
        }
      }
    }
  } catch (error) {
    console.error('[sendPushNotification] Error in sendPushNotification:', error);
  }
};

