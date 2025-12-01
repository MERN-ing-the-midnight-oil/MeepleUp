import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, KeyboardAvoidingView } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Share,
  Image,
  FlatList,
  Pressable,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { useCollections } from '../context/CollectionsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import GameCard from '../components/GameCard';
import GameDetailsModal from '../components/GameDetailsModal';
import { getGameById } from '../services/gameDatabase';
import { generateIcalEvent, downloadIcalFile, generateGoogleCalendarUrl } from '../utils/icalExport';
import { formatDate, formatTime } from '../utils/helpers';
import { Linking } from 'react-native';

// Platform-specific navigation hooks
let useNavigationHook;
let useRouteHook;
let useParamsHook;

if (Platform.OS === 'web') {
  try {
    const { useNavigate, useParams } = require('react-router-dom');
    useNavigationHook = () => ({ goBack: () => window.history.back() });
    useRouteHook = () => ({ params: {} });
    useParamsHook = useParams;
  } catch (e) {
    useNavigationHook = () => ({ goBack: () => {} });
    useRouteHook = () => ({ params: {} });
    useParamsHook = () => ({ eventId: null });
  }
} else {
  const { useNavigation, useRoute } = require('@react-navigation/native');
  useNavigationHook = useNavigation;
  useRouteHook = useRoute;
  useParamsHook = () => null;
}

const TABS = {
  SCHEDULE: 'schedule',
  GAMES: 'games',
  DISCUSSION: 'discussion',
  MEMBERS: 'members',
};

