import React, { useState, useMemo } from 'react';
import { Platform } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';

// Only import react-router-dom on web platform
let useNavigateHook;
if (Platform.OS === 'web') {
  try {
    const { useNavigate } = require('react-router-dom');
    useNavigateHook = useNavigate;
  } catch (e) {
    // react-router-dom not available
    useNavigateHook = () => () => {};
  }
} else {
  // React Native - return no-op function
  useNavigateHook = () => () => {};
}
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { formatDate } from '../utils/helpers';
import { validateJoinCode } from '../utils/api';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Modal from '../components/common/Modal';
import ContactOrganizerForm from '../components/ContactOrganizerForm';

const EventsScreen = () => {
  const navigate = useNavigateHook();
  
  // If not on web, show a message that this screen is web-only
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>MeepleUps</Text>
          <Text style={styles.subtitle}>
            MeepleUps management is available on the web version. Use the Collection or Profile screens on mobile.
          </Text>
        </View>
      </View>
    );
  }
  const { user } = useAuth();
  const {
    events,
    getUserEvents,
    getUserArchivedEvents,
    createEvent,
    joinEventWithCode,
    getMembershipStatus,
    submitContactRequest,
    unarchiveEvent,
    leaveEvent,
    getEventById,
    membershipStatus,
  } = useEvents();

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [joinCodeWord1, setJoinCodeWord1] = useState('');
  const [joinCodeWord2, setJoinCodeWord2] = useState('');
  const [joinCodeWord3, setJoinCodeWord3] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');

  // Event creation form state
  const [eventForm, setEventForm] = useState({
    name: '',
    generalLocation: '',
    scheduledFor: '',
    description: '',
  });

  const userIdentifier = user?.uid || user?.id;
  const userEvents = userIdentifier ? getUserEvents(userIdentifier) : [];
  const archivedEvents = userIdentifier ? getUserArchivedEvents(userIdentifier) : [];

  const publicEvents = useMemo(
    () => events.filter((event) => 
      event.allowStrangerMessages && 
      !event.deletedAt && 
      event.isActive !== false
    ),
    [events],
  );

  const handleEventClick = (eventId) => {
    navigate(`/event/${eventId}`);
  };

  const handleJoinCodeWordChange = (wordIndex, text) => {
    // Keep lowercase for word phrases, just trim
    const trimmed = text.trim().toLowerCase();
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

      setShowJoinModal(false);
      setJoinCodeWord1('');
      setJoinCodeWord2('');
      setJoinCodeWord3('');
      Alert.alert('Success', 'You have joined the MeepleUp!');
    } catch (err) {
      setJoinError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!userIdentifier) {
      Alert.alert('Error', 'Please sign in to host a MeepleUp.');
      return;
    }

    if (!eventForm.name.trim()) {
      Alert.alert('Error', 'Please enter an event name.');
      return;
    }

    try {
      const newEvent = await createEvent({
        name: eventForm.name.trim(),
        generalLocation: eventForm.generalLocation.trim() || 'Location TBD',
        scheduledFor: eventForm.scheduledFor.trim() || '',
        description: eventForm.description.trim() || '',
        visibility: 'private',
      });

      setShowCreateModal(false);
      setEventForm({ name: '', generalLocation: '', scheduledFor: '', description: '' });
      Alert.alert('MeepleUp Hosted', `Your MeepleUp "${newEvent.name}" has been hosted! Share join code: ${newEvent.joinCode}`);
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create MeepleUp. Please try again.');
    }
  };

  const handleOpenContact = (event) => {
    setSelectedEvent(event);
    setShowContactModal(true);
  };

  const handleCloseContactModal = () => {
    setSelectedEvent(null);
    setShowContactModal(false);
  };

  const handleContactSubmit = async ({ name, email, message }) => {
    if (!selectedEvent) {
      return;
    }

    setContactLoading(true);
    try {
      const request = submitContactRequest(selectedEvent.id, {
        name,
        email,
        message,
      });

      if (!request) {
        Alert.alert('Couldn\'t send request', 'Double-check your details and try again.');
        return;
      }

      setInfoMessage('Request sent! The organizer will follow up soon.');
      handleCloseContactModal();
    } catch (error) {
      Alert.alert('Something went wrong', 'We hit a snag while sending your message. Please try again.');
      console.error(error);
    } finally {
      setContactLoading(false);
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

  const handleLeaveEvent = async (eventId) => {
    if (!userIdentifier) {
      Alert.alert('Error', 'You must be signed in to leave a MeepleUp.');
      return;
    }

    const event = getEventById(eventId);
    if (!event) {
      Alert.alert('Error', 'MeepleUp not found.');
      return;
    }

    // Don't allow organizer to leave
    if (event.organizerId === userIdentifier) {
      Alert.alert('Cannot Leave', 'As the organizer, you cannot leave this MeepleUp. You can archive it instead.');
      return;
    }

    Alert.alert(
      'Leave MeepleUp?',
      'Are you sure you want to leave this MeepleUp? You will need to get a new invitation to rejoin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveEvent(eventId, userIdentifier);
              Alert.alert('Left MeepleUp', 'You have successfully left the MeepleUp.');
            } catch (error) {
              Alert.alert('Error', 'Failed to leave MeepleUp. Please try again.');
              console.error(error);
            }
          },
        },
      ],
    );
  };


  return (
    <>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Your MeepleUps</Text>
          <Text style={styles.subtitle}>Manage your game night MeepleUps</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            label="+ Host MeepleUp"
            onPress={() => setShowCreateModal(true)}
            style={styles.actionButton}
          />
          <Button
            label="Join MeepleUp"
            onPress={() => setShowJoinModal(true)}
            variant="outline"
            style={styles.actionButton}
          />
        </View>

        {/* User's Events */}
        {userEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No MeepleUps yet</Text>
            <Text style={styles.emptyText}>
              Host a new MeepleUp or join one with a code.
            </Text>
          </View>
        ) : (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>My MeepleUps</Text>
            {userEvents.map((event) => {
              const memberCount = (event.members || []).filter(
                (member) => member.status === 'member',
              ).length;
              const isOrganizer = event.organizerId === userIdentifier;

              return (
                <View key={event.id} style={styles.eventTile}>
                  <Pressable
                    style={styles.eventTileContent}
                    onPress={() => handleEventClick(event.id)}
                  >
                    <View style={styles.eventHeader}>
                      <View style={styles.eventInfo}>
                        <Text style={styles.eventTitle}>
                          {event.name || 'Untitled MeepleUp'}
                        </Text>
                        <Text style={styles.eventMeta}>
                          {event.generalLocation || event.exactLocation || 'Location TBD'}
                        </Text>
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
                  </Pressable>
                  {!isOrganizer && (
                    <Pressable
                      style={styles.leaveButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleLeaveEvent(event.id);
                      }}
                    >
                      <Text style={styles.leaveButtonText}>Leave</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Public Events */}
        {publicEvents.length > 0 && (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Discover MeepleUps</Text>
            {infoMessage ? (
              <View style={styles.infoMessage}>
                <Text style={styles.infoText}>{infoMessage}</Text>
              </View>
            ) : null}
            {publicEvents.map((event) => {
              const status = userIdentifier
                ? getMembershipStatus(event.id, userIdentifier)
                : membershipStatus.STRANGER;
              const isMember = status === membershipStatus.MEMBER;
              const locationDisplay = isMember
                ? event.exactLocation || event.generalLocation
                : event.generalLocation;

              return (
                <View key={event.id} style={styles.eventCard}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventTitle}>
                      {event.name || 'Untitled MeepleUp'}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        isMember ? styles.memberBadge : styles.strangerBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isMember && styles.memberBadgeText,
                        ]}
                      >
                        {isMember ? 'Member' : 'Public'}
                      </Text>
                    </View>
                  </View>

                  {event.scheduledFor ? (
                    <Text style={styles.meta}>
                      {formatDate(event.scheduledFor) || event.scheduledFor}
                    </Text>
                  ) : null}

                  <Text style={styles.meta}>
                    {isMember ? 'Location' : 'Area'}: {locationDisplay || 'Details coming soon'}
                  </Text>

                  {event.description ? (
                    <Text style={styles.description}>{event.description}</Text>
                  ) : null}

                  <View style={styles.cardActions}>
                    {isMember ? (
                      <Button
                        label="View MeepleUp"
                        onPress={() => handleEventClick(event.id)}
                        style={styles.cardButton}
                      />
                    ) : (
                      <>
                        <Pressable
                          style={styles.secondaryAction}
                          onPress={() => handleEventClick(event.id)}
                        >
                          <Text style={styles.secondaryActionText}>
                            View Details
                          </Text>
                        </Pressable>
                        <Button
                          label="Contact Organizer"
                          onPress={() => handleOpenContact(event)}
                          style={styles.cardButton}
                        />
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Archived Events - Only visible to organizers */}
        {archivedEvents.length > 0 && (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Your Archived MeepleUps</Text>
            <Text style={styles.sectionSubtitle}>
              MeepleUps you've hosted and archived. Only you can see and restore these.
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
                        {event.generalLocation || event.exactLocation || 'Location TBD'}
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

      {/* Join Event Modal */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => {
          setShowJoinModal(false);
          setJoinCodeWord1('');
          setJoinCodeWord2('');
          setJoinCodeWord3('');
          setJoinError('');
        }}
        title="Join MeepleUp"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalText}>
            Enter the three-word join code provided by the MeepleUp organizer.
          </Text>
          <View style={styles.joinCodeFields}>
            <Input
              value={joinCodeWord1}
              onChangeText={(text) => handleJoinCodeWordChange(1, text)}
              placeholder="Word 1"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.modalInput, styles.joinCodeInput]}
            />
            <Input
              value={joinCodeWord2}
              onChangeText={(text) => handleJoinCodeWordChange(2, text)}
              placeholder="Word 2"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.modalInput, styles.joinCodeInput]}
            />
            <Input
              value={joinCodeWord3}
              onChangeText={(text) => handleJoinCodeWordChange(3, text)}
              placeholder="Word 3"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.modalInput, styles.joinCodeInput]}
            />
          </View>
          {joinError ? (
            <Text style={styles.errorText}>{joinError}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Button
              label={joinLoading ? 'Joining...' : 'Join MeepleUp'}
              onPress={handleJoinEvent}
              disabled={joinLoading || !joinCodeWord1.trim() || !joinCodeWord2.trim() || !joinCodeWord3.trim()}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => {
                setShowJoinModal(false);
                setJoinCodeWord1('');
                setJoinCodeWord2('');
                setJoinCodeWord3('');
                setJoinError('');
              }}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Host Event Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEventForm({ name: '', generalLocation: '', scheduledFor: '', description: '' });
        }}
        title="Host MeepleUp"
      >
        <View style={styles.modalContent}>
          <Text style={styles.fieldLabel}>MeepleUp name <Text style={styles.requiredAsterisk}>*</Text></Text>
          <Input
            value={eventForm.name}
            onChangeText={(text) => setEventForm({ ...eventForm, name: text })}
            placeholder="MeepleUp name"
            style={styles.modalInput}
          />
          <Input
            value={eventForm.generalLocation}
            onChangeText={(text) => setEventForm({ ...eventForm, generalLocation: text })}
            placeholder="General location (e.g., Seattle, WA)"
            style={styles.modalInput}
          />
          <Input
            value={eventForm.scheduledFor}
            onChangeText={(text) => setEventForm({ ...eventForm, scheduledFor: text })}
            placeholder="Date & time (optional)"
            style={styles.modalInput}
          />
          <Input
            value={eventForm.description}
            onChangeText={(text) => setEventForm({ ...eventForm, description: text })}
            placeholder="Description (optional)"
            multiline
            numberOfLines={3}
            style={styles.modalInput}
          />
          <View style={styles.modalActions}>
            <Button
              label="Host MeepleUp"
              onPress={handleCreateEvent}
              style={styles.modalButton}
            />
            <Button
              label="Cancel"
              onPress={() => {
                setShowCreateModal(false);
                setEventForm({ name: '', generalLocation: '', scheduledFor: '', description: '' });
              }}
              variant="outline"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Contact Organizer Modal */}
      <Modal
        isOpen={showContactModal}
        onClose={handleCloseContactModal}
        title={
          selectedEvent
            ? `Contact ${selectedEvent.name || 'the organizer'}`
            : 'Contact Organizer'
        }
      >
        <ContactOrganizerForm
          onSubmit={handleContactSubmit}
          onCancel={handleCloseContactModal}
          initialName={user?.name || ''}
          initialEmail={user?.email || ''}
          loading={contactLoading}
        />
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  eventsSection: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  eventTile: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  eventTileContent: {
    padding: 16,
  },
  leaveButton: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff5f5',
  },
  leaveButtonText: {
    color: '#d45d5d',
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 14,
    color: '#666',
  },
  eventDate: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
  },
  eventMembers: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
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
    fontSize: 14,
    color: '#4a4a4a',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#555',
    marginTop: 6,
    lineHeight: 20,
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
    color: '#d45d5d',
    fontSize: 14,
    marginBottom: 12,
  },
  joinCodeFields: {
    marginBottom: 16,
  },
  joinCodeInput: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: '#d45d5d',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
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
});

export default EventsScreen;

