/**
 * Notification hooks and helpers
 * 
 * Use these functions to trigger notifications when certain events happen.
 * These functions check user preferences before sending notifications.
 */

import { notifyMeepleUpMembers, notifyGameOwner } from './notifications';

/**
 * Call this when a new post is created in a MeepleUp
 * @param {string} groupId - MeepleUp/Group ID
 * @param {string} postId - Post ID
 * @param {string} userId - User ID who created the post
 * @param {string} userName - Name of user who created the post
 * @param {string} postTitle - Post title (optional)
 * @param {string} postContent - Post content preview
 */
export const notifyNewPost = async (groupId, postId, userId, userName, postTitle, postContent) => {
  if (!groupId || !postId || !userId) {
    return;
  }

  const message = postTitle 
    ? `${userName} posted: "${postTitle}"`
    : `${userName} posted in the discussion`;

  await notifyMeepleUpMembers(groupId, userId, {
    type: 'new_post',
    postId: postId,
    fromUserName: userName,
    message: message,
  });
};

/**
 * Call this when a new comment is created on a post
 * @param {string} groupId - MeepleUp/Group ID
 * @param {string} postId - Post ID
 * @param {string} commentId - Comment ID
 * @param {string} userId - User ID who created the comment
 * @param {string} userName - Name of user who created the comment
 * @param {string} postAuthorId - User ID of the post author (to notify them separately)
 */
export const notifyNewComment = async (groupId, postId, commentId, userId, userName, postAuthorId) => {
  if (!groupId || !postId || !userId) {
    return;
  }

  const message = `${userName} commented on a post`;

  // Notify all members (excluding the commenter)
  await notifyMeepleUpMembers(groupId, userId, {
    type: 'new_comment',
    postId: postId,
    fromUserName: userName,
    message: message,
  });
};

/**
 * Call this when a MeepleUp is updated (description, date, location, etc.)
 * @param {string} groupId - MeepleUp/Group ID
 * @param {string} updatedByUserId - User ID who made the update
 * @param {string} updateType - Type of update ('date', 'location', 'description', 'general')
 * @param {string} groupName - MeepleUp name
 */
export const notifyMeepleUpUpdate = async (groupId, updatedByUserId, updateType, groupName) => {
  if (!groupId || !updatedByUserId) {
    return;
  }

  let message = '';
  switch (updateType) {
    case 'date':
      message = `The date/time for "${groupName}" has been updated`;
      break;
    case 'location':
      message = `The location for "${groupName}" has been updated`;
      break;
    case 'description':
      message = `The description for "${groupName}" has been updated`;
      break;
    default:
      message = `"${groupName}" has been updated`;
  }

  await notifyMeepleUpMembers(groupId, updatedByUserId, {
    type: 'meepleup_changes',
    message: message,
  });
};

/**
 * Call this when someone marks interest in a game
 * @param {string} groupId - MeepleUp/Group ID where the interest was marked
 * @param {string} gameId - Game ID
 * @param {string} gameName - Game name
 * @param {string} ownerId - User ID who owns the game
 * @param {string} interestedUserId - User ID who marked interest
 * @param {string} interestedUserName - Name of user who marked interest
 */
export const notifyGameInterest = async (
  groupId,
  gameId,
  gameName,
  ownerId,
  interestedUserId,
  interestedUserName
) => {
  if (!groupId || !gameId || !ownerId || !interestedUserId) {
    return;
  }

  await notifyGameOwner(
    ownerId,
    interestedUserId,
    interestedUserName,
    gameId,
    gameName,
    groupId
  );
};