const EventHub = () => {
  const navigation = useNavigationHook();
  const route = useRouteHook();
  const params = useParamsHook();
  const { eventId } = params?.eventId ? params : (route?.params || {});

  const {
    getEventById,
    getMembershipStatus,
    membershipStatus,
    regenerateJoinCode,
    updateContactRequest,
    contactStatus,
    leaveEvent,
    archiveEvent,
    updateMemberRSVP,
    updateEventSchedule,
    updateEvent,
  } = useEvents();
  const { user } = useAuth();
  const { getUserCollection, getEventCollection, syncGamesForUsers, collections } = useCollections();

  const [activeTab, setActiveTab] = useState(TABS.SCHEDULE);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    scheduledFor: '',
    generalLocation: '',
    exactLocation: '',
  });
  const [memberNames, setMemberNames] = useState({});
  const [memberRSVPs, setMemberRSVPs] = useState({});
  const [memberAvatars, setMemberAvatars] = useState({});
  const [pinnedNotes, setPinnedNotes] = useState('');
  const [showEditPinnedNotes, setShowEditPinnedNotes] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [commentsByPost, setCommentsByPost] = useState({}); // { postId: [comments] }
  const [replyingTo, setReplyingTo] = useState(null); // { type: 'post' | 'comment', id: string, postId: string }
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState(null); // { type: 'post' | 'comment', id: string, postId: string, content: string }
  const [editText, setEditText] = useState('');
  // GamesTab state
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedGameBggData, setSelectedGameBggData] = useState(null);
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [showPlanningGamesModal, setShowPlanningGamesModal] = useState(false);
  const [selectedGamesForBringing, setSelectedGamesForBringing] = useState(new Set());
  const [planningGamesSearchQuery, setPlanningGamesSearchQuery] = useState('');
  const [gameInterests, setGameInterests] = useState({}); // { gameId: { userId: 'bringing' } }
  const [showSelectedGamesList, setShowSelectedGamesList] = useState(true);

  const event = getEventById(eventId);
  const userId = user?.uid || user?.id || null;

  const memberStatus = event && userId
    ? getMembershipStatus(event.id, userId)
    : membershipStatus.STRANGER;
  const isMember = memberStatus === membershipStatus.MEMBER;
  const isOrganizer = event?.organizerId && event.organizerId === userId;

  const members = useMemo(
    () => (event?.members || []).filter((member) => member.status === membershipStatus.MEMBER),
    [event, membershipStatus],
  );

  // Stable key representing the member IDs for this event.
  // Used to avoid infinite effect loops caused by changing array references.
  const memberIdsKey = useMemo(() => {
    if (!members.length) return '';
    const ids = members
      .map((m) => m.userId)
      .filter(Boolean)
      .sort();
    return ids.join(',');
  }, [members]);

  // Initialize schedule form when event loads
  useEffect(() => {
    if (event) {
      setScheduleForm({
        scheduledFor: event.scheduledFor || '',
        generalLocation: event.generalLocation || '',
        exactLocation: event.exactLocation || '',
      });
      setPinnedNotes(event.description || '');
    }
  }, [event]);

  // GamesTab-specific logic removed - will be rebuilt

  // Fetch member names, RSVP data, and avatars from Firestore
  useEffect(() => {
    if (!members.length || !db || !event?.id) return;

    const fetchMemberData = async () => {
      const names = {};
      const rsvps = {};
      const avatars = {};
      
      for (const member of members) {
        if (!member.userId || names[member.userId]) continue;
        
        // First check if this is the current user - use Auth context data
        if (user && member.userId === (user.uid || user.id)) {
          names[member.userId] = user.name || user.email || member.userId;
          avatars[member.userId] = user.photoURL || user.avatarUrl || null;
          // Still fetch RSVP from Firestore for current user
          try {
            if (event.id) {
              const memberDoc = await db.collection('gamingGroups').doc(event.id)
                .collection('members').doc(member.userId).get();
              
              if (memberDoc.exists) {
                const memberData = memberDoc.data();
                if (memberData.rsvpStatus) {
                  rsvps[member.userId] = memberData.rsvpStatus;
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching RSVP for current user:`, error);
          }
          continue;
        }
        
        try {
          // Get from members subcollection (has denormalized userName and rsvpStatus)
          if (event.id) {
            const memberDoc = await db.collection('gamingGroups').doc(event.id)
              .collection('members').doc(member.userId).get();
            
            if (memberDoc.exists) {
              const memberData = memberDoc.data();
              if (memberData.userName) {
                names[member.userId] = memberData.userName;
              }
              if (memberData.rsvpStatus) {
                rsvps[member.userId] = memberData.rsvpStatus;
              }
              if (memberData.userAvatarUrl) {
                avatars[member.userId] = memberData.userAvatarUrl;
              }
              continue;
            }
          }
          
          // Fallback to users collection
          const userDoc = await db.collection('users').doc(member.userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            names[member.userId] = userData.name || userData.email || member.userId;
            avatars[member.userId] = userData.avatarUrl || null;
          } else {
            names[member.userId] = member.userId;
            avatars[member.userId] = null;
          }
        } catch (error) {
          console.error(`Error fetching data for user ${member.userId}:`, error);
          names[member.userId] = member.userId;
          avatars[member.userId] = null;
        }
      }
      
      console.log('[EventHub] fetchMemberData complete', {
        namesCount: Object.keys(names).length,
        rsvpsCount: Object.keys(rsvps).length,
        avatarsCount: Object.keys(avatars).length,
        userIds: Object.keys(names),
      });
      setMemberNames(names);
      setMemberRSVPs(prev => {
        const updated = { ...prev, ...rsvps };
        console.log('[EventHub] memberRSVPs updated, total count:', Object.keys(updated).length);
        return updated;
      });
      setMemberAvatars(avatars);
    };

    fetchMemberData();
  }, [members, event?.id, user]);

  // Fetch current user's RSVP from Firestore
  useEffect(() => {
    if (!userId || !event?.id || !db) return;

    const fetchCurrentUserRSVP = async () => {
      try {
        const memberDoc = await db.collection('gamingGroups').doc(event.id)
          .collection('members').doc(userId).get();
        
        if (memberDoc.exists) {
          const memberData = memberDoc.data();
          if (memberData.rsvpStatus) {
            setMemberRSVPs(prev => ({
              ...prev,
              [userId]: memberData.rsvpStatus,
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching current user RSVP:', error);
      }
    };

    fetchCurrentUserRSVP();
  }, [userId, event?.id]);

  if (!event) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>MeepleUp Hub</Text>
          <Text style={styles.subtitle}>
            We couldn&apos;t find that MeepleUp. It may have been removed or you might not have
            permission to view it yet.
          </Text>
          <Button
            label="Go back"
            onPress={() => navigation.goBack()}
            style={styles.primaryAction}
          />
        </View>
      </ScrollView>
    );
  }

  const handleRSVP = async (status) => {
    if (!userId || !isMember) {
      Alert.alert('Error', 'You must be a member to RSVP.');
      return;
    }

    try {
      await updateMemberRSVP(event.id, userId, status);
      setMemberRSVPs(prev => ({
        ...prev,
        [userId]: status,
      }));
    } catch (error) {
      Alert.alert('Error', 'Failed to update RSVP. Please try again.');
      console.error(error);
    }
  };

  const handleEditSchedule = async () => {
    if (!isOrganizer) {
      Alert.alert('Error', 'Only the organizer can edit the schedule.');
      return;
    }

    try {
      await updateEventSchedule(event.id, userId, scheduleForm);
      setShowEditSchedule(false);
      Alert.alert('Success', 'Schedule updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update schedule. Please try again.');
      console.error(error);
    }
  };

  const handleShareInvite = async () => {
    try {
      const shareMessage = `Join my MeepleUp "${event.name}"!\n\nJoin code: ${event.joinCode}`;
      await Share.share({
        message: shareMessage,
        title: `Join ${event.name} on MeepleUp`,
      });
    } catch (error) {
      console.error('Error sharing invite:', error);
    }
  };

  const handleRegenerateJoinCode = () => {
    if (regenerateBusy) {
      return;
    }

    Alert.alert(
      'Create a fresh invite code?',
      'Anyone with the old code will no longer be able to join once you refresh it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate new code',
          style: 'destructive',
          onPress: async () => {
            try {
              setRegenerateBusy(true);
              const newCode = regenerateJoinCode(event.id);
              Alert.alert(
                'New code ready',
                `Your new join code is: ${newCode}`,
              );
            } catch (error) {
              Alert.alert('Could not refresh', 'Please try again in a moment.');
              console.error(error);
            } finally {
              setRegenerateBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleArchiveEvent = () => {
    if (!userId || !isOrganizer) {
      Alert.alert('Error', 'Only the organizer can archive a MeepleUp.');
      return;
    }

    Alert.alert(
      'Archive MeepleUp?',
      `Are you sure you want to archive "${event.name}"? This will hide it from all members. You can restore it later from your archived MeepleUps.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive MeepleUp',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveEvent(event.id, userId);
              Alert.alert('MeepleUp Archived', 'The MeepleUp has been archived. You can restore it from your archived MeepleUps section.', [
                {
                  text: 'OK',
                  onPress: () => navigation.goBack(),
                },
              ]);
            } catch (error) {
              const errorMessage = error.message || 'Failed to archive MeepleUp. Please try again.';
              Alert.alert('Error', errorMessage);
              console.error(error);
            }
          },
        },
      ],
    );
  };

  const handleExportToCalendar = async () => {
    if (!event) {
      Alert.alert('Error', 'Event not found.');
      return;
    }

    if (Platform.OS !== 'web') {
      const googleCalendarUrl = generateGoogleCalendarUrl(event);
      
      Alert.alert(
        'Add to Calendar',
        'How would you like to add this event?',
        [
          {
            text: 'Open in Google Calendar',
            onPress: async () => {
              try {
                const supported = await Linking.canOpenURL(googleCalendarUrl);
                if (supported) {
                  await Linking.openURL(googleCalendarUrl);
                } else {
                  Alert.alert('Error', 'Unable to open Google Calendar. Please make sure the Google Calendar app is installed.');
                }
              } catch (error) {
                console.error('Error opening Google Calendar:', error);
                Alert.alert('Error', 'Unable to open Google Calendar.');
              }
            },
          },
          {
            text: 'Share .ics File',
            onPress: async () => {
              await handleShareIcsFile();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    try {
      const icalContent = generateIcalEvent(event);
      const safeName = (event.name || 'MeepleUp').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeName}.ics`;
      downloadIcalFile(icalContent, filename);
      Alert.alert('Exported!', `"${event.name}" has been exported. The .ics file should download automatically.`);
    } catch (error) {
      console.error('Error exporting to calendar:', error);
      Alert.alert('Error', 'Failed to export event to calendar. Please try again.');
    }
  };

  const handleShareIcsFile = async () => {
    if (!event) return;

    try {
      const icalContent = generateIcalEvent(event);
      const safeName = (event.name || 'MeepleUp').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeName}.ics`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, icalContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/calendar',
          dialogTitle: `Export ${event.name} to Calendar`,
        });
      }
    } catch (error) {
      console.error('Error sharing ICS file:', error);
      Alert.alert('Error', 'Failed to share calendar file. Please try again.');
    }
  };

  const getRSVPStatusLabel = (status) => {
    switch (status) {
      case 'going':
        return 'Going';
      case 'maybe':
        return 'Maybe';
      case 'not-going':
        return "Can't Make It";
      default:
        return 'Not Responded';
    }
  };

  const getRSVPCounts = () => {
    const counts = { going: 0, maybe: 0, 'not-going': 0, none: 0 };
    members.forEach((member) => {
      const status = memberRSVPs[member.userId] || null;
      if (status) {
        counts[status] = (counts[status] || 0) + 1;
      } else {
        counts.none += 1;
      }
    });
    return counts;
  };

  const rsvpCounts = getRSVPCounts();
  const currentUserRSVP = memberRSVPs[userId] || null;

  // Schedule Tab Component
  const ScheduleTab = () => {
    if (!event) {
      return (
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
          <View style={styles.section}>
            <Text>Loading event...</Text>
          </View>
        </ScrollView>
      );
    }
    
    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Event Details</Text>
          {event.scheduledFor && (
            <Button
              label="Export to Calendar"
              onPress={handleExportToCalendar}
              variant="outline"
              style={styles.exportButton}
            />
          )}
        </View>
        
        <View style={styles.scheduleInfo}>
          <Text style={styles.scheduleLabel}>Date & Time</Text>
          <Text style={styles.scheduleValue}>
            {event.scheduledFor
              ? `${formatDate(event.scheduledFor)} at ${formatTime(event.scheduledFor)}`
              : 'Date and time to be announced'}
          </Text>
        </View>

        <View style={styles.scheduleInfo}>
          <Text style={styles.scheduleLabel}>Location</Text>
          <Text style={styles.scheduleValue}>
            {event.generalLocation || 'Organizer will confirm'}
          </Text>
          {isMember && event.exactLocation && (
            <Text style={[styles.scheduleValue, styles.highlight]}>
              Exact location: {event.exactLocation}
            </Text>
          )}
        </View>

        {isOrganizer && (
          <Button
            label="Edit Schedule"
            onPress={() => setShowEditSchedule(true)}
            variant="outline"
            style={styles.editButton}
          />
        )}
      </View>

      {/* Invite Guests Section - Combined with Event Details */}
      {isOrganizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite Guests</Text>
          <View style={styles.inviteBlock}>
            <Text style={styles.inviteLabel}>Current join code</Text>
            <Text style={styles.inviteCode}>{event.joinCode}</Text>
            <Button
              label="Share invite code"
              onPress={handleShareInvite}
              style={styles.primaryAction}
            />
            <Button
              label={regenerateBusy ? 'Refreshing...' : 'Refresh invite code'}
              onPress={handleRegenerateJoinCode}
              style={styles.primaryAction}
              disabled={regenerateBusy}
              variant="outline"
            />
          </View>
        </View>
      )}

      {/* Archive Section - Combined with Event Details */}
      {isOrganizer && (
        <View style={styles.section}>
          <Button
            label="Archive MeepleUp"
            onPress={handleArchiveEvent}
            variant="outline"
            style={styles.dangerAction}
          />
          <Text style={styles.sectionHint}>
            Archiving will hide this MeepleUp from all members. You can restore it later from your archived MeepleUps.
          </Text>
        </View>
      )}

      {isMember && !isOrganizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RSVP</Text>
          <Text style={styles.sectionCopy}>
            Your RSVP: <Text style={styles.bold}>{getRSVPStatusLabel(currentUserRSVP)}</Text>
          </Text>
          
          <View style={styles.rsvpButtons}>
            <Button
              label="Going"
              onPress={() => handleRSVP('going')}
              variant={currentUserRSVP === 'going' ? 'primary' : 'outline'}
              style={styles.rsvpButton}
            />
            <Button
              label="Maybe"
              onPress={() => handleRSVP('maybe')}
              variant={currentUserRSVP === 'maybe' ? 'primary' : 'outline'}
              style={styles.rsvpButton}
            />
            <Button
              label="Can't Make It"
              onPress={() => handleRSVP('not-going')}
              variant={currentUserRSVP === 'not-going' ? 'primary' : 'outline'}
              style={styles.rsvpButton}
            />
          </View>

          <View style={styles.rsvpSummary}>
            <Text style={styles.rsvpSummaryTitle}>RSVP Summary</Text>
            <Text style={styles.rsvpSummaryItem}>
              Going: {rsvpCounts.going}
            </Text>
            <Text style={styles.rsvpSummaryItem}>
              Maybe: {rsvpCounts.maybe}
            </Text>
            <Text style={styles.rsvpSummaryItem}>
              Can't Make It: {rsvpCounts['not-going']}
            </Text>
            {rsvpCounts.none > 0 && (
              <Text style={styles.rsvpSummaryItem}>
                Not Responded: {rsvpCounts.none}
              </Text>
            )}
          </View>
        </View>
      )}


      </ScrollView>
    );
  };

  // Fetch discussion posts from Firestore with real-time listener
  useEffect(() => {
    if (!event?.id || !db || !isMember) {
      // Clear messages if user is not a member
      setDiscussionMessages([]);
      return;
    }

    console.log('[EventHub] Setting up real-time listener for discussion posts, eventId:', event.id, 'isMember:', isMember);

    // Set up real-time listener for posts
    const postsRef = db.collection('gamingGroups').doc(event.id)
      .collection('posts')
      .limit(100); // Get more than we need, then filter

    const unsubscribe = postsRef.onSnapshot(
      (snapshot) => {
        console.log('[EventHub] Discussion posts snapshot received, docs:', snapshot.docs.length);
        
        const posts = [];
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          // Filter out deleted posts
          if (data.deleted === true) continue;
          
          posts.push({
            id: doc.id,
            userId: data.userId,
            userName: data.userName || 'Unknown',
            content: data.content,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
            edited: data.edited || false,
            pinned: data.pinned || false,
          });
        }
        
        // Sort manually: pinned first, then by date (newest first)
        posts.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        // Limit to 50 most recent after sorting
        console.log('[EventHub] Setting discussion messages, count:', posts.slice(0, 50).length);
        setDiscussionMessages(posts.slice(0, 50));
      },
      (error) => {
        console.error('[EventHub] Error in discussion posts listener:', error);
        // If query fails, just show empty state
        setDiscussionMessages([]);
      }
    );

    // Cleanup listener on unmount or when dependencies change
    return () => {
      console.log('[EventHub] Cleaning up discussion posts listener');
      unsubscribe();
    };
  }, [event?.id, isMember, db]);

  // Fetch comments for all posts with real-time listeners
  useEffect(() => {
    if (!event?.id || !db || !isMember || discussionMessages.length === 0) {
      setCommentsByPost({});
      return;
    }

    console.log('[EventHub] Setting up comment listeners for', discussionMessages.length, 'posts');

    const unsubscribes = [];

    // Set up listeners for each post
    discussionMessages.forEach((post) => {
      const commentsRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(post.id)
        .collection('comments')
        .limit(500); // Get enough for deep nesting

      const unsubscribe = commentsRef.onSnapshot(
        (snapshot) => {
          console.log(`[EventHub] Comments snapshot for post ${post.id}, docs:`, snapshot.docs.length);
          
          const comments = [];
          
          for (const doc of snapshot.docs) {
            const data = doc.data();
            // Filter out deleted comments
            if (data.deleted === true) continue;
            
            comments.push({
              id: doc.id,
              postId: post.id,
              parentCommentId: data.parentCommentId || null, // null for top-level, commentId for nested
              userId: data.userId,
              userName: data.userName || 'Unknown',
              content: data.content,
              createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null,
              edited: data.edited || false,
            });
          }
          
          // Sort by creation time
          comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          
          setCommentsByPost(prev => ({
            ...prev,
            [post.id]: comments,
          }));
        },
        (error) => {
          console.error(`[EventHub] Error in comments listener for post ${post.id}:`, error);
        }
      );

      unsubscribes.push(unsubscribe);
    });

    // Cleanup all listeners
    return () => {
      console.log('[EventHub] Cleaning up comment listeners');
      unsubscribes.forEach(unsub => unsub());
    };
  }, [event?.id, isMember, db, discussionMessages]);

  // Build comment tree structure (parent -> children)
  const buildCommentTree = useCallback((comments) => {
    if (!comments || comments.length === 0) return [];
    
    // Create a map of commentId -> comment
    const commentMap = new Map();
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, children: [] });
    });
    
    // Build tree structure
    const rootComments = [];
    commentMap.forEach((comment) => {
      if (comment.parentCommentId) {
        // This is a nested comment
        const parent = commentMap.get(comment.parentCommentId);
        if (parent) {
          parent.children.push(comment);
        } else {
          // Parent not found (might be deleted), treat as root
          rootComments.push(comment);
        }
      } else {
        // This is a top-level comment
        rootComments.push(comment);
      }
    });
    
    // Sort root comments by date
    rootComments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    return rootComments;
  }, []);

  // Handler for posting comments/replies
  const handlePostComment = useCallback(async () => {
    if (!replyText.trim() || !userId || !event?.id || !db || !replyingTo) {
      return;
    }

    try {
      const { type, id, postId } = replyingTo;
      
      const commentsRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId)
        .collection('comments');
      
      const commentData = {
        postId,
        parentCommentId: type === 'comment' ? id : null, // null for post replies, commentId for comment replies
        userId,
        userName: user?.name || user?.email || 'Unknown',
        content: replyText.trim(),
        createdAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
        edited: false,
        deleted: false,
      };

      await commentsRef.add(commentData);
      
      // Update post comment count
      const postRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId);
      await postRef.update({
        commentCount: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      
      setReplyText('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Error posting comment:', error);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    }
  }, [replyText, userId, event?.id, db, replyingTo, user?.name, user?.email]);

  // Handler for posting messages - memoized to prevent recreation
  const handlePostMessage = useCallback(async () => {
    if (!newMessage.trim() || !userId || !event?.id || !db) {
      return;
    }

    try {
      const postsRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts');
      
      const postData = {
        userId,
        userName: user?.name || user?.email || 'Unknown',
        content: newMessage.trim(),
        likeCount: 0,
        commentCount: 0,
        createdAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
        edited: false,
        deleted: false,
        pinned: false,
      };

      const docRef = await postsRef.add(postData);
      
      // Add to local state
      setDiscussionMessages(prev => [{
        id: docRef.id,
        userId,
        userName: user?.name || user?.email || 'Unknown',
        content: newMessage.trim(),
        createdAt: new Date().toISOString(),
        pinned: false,
      }, ...prev]);
      
      setNewMessage('');
    } catch (error) {
      console.error('Error posting message:', error);
      Alert.alert('Error', 'Failed to post message. Please try again.');
    }
  }, [newMessage, userId, event?.id, db, user?.name, user?.email]);

  // Handler for editing posts
  const handleEditPost = useCallback(async (postId, newContent) => {
    if (!newContent.trim() || !userId || !event?.id || !db) {
      return;
    }

    try {
      const postRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId);
      
      await postRef.update({
        content: newContent.trim(),
        edited: true,
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      
      // Update local state
      setDiscussionMessages(prev => prev.map(msg => 
        msg.id === postId 
          ? { ...msg, content: newContent.trim(), edited: true, updatedAt: new Date().toISOString() }
          : msg
      ));
      
      setEditing(null);
      setEditText('');
    } catch (error) {
      console.error('Error editing post:', error);
      Alert.alert('Error', 'Failed to edit post. Please try again.');
    }
  }, [userId, event?.id, db]);

  // Handler for deleting posts
  const handleDeletePost = useCallback(async (postId) => {
    if (!userId || !event?.id || !db) {
      return;
    }

    Alert.alert(
      'Delete Post?',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const postRef = db.collection('gamingGroups').doc(event.id)
                .collection('posts').doc(postId);
              
              await postRef.update({
                deleted: true,
                updatedAt: firebase.firestore.Timestamp.now(),
              });
              
              // Update local state - filter out deleted post
              setDiscussionMessages(prev => prev.filter(msg => msg.id !== postId));
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert('Error', 'Failed to delete post. Please try again.');
            }
          },
        },
      ]
    );
  }, [userId, event?.id, db]);

  // Handler for editing comments
  const handleEditComment = useCallback(async (postId, commentId, newContent) => {
    if (!newContent.trim() || !userId || !event?.id || !db) {
      return;
    }

    try {
      const commentRef = db.collection('gamingGroups').doc(event.id)
        .collection('posts').doc(postId)
        .collection('comments').doc(commentId);
      
      await commentRef.update({
        content: newContent.trim(),
        edited: true,
        updatedAt: firebase.firestore.Timestamp.now(),
      });
      
      // Update local state
      setCommentsByPost(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).map(comment =>
          comment.id === commentId
            ? { ...comment, content: newContent.trim(), edited: true, updatedAt: new Date().toISOString() }
            : comment
        ),
      }));
      
      setEditing(null);
      setEditText('');
    } catch (error) {
      console.error('Error editing comment:', error);
      Alert.alert('Error', 'Failed to edit comment. Please try again.');
    }
  }, [userId, event?.id, db]);

  // Handler for deleting comments
  const handleDeleteComment = useCallback(async (postId, commentId) => {
    if (!userId || !event?.id || !db) {
      return;
    }

    Alert.alert(
      'Delete Comment?',
      'Are you sure you want to delete this comment? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const commentRef = db.collection('gamingGroups').doc(event.id)
                .collection('posts').doc(postId)
                .collection('comments').doc(commentId);
              
              await commentRef.update({
                deleted: true,
                updatedAt: firebase.firestore.Timestamp.now(),
              });
              
              // Update local state - filter out deleted comment
              setCommentsByPost(prev => ({
                ...prev,
                [postId]: (prev[postId] || []).filter(comment => comment.id !== commentId),
              }));
              
              // Update post comment count
              const postRef = db.collection('gamingGroups').doc(event.id)
                .collection('posts').doc(postId);
              await postRef.update({
                commentCount: firebase.firestore.FieldValue.increment(-1),
                updatedAt: firebase.firestore.Timestamp.now(),
              });
            } catch (error) {
              console.error('Error deleting comment:', error);
              Alert.alert('Error', 'Failed to delete comment. Please try again.');
            }
          },
        },
      ]
    );
  }, [userId, event?.id, db]);

  // Reply Input Component - separate to prevent re-render issues
  const ReplyInput = React.memo(({ replyingTo, replyText, setReplyText, onCancel, onSubmit, postComments }) => {
    const inputRef = useRef(null);
    
    useEffect(() => {
      if (replyingTo && inputRef.current) {
        const timer = setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [replyingTo]);
    
    if (!replyingTo) return null;
    
    return (
      <View style={styles.replyInputContainer}>
        <Text style={styles.replyingToLabel}>
          {replyingTo.type === 'comment' 
            ? `Replying to ${postComments?.find(c => c.id === replyingTo.id)?.userName || 'comment'}`
            : 'Replying to post'}
        </Text>
        <Input
          ref={inputRef}
          value={replyText}
          onChangeText={setReplyText}
          placeholder="Write a reply..."
          multiline
          style={styles.replyInputField}
        />
        <View style={styles.replyActions}>
          <Button
            label="Cancel"
            onPress={onCancel}
            variant="outline"
            style={styles.replyCancelButton}
          />
          <Button
            label="Post Reply"
            onPress={onSubmit}
            disabled={!replyText.trim()}
            style={styles.replyPostButton}
          />
        </View>
      </View>
    );
  });

  // Recursive Comment Thread Component
  const CommentThread = useCallback(({ comment, depth = 0, postId, maxDepth = 10, commentsByPost }) => {
    const isNested = depth > 0;
    const canNest = depth < maxDepth;
    const isReplyingToThis = replyingTo && replyingTo.type === 'comment' && replyingTo.id === comment.id;
    const isEditingThis = editing && editing.type === 'comment' && editing.id === comment.id;
    const isOwner = comment.userId === userId;
    const postComments = commentsByPost || [];
    
    return (
      <View key={comment.id} style={[styles.commentContainer, isNested && styles.nestedComment]}>
        <View style={[styles.commentCard, { marginLeft: depth * 16 }]}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentAuthor}>{comment.userName}</Text>
            <Text style={styles.commentTime}>
              {formatDate(comment.createdAt)}
              {comment.edited && comment.updatedAt && (
                <Text style={styles.editedLabel}> • edited {formatDate(comment.updatedAt)}</Text>
              )}
            </Text>
          </View>
          
          {isEditingThis ? (
            <View style={styles.editContainer}>
              <Input
                value={editText}
                onChangeText={setEditText}
                placeholder="Edit your comment..."
                multiline
                style={styles.editInputField}
              />
              <View style={styles.editActions}>
                <Button
                  label="Cancel"
                  onPress={() => {
                    setEditing(null);
                    setEditText('');
                  }}
                  variant="outline"
                  style={styles.editCancelButton}
                />
                <Button
                  label="Save"
                  onPress={() => handleEditComment(postId, comment.id, editText)}
                  disabled={!editText.trim()}
                  style={styles.editSaveButton}
                />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.commentContent}>{comment.content}</Text>
              <View style={styles.commentActions}>
                {isMember && canNest && (
                  <TouchableOpacity
                    style={styles.replyButton}
                    onPress={() => setReplyingTo({ type: 'comment', id: comment.id, postId })}
                  >
                    <Text style={styles.replyButtonText}>Reply</Text>
                  </TouchableOpacity>
                )}
                {isOwner && (
                  <>
                    <TouchableOpacity
                      style={styles.editDeleteButton}
                      onPress={() => {
                        setEditing({ type: 'comment', id: comment.id, postId, content: comment.content });
                        setEditText(comment.content);
                      }}
                    >
                      <Text style={styles.editDeleteButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editDeleteButton}
                      onPress={() => handleDeleteComment(postId, comment.id)}
                    >
                      <Text style={[styles.editDeleteButtonText, styles.deleteButtonText]}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
        
        {/* Reply Input for this comment */}
        {isReplyingToThis && (
          <View style={{ marginLeft: (depth + 1) * 16 }}>
            <ReplyInput
              replyingTo={replyingTo}
              replyText={replyText}
              setReplyText={setReplyText}
              onCancel={() => {
                setReplyingTo(null);
                setReplyText('');
              }}
              onSubmit={handlePostComment}
              postComments={commentsByPost}
            />
          </View>
        )}
        
        {/* Render nested comments */}
        {comment.children && comment.children.length > 0 && (
          <View style={styles.commentChildren}>
            {comment.children.map((child) => (
              <CommentThread
                key={child.id}
                comment={child}
                depth={depth + 1}
                postId={postId}
                maxDepth={maxDepth}
                commentsByPost={postComments}
              />
            ))}
          </View>
        )}
      </View>
    );
  }, [isMember, userId, setReplyingTo, replyingTo, replyText, setReplyText, handlePostComment, editing, editText, setEditText, setEditing, handleEditComment, handleDeleteComment]);

  // Discussion Tab Component - memoized to prevent re-creation on every render
  const DiscussionTab = useMemo(() => {
    // Separate pinned and regular messages
    const pinnedMessages = discussionMessages.filter(m => m.pinned);
    const regularMessages = discussionMessages.filter(m => !m.pinned);

    return (
      <ScrollView 
        style={styles.tabContent}
        contentContainerStyle={styles.discussionScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pinned Notes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pinned Notes</Text>
            {isOrganizer && (
              <TouchableOpacity
                onPress={() => setShowEditPinnedNotes(true)}
                style={styles.editLink}
              >
                <Text style={styles.editLinkText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionCopy}>
            {pinnedNotes || (isOrganizer ? 'Add notes about parking, what to bring, house rules, etc.' : 'No pinned notes yet.')}
          </Text>
        </View>

        {/* Pinned Messages */}
        {pinnedMessages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📌 Pinned Messages</Text>
            {pinnedMessages.map((message) => {
              const postComments = commentsByPost[message.id] || [];
              const commentTree = buildCommentTree(postComments);
              
              return (
                <View key={message.id} style={styles.postContainer}>
                  <View style={[styles.messageCard, styles.pinnedMessageCard]}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.messageAuthor}>{message.userName}</Text>
                      <Text style={styles.messageTime}>
                        {formatDate(message.createdAt)}
                        {message.edited && message.updatedAt && (
                          <Text style={styles.editedLabel}> • edited {formatDate(message.updatedAt)}</Text>
                        )}
                      </Text>
                    </View>
                    
                    {editing && editing.type === 'post' && editing.id === message.id ? (
                      <View style={styles.editContainer}>
                        <Input
                          value={editText}
                          onChangeText={setEditText}
                          placeholder="Edit your post..."
                          multiline
                          style={styles.editInputField}
                        />
                        <View style={styles.editActions}>
                          <Button
                            label="Cancel"
                            onPress={() => {
                              setEditing(null);
                              setEditText('');
                            }}
                            variant="outline"
                            style={styles.editCancelButton}
                          />
                          <Button
                            label="Save"
                            onPress={() => handleEditPost(message.id, editText)}
                            disabled={!editText.trim()}
                            style={styles.editSaveButton}
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.messageContent}>{message.content}</Text>
                        <View style={styles.postActions}>
                          {isMember && (
                            <TouchableOpacity
                              style={styles.replyButton}
                              onPress={() => {
                                setReplyingTo({ type: 'post', id: message.id, postId: message.id });
                              }}
                            >
                              <Text style={styles.replyButtonText}>
                                {postComments.length > 0 ? `${postComments.length} comment${postComments.length !== 1 ? 's' : ''} • Reply` : 'Reply'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {message.userId === userId && (
                            <>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => {
                                  setEditing({ type: 'post', id: message.id, postId: message.id, content: message.content });
                                  setEditText(message.content);
                                }}
                              >
                                <Text style={styles.editDeleteButtonText}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => handleDeletePost(message.id)}
                              >
                                <Text style={[styles.editDeleteButtonText, styles.deleteButtonText]}>Delete</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                  
                  {/* Comment Thread */}
                  {commentTree.length > 0 && (
                    <View style={styles.commentsSection}>
                      {commentTree.map((comment) => (
                        <CommentThread
                          key={comment.id}
                          comment={comment}
                          depth={0}
                          postId={message.id}
                          maxDepth={10}
                          commentsByPost={postComments}
                        />
                      ))}
                    </View>
                  )}
                  
                  {/* Reply Input for this post */}
                  {replyingTo && replyingTo.postId === message.id && replyingTo.type === 'post' && (
                    <ReplyInput
                      replyingTo={replyingTo}
                      replyText={replyText}
                      setReplyText={setReplyText}
                      onCancel={() => {
                        setReplyingTo(null);
                        setReplyText('');
                      }}
                      onSubmit={handlePostComment}
                      postComments={postComments}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Discussion Messages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discussion</Text>
          {regularMessages.length === 0 && pinnedMessages.length === 0 ? (
            <Text style={styles.sectionCopy}>
              No messages yet. Start the conversation!
            </Text>
          ) : (
            regularMessages.map((message) => {
              const postComments = commentsByPost[message.id] || [];
              const commentTree = buildCommentTree(postComments);
              
              return (
                <View key={message.id} style={styles.postContainer}>
                  <View style={styles.messageCard}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.messageAuthor}>{message.userName}</Text>
                      <Text style={styles.messageTime}>
                        {formatDate(message.createdAt)}
                        {message.edited && message.updatedAt && (
                          <Text style={styles.editedLabel}> • edited {formatDate(message.updatedAt)}</Text>
                        )}
                      </Text>
                    </View>
                    
                    {editing && editing.type === 'post' && editing.id === message.id ? (
                      <View style={styles.editContainer}>
                        <Input
                          value={editText}
                          onChangeText={setEditText}
                          placeholder="Edit your post..."
                          multiline
                          style={styles.editInputField}
                        />
                        <View style={styles.editActions}>
                          <Button
                            label="Cancel"
                            onPress={() => {
                              setEditing(null);
                              setEditText('');
                            }}
                            variant="outline"
                            style={styles.editCancelButton}
                          />
                          <Button
                            label="Save"
                            onPress={() => handleEditPost(message.id, editText)}
                            disabled={!editText.trim()}
                            style={styles.editSaveButton}
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.messageContent}>{message.content}</Text>
                        <View style={styles.postActions}>
                          {isMember && (
                            <TouchableOpacity
                              style={styles.replyButton}
                              onPress={() => {
                                setReplyingTo({ type: 'post', id: message.id, postId: message.id });
                              }}
                            >
                              <Text style={styles.replyButtonText}>
                                {postComments.length > 0 ? `${postComments.length} comment${postComments.length !== 1 ? 's' : ''} • Reply` : 'Reply'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {message.userId === userId && (
                            <>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => {
                                  setEditing({ type: 'post', id: message.id, postId: message.id, content: message.content });
                                  setEditText(message.content);
                                }}
                              >
                                <Text style={styles.editDeleteButtonText}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.editDeleteButton}
                                onPress={() => handleDeletePost(message.id)}
                              >
                                <Text style={[styles.editDeleteButtonText, styles.deleteButtonText]}>Delete</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                  
                  {/* Comment Thread */}
                  {commentTree.length > 0 && (
                    <View style={styles.commentsSection}>
                      {commentTree.map((comment) => (
                        <CommentThread
                          key={comment.id}
                          comment={comment}
                          depth={0}
                          postId={message.id}
                          maxDepth={10}
                          commentsByPost={postComments}
                        />
                      ))}
                    </View>
                  )}
                  
                  {/* Reply Input for this post */}
                  {replyingTo && replyingTo.postId === message.id && replyingTo.type === 'post' && (
                    <ReplyInput
                      replyingTo={replyingTo}
                      replyText={replyText}
                      setReplyText={setReplyText}
                      onCancel={() => {
                        setReplyingTo(null);
                        setReplyText('');
                      }}
                      onSubmit={handlePostComment}
                      postComments={postComments}
                    />
                  )}
                </View>
              );
            })
          )}

          {/* New Post Input */}
          {isMember && !replyingTo && (
            <View style={styles.messageInput}>
              <Input
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Start a new discussion..."
                multiline
                style={styles.messageInputField}
              />
              <Button
                label="Post"
                onPress={handlePostMessage}
                disabled={!newMessage.trim()}
                style={styles.postButton}
              />
            </View>
          )}
        </View>
      </ScrollView>
    );
  }, [
    discussionMessages,
    pinnedNotes,
    isOrganizer,
    isMember,
    newMessage,
    handlePostMessage,
    commentsByPost,
    buildCommentTree,
    CommentThread,
    replyingTo,
    replyText, // Needed for ReplyInput to update, but ReplyInput is memoized so it won't cause full re-render
    handlePostComment,
    ReplyInput,
    editing,
    editText,
    setEditText,
    setEditing,
    handleEditPost,
    handleDeletePost,
    userId,
  ]);

  // ONE-TIME sync when event loads
  useEffect(() => {
    if (!event?.id || !members.length || !syncGamesForUsers) return;

    const memberIds = members
      .map(m => m.userId)
      .filter(Boolean);
    
    if (memberIds.length > 0) {
      console.log('[EventHub] Syncing games for event members (one-time)');
      syncGamesForUsers(memberIds);
    }
  }, [event?.id]); // ONLY when event ID changes

  // RSVP key - stable string (used by Schedule tab)
  const rsvpKey = useMemo(() => {
    return Object.keys(memberRSVPs)
      .sort()
      .map(uid => `${uid}:${memberRSVPs[uid]}`)
      .join('|');
  }, [memberRSVPs]);

  // Load game interests from Firestore (which games users are bringing)
  useEffect(() => {
    if (!event?.id || !db || !isMember) {
      setGameInterests({});
      return;
    }

    const gameStatusRef = db.collection('gamingGroups').doc(event.id)
      .collection('gameStatus');

    const unsubscribe = gameStatusRef.onSnapshot(
      (snapshot) => {
        const interests = {};
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const gameId = data.gameId;
          const userId = data.userId;
          const status = data.status; // 'bringing', 'want-to-play', 'open-to'

          if (!interests[gameId]) {
            interests[gameId] = {};
          }
          interests[gameId][userId] = status;
        });
        setGameInterests(interests);
      },
      (error) => {
        console.error('Error loading game interests:', error);
      }
    );

    return () => unsubscribe();
  }, [event?.id, db, isMember]);

  // Initialize selected games when modal opens (pre-select games already marked as bringing)
  useEffect(() => {
    if (showPlanningGamesModal && userId) {
      const alreadyBringing = new Set();
      // gameInterests keys are already using BGG ID or game.id as stored in Firestore
      Object.keys(gameInterests).forEach(gameId => {
        if (gameInterests[gameId]?.[userId] === 'bringing') {
          alreadyBringing.add(gameId);
        }
      });
      setSelectedGamesForBringing(alreadyBringing);
      setShowSelectedGamesList(true); // Show list by default when modal opens
    } else if (!showPlanningGamesModal) {
      setSelectedGamesForBringing(new Set());
      setPlanningGamesSearchQuery('');
      setShowSelectedGamesList(true); // Reset to show when modal closes
    }
  }, [showPlanningGamesModal, gameInterests, userId]);

  // Handler to save selected games as "bringing"
  const handleSavePlanningGames = useCallback(async () => {
    if (!userId || !event?.id || !db || !isMember) {
      Alert.alert('Error', 'Unable to save games. Please try again.');
      return;
    }

    try {
      const gameStatusRef = db.collection('gamingGroups').doc(event.id)
        .collection('gameStatus');

      // Get current games marked as bringing by this user
      const currentBringing = new Set();
      Object.keys(gameInterests).forEach(gameId => {
        if (gameInterests[gameId]?.[userId] === 'bringing') {
          currentBringing.add(gameId);
        }
      });

      // Remove games that were unselected
      const toRemove = Array.from(currentBringing).filter(
        gameId => !selectedGamesForBringing.has(gameId)
      );

      // Add games that were newly selected
      const toAdd = Array.from(selectedGamesForBringing).filter(
        gameId => !currentBringing.has(gameId)
      );

      // Batch operations
      const batch = db.batch();

      // Remove unselected games
      toRemove.forEach(gameId => {
        const docRef = gameStatusRef.doc(`${gameId}_${userId}`);
        batch.delete(docRef);
      });

      // Add newly selected games
      toAdd.forEach(gameId => {
        const docRef = gameStatusRef.doc(`${gameId}_${userId}`);
        batch.set(docRef, {
          gameId,
          userId,
          status: 'bringing',
          updatedAt: firebase.firestore.Timestamp.now(),
        });
      });

      await batch.commit();
      setShowPlanningGamesModal(false);
      Alert.alert('Success', 'Your planned games have been saved!');
    } catch (error) {
      console.error('Error saving planning games:', error);
      Alert.alert('Error', 'Failed to save games. Please try again.');
    }
  }, [userId, event?.id, db, isMember, selectedGamesForBringing, gameInterests]);

  // Create a stable key from collections to avoid infinite loops
  // Only recompute when memberIdsKey changes (not when members array reference changes)
  const collectionsKey = useMemo(() => {
    if (!collections || !memberIdsKey) return '';
    const memberIds = memberIdsKey.split(',').filter(Boolean);
    const keys = memberIds.map(uid => {
      const games = collections[uid] || [];
      const gameIds = games.map(g => (g.bggId || g.id)).filter(Boolean).sort();
      return `${uid}:${gameIds.join(',')}`;
    });
    if (userId && collections[userId]) {
      const userGames = collections[userId] || [];
      const userGameIds = userGames.map(g => (g.bggId || g.id)).filter(Boolean).sort();
      keys.push(`user:${userGameIds.join(',')}`);
    }
    return keys.join('|');
  }, [collections, memberIdsKey, userId]);

  // Stable handler for search input to prevent focus loss
  const handleSearchChange = useCallback((text) => {
    setPlanningGamesSearchQuery(text);
  }, []);

  // Games Tab Component - Rebuilt from scratch
  const GamesTab = () => {
    // Get user's games
    const myGames = userId ? (collections[userId] || []) : [];

    // Filter games for the modal (no sorting - keep original order)
    const filteredGames = useMemo(() => {
      if (!myGames.length) return [];
      
      // Apply search filter only
      if (planningGamesSearchQuery.trim()) {
        const query = planningGamesSearchQuery.toLowerCase().trim();
        return myGames.filter(game => 
          (game.title || '').toLowerCase().includes(query)
        );
      }
      
      return myGames;
    }, [myGames, planningGamesSearchQuery]);

    // Get expected games (games marked as "bringing" by any user)
    // Use stable collectionsKey instead of collections object to prevent infinite loops
    const expectedGames = useMemo(() => {
      if (!event?.id || !members.length || !collectionsKey) return [];
      
      const expected = [];
      const seenGameIds = new Set();
      
      // Get all games that are marked as "bringing"
      Object.keys(gameInterests).forEach(gameId => {
      const statuses = gameInterests[gameId] || {};
        const bringingUserIds = Object.keys(statuses).filter(
          uid => statuses[uid] === 'bringing'
        );
        
        if (bringingUserIds.length > 0 && !seenGameIds.has(gameId)) {
          // Find the game in any user's collection
          // Match by BGG ID first, then fallback to game.id
          let gameData = null;
          for (const member of members) {
        const memberGames = collections[member.userId] || [];
            const found = memberGames.find(g => {
              const gId = g.bggId || g.id;
              return gId === gameId;
            });
            if (found) {
              gameData = found;
              break;
            }
          }
          
          // Also check current user's collection
          if (!gameData && userId) {
            const userGames = collections[userId] || [];
            gameData = userGames.find(g => {
              const gId = g.bggId || g.id;
              return gId === gameId;
            });
          }
          
          if (gameData) {
            expected.push({
              ...gameData,
              bringingBy: bringingUserIds.map(uid => ({
                userId: uid,
                userName: uid === userId 
                  ? (user?.name || user?.email || userId) 
                  : (memberNames[uid] || uid),
              })),
            });
            seenGameIds.add(gameId);
          }
        }
      });
      
      return expected;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameInterests, collectionsKey, memberIdsKey, memberNames, userId, user, event?.id]);

    const toggleGameSelection = (gameId) => {
      setSelectedGamesForBringing(prev => {
        const next = new Set(prev);
        if (next.has(gameId)) {
          next.delete(gameId);
        } else {
          next.add(gameId);
        }
        return next;
      });
    };

    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
        {/* Planning Games Section */}
        {isMember && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Planning to Bring</Text>
            <Text style={styles.sectionCopy}>
              Select games from your collection that you're planning to bring to this MeepleUp.
            </Text>
                <TouchableOpacity
              style={styles.planningGamesLink}
              onPress={() => setShowPlanningGamesModal(true)}
            >
              <Text style={styles.planningGamesLinkText}>
                Add games
                                      </Text>
                </TouchableOpacity>
          </View>
        )}

        {/* Expected Games Section */}
        {isMember && expectedGames.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expected Games</Text>
            <Text style={styles.sectionCopy}>
              Games that members are planning to bring to this MeepleUp.
            </Text>
            {expectedGames.map((game) => {
              // Use BGG ID as primary identifier, fallback to game.id
              const gameId = game.bggId || game.id;
              const isUserBringing = game.bringingBy?.some(b => b.userId === userId) || false;
                  return (
                <View key={gameId} style={styles.expectedGameItem}>
                  <View style={styles.expectedGameContent}>
                    <Text style={styles.expectedGameTitle}>{game.title || 'Unknown Game'}</Text>
                    {game.bringingBy && game.bringingBy.length > 0 && (
                      <Text style={styles.expectedGameBringingBy}>
                        Bringing: {game.bringingBy.map(b => b.userName).join(', ')}
                      </Text>
                        )}
                      </View>
                  {isUserBringing && (
                      <TouchableOpacity
                      onPress={async () => {
                        try {
                          const gameStatusRef = db.collection('gamingGroups').doc(event.id)
                            .collection('gameStatus').doc(`${gameId}_${userId}`);
                          await gameStatusRef.delete();
                        } catch (error) {
                          console.error('Error removing game:', error);
                          Alert.alert('Error', 'Failed to remove game. Please try again.');
                        }
                      }}
                      style={styles.expectedGameDeleteButton}
                    >
                      <Text style={styles.expectedGameDeleteText}>×</Text>
                      </TouchableOpacity>
                  )}
                </View>
                  );
                })}
          </View>
        )}

        {isMember && expectedGames.length === 0 && (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expected Games</Text>
          <Text style={styles.sectionCopy}>
              No games marked as "bringing" yet. Use the link above to mark games you're planning to bring.
          </Text>
          </View>
        )}

        {/* Planning Games Modal */}
        <Modal
          isOpen={showPlanningGamesModal}
          onClose={() => setShowPlanningGamesModal(false)}
          title="Add games"
          fullScreen={true}
        >
          <View style={styles.fullScreenModalContent}>
            {/* Search Box */}
            <View style={styles.modalFieldContainer}>
              <Input
                key="planning-games-search"
                placeholder="Search games by title..."
                value={planningGamesSearchQuery}
                onChangeText={handleSearchChange}
                style={styles.modalInput}
                autoCapitalize="none"
              />
              </View>


            {/* Games Grid */}
            {filteredGames.length === 0 ? (
              <View style={styles.emptyStateContainer}>
            <Text style={styles.sectionCopy}>
                  {planningGamesSearchQuery.trim() 
                    ? 'No games found matching your search.' 
                    : 'No games in your collection yet.'}
            </Text>
              </View>
          ) : (
              <FlatList
                data={filteredGames}
                keyExtractor={(item) => {
                  const key = item.bggId || item.id;
                  return key ? key.toString() : `game-${Math.random()}`;
                }}
                renderItem={({ item }) => {
                  const gameId = item.bggId || item.id;
                  const isSelected = selectedGamesForBringing.has(gameId);
                  return (
                    <View style={styles.selectableGameCardWrapper}>
                      <Pressable
                        onPress={() => toggleGameSelection(gameId)}
                        style={{ width: '100%' }}
                      >
                  <GameCard 
                    game={item} 
                    preloadedBggData={item._bggData}
                          disableModal={true}
                        />
                      </Pressable>
                      {isSelected && (
                        <View style={styles.selectedOverlay}>
                          <Text style={styles.selectedCheckmark}>✓</Text>
                        </View>
                      )}
                      {isSelected && (
                        <View style={styles.selectedBorder} />
                      )}
                    </View>
                  );
                }}
                numColumns={3}
                columnWrapperStyle={styles.gameCardRow}
                contentContainerStyle={styles.gameCardContainer}
                scrollEnabled={true}
                style={styles.fullScreenGamesList}
              />
            )}

            {/* Submit Button - Fixed at bottom */}
            <View style={styles.modalButtonContainer}>
              <Button
                onPress={handleSavePlanningGames}
                label="Add games"
                style={styles.modalButton}
                disabled={selectedGamesForBringing.size === 0}
              />
        </View>
          </View>
        </Modal>
      </ScrollView>
    );
  };

  // Members Tab Component
  const MembersTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members ({members.length})</Text>
        {members.length === 0 ? (
          <Text style={styles.sectionCopy}>
            No members yet. Invite trusted players to join.
          </Text>
        ) : (
          members.map((member) => {
            const displayName = memberNames[member.userId] || member.userId;
            const rsvpStatus = memberRSVPs[member.userId] || null;
            const isCurrentUser = member.userId === userId;

            return (
              <View key={member.userId} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.role === 'organizer' ? '👑 ' : ''}{displayName}
                    {isCurrentUser && ' (You)'}
                  </Text>
                  <Text style={styles.memberRole}>
                    {member.role === 'organizer' ? 'Organizer' : 'Member'}
                  </Text>
                  {rsvpStatus && (
                    <Text style={styles.memberRSVP}>
                      RSVP: {getRSVPStatusLabel(rsvpStatus)}
                    </Text>
                  )}
                </View>
                {isOrganizer && !isCurrentUser && member.role !== 'organizer' && (
                  <TouchableOpacity
                    style={styles.removeMemberButton}
                    onPress={() => {
                      Alert.alert(
                        'Remove Member?',
                        `Are you sure you want to remove ${displayName} from this MeepleUp?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await leaveEvent(event.id, member.userId);
                                Alert.alert('Member Removed', `${displayName} has been removed from the MeepleUp.`);
                              } catch (error) {
                                Alert.alert('Error', 'Failed to remove member. Please try again.');
                                console.error(error);
                              }
                            },
                          },
                        ],
                      );
                    }}
                  >
                    <Text style={styles.removeMemberText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{event.name || 'MeepleUp Hub'}</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === TABS.SCHEDULE && styles.tabActive]}
          onPress={() => setActiveTab(TABS.SCHEDULE)}
        >
          <Text style={[styles.tabText, activeTab === TABS.SCHEDULE && styles.tabTextActive]}>
            Schedule
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === TABS.GAMES && styles.tabActive]}
          onPress={() => setActiveTab(TABS.GAMES)}
        >
          <Text style={[styles.tabText, activeTab === TABS.GAMES && styles.tabTextActive]}>
            Games
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === TABS.DISCUSSION && styles.tabActive]}
          onPress={() => setActiveTab(TABS.DISCUSSION)}
        >
          <Text style={[styles.tabText, activeTab === TABS.DISCUSSION && styles.tabTextActive]}>
            Discussion
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === TABS.MEMBERS && styles.tabActive]}
          onPress={() => setActiveTab(TABS.MEMBERS)}
        >
          <Text style={[styles.tabText, activeTab === TABS.MEMBERS && styles.tabTextActive]}>
            Members
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === TABS.SCHEDULE && <ScheduleTab />}
      {activeTab === TABS.GAMES && <GamesTab />}
      {activeTab === TABS.DISCUSSION && DiscussionTab}
      {activeTab === TABS.MEMBERS && <MembersTab />}

      {/* Game Details Modal */}
      <GameDetailsModal
        game={selectedGame}
        isOpen={isGameModalOpen}
        onClose={() => {
          setIsGameModalOpen(false);
          setSelectedGame(null);
          setSelectedGameBggData(null);
        }}
        preloadedBggData={selectedGameBggData}
        showTeachingStatus={false}
      />

      {/* Edit Schedule Modal */}
      <Modal
        isOpen={showEditSchedule}
        onClose={() => setShowEditSchedule(false)}
        title="Edit Schedule"
      >
        <View style={styles.modalContent}>
          <View style={styles.modalFieldContainer}>
            <Text style={styles.fieldLabel}>Date & Time</Text>
            <Input
              value={scheduleForm.scheduledFor}
              onChangeText={(text) => setScheduleForm({ ...scheduleForm, scheduledFor: text })}
              placeholder="e.g., 2024-12-25T18:00:00"
              style={styles.modalInput}
            />
            <Text style={styles.fieldHint}>
              Format: YYYY-MM-DDTHH:mm:ss (e.g., 2024-12-25T18:00:00)
            </Text>
          </View>

          <View style={styles.modalFieldContainer}>
            <Text style={styles.fieldLabel}>General Location</Text>
            <Input
              value={scheduleForm.generalLocation}
              onChangeText={(text) => setScheduleForm({ ...scheduleForm, generalLocation: text })}
              placeholder="e.g., Seattle, WA"
              style={styles.modalInput}
            />
          </View>

          <View style={styles.modalFieldContainer}>
            <Text style={styles.fieldLabel}>Exact Location</Text>
            <Input
              value={scheduleForm.exactLocation}
              onChangeText={(text) => setScheduleForm({ ...scheduleForm, exactLocation: text })}
              placeholder="e.g., 123 Main St, Seattle, WA"
              style={styles.modalInput}
            />
          </View>

          <View style={styles.modalActions}>
            <Button
              label="Save"
              onPress={handleEditSchedule}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => setShowEditSchedule(false)}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Edit Pinned Notes Modal */}
      <Modal
        isOpen={showEditPinnedNotes}
        onClose={() => setShowEditPinnedNotes(false)}
        title="Edit Pinned Notes"
      >
        <View style={styles.modalContent}>
          <View style={styles.modalFieldContainer}>
            <Input
              value={pinnedNotes}
              onChangeText={setPinnedNotes}
              placeholder="Add notes about parking, what to bring, house rules, etc."
              multiline
              numberOfLines={6}
              style={styles.modalInput}
            />
          </View>
          <View style={styles.modalActions}>
            <Button
              label="Save"
              onPress={async () => {
                try {
                  // Update local state
                  await updateEvent(event.id, { description: pinnedNotes });
                  
                  // Update Firestore if available
                  if (db && event.id) {
                    await db.collection('gamingGroups').doc(event.id).update({
                      description: pinnedNotes,
                      updatedAt: firebase.firestore.Timestamp.now(),
                    });
                  }
                  
                  setShowEditPinnedNotes(false);
                  Alert.alert('Success', 'Pinned notes updated successfully.');
                } catch (error) {
                  Alert.alert('Error', 'Failed to update pinned notes. Please try again.');
                  console.error(error);
                }
              }}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => setShowEditPinnedNotes(false)}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
    );
  };

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    flexDirection: 'column',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d45d5d',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#d45d5d',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#d45d5d',
    fontWeight: '600',
  },
  discussionScrollContent: {
    paddingBottom: 100,
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    paddingBottom: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    margin: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2f2f2f',
    flex: 1,
  },
  sectionCopy: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 6,
  },
  scheduleInfo: {
    marginBottom: 16,
  },
  scheduleLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 4,
  },
  scheduleValue: {
    fontSize: 16,
    color: '#2f2f2f',
    fontWeight: '500',
  },
  highlight: {
    fontWeight: '600',
    color: '#1f4f8c',
    marginTop: 4,
  },
  exportButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 140,
  },
  editButton: {
    marginTop: 12,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  rsvpButton: {
    flex: 1,
  },
  rsvpSummary: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  rsvpSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 8,
  },
  rsvpSummaryItem: {
    fontSize: 14,
    color: '#444',
    marginBottom: 4,
  },
  bold: {
    fontWeight: '600',
  },
  editLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editLinkText: {
    color: '#d45d5d',
    fontSize: 14,
    fontWeight: '500',
  },
  messageCard: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  pinnedMessageCard: {
    backgroundColor: '#fff7e6',
    borderLeftWidth: 3,
    borderLeftColor: '#ffa500',
  },
  messageAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
  },
  messageInput: {
    marginTop: 16,
  },
  messageInputField: {
    marginBottom: 12,
  },
  postButton: {
    marginTop: 8,
  },
  postContainer: {
    marginBottom: 24,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentContainer: {
    marginTop: 12,
  },
  nestedComment: {
    marginLeft: 0,
  },
  commentCard: {
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#d45d5d',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2f2f2f',
  },
  commentTime: {
    fontSize: 11,
    color: '#999',
  },
  commentContent: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 4,
  },
  commentChildren: {
    marginTop: 8,
    marginLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#e0e0e0',
    paddingLeft: 12,
  },
  commentsSection: {
    marginTop: 12,
    marginLeft: 0,
  },
  replyButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  replyButtonText: {
    fontSize: 13,
    color: '#d45d5d',
    fontWeight: '500',
  },
  replyInputContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  replyingToLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  replyInputField: {
    marginBottom: 8,
  },
  replyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  replyCancelButton: {
    flex: 1,
  },
  replyPostButton: {
    flex: 1,
  },
  editedLabel: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  editDeleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editDeleteButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  deleteButtonText: {
    color: '#d45d5d',
  },
  editContainer: {
    marginTop: 8,
  },
  editInputField: {
    marginBottom: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editCancelButton: {
    flex: 1,
  },
  editSaveButton: {
    flex: 1,
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  memberRSVP: {
    fontSize: 13,
    color: '#d45d5d',
    fontWeight: '500',
  },
  removeMemberButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff5f5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d45d5d',
  },
  removeMemberText: {
    color: '#d45d5d',
    fontSize: 13,
    fontWeight: '500',
  },
  adminSection: {
    paddingTop: 20,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  inviteBlock: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#c7d4ff',
    backgroundColor: '#eef3ff',
    marginTop: 12,
  },
  inviteLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#4a5ec5',
    letterSpacing: 1,
    marginTop: 8,
  },
  inviteCode: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2a75',
    letterSpacing: 2,
    marginTop: 4,
  },
  primaryAction: {
    marginTop: 16,
  },
  dangerAction: {
    marginTop: 8,
    borderColor: '#d45d5d',
  },
  sectionHint: {
    fontSize: 13,
    color: '#8a6d3b',
    backgroundColor: '#fff7e6',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    lineHeight: 18,
  },
  modalContent: {
    padding: 20,
  },
  modalFieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 0,
  },
  fieldHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    marginBottom: 0,
  },
  modalInput: {
    marginBottom: 0,
  },
  modalActions: {
    marginTop: 8,
  },
  modalButton: {
    marginBottom: 12,
  },
  modalButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: -2 },
    elevation: 5,
  },
  planningGamesLink: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#eef3ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d4ff',
  },
  planningGamesLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2a75',
    textAlign: 'center',
  },
  fullScreenModalContent: {
    flex: 1,
    padding: 20,
    paddingTop: 0,
  },
  fullScreenGamesList: {
    flex: 1,
    marginBottom: 80, // Space for fixed button
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  selectableGameCardWrapper: {
    position: 'relative',
    width: '31%',
    alignSelf: 'flex-start',
  },
  selectedBorder: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 4,
    borderColor: '#4a5ec5',
    borderRadius: 16,
    zIndex: 5,
    backgroundColor: 'rgba(74, 94, 197, 0.1)',
  },
  selectedOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4a5ec5',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  selectedCheckmark: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  selectedGamesListContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedGamesListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedGamesListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2f2f2f',
  },
  selectedGamesListToggle: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  selectedGamesList: {
    maxHeight: 120,
  },
  selectedGamesListContent: {
    paddingBottom: 4,
  },
  selectedGameListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#4a5ec5',
  },
  selectedGameListItemTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2f2f2f',
    flex: 1,
    marginRight: 8,
  },
  removeGameButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  removeGameButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  expectedGameItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4a5ec5',
  },
  expectedGameContent: {
    flex: 1,
  },
  expectedGameTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 8,
  },
  expectedGameBringingBy: {
    fontSize: 14,
    color: '#666',
  },
  expectedGameDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  expectedGameDeleteText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
  gameItem: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  gameItemHeader: {
    marginBottom: 8,
  },
  gameItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  gameItemOwners: {
    fontSize: 12,
    color: '#666',
  },
  gameStatusCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  gameStatusCount: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  gameStatusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gameStatusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  gameStatusButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  gameStatusButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  gameStatusButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  expectedGameDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d45d5d',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  expectedGameDeleteText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  expectedGameMeta: {
    gap: 4,
  },
  expectedGameBringingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  expectedGameBringingLabel: {
    fontSize: 13,
    color: '#4a90e2',
    fontWeight: '500',
    marginRight: 8,
  },
  expectedGameAvatars: {
    flexDirection: 'row',
    marginRight: 8,
  },
  expectedGameAvatarContainer: {
    marginRight: -8,
  },
  expectedGameAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  expectedGameAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4a90e2',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expectedGameAvatarInitial: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  expectedGameBringingNames: {
    fontSize: 13,
    color: '#4a90e2',
    fontWeight: '500',
  },
  expectedGameOwners: {
    fontSize: 12,
    color: '#666',
  },
  expectedGameArrow: {
    fontSize: 18,
    color: '#999',
    marginLeft: 12,
  },
  expandLinkText: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '500',
  },
  gamesCountText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  myGamesList: {
    marginTop: 12,
    gap: 8,
  },
  myGameItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  myGameContent: {
    flex: 1,
  },
  myGameTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2f2f2f',
    marginBottom: 4,
  },
  myGameStatus: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '500',
  },
  myGameMarkButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  myGameMarkButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  myGameMarkButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  myGameMarkButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  sortContainer: {
    marginTop: 12,
    marginBottom: 16,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  sortButtonActive: {
    borderColor: '#4a90e2',
    backgroundColor: '#e8f4fd',
  },
  sortButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  sortButtonTextActive: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 16,
  },
  paginationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a90e2',
    backgroundColor: '#fff',
  },
  paginationButtonDisabled: {
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  paginationButtonText: {
    fontSize: 14,
    color: '#4a90e2',
    fontWeight: '500',
  },
  paginationButtonTextDisabled: {
    color: '#999',
  },
  paginationInfo: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  gameCardContainer: {
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  gameCardRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    gap: 8,
    alignItems: 'flex-start',
  },
});

export default EventHub;
