import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Platform, KeyboardAvoidingView } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { db } from '../config/firebase';
import firebase from '../config/firebase';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
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
  const [pinnedNotes, setPinnedNotes] = useState('');
  const [showEditPinnedNotes, setShowEditPinnedNotes] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

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

  // Fetch member names and RSVP data from Firestore
  useEffect(() => {
    if (!members.length || !db || !event?.id) return;

    const fetchMemberData = async () => {
      const names = {};
      const rsvps = {};
      
      for (const member of members) {
        if (!member.userId || names[member.userId]) continue;
        
        // First check if this is the current user - use Auth context data
        if (user && member.userId === (user.uid || user.id)) {
          names[member.userId] = user.name || user.email || member.userId;
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
              continue;
            }
          }
          
          // Fallback to users collection
          const userDoc = await db.collection('users').doc(member.userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            names[member.userId] = userData.name || userData.email || member.userId;
          } else {
            names[member.userId] = member.userId;
          }
        } catch (error) {
          console.error(`Error fetching data for user ${member.userId}:`, error);
          names[member.userId] = member.userId;
        }
      }
      
      setMemberNames(names);
      setMemberRSVPs(rsvps);
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
  const ScheduleTab = () => (
    <ScrollView style={styles.tabContent}>
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

      {isMember && (
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

  // Fetch discussion posts from Firestore
  useEffect(() => {
    if (!event?.id || !db || !isMember) return;

    const fetchPosts = async () => {
      try {
        // Fetch all posts and filter/sort in memory to avoid index requirements
        // This is more efficient for small collections and doesn't require composite indexes
        const postsRef = db.collection('gamingGroups').doc(event.id)
          .collection('posts')
          .limit(100); // Get more than we need, then filter

        const snapshot = await postsRef.get();

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
        setDiscussionMessages(posts.slice(0, 50));
      } catch (error) {
        console.error('Error fetching discussion posts:', error);
        // If query fails, just show empty state
        setDiscussionMessages([]);
      }
    };

    fetchPosts();
  }, [event?.id, isMember]);

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
            {pinnedMessages.map((message) => (
              <View key={message.id} style={[styles.messageCard, styles.pinnedMessageCard]}>
                <Text style={styles.messageAuthor}>{message.userName}</Text>
                <Text style={styles.messageContent}>{message.content}</Text>
                <Text style={styles.messageTime}>{formatDate(message.createdAt)}</Text>
              </View>
            ))}
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
            regularMessages.map((message) => (
              <View key={message.id} style={styles.messageCard}>
                <Text style={styles.messageAuthor}>{message.userName}</Text>
                <Text style={styles.messageContent}>{message.content}</Text>
                <Text style={styles.messageTime}>{formatDate(message.createdAt)}</Text>
              </View>
            ))
          )}

          {isMember && (
            <View style={styles.messageInput}>
              <Input
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Type a message..."
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
  ]);

  // Members Tab Component
  const MembersTab = () => (
    <ScrollView style={styles.tabContent}>
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
      {activeTab === TABS.DISCUSSION && DiscussionTab}
      {activeTab === TABS.MEMBERS && <MembersTab />}

      {/* Admin-Only Sections */}
      {isOrganizer && (
        <View style={styles.adminSection}>
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
        </View>
      )}

      {/* Edit Schedule Modal */}
      <Modal
        isOpen={showEditSchedule}
        onClose={() => setShowEditSchedule(false)}
        title="Edit Schedule"
      >
        <View style={styles.modalContent}>
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

          <Text style={styles.fieldLabel}>General Location</Text>
          <Input
            value={scheduleForm.generalLocation}
            onChangeText={(text) => setScheduleForm({ ...scheduleForm, generalLocation: text })}
            placeholder="e.g., Seattle, WA"
            style={styles.modalInput}
          />

          <Text style={styles.fieldLabel}>Exact Location</Text>
          <Input
            value={scheduleForm.exactLocation}
            onChangeText={(text) => setScheduleForm({ ...scheduleForm, exactLocation: text })}
            placeholder="e.g., 123 Main St, Seattle, WA"
            style={styles.modalInput}
          />

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
          <Input
            value={pinnedNotes}
            onChangeText={setPinnedNotes}
            placeholder="Add notes about parking, what to bring, house rules, etc."
            multiline
            numberOfLines={6}
            style={styles.modalInput}
          />
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
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
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
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    margin: 20,
    marginBottom: 0,
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
    padding: 20,
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  fieldHint: {
    fontSize: 12,
    color: '#666',
    marginTop: -8,
    marginBottom: 12,
  },
  modalInput: {
    marginBottom: 16,
  },
  modalActions: {
    marginTop: 8,
  },
  modalButton: {
    marginBottom: 12,
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
});

export default EventHub;
