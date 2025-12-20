import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { getBlockedUsers } from './blocking';
import { notifyNewDirectMessage } from '../utils/notifications';

/**
 * Generate a consistent conversation ID from two user IDs
 * Always sorts IDs to ensure same conversation ID regardless of order
 */
const getConversationId = (userId1, userId2) => {
  const sorted = [userId1, userId2].sort();
  return `${sorted[0]}_${sorted[1]}`;
};

/**
 * Get all conversations for a user in a specific MeepleUp
 */
export const getConversations = async (eventId, userId) => {
  if (!db || !eventId || !userId) {
    return [];
  }

  try {
    const conversationsRef = db
      .collection('gamingGroups')
      .doc(eventId)
      .collection('privateConversations');

    // Get all conversations where this user is a participant
    const snapshot = await conversationsRef
      .where('participants', 'array-contains', userId)
      .orderBy('lastMessageAt', 'desc')
      .get();

    // Get list of blocked users
    const blockedUsers = await getBlockedUsers(userId);
    const blockedUserSet = new Set(blockedUsers);

    const conversations = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const otherUserId = data.participants.find(id => id !== userId);
      
      // Skip if other user is blocked
      if (otherUserId && blockedUserSet.has(otherUserId)) {
        continue;
      }
      
      // Get other user's info
      let otherUser = null;
      if (otherUserId) {
        try {
          const userDoc = await db.collection('users').doc(otherUserId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            otherUser = {
              id: otherUserId,
              name: userData.name || userData.email || 'Unknown User',
              avatarUrl: userData.avatarUrl || null,
            };
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      }

      conversations.push({
        id: doc.id,
        otherUser,
        lastMessage: data.lastMessage || null,
        lastMessageAt: data.lastMessageAt?.toDate?.()?.toISOString() || data.lastMessageAt || null,
        unreadCount: data.unreadCounts?.[userId] || 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || null,
      });
    }

    return conversations;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
};

/**
 * Get or create a conversation between two users in a MeepleUp
 */
export const getOrCreateConversation = async (eventId, userId1, userId2) => {
  if (!db || !eventId || !userId1 || !userId2 || userId1 === userId2) {
    return null;
  }

  const conversationId = getConversationId(userId1, userId2);
  const conversationsRef = db
    .collection('gamingGroups')
    .doc(eventId)
    .collection('privateConversations')
    .doc(conversationId);

  try {
    const doc = await conversationsRef.get();
    
    if (doc.exists) {
      return {
        id: conversationId,
        ...doc.data(),
      };
    }

    // Create new conversation
    const conversationData = {
      participants: [userId1, userId2].sort(),
      createdAt: firebase.firestore.Timestamp.now(),
      lastMessageAt: firebase.firestore.Timestamp.now(),
      lastMessage: null,
      unreadCounts: {
        [userId1]: 0,
        [userId2]: 0,
      },
    };

    await conversationsRef.set(conversationData);
    return {
      id: conversationId,
      ...conversationData,
    };
  } catch (error) {
    console.error('Error getting/creating conversation:', error);
    return null;
  }
};

/**
 * Send a private message
 */
export const sendMessage = async (eventId, conversationId, senderId, content) => {
  if (!db || !eventId || !conversationId || !senderId || !content?.trim()) {
    throw new Error('Missing required parameters');
  }

  try {
    const messagesRef = db
      .collection('gamingGroups')
      .doc(eventId)
      .collection('privateConversations')
      .doc(conversationId)
      .collection('messages');

    const messageData = {
      senderId,
      content: content.trim(),
      createdAt: firebase.firestore.Timestamp.now(),
      read: false,
    };

    const messageDoc = await messagesRef.add(messageData);

    // Update conversation metadata
    const conversationRef = db
      .collection('gamingGroups')
      .doc(eventId)
      .collection('privateConversations')
      .doc(conversationId);

    const conversationDoc = await conversationRef.get();
    const conversationData = conversationDoc.data();
    const otherUserId = conversationData.participants.find(id => id !== senderId);

    await conversationRef.update({
      lastMessage: content.trim(),
      lastMessageAt: firebase.firestore.Timestamp.now(),
      lastMessageSenderId: senderId,
      // Increment unread count for the other user
      [`unreadCounts.${otherUserId}`]: firebase.firestore.FieldValue.increment(1),
    });

    // Get sender's name and meepleup name for notification
    let senderName = 'Someone';
    let groupName = 'MeepleUp';
    try {
      const [senderDoc, groupDoc] = await Promise.all([
        db.collection('users').doc(senderId).get(),
        db.collection('gamingGroups').doc(eventId).get(),
      ]);
      
      if (senderDoc.exists) {
        senderName = senderDoc.data().name || senderName;
      }
      if (groupDoc.exists) {
        groupName = groupDoc.data().name || groupName;
      }
    } catch (error) {
      console.error('Error fetching names for notification:', error);
    }

    // Notify recipient about new message
    await notifyNewDirectMessage(
      otherUserId,
      senderId,
      senderName,
      content.trim(),
      eventId,
      groupName
    );

    return {
      id: messageDoc.id,
      ...messageData,
    };
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Get messages for a conversation with real-time listener
 */
export const subscribeToMessages = (eventId, conversationId, userId, callback) => {
  if (!db || !eventId || !conversationId || !callback) {
    return null;
  }

  const messagesRef = db
    .collection('gamingGroups')
    .doc(eventId)
    .collection('privateConversations')
    .doc(conversationId)
    .collection('messages')
    .orderBy('createdAt', 'asc');

  return messagesRef.onSnapshot(
    async (snapshot) => {
      // Get list of blocked users
      const blockedUsers = userId ? await getBlockedUsers(userId) : [];
      const blockedUserSet = new Set(blockedUsers);

      const messages = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Skip messages from blocked users
        if (data.senderId && blockedUserSet.has(data.senderId)) {
          continue;
        }

        messages.push({
          id: doc.id,
          senderId: data.senderId,
          content: data.content,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || null,
          read: data.read || false,
        });
      }
      callback(messages);
    },
    (error) => {
      console.error('Error subscribing to messages:', error);
      callback([]);
    }
  );
};

/**
 * Mark messages as read
 */
export const markMessagesAsRead = async (eventId, conversationId, userId) => {
  if (!db || !eventId || !conversationId || !userId) {
    return;
  }

  try {
    const conversationRef = db
      .collection('gamingGroups')
      .doc(eventId)
      .collection('privateConversations')
      .doc(conversationId);

    // Reset unread count for this user
    await conversationRef.update({
      [`unreadCounts.${userId}`]: 0,
    });

    // Mark all unread messages from other users as read
    const messagesRef = conversationRef.collection('messages');
    const unreadSnapshot = await messagesRef
      .where('read', '==', false)
      .where('senderId', '!=', userId)
      .get();

    if (!unreadSnapshot.empty) {
      const batch = db.batch();
      unreadSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();
    }
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
};

/**
 * Get unread message count for a user in a MeepleUp
 */
export const getUnreadCount = async (eventId, userId) => {
  if (!db || !eventId || !userId) {
    return 0;
  }

  try {
    const conversationsRef = db
      .collection('gamingGroups')
      .doc(eventId)
      .collection('privateConversations');

    const snapshot = await conversationsRef
      .where('participants', 'array-contains', userId)
      .get();

    let totalUnread = 0;
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      totalUnread += data.unreadCounts?.[userId] || 0;
    });

    return totalUnread;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

/**
 * Find all meepleups where both users are members
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<Array>} Array of meepleup objects
 */
export const findSharedMeepleups = async (userId1, userId2) => {
  if (!db || !userId1 || !userId2 || userId1 === userId2) {
    return [];
  }

  try {
    // Get all meepleups where userId1 is a member
    const user1GroupsSnapshot = await db
      .collection('gamingGroups')
      .where('memberIds', 'array-contains', userId1)
      .where('isActive', '==', true)
      .get();

    const sharedMeepleups = [];

    for (const doc of user1GroupsSnapshot.docs) {
      const groupData = doc.data();
      const memberIds = groupData.memberIds || [];

      // Check if userId2 is also a member
      if (memberIds.includes(userId2)) {
        sharedMeepleups.push({
          id: doc.id,
          name: groupData.name || 'Unnamed MeepleUp',
          ...groupData,
        });
      }
    }

    return sharedMeepleups;
  } catch (error) {
    console.error('Error finding shared meepleups:', error);
    return [];
  }
};

/**
 * Send a direct message from profile modal
 * Finds a shared meepleup and sends the message there
 * @param {string} senderId - User ID sending the message
 * @param {string} recipientId - User ID receiving the message
 * @param {string} content - Message content
 * @returns {Promise<object>} Message data or null if no shared meepleup
 */
export const sendDirectMessage = async (senderId, recipientId, content) => {
  if (!db || !senderId || !recipientId || !content?.trim() || senderId === recipientId) {
    throw new Error('Invalid parameters for direct message');
  }

  try {
    // Find shared meepleups
    const sharedMeepleups = await findSharedMeepleups(senderId, recipientId);

    if (sharedMeepleups.length === 0) {
      throw new Error('You must be in at least one MeepleUp together to send messages');
    }

    // Use the first shared meepleup (or could let user choose)
    const meepleup = sharedMeepleups[0];

    // Get or create conversation
    const conversation = await getOrCreateConversation(meepleup.id, senderId, recipientId);

    if (!conversation) {
      throw new Error('Failed to create conversation');
    }

    // Send the message
    const message = await sendMessage(meepleup.id, conversation.id, senderId, content);

    // Get sender's name for notification
    let senderName = 'Someone';
    try {
      const senderDoc = await db.collection('users').doc(senderId).get();
      if (senderDoc.exists) {
        senderName = senderDoc.data().name || senderName;
      }
    } catch (error) {
      console.error('Error fetching sender name:', error);
    }

    // Notify recipient
    await notifyNewDirectMessage(
      recipientId,
      senderId,
      senderName,
      content,
      meepleup.id,
      meepleup.name
    );

    return {
      message,
      meepleup,
      conversation,
    };
  } catch (error) {
    console.error('Error sending direct message:', error);
    throw error;
  }
};

