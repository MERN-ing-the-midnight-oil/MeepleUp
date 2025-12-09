import { db } from '../config/firebase';
import firebase from '../config/firebase';

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

    const conversations = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const otherUserId = data.participants.find(id => id !== userId);
      
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
export const subscribeToMessages = (eventId, conversationId, callback) => {
  if (!db || !eventId || !conversationId) {
    return () => {};
  }

  const messagesRef = db
    .collection('gamingGroups')
    .doc(eventId)
    .collection('privateConversations')
    .doc(conversationId)
    .collection('messages')
    .orderBy('createdAt', 'asc');

  const unsubscribe = messagesRef.onSnapshot(
    (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        senderId: doc.data().senderId,
        content: doc.data().content,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt || null,
        read: doc.data().read || false,
      }));
      callback(messages);
    },
    (error) => {
      console.error('Error in messages listener:', error);
      callback([]);
    }
  );

  return unsubscribe;
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

