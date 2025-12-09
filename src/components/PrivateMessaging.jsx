import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  getConversations,
  getOrCreateConversation,
  sendMessage,
  subscribeToMessages,
  markMessagesAsRead,
  getUnreadCount,
} from '../services/messaging';
import { formatDate } from '../utils/helpers';
import { db } from '../config/firebase';

const PrivateMessaging = ({ eventId, members }) => {
  const { user } = useAuth();
  const userId = user?.uid || user?.id;
  
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [memberData, setMemberData] = useState({});

  // Load member data
  useEffect(() => {
    if (!db || !members || members.length === 0) return;

    const loadMemberData = async () => {
      const memberMap = {};
      for (const member of members) {
        if (member.userId && member.userId !== userId) {
          try {
            const userDoc = await db.collection('users').doc(member.userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              memberMap[member.userId] = {
                id: member.userId,
                name: userData.name || userData.email || 'Unknown User',
                avatarUrl: userData.avatarUrl || null,
              };
            } else {
              // Fallback to member data from context
              memberMap[member.userId] = {
                id: member.userId,
                name: member.userName || 'Unknown User',
                avatarUrl: member.userAvatarUrl || null,
              };
            }
          } catch (error) {
            console.error('Error loading member data:', error);
            memberMap[member.userId] = {
              id: member.userId,
              name: member.userName || 'Unknown User',
              avatarUrl: member.userAvatarUrl || null,
            };
          }
        }
      }
      setMemberData(memberMap);
    };

    loadMemberData();
  }, [members, userId]);

  // Load conversations
  useEffect(() => {
    if (!eventId || !userId) return;

    const loadConversations = async () => {
      try {
        const convos = await getConversations(eventId, userId);
        setConversations(convos);
      } catch (error) {
        console.error('Error loading conversations:', error);
      }
    };

    loadConversations();

    // Refresh conversations periodically
    const interval = setInterval(loadConversations, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [eventId, userId]);

  // Load unread count
  useEffect(() => {
    if (!eventId || !userId) return;

    const loadUnread = async () => {
      const count = await getUnreadCount(eventId, userId);
      setUnreadCount(count);
    };

    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, [eventId, userId]);

  // Subscribe to messages when conversation is selected
  useEffect(() => {
    if (!selectedConversation || !eventId) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToMessages(eventId, selectedConversation.id, (msgs) => {
      setMessages(msgs);
      // Mark as read when viewing
      markMessagesAsRead(eventId, selectedConversation.id, userId);
    });

    // Mark as read when opening conversation
    markMessagesAsRead(eventId, selectedConversation.id, userId);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedConversation, eventId, userId]);

  const handleStartConversation = useCallback(async (otherUserId) => {
    if (!eventId || !userId || !otherUserId || userId === otherUserId) return;

    setLoading(true);
    try {
      const conversation = await getOrCreateConversation(eventId, userId, otherUserId);
      if (conversation) {
        setSelectedConversation({
          id: conversation.id,
          otherUser: memberData[otherUserId] || {
            id: otherUserId,
            name: 'Unknown User',
            avatarUrl: null,
          },
        });
        // Reload conversations to get updated list
        const convos = await getConversations(eventId, userId);
        setConversations(convos);
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
    } finally {
      setLoading(false);
    }
  }, [eventId, userId, memberData]);

  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || !selectedConversation || !eventId || !userId) return;

    const text = messageText.trim();
    setMessageText('');
    setLoading(true);

    try {
      await sendMessage(eventId, selectedConversation.id, userId, text);
      // Reload conversations to update last message
      const convos = await getConversations(eventId, userId);
      setConversations(convos);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessageText(text); // Restore text on error
    } finally {
      setLoading(false);
    }
  }, [messageText, selectedConversation, eventId, userId]);

  const otherMembers = useMemo(() => {
    if (!members || !userId) return [];
    return members
      .filter(m => m.userId && m.userId !== userId)
      .map(m => ({
        userId: m.userId,
        name: memberData[m.userId]?.name || m.userName || 'Unknown User',
        avatarUrl: memberData[m.userId]?.avatarUrl || m.userAvatarUrl || null,
      }));
  }, [members, userId, memberData]);

  // If no conversation selected, show conversation list
  if (!selectedConversation) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Private Messages</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.conversationItem}
              onPress={() => setSelectedConversation(item)}
            >
              <View style={styles.conversationContent}>
                <Text style={styles.conversationName}>
                  {item.otherUser?.name || 'Unknown User'}
                </Text>
                {item.lastMessage && (
                  <Text style={styles.conversationPreview} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                )}
                {item.lastMessageAt && (
                  <Text style={styles.conversationTime}>
                    {formatDate(item.lastMessageAt)}
                  </Text>
                )}
              </View>
              {item.unreadCount > 0 && (
                <View style={styles.conversationUnreadBadge}>
                  <Text style={styles.conversationUnreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No conversations yet</Text>
            </View>
          }
          ListHeaderComponent={
            otherMembers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Start a conversation</Text>
                {otherMembers.map((member) => {
                  const existingConvo = conversations.find(
                    c => c.otherUser?.id === member.userId
                  );
                  if (existingConvo) return null;

                  return (
                    <TouchableOpacity
                      key={member.userId}
                      style={styles.memberItem}
                      onPress={() => handleStartConversation(member.userId)}
                      disabled={loading}
                    >
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberAction}>Message</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          }
        />
      </View>
    );
  }

  // Show conversation view
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.conversationHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            setSelectedConversation(null);
            setMessages([]);
            // Reload conversations when going back
            getConversations(eventId, userId).then(setConversations);
          }}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.conversationHeaderTitle}>
          {selectedConversation.otherUser?.name || 'Unknown User'}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
          </View>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId === userId;
            return (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isOwn ? styles.messageTextOwn : styles.messageTextOther,
                  ]}
                >
                  {message.content}
                </Text>
                {message.createdAt && (
                  <Text
                    style={[
                      styles.messageTime,
                      isOwn ? styles.messageTimeOwn : styles.messageTimeOther,
                    ]}
                  >
                    {formatDate(message.createdAt)}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!messageText.trim() || loading) && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!messageText.trim() || loading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  unreadBadge: {
    backgroundColor: '#ff4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  conversationContent: {
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  conversationPreview: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  conversationTime: {
    fontSize: 12,
    color: '#999',
  },
  conversationUnreadBadge: {
    backgroundColor: '#ff4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  conversationUnreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginBottom: 8,
  },
  memberName: {
    fontSize: 16,
    color: '#333',
  },
  memberAction: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    minWidth: 60,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  conversationHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  messageBubbleOwn: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },
  messageBubbleOther: {
    backgroundColor: '#e0e0e0',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: '#fff',
  },
  messageTextOther: {
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  messageTimeOwn: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  messageTimeOther: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    marginRight: 8,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PrivateMessaging;

