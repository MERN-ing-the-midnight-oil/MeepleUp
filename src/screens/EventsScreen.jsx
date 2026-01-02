import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  useWindowDimensions,
  Platform,
  Animated,
} from 'react-native';
import { useResponsive } from '../utils/responsive';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { theme, commonStyles } from '../utils/theme';
import { formatDate } from '../utils/helpers';
import { validateJoinCode } from '../utils/api';
import { useUnifiedNavigation } from '../utils/navigation';
import { useNavigation } from '@react-navigation/native';
import { db } from '../config/firebase';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import JoinForm from '../components/JoinForm';
import CreateEventForm from '../components/CreateEventForm';
import EventCard from '../components/EventCard';
import UserProfileModal from '../components/UserProfileModal';

const EventsScreen = () => {
  const navigate = useUnifiedNavigation();
  const navigation = Platform.OS !== 'web' ? useNavigation() : null;
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const { isMobile, isTablet } = useResponsive();
  const {
    events,
    getUserEvents,
    getUserArchivedEvents,
    createEvent,
    joinEventWithCode,
    unarchiveEvent,
    leaveEvent,
    getEventById,
    updateMemberRSVP,
  } = useEvents();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinCodeWord1, setJoinCodeWord1] = useState('');
  const [joinCodeWord2, setJoinCodeWord2] = useState('');
  const [joinCodeWord3, setJoinCodeWord3] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [memberRSVPs, setMemberRSVPs] = useState({});
  const [organizerData, setOrganizerData] = useState({}); // { eventId: { name, avatarUrl } }
  const [memberData, setMemberData] = useState({}); // { eventId: { [userId]: { name, avatarUrl } } }
  const [selectedUserForProfile, setSelectedUserForProfile] = useState(null);
  const [joinedEventName, setJoinedEventName] = useState(null); // Store event name for success modal
  const scrollViewRef = useRef(null);
  const scrollPositionRef = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Event creation form state
  const [eventForm, setEventForm] = useState({
    name: '',
    location: '',
    address: '',
    scheduledFor: '',
    description: '',
    rsvpSettings: {
      enabled: true,
      allowMaybe: true,
      attendanceLimit: null,
    },
  });

  // Fetch RSVP data and organizer info for all user events
  useEffect(() => {
    if (!userIdentifier || !db || userEvents.length === 0) return;

    const fetchEventData = async () => {
      const rsvps = {};
      const organizers = {};
      const members = {}; // { eventId: { [userId]: { name, avatarUrl } } }
      try {
        for (const event of userEvents) {
          if (!event.id) continue;
          
          const eventMembers = {};
          
          // Fetch RSVPs and member data
          try {
            const membersSnapshot = await db
              .collection('gamingGroups')
              .doc(event.id)
              .collection('members')
              .get();

            membersSnapshot.docs.forEach((memberDoc) => {
              const memberData = memberDoc.data();
              const memberId = memberDoc.id;
              if (memberData.rsvpStatus) {
                rsvps[`${event.id}_${memberId}`] = memberData.rsvpStatus;
              }
              
              // Store member data
              eventMembers[memberId] = {
                name: memberData.userName || null,
                avatarUrl: memberData.userAvatarUrl || null,
              };
            });
          } catch (error) {
            console.error(`Error fetching RSVPs for event ${event.id}:`, error);
          }

          // Fetch missing member data from users collection
          if (event.members && Array.isArray(event.members)) {
            for (const member of event.members) {
              if (!member.userId || eventMembers[member.userId]) continue;
              
              try {
                // Check if member is current user first
                if (member.userId === userIdentifier) {
                  eventMembers[member.userId] = {
                    name: user?.name || user?.email || 'You',
                    avatarUrl: user?.photoURL || user?.avatarUrl || null,
                  };
                } else {
                  // Try to get from users collection
                  const userDoc = await db.collection('users').doc(member.userId).get();
                  if (userDoc.exists) {
                    const userData = userDoc.data();
                    eventMembers[member.userId] = {
                      name: userData.name || userData.email || 'Unknown',
                      avatarUrl: userData.avatarUrl || null,
                    };
                  } else if (member.userName) {
                    // Fallback to member data from event
                    eventMembers[member.userId] = {
                      name: member.userName,
                      avatarUrl: member.userAvatarUrl || null,
                    };
                  }
                }
              } catch (error) {
                console.error(`Error fetching member data for ${member.userId}:`, error);
              }
            }
          }
          
          members[event.id] = eventMembers;

          // Fetch organizer info
          if (event.organizerId) {
            try {
              // Check if organizer is current user first
              if (event.organizerId === userIdentifier) {
                organizers[event.id] = {
                  name: user?.name || user?.email || 'You',
                  avatarUrl: user?.photoURL || user?.avatarUrl || null,
                };
              } else {
                // Fetch from Firestore
                const organizerDoc = await db.collection('users').doc(event.organizerId).get();
                if (organizerDoc.exists) {
                  const organizerData = organizerDoc.data();
                  organizers[event.id] = {
                    name: organizerData.name || organizerData.email || 'Unknown Host',
                    avatarUrl: organizerData.avatarUrl || null,
                  };
                } else {
                  // Fallback: try to get from members collection
                  const memberDoc = await db
                    .collection('gamingGroups')
                    .doc(event.id)
                    .collection('members')
                    .doc(event.organizerId)
                    .get();
                  if (memberDoc.exists) {
                    const memberData = memberDoc.data();
                    organizers[event.id] = {
                      name: memberData.userName || 'Unknown Host',
                      avatarUrl: memberData.userAvatarUrl || null,
                    };
                  }
                }
              }
            } catch (error) {
              console.error(`Error fetching organizer for event ${event.id}:`, error);
            }
          }
        }
        setMemberRSVPs(rsvps);
        setOrganizerData(organizers);
        setMemberData(members);
      } catch (error) {
        console.error('Error fetching event data:', error);
      }
    };

    fetchEventData();
  }, [userIdentifier, userEvents.length, user]);

  const handleRSVP = useCallback(async (eventId, status) => {
    if (!userIdentifier) {
      Alert.alert('Error', 'Please sign in to RSVP.');
      return;
    }

    // Capture scroll position before any updates
    const savedScroll = scrollPositionRef.current;

    // Optimistically update local state immediately
    setMemberRSVPs((prev) => ({
      ...prev,
      [`${eventId}_${userIdentifier}`]: status,
    }));

    // Restore scroll position after React has painted the update
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollViewRef.current && savedScroll > 0) {
          scrollViewRef.current.scrollTo({
            y: savedScroll,
            animated: false,
          });
        }
      });
    });

    // Update context asynchronously
    try {
      await updateMemberRSVP(eventId, userIdentifier, status);
    } catch (error) {
      // Revert optimistic update on error
      setMemberRSVPs((prev) => {
        const updated = { ...prev };
        delete updated[`${eventId}_${userIdentifier}`];
        return updated;
      });
      Alert.alert('Error', error.message || 'Failed to update RSVP.');
    }
  }, [userIdentifier, updateMemberRSVP]);

  const userIdentifier = user?.uid || user?.id;
  const userEvents = userIdentifier ? getUserEvents(userIdentifier) : [];
  const archivedEvents = userIdentifier ? getUserArchivedEvents(userIdentifier) : [];

  // Memoize eventRSVPs mapping to prevent unnecessary re-renders
  // Only re-create when memberRSVPs or userEvents change
  const eventRSVPsMap = useMemo(() => {
    const map = {};
    userEvents.forEach((event) => {
      const eventRSVPs = {};
      (event.members || []).forEach((member) => {
        const rsvpKey = `${event.id}_${member.userId}`;
        if (memberRSVPs[rsvpKey]) {
          eventRSVPs[member.userId] = memberRSVPs[rsvpKey];
        } else if (member.rsvpStatus) {
          eventRSVPs[member.userId] = member.rsvpStatus;
        }
      });
      map[event.id] = eventRSVPs;
    });
    return map;
  }, [userEvents, memberRSVPs]);

  const handleEventClick = (eventId) => {
    navigate(`/event/${eventId}`);
  };

  const handleJoinCodeWordChange = (wordIndex, text) => {
    // Allow any case - normalization happens during comparison
    const trimmed = text.trim();
    if (wordIndex === 1) {
      setJoinCodeWord1(trimmed);
    } else if (wordIndex === 2) {
      setJoinCodeWord2(trimmed);
    } else if (wordIndex === 3) {
      setJoinCodeWord3(trimmed);
    }
    setJoinError('');
  };

  const handleJoinEvent = async () => {
    if (!userIdentifier) {
      setJoinError('Please sign in to join a MeepleUp.');
      return;
    }

    const word1 = joinCodeWord1.trim().toLowerCase();
    const word2 = joinCodeWord2.trim().toLowerCase();
    const word3 = joinCodeWord3.trim().toLowerCase();

    if (!word1 || !word2 || !word3) {
      setJoinError('Please enter all three words of the join code');
      return;
    }

    const joinCode = `${word1} ${word2} ${word3}`;

    if (!validateJoinCode(joinCode)) {
      setJoinError('Invalid join code format');
      return;
    }

    setJoinLoading(true);
    setJoinError('');

    try {
      const joinedEvent = await joinEventWithCode(joinCode, userIdentifier);

      if (!joinedEvent) {
        setJoinError('MeepleUp not found. Please double-check your join code. If the event was just created, wait a moment and try again.');
        setJoinLoading(false);
        return;
      }

      setJoinCodeWord1('');
      setJoinCodeWord2('');
      setJoinCodeWord3('');
      // Show success modal with event name
      setJoinedEventName(joinedEvent.name || 'MeepleUp');
    } catch (err) {
      setJoinError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!userIdentifier) {
      Alert.alert('Error', 'Please sign in to organize a MeepleUp.');
      return;
    }

    if (!eventForm.name.trim()) {
      Alert.alert('Error', 'Please enter an event name.');
      return;
    }

    try {
      const newEvent = await createEvent({
        name: eventForm.name.trim(),
        location: eventForm.location.trim() || '',
        address: eventForm.address.trim() || '',
        scheduledFor: eventForm.scheduledFor.trim() || '',
        description: eventForm.description.trim() || '',
        visibility: 'private',
        rsvpSettings: eventForm.rsvpSettings || {
          enabled: true,
          allowMaybe: true,
          attendanceLimit: null,
        },
      });

      setShowCreateModal(false);
      setEventForm({ name: '', location: '', address: '', scheduledFor: '', description: '' });
      Alert.alert('MeepleUp Organized', `Your MeepleUp "${newEvent.name}" has been organized! Share join code: ${newEvent.joinCode}`);
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create MeepleUp. Please try again.');
    }
  };


  const handleUnarchiveEvent = async (eventId) => {
    if (!userIdentifier) {
      Alert.alert('Error', 'You must be signed in to unarchive an event.');
      return;
    }

    // Verify user is the organizer of this event
    const event = events.find((e) => e.id === eventId);
    if (!event) {
      Alert.alert('Error', 'MeepleUp not found.');
      return;
    }

    if (event.organizerId !== userIdentifier) {
      Alert.alert('Error', 'Only the organizer can unarchive this MeepleUp.');
      return;
    }

    Alert.alert(
      'Unarchive MeepleUp?',
      'This will restore the MeepleUp and make it visible to all members again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unarchive',
          onPress: async () => {
            try {
              await unarchiveEvent(eventId, userIdentifier);
              Alert.alert('MeepleUp Restored', 'The MeepleUp has been unarchived and is now active.');
            } catch (error) {
              Alert.alert('Error', 'Failed to unarchive MeepleUp. Please try again.');
              console.error(error);
            }
          },
        },
      ],
    );
  };


  // Memoize RSVP handlers to prevent unnecessary re-renders
  const rsvpHandlers = useMemo(() => {
    const handlers = {};
    userEvents.forEach((event) => {
      handlers[event.id] = (status) => handleRSVP(event.id, status);
    });
    return handlers;
  }, [userEvents, handleRSVP]);


  return (
    <>
      <ScrollView 
          ref={scrollViewRef}
          style={styles.container}
          onScroll={Platform.OS !== 'web' 
            ? Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: false, listener: (event) => {
                  scrollPositionRef.current = event.nativeEvent.contentOffset.y;
                }}
              )
            : (event) => {
                scrollPositionRef.current = event.nativeEvent.contentOffset.y;
              }
          }
          scrollEventThrottle={16}
        >
        <View style={styles.header}>
          <Text style={styles.title}>Your MeepleUps</Text>
          <Text style={styles.subtitle}>Manage your game night MeepleUps</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            label="+ Organize MeepleUp"
            onPress={() => setShowCreateModal(true)}
            style={styles.actionButton}
          />
        </View>

        {/* Join an existing MeepleUp Section */}
        <View style={styles.joinSection}>
          <JoinForm
            joinCodeWord1={joinCodeWord1}
            joinCodeWord2={joinCodeWord2}
            joinCodeWord3={joinCodeWord3}
            onJoinCodeWordChange={handleJoinCodeWordChange}
            onJoin={handleJoinEvent}
            error={joinError}
            loading={joinLoading}
          />
        </View>

        {/* User's Events */}
        {userEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No MeepleUps yet</Text>
            <Text style={styles.emptyText}>
              Organize a new MeepleUp or join one with a code.
            </Text>
          </View>
        ) : (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>My MeepleUps</Text>
            {userEvents.map((event) => {
              const isOrganizer = event.organizerId === userIdentifier;
              const eventRSVPs = eventRSVPsMap[event.id] || {};
              const organizer = organizerData[event.id] || {};
              const eventMemberData = memberData[event.id] || {};
              
              // Extract member avatars and names
              const memberAvatars = {};
              const memberNames = {};
              Object.keys(eventMemberData).forEach((userId) => {
                memberAvatars[userId] = eventMemberData[userId]?.avatarUrl || null;
                memberNames[userId] = eventMemberData[userId]?.name || 'Unknown';
              });

              return (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={() => handleEventClick(event.id)}
                  isOrganizer={isOrganizer}
                  style={styles.eventTile}
                  currentUserId={userIdentifier}
                  onRSVP={rsvpHandlers[event.id]}
                  memberRSVPs={eventRSVPs}
                  memberAvatars={memberAvatars}
                  memberNames={memberNames}
                  onMemberPress={(userId, userName, avatarUrl) => {
                    setSelectedUserForProfile({ userId, userName, avatarUrl });
                  }}
                  navigation={navigation}
                />
              );
            })}
          </View>
        )}

        {/* Archived Events - Only visible to organizers */}
        {archivedEvents.length > 0 && (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Your Archived MeepleUps</Text>
            <Text style={styles.sectionSubtitle}>
              MeepleUps you've organized and archived. Only you can see and restore these.
            </Text>
            {archivedEvents.map((event) => {
              const memberCount = (event.members || []).filter(
                (member) => member.status === 'member',
              ).length;

              return (
                <View key={event.id} style={[styles.eventCard, styles.archivedCard]}>
                  <View style={styles.eventHeader}>
                    <View style={styles.eventInfo}>
                      <Text style={[styles.eventTitle, styles.archivedTitle]}>
                        {event.name || 'Untitled MeepleUp'}
                      </Text>
                      <Text style={styles.eventMeta}>
                        {event.location || event.address || (event.generalLocation || event.exactLocation) || 'Location TBD'}
                      </Text>
                    </View>
                    <View style={styles.archivedBadge}>
                      <Text style={styles.archivedBadgeText}>Archived</Text>
                    </View>
                  </View>
                  {event.scheduledFor && (
                    <Text style={styles.eventDate}>
                      {formatDate(event.scheduledFor) || event.scheduledFor}
                    </Text>
                  )}
                  {event.members && (
                    <Text style={styles.eventMembers}>
                      {memberCount} member{memberCount !== 1 ? 's' : ''}
                    </Text>
                  )}
                  <View style={styles.cardActions}>
                    <Button
                      label="Unarchive MeepleUp"
                      onPress={() => handleUnarchiveEvent(event.id)}
                      variant="outline"
                      style={styles.cardButton}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Organize Event Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEventForm({
            name: '',
            location: '',
            address: '',
            scheduledFor: '',
            description: '',
            rsvpSettings: {
              enabled: true,
              allowMaybe: true,
              attendanceLimit: null,
            },
          });
        }}
        title="Organize MeepleUp"
      >
        <CreateEventForm
          eventForm={eventForm}
          onFormChange={setEventForm}
          onSubmit={handleCreateEvent}
          onCancel={() => {
            setShowCreateModal(false);
            setEventForm({
              name: '',
              location: '',
              address: '',
              scheduledFor: '',
              description: '',
              rsvpSettings: {
                enabled: true,
                allowMaybe: true,
                attendanceLimit: null,
              },
            });
          }}
          loading={false}
        />
      </Modal>

      {/* User Profile Modal */}
      {selectedUserForProfile && (
        <UserProfileModal
          isOpen={!!selectedUserForProfile}
          onClose={() => setSelectedUserForProfile(null)}
          userId={selectedUserForProfile.userId}
          userName={selectedUserForProfile.userName}
          avatarUrl={selectedUserForProfile.avatarUrl}
        />
      )}

      {/* Join Success Modal */}
      <Modal
        isOpen={!!joinedEventName}
        onClose={() => setJoinedEventName(null)}
        title="Congrats!"
      >
        <View style={styles.successModalContent}>
          <Text style={styles.successModalText}>
            You've successfully joined "{joinedEventName}"!
          </Text>
          <Text style={styles.successModalSubtext}>
            Look for it on the "MeepleUps" tab.
          </Text>
          <Button
            label="Got it!"
            onPress={() => setJoinedEventName(null)}
            style={styles.successModalButton}
          />
        </View>
      </Modal>

    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgColor, // Wood table background
  },
  header: {
    padding: theme.spacing.xl,
    paddingTop: 8,
  },
  title: {
    fontSize: theme.typography.fontSize.h1,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    backgroundColor: theme.colors.woodLight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(20px, 4vw, 28px)',
    } : {}),
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(14px, 2vw, 16px)',
    } : {}),
  },
  actions: {
    flexDirection: 'row',
    padding: theme.spacing.xl,
    paddingTop: 0,
    gap: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  joinSection: {
    padding: theme.spacing.xl,
    paddingTop: 0,
  },
  joinTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  joinSubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.fontSize.base * theme.typography.lineHeight.normal,
  },
  joinCodeFields: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  joinCodeInput: {
    flex: 1,
    marginBottom: 0,
  },
  joinButton: {
    width: '100%',
  },
  eventsSection: {
    padding: theme.spacing.xl,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },
  emptyState: {
    padding: theme.spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  eventTile: {
    backgroundColor: theme.colors.cardSurface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    overflow: 'hidden',
  },
  eventTileContent: {
    padding: theme.spacing.lg,
  },
  leaveButton: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.woodLight,
  },
  leaveButtonText: {
    color: theme.colors.meepleRed,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: 'center',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  eventMeta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  eventDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
  },
  eventMembers: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  eventCard: {
    ...commonStyles.card,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberBadge: {
    backgroundColor: '#e7f5ff',
    borderColor: '#8cc3ff',
  },
  memberBadgeText: {
    color: '#1d5ebf',
  },
  strangerBadge: {
    backgroundColor: '#fff1f0',
    borderColor: '#ffb3ab',
  },
  meta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
  },
  cardActions: {
    marginTop: 16,
  },
  cardButton: {
    width: '100%',
    marginTop: 12,
  },
  secondaryAction: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dae0e6',
    marginBottom: 12,
  },
  secondaryActionText: {
    color: '#4a90e2',
    fontSize: 15,
    fontWeight: '500',
  },
  infoMessage: {
    backgroundColor: '#d4edda',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    color: '#155724',
    fontSize: 14,
  },
  modalContent: {
    padding: 20,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
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
  errorText: {
    color: theme.colors.meepleRed,
    fontSize: theme.typography.fontSize.sm,
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  requiredAsterisk: {
    color: theme.colors.meepleRed,
  },
  sectionSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  archivedCard: {
    opacity: 0.7,
    borderColor: '#999',
  },
  archivedTitle: {
    opacity: 0.8,
  },
  archivedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  archivedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  successModalContent: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  successModalText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  successModalSubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  successModalButton: {
    width: '100%',
  },
});

export default EventsScreen;

