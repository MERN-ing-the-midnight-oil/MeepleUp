import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useEvents } from './EventsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import { getUnreadCount } from '../services/messaging';
import NotificationPopup from '../components/NotificationPopup';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { getUserEvents } = useEvents();
  const [notifications, setNotifications] = useState([]);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [loading, setLoading] = useState(false);
  const notificationQueueRef = useRef([]);
  const lastCheckedRef = useRef(null);
  const lastGameCountsRef = useRef({}); // Track game counts per user to detect additions

  const userId = user?.uid || user?.id;

  // Fetch unread notifications from Firestore
  const fetchNotifications = useCallback(async () => {
    if (!userId || !db || !isAuthenticated) return [];

    try {
      setLoading(true);
      // Fetch notifications - try with orderBy first, fallback if index doesn't exist
      let snapshot;
      let fetchedNotifications = [];
      
      try {
        const notificationsRef = db
          .collection('users')
          .doc(userId)
          .collection('notifications')
          .where('read', '==', false)
          .orderBy('createdAt', 'desc')
          .limit(20);
        snapshot = await notificationsRef.get();
      } catch (error) {
        // If orderBy fails (index missing), fetch without it and sort manually
        console.log('OrderBy index may not exist, fetching without orderBy:', error);
        const notificationsRef = db
          .collection('users')
          .doc(userId)
          .collection('notifications')
          .where('read', '==', false)
          .limit(50); // Get more to sort manually
        snapshot = await notificationsRef.get();
      }

      fetchedNotifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      }));

      // Sort by date (newest first) and limit to 20
      fetchedNotifications.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      fetchedNotifications = fetchedNotifications.slice(0, 20);

      setNotifications(fetchedNotifications);
      return fetchedNotifications;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId, isAuthenticated]);

  // Fetch unread DMs and convert to notifications
  const fetchUnreadDMs = useCallback(async () => {
    if (!userId || !db || !isAuthenticated) return [];

    try {
      const events = getUserEvents();
      const dmNotifications = [];

      for (const event of events) {
        try {
          const unreadCount = await getUnreadCount(event.id, userId);
          if (unreadCount > 0) {
            dmNotifications.push({
              id: `dm_${event.id}`,
              type: 'new_message',
              title: 'New Messages',
              message: `You have ${unreadCount} unread message${unreadCount > 1 ? 's' : ''} in ${event.name || 'this MeepleUp'}`,
              groupId: event.id,
              groupName: event.name,
              read: false,
              createdAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error(`Error fetching unread count for event ${event.id}:`, error);
        }
      }

      return dmNotifications;
    } catch (error) {
      console.error('Error fetching unread DMs:', error);
      return [];
    }
  }, [userId, isAuthenticated, getUserEvents]);

  // Check for new game additions in meepleups
  const checkGameAdditions = useCallback(async () => {
    if (!userId || !db || !isAuthenticated) return [];

    try {
      const events = getUserEvents();
      const gameNotifications = [];

      for (const event of events) {
        try {
          // Get all members of this meepleup
          const groupDoc = await db.collection('gamingGroups').doc(event.id).get();
          if (!groupDoc.exists) continue;

          const groupData = groupDoc.data();
          const memberIds = groupData.memberIds || [];

          // Check each member's game count
          for (const memberId of memberIds) {
            if (memberId === userId) continue; // Skip current user

            try {
              const gamesSnapshot = await db
                .collection('userGames')
                .doc(memberId)
                .collection('games')
                .get();

              const currentCount = gamesSnapshot.size;
              const lastCount = lastGameCountsRef.current[memberId] || 0;

              // If count increased, member added games
              if (currentCount > lastCount && lastCount > 0) {
                const addedCount = currentCount - lastCount;
                
                // Get member's name
                let memberName = 'A member';
                try {
                  const memberDoc = await db.collection('users').doc(memberId).get();
                  if (memberDoc.exists) {
                    memberName = memberDoc.data().name || memberName;
                  }
                } catch (error) {
                  console.error('Error fetching member name:', error);
                }

                gameNotifications.push({
                  id: `game_added_${memberId}_${event.id}_${Date.now()}`,
                  type: 'game_added',
                  title: 'New Games Added',
                  message: `${memberName} added ${addedCount} new game${addedCount > 1 ? 's' : ''} to their collection in ${event.name || 'this MeepleUp'}`,
                  groupId: event.id,
                  groupName: event.name,
                  fromUserId: memberId,
                  fromUserName: memberName,
                  read: false,
                  createdAt: new Date().toISOString(),
                });
              }

              // Update last known count
              lastGameCountsRef.current[memberId] = currentCount;
            } catch (error) {
              console.error(`Error checking games for member ${memberId}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error checking game additions for event ${event.id}:`, error);
        }
      }

      return gameNotifications;
    } catch (error) {
      console.error('Error checking game additions:', error);
      return [];
    }
  }, [userId, isAuthenticated, getUserEvents]);

  // Load all notifications on app open
  const loadNotifications = useCallback(async () => {
    if (!userId || !isAuthenticated) return;

    try {
      // Fetch Firestore notifications
      const firestoreNotifications = await fetchNotifications();
      const fetchedNotifications = firestoreNotifications || [];

      // Fetch unread DMs
      const dmNotifications = await fetchUnreadDMs();

      // Initialize game counts on first check
      if (!lastCheckedRef.current) {
        const events = getUserEvents();
        for (const event of events) {
          try {
            const groupDoc = await db.collection('gamingGroups').doc(event.id).get();
            if (groupDoc.exists) {
              const groupData = groupDoc.data();
              const memberIds = groupData.memberIds || [];
              
              for (const memberId of memberIds) {
                if (memberId === userId) continue;
                try {
                  const gamesSnapshot = await db
                    .collection('userGames')
                    .doc(memberId)
                    .collection('games')
                    .get();
                  lastGameCountsRef.current[memberId] = gamesSnapshot.size;
                } catch (error) {
                  // Ignore errors for individual members
                }
              }
            }
          } catch (error) {
            // Ignore errors for individual events
          }
        }
        lastCheckedRef.current = Date.now();
      }

      // Check for game additions (only if we've checked before)
      const gameNotifications = lastCheckedRef.current 
        ? await checkGameAdditions()
        : [];

      // Combine all notifications
      const allNotifications = [
        ...fetchedNotifications,
        ...dmNotifications,
        ...gameNotifications,
      ];

      // Sort by creation date (newest first)
      allNotifications.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      // Add to queue
      if (allNotifications.length > 0) {
        notificationQueueRef.current = allNotifications;
        showNextNotification();
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }, [userId, isAuthenticated, fetchNotifications, fetchUnreadDMs, checkGameAdditions, getUserEvents, showNextNotification]);

  // Show next notification from queue
  const showNextNotification = useCallback(() => {
    if (notificationQueueRef.current.length === 0) {
      setCurrentNotification(null);
      return;
    }

    const next = notificationQueueRef.current.shift();
    setCurrentNotification(next);
  }, []);

  // Handle notification close
  const handleCloseNotification = useCallback(async () => {
    if (!currentNotification) return;

    // Mark as read if it's a Firestore notification
    if (currentNotification.id && !currentNotification.id.startsWith('dm_') && !currentNotification.id.startsWith('game_added_')) {
      try {
        if (db && userId) {
          await db
            .collection('users')
            .doc(userId)
            .collection('notifications')
            .doc(currentNotification.id)
            .update({ read: true });
        }
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }

    setCurrentNotification(null);

    // Show next notification after a short delay
    setTimeout(() => {
      showNextNotification();
    }, 300);
  }, [currentNotification, userId, showNextNotification]);

  // Handle notification press (navigate to relevant screen)
  const handleNotificationPress = useCallback((notification) => {
    // This will be handled by the component that uses the context
    // For now, just close it
    handleCloseNotification();
  }, [handleCloseNotification]);

  // Load notifications when user logs in
  useEffect(() => {
    if (isAuthenticated && userId) {
      // Small delay to ensure other contexts are loaded
      const timer = setTimeout(() => {
        loadNotifications();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, userId, loadNotifications]);

  // Periodically check for new notifications
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    const interval = setInterval(() => {
      loadNotifications();
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [isAuthenticated, userId, loadNotifications]);

  const value = {
    notifications,
    currentNotification,
    loadNotifications,
    fetchNotifications,
    handleCloseNotification,
    handleNotificationPress,
    loading,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {currentNotification && (
        <NotificationPopup
          notification={currentNotification}
          onClose={handleCloseNotification}
          onPress={handleNotificationPress}
        />
      )}
    </NotificationContext.Provider>
  );
};

