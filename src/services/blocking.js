import { db } from '../config/firebase';

/**
 * Block a user - prevents them from messaging you and hides their content
 * @param {string} currentUserId - The user doing the blocking
 * @param {string} blockedUserId - The user being blocked
 * @returns {Promise<void>}
 */
export const blockUser = async (currentUserId, blockedUserId) => {
  if (!currentUserId || !blockedUserId || currentUserId === blockedUserId) {
    throw new Error('Invalid user IDs');
  }

  if (!db) {
    throw new Error('Database not initialized');
  }

  try {
    const userRef = db.collection('users').doc(currentUserId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    const blockedUsers = userData.blockedUsers || [];

    // Add to blocked list if not already blocked
    if (!blockedUsers.includes(blockedUserId)) {
      await userRef.update({
        blockedUsers: [...blockedUsers, blockedUserId],
      });
    }

    // Also remove any existing conversations with this user
    // This is handled in the messaging service queries
  } catch (error) {
    console.error('Error blocking user:', error);
    throw error;
  }
};

/**
 * Unblock a user
 * @param {string} currentUserId - The user doing the unblocking
 * @param {string} blockedUserId - The user being unblocked
 * @returns {Promise<void>}
 */
export const unblockUser = async (currentUserId, blockedUserId) => {
  if (!currentUserId || !blockedUserId) {
    throw new Error('Invalid user IDs');
  }

  if (!db) {
    throw new Error('Database not initialized');
  }

  try {
    const userRef = db.collection('users').doc(currentUserId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    const blockedUsers = userData.blockedUsers || [];

    // Remove from blocked list
    await userRef.update({
      blockedUsers: blockedUsers.filter(id => id !== blockedUserId),
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    throw error;
  }
};

/**
 * Check if a user is blocked
 * @param {string} currentUserId - The user to check
 * @param {string} otherUserId - The user to check against
 * @returns {Promise<boolean>}
 */
export const isUserBlocked = async (currentUserId, otherUserId) => {
  if (!currentUserId || !otherUserId || currentUserId === otherUserId) {
    return false;
  }

  if (!db) {
    return false;
  }

  try {
    const userDoc = await db.collection('users').doc(currentUserId).get();
    if (!userDoc.exists) {
      return false;
    }

    const blockedUsers = userDoc.data().blockedUsers || [];
    return blockedUsers.includes(otherUserId);
  } catch (error) {
    console.error('Error checking if user is blocked:', error);
    return false;
  }
};

/**
 * Get list of blocked user IDs for a user
 * @param {string} userId - The user to get blocked list for
 * @returns {Promise<string[]>}
 */
export const getBlockedUsers = async (userId) => {
  if (!userId || !db) {
    return [];
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return [];
    }

    return userDoc.data().blockedUsers || [];
  } catch (error) {
    console.error('Error getting blocked users:', error);
    return [];
  }
};

/**
 * Report a user for abuse
 * @param {string} reporterUserId - The user making the report
 * @param {string} reportedUserId - The user being reported
 * @param {string} reason - The reason for reporting (harassment, spam, inappropriate content, etc.)
 * @param {string} description - Optional description/details
 * @param {string} context - Optional context (messageId, postId, eventId, etc.)
 * @returns {Promise<string>} The report document ID
 */
export const reportUser = async (reporterUserId, reportedUserId, reason, description = '', context = {}) => {
  if (!reporterUserId || !reportedUserId || reporterUserId === reportedUserId) {
    throw new Error('Invalid user IDs');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Reason is required');
  }

  if (!db) {
    throw new Error('Database not initialized');
  }

  try {
    const reportData = {
      reporterUserId,
      reportedUserId,
      reason: reason.trim(),
      description: description.trim(),
      context, // Can include messageId, postId, eventId, etc.
      status: 'pending', // pending, reviewed, resolved, dismissed
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const reportRef = await db.collection('reports').add(reportData);
    
    return reportRef.id;
  } catch (error) {
    console.error('Error reporting user:', error);
    throw error;
  }
};

/**
 * Get reports made by a user
 * @param {string} userId - The user to get reports for
 * @returns {Promise<Array>}
 */
export const getUserReports = async (userId) => {
  if (!userId || !db) {
    return [];
  }

  try {
    const snapshot = await db
      .collection('reports')
      .where('reporterUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting user reports:', error);
    return [];
  }
};

